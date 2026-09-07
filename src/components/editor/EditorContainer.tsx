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
      case "markdown":
        return (
          <div className="p-8 border border-border rounded-xs bg-canvas-surface text-center font-mono text-xs text-ink-muted">
            02 / MARKDOWN SURFACE — SCHEDULED FOR PHASE 4
          </div>
        );
      case "latex":
        return (
          <div className="p-8 border border-border rounded-xs bg-canvas-surface text-center font-mono text-xs text-ink-muted">
            03 / LATEX SURFACE — SCHEDULED FOR PHASE 4 (TIER 1 WASM)
          </div>
        );
    }
  };

  if (hasAccess === null) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4 selection:bg-sage-soft">
        <Loader2 className="w-6 h-6 animate-spin text-sage mb-3" />
        <p className="font-mono text-xs text-ink-muted uppercase">
          VERIFYING ACCESS & RESOLVING ENCRYPTION KEYS...
        </p>
      </div>
    );
  }

  if (hasAccess === false) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col selection:bg-sage-soft">
        {/* Navigation Bar */}
        <header className="bg-canvas-surface border-b border-border px-4 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-mono text-xs font-semibold text-ink hover:text-sage transition-colors uppercase"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>&larr; ALL DOCUMENTS</span>
          </Link>

          <button
            onClick={() => setIsProfileModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-ink-secondary hover:text-ink bg-canvas-subtle hover:bg-canvas-neutral border border-border rounded-xs transition-colors"
            title="View or change your email identity"
          >
            <User className="w-3.5 h-3.5 text-ink-muted" />
            <span>{userEmail || "IDENTITY"}</span>
          </button>
        </header>

        {/* Restricted Notice */}
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-canvas-surface p-8 border border-border rounded-xs text-center space-y-6">
            <div className="w-12 h-12 bg-canvas-subtle border border-border text-status-danger rounded-xs flex items-center justify-center mx-auto">
              <Lock className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h2 className="font-mono text-sm font-bold uppercase text-ink">
                00 / ACCESS RESTRICTED
              </h2>
              <p className="text-xs text-ink-secondary leading-relaxed">
                This document is end-to-end encrypted. Your identity{" "}
                <strong className="text-ink font-mono underline decoration-border-structural">
                  {userEmail || "anonymous"}
                </strong>{" "}
                has not been granted access by the owner.
              </p>
            </div>

            {/* Direct Key / Invite Unlock Input */}
            <form onSubmit={handleUnlockWithKey} className="space-y-2 text-left pt-2">
              <label className="block font-mono text-[10px] font-bold uppercase text-ink-muted">
                HAVE A SECRET KEY OR INVITE LINK?
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={directKeyInput}
                  onChange={(e) => setDirectKeyInput(e.target.value)}
                  placeholder="Paste #key=... or invite URL"
                  className="flex-1 text-xs font-mono bg-canvas-DEFAULT border border-border px-3 py-2 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage"
                />
                <button
                  type="submit"
                  disabled={unlocking}
                  className="px-3.5 py-2 bg-sage hover:bg-sage-hover text-canvas-DEFAULT text-xs font-medium rounded-xs border border-sage transition-colors shrink-0 disabled:opacity-50"
                >
                  {unlocking ? "UNLOCKING..." : "UNLOCK"}
                </button>
              </div>
              {unlockError && (
                <p className="font-mono text-[11px] text-status-danger">{unlockError}</p>
              )}
            </form>

            <div className="pt-4 border-t border-border flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(true)}
                className="flex-1 py-2 px-3 text-xs font-mono font-medium text-ink bg-canvas-subtle hover:bg-canvas-neutral border border-border rounded-xs transition-colors"
              >
                SWITCH IDENTITY
              </button>
              <Link
                href="/"
                className="flex-1 inline-flex items-center justify-center py-2 px-3 text-xs font-mono font-medium text-canvas-DEFAULT bg-ink hover:bg-ink/90 rounded-xs transition-colors"
              >
                BACK TO LIST
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
    <div className="min-h-screen bg-canvas flex flex-col selection:bg-sage-soft selection:text-ink">
      {/* Top Architectural Navigation Bar */}
      <header className="border-b border-border bg-canvas-surface sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Link
              href="/"
              className="p-1 rounded-xs text-ink-muted hover:text-ink hover:bg-canvas-subtle border border-transparent hover:border-border transition-colors"
              title="Back to all documents"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <input
              type="text"
              value={title}
              readOnly={!isEditable}
              onChange={handleTitleChange}
              placeholder="Untitled Document"
              className={`font-semibold text-base text-ink bg-transparent border border-transparent px-2 py-0.5 rounded-xs focus:outline-none w-full max-w-md transition-colors ${
                isEditable
                  ? "hover:border-border focus:border-sage focus:bg-canvas-DEFAULT"
                  : "cursor-default text-ink"
              }`}
            />
          </div>

          <div className="flex items-center gap-2">
            {/* User Role Badge */}
            <div
              className="hidden sm:flex items-center gap-1 font-mono text-[10px] uppercase text-ink-secondary bg-canvas-subtle border border-border px-2 py-1 rounded-xs"
              title={`Your role: ${userRole}`}
            >
              <span>ROLE:</span>
              <span className="font-bold text-ink">{userRole}</span>
            </div>

            {/* E2EE Security Badge */}
            {isEncrypted && (
              <div
                className="hidden md:flex items-center gap-1.5 font-mono text-[10px] text-status-success bg-canvas-subtle border border-border px-2 py-1 rounded-xs"
                title="End-to-End Encrypted with client-side AES-256-GCM"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
                <span>E2EE (AES-256)</span>
              </div>
            )}

            {/* Live Sync Status & Active Collaborators */}
            {isSupabase && (
              <div className="flex items-center gap-2 font-mono text-[10px] text-ink-secondary px-2 py-1 bg-canvas-subtle border border-border rounded-xs">
                <div
                  className="flex items-center gap-1.5"
                  title={isSyncConnected ? "Realtime sync connected" : "Connecting..."}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSyncConnected ? "bg-status-success" : "bg-status-warning animate-pulse"
                    }`}
                  />
                  <span className="hidden lg:inline">
                    {isSyncConnected ? "LIVE" : "CONNECTING"}
                  </span>
                </div>

                <div className="w-px h-3 bg-border" />

                <div className="flex items-center gap-1" title={`${collaborators.length} active in room`}>
                  <Users className="w-3 h-3 text-ink-muted" />
                  <span className="font-bold text-ink">{collaborators.length}</span>
                </div>
              </div>
            )}

            <StatusBadge status={isEditable ? saveStatus : "saved"} />

            {/* Profile / Identity Button */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="hidden sm:flex items-center gap-1 px-2 py-1 text-[11px] font-mono text-ink-secondary hover:text-ink bg-canvas-subtle hover:bg-canvas-neutral border border-border rounded-xs transition-colors"
              title="View your public key and edit email identity"
            >
              <User className="w-3 h-3 text-ink-muted" />
              <span className="max-w-[100px] truncate">{userEmail || "IDENTITY"}</span>
            </button>

            <button
              onClick={() => setIsShareModalOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-ink bg-canvas-subtle hover:bg-canvas-neutral border border-border rounded-xs transition-colors"
              title="Share document & permissions"
            >
              <Share2 className="w-3 h-3 text-ink-muted" />
              <span>SHARE</span>
            </button>

            {isEditable ? (
              <button
                onClick={handleManualSave}
                disabled={saveStatus === "saving"}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-medium text-canvas-DEFAULT bg-sage hover:bg-sage-hover border border-sage rounded-xs transition-colors disabled:opacity-50"
              >
                <Save className="w-3 h-3" />
                <span>SAVE</span>
              </button>
            ) : (
              <span className="px-2 py-0.5 font-mono text-[10px] text-ink-muted bg-canvas-subtle border border-border rounded-xs">
                READ_ONLY
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Editing Surface Canvas */}
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

