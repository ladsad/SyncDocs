"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import * as Y from "yjs";
import { Document, DocumentRole, SaveStatus } from "@/types/document";
import { updateDocument, isSupabaseConfigured, supabase } from "@/lib/supabase";
import { cryptoVault } from "@/lib/crypto/vault";
import { RichTextEditor } from "./RichTextEditor";
import { ShareModal } from "./ShareModal";
import { UserProfileModal } from "../ui/UserProfileModal";
import { StatusBadge } from "../ui/StatusBadge";
import { redeemDocumentInvitation } from "@/lib/crypto/document-crypto";
import {
  SupabaseYjsProvider,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from "@/lib/sync/supabase-provider";
import { getRandomUserPresence } from "@/lib/sync/user-presence";
import {
  ArrowLeft,
  Save,
  Database,
  HardDrive,
  Users,
  Wifi,
  WifiOff,
  ShieldCheck,
  Eye,
  Edit3,
  Crown,
  Share2,
  User,
  Lock,
  ShieldAlert,
  Loader2,
  Key,
} from "lucide-react";
import { importRawDocumentKey } from "@/lib/crypto/keys";

interface EditorContainerProps {
  initialDocument: Document;
}

interface CollaboratorInfo {
  clientId: number;
  name: string;
  color: string;
}

export function EditorContainer({ initialDocument }: EditorContainerProps) {
  const [doc, setDoc] = useState<Document>(initialDocument);
  const [title, setTitle] = useState(initialDocument.title);
  const [content, setContent] = useState(initialDocument.content);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  const [isSyncConnected, setIsSyncConnected] = useState(false);
  const [isEncrypted, setIsEncrypted] = useState(true);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<DocumentRole>(
    initialDocument.role || "editor"
  );
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [directKeyInput, setDirectKeyInput] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const isEditable = userRole !== "viewer";

  const [currentUser] = useState(() => getRandomUserPresence());
  const [provider, setProvider] = useState<SupabaseYjsProvider | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstRender = useRef(true);
  const isSupabase = isSupabaseConfigured();

  // Access validation and key resolution
  const verifyAccess = useCallback(async () => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const inviteToken = params.get("invite");
      const hash = window.location.hash;
      const inviteKeyMatch = hash.match(/(?:#|&)inviteKey=([^&]+)/);
      const inviteKey = inviteKeyMatch ? decodeURIComponent(inviteKeyMatch[1]) : null;

      if (inviteToken && inviteKey) {
        try {
          const res = await redeemDocumentInvitation(inviteToken, inviteKey);
          if (res.success && res.role) {
            setUserRole(res.role);
            window.history.replaceState({}, "", window.location.pathname);
          }
        } catch (e) {
          console.warn("Invite redemption failed:", e);
        }
      }
    }

    const session = await cryptoVault.initializeUserSession();
    setUserEmail(session.email);

    const dk = await cryptoVault.getLocalFallbackDocumentKey(initialDocument.id);
    const role = await cryptoVault.fetchDocumentRole(initialDocument.id);

    if (initialDocument.is_encrypted) {
      if (!dk && !role) {
        setHasAccess(false);
        return;
      }
    }

    if (role) setUserRole(role);
    setHasAccess(true);
  }, [initialDocument.id, initialDocument.is_encrypted]);

  useEffect(() => {
    verifyAccess();
  }, [verifyAccess]);

  const handleUnlockWithKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    const input = directKeyInput.trim();
    if (!input) return;

    setUnlocking(true);
    try {
      let rawKey = input;
      if (input.includes("#key=")) {
        const match = input.match(/(?:#|&)key=([^&]+)/);
        if (match) rawKey = decodeURIComponent(match[1]);
      } else if (input.includes("invite=")) {
        const inviteMatch = input.match(/[?&]invite=([^&#]+)/);
        const inviteKeyMatch = input.match(/(?:#|&)inviteKey=([^&]+)/);
        if (inviteMatch && inviteKeyMatch) {
          const res = await redeemDocumentInvitation(
            decodeURIComponent(inviteMatch[1]),
            decodeURIComponent(inviteKeyMatch[1])
          );
          if (res.success) {
            setHasAccess(true);
            setUserRole(res.role || "editor");
            setUnlocking(false);
            return;
          }
        }
      }

      const dk = await importRawDocumentKey(rawKey);
      cryptoVault.setDocumentKey(initialDocument.id, dk);
      if (typeof window !== "undefined") {
        localStorage.setItem(`syncdocs_dk_${initialDocument.id}`, rawKey);
      }
      setHasAccess(true);
      setUserRole("editor");
    } catch (err) {
      setUnlockError("Invalid key format or unauthorized link.");
    } finally {
      setUnlocking(false);
    }
  };

  // Update browser tab title dynamically
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.title = `${title || "Untitled Document"} — SyncDocs`;
    }
    return () => {
      if (typeof document !== "undefined") {
        document.title = "SyncDocs — End-to-End Encrypted Collaborative Docs";
      }
    };
  }, [title]);

  // Initialize Yjs Document with stored binary state (if any), Document Key, and Supabase Provider
  useEffect(() => {
    if (!hasAccess) return;

    let isCancelled = false;
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Restore existing binary CRDT state to ensure matching state vectors across all tabs
    if (initialDocument.yjs_state) {
      try {
        const binaryState = base64ToUint8Array(initialDocument.yjs_state);
        Y.applyUpdate(ydoc, binaryState);
      } catch (err) {
        console.error("Failed to restore initial Yjs state:", err);
      }
    }

    const isReadOnly = userRole === "viewer";
    const yProvider = new SupabaseYjsProvider(
      supabase,
      initialDocument.id,
      ydoc,
      null,
      isReadOnly
    );
    setProvider(yProvider);

    // Setup E2EE Document Key
    cryptoVault
      .getLocalFallbackDocumentKey(initialDocument.id)
      .then((dk) => {
        if (!isCancelled && dk) {
          yProvider.setDocumentKey(dk);
          setIsEncrypted(true);
        }
      })
      .catch((e) => console.error("Failed to acquire Document Key:", e));

    // Set local awareness presence
    yProvider.awareness.setLocalStateField("user", currentUser);

    const unsubscribeStatus = yProvider.onStatus(({ connected }) => {
      setIsSyncConnected(connected);
    });

    const updateCollaborators = () => {
      const states = yProvider.awareness.getStates();
      const active: CollaboratorInfo[] = [];

      states.forEach((state: any, clientId: number) => {
        if (state?.user) {
          active.push({
            clientId,
            name: state.user.name || "Collaborator",
            color: state.user.color || "#3b82f6",
          });
        }
      });
      setCollaborators(active);
    };

    yProvider.awareness.on("change", updateCollaborators);
    updateCollaborators();

    return () => {
      isCancelled = true;
      unsubscribeStatus();
      yProvider.awareness.off("change", updateCollaborators);
      yProvider.destroy();
      ydoc.destroy();
      ydocRef.current = null;
    };
  }, [hasAccess, initialDocument.id, initialDocument.yjs_state, currentUser, userRole]);

  const performSave = useCallback(
    async (newTitle: string, newContent: any) => {
      if (!isEditable) return; // Disallow write operations for viewers
      setSaveStatus("saving");
      try {
        const ydoc = ydocRef.current;
        const yjsState = ydoc
          ? uint8ArrayToBase64(Y.encodeStateAsUpdate(ydoc))
          : undefined;

        const updated = await updateDocument(
          doc.id,
          {
            title: newTitle,
            content: newContent,
            yjs_state: yjsState,
          },
          isEncrypted
        );
        if (updated) {
          setDoc(updated);
          setSaveStatus("saved");
        } else {
          setSaveStatus("error");
        }
      } catch (err) {
        console.error("Failed to save document:", err);
        setSaveStatus("error");
      }
    },
    [doc.id, isEncrypted, isEditable]
  );

  // Trigger auto-save debounce on title or content change
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (!isEditable) return; // Viewers do not auto-save

    setSaveStatus("unsaved");

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      performSave(title, content);
    }, 1200);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [title, content, performSave, isEditable]);

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (!isEditable) return;
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        performSave(title, content);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [title, content, performSave, isEditable]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isEditable) return;
    setTitle(e.target.value);
  };

  const handleContentChange = (newContent: any) => {
    setContent(newContent);
  };

  const handleManualSave = () => {
    if (!isEditable) return;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    performSave(title, content);
  };

  // Section 6: Content-type routing layer
  const renderEditorSurface = () => {
    switch (doc.content_type) {
      case "rich_text":
      default:
        return (
          <RichTextEditor
            initialContent={content}
            onChange={handleContentChange}
            provider={provider}
            userPresence={currentUser}
            editable={isEditable}
          />
        );
      case "markdown":
        return (
          <div className="p-8 border border-slate-200 rounded-lg bg-white text-center text-slate-500">
            Markdown editor surface will be enabled in future phases.
          </div>
        );
      case "latex":
        return (
          <div className="p-8 border border-slate-200 rounded-lg bg-white text-center text-slate-500">
            LaTeX editor surface will be enabled in future phases.
          </div>
        );
    }
  };

  if (hasAccess === null) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-slate-600 font-medium text-sm">Verifying document access & cryptographic keys...</p>
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Navigation Bar */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>SyncDocs</span>
          </Link>

          <button
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
            title="View or change your email identity"
          >
            <User className="w-3.5 h-3.5 text-slate-500" />
            <span>{userEmail || "Identity"}</span>
          </button>
        </header>

        {/* Restricted Notice */}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white p-8 rounded-2xl border border-slate-200 shadow-sm text-center space-y-6">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100 shadow-inner">
              <Lock className="w-7 h-7 text-rose-600" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">
                Document Access Restricted
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                This document is end-to-end encrypted. Your current identity{" "}
                <strong className="text-slate-900 underline decoration-slate-300">
                  {userEmail || "anonymous"}
                </strong>{" "}
                has not been granted access by the owner.
              </p>
            </div>

            {/* Direct Key / Invite Unlock Input */}
            <form onSubmit={handleUnlockWithKey} className="space-y-2 text-left pt-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Have a share link or secret key?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={directKeyInput}
                  onChange={(e) => setDirectKeyInput(e.target.value)}
                  placeholder="Paste #key=... or invite URL"
                  className="flex-1 text-xs bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={unlocking}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors shrink-0 disabled:opacity-50"
                >
                  {unlocking ? "Unlocking..." : "Unlock"}
                </button>
              </div>
              {unlockError && (
                <p className="text-xs text-rose-600">{unlockError}</p>
              )}
            </form>

            <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="flex-1 py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Switch Identity
              </button>
              <Link
                href="/"
                className="flex-1 inline-flex items-center justify-center py-2 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors"
              >
                Back to Documents
              </Link>
            </div>
          </div>
        </main>

        <UserProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          onProfileUpdated={(newEmail) => {
            setUserEmail(newEmail);
            verifyAccess();
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link
              href="/"
              className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Back to all documents"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>

            <input
              type="text"
              value={title}
              readOnly={!isEditable}
              onChange={handleTitleChange}
              placeholder="Untitled Document"
              className={`font-semibold text-lg text-slate-900 bg-transparent border border-transparent px-2 py-0.5 rounded-md focus:outline-none w-full max-w-md transition-colors ${
                isEditable
                  ? "hover:border-slate-200 focus:border-blue-500 focus:bg-white"
                  : "cursor-default text-slate-700"
              }`}
            />
          </div>

          <div className="flex items-center gap-3">
            {/* User Role Badge */}
            {userRole === "owner" && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg text-xs font-medium"
                title="You are the Owner of this document"
              >
                <Crown className="w-3.5 h-3.5 text-purple-600" />
                <span>Owner</span>
              </div>
            )}
            {userRole === "editor" && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-xs font-medium"
                title="You are an Editor on this document"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                <span>Editor</span>
              </div>
            )}
            {userRole === "viewer" && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium"
                title="You have Read-Only (Viewer) access"
              >
                <Eye className="w-3.5 h-3.5 text-amber-600" />
                <span>Viewer</span>
              </div>
            )}

            {/* E2EE Security Badge */}
            {isEncrypted && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200/80 text-emerald-800 rounded-lg text-xs font-medium"
                title="End-to-End Encrypted with client-side AES-256-GCM. Plaintext never leaves your browser."
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>E2EE (AES-256)</span>
              </div>
            )}

            {/* Live Sync Status & Active Collaborators */}
            {isSupabase && (
              <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                <div
                  className="flex items-center gap-1 font-medium"
                  title={isSyncConnected ? "Realtime sync connected" : "Connecting to sync room..."}
                >
                  {isSyncConnected ? (
                    <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                  )}
                  <span className="hidden md:inline">
                    {isSyncConnected ? "Live Sync" : "Connecting..."}
                  </span>
                </div>

                <div className="w-px h-3.5 bg-slate-300" />

                {/* Collaborator Avatars */}
                <div className="flex items-center gap-1" title={`${collaborators.length} active in room`}>
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-semibold text-slate-700">{collaborators.length}</span>
                  <div className="hidden sm:flex items-center -space-x-1.5 ml-1">
                    {collaborators.map((c) => (
                      <span
                        key={c.clientId}
                        style={{ backgroundColor: c.color }}
                        className="w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center border-2 border-white uppercase shadow-sm"
                        title={c.name}
                      >
                        {c.name.replace("Guest ", "").charAt(0)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Storage Mode indicator */}
            <div
              className="hidden lg:flex items-center gap-1 text-xs text-slate-500 px-2 py-1 bg-slate-100 rounded"
              title={
                isSupabase
                  ? "Connected to Supabase Postgres"
                  : "Using Local Storage"
              }
            >
              {isSupabase ? (
                <>
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Supabase</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-amber-600" />
                  <span>Local Mode</span>
                </>
              )}
            </div>

            <StatusBadge status={isEditable ? saveStatus : "saved"} />

            {/* Profile / Identity Switcher */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
              title="View your public key and edit your email identity"
            >
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="max-w-[120px] truncate hidden sm:inline">
                {userEmail || "Identity"}
              </span>
            </button>

            <button
              onClick={() => setIsShareModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md shadow-sm transition-colors"
              title="Share document & manage collaborator permissions"
            >
              <Share2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Share</span>
            </button>

            {isEditable ? (
              <button
                onClick={handleManualSave}
                disabled={saveStatus === "saving"}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md shadow-sm transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">Save</span>
              </button>
            ) : (
              <span className="px-2.5 py-1 text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200 rounded-md">
                Read Only
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Editing Surface */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
        {renderEditorSurface()}
      </main>

      {/* Share & Permissions Modal */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        documentId={doc.id}
        documentTitle={title}
        currentUserRole={userRole}
      />

      {/* User Profile & Key Management Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={(newEmail) => setUserEmail(newEmail)}
      />
    </div>
  );
}
