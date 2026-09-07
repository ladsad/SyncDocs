"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Document, DocumentContentType, DocumentInvitation } from "@/types/document";
import {
  fetchDocuments,
  createDocument,
  deleteDocument,
  isSupabaseConfigured,
} from "@/lib/supabase";
import {
  FileText,
  Plus,
  Trash2,
  Database,
  HardDrive,
  Info,
  Clock,
  FileCode,
  FileSpreadsheet,
  ShieldCheck,
  Share2,
  User,
  Search,
  Copy,
  Check,
  Mail,
  Key,
  ArrowRight,
} from "lucide-react";
import { ShareModal } from "../editor/ShareModal";
import { UserProfileModal } from "../ui/UserProfileModal";
import { OnboardingModal } from "../ui/OnboardingModal";
import { cryptoVault } from "@/lib/crypto/vault";
import {
  fetchIncomingInvitations,
  redeemDocumentInvitation,
} from "@/lib/crypto/document-crypto";

export function DocumentList() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<DocumentInvitation[]>([]);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);
  const [selectedShareDoc, setSelectedShareDoc] = useState<Document | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const isSupabase = isSupabaseConfigured();

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error("Failed to load documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadInvites = async (email?: string | null) => {
    if (!email) return;
    try {
      const invites = await fetchIncomingInvitations(email);
      setIncomingInvites(invites);
    } catch (e) {
      console.warn("Failed to load incoming invitations:", e);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("syncdocs_onboarded")) {
      setIsOnboardingOpen(true);
    }

    cryptoVault
      .initializeUserSession()
      .then((session) => {
        setUserEmail(session.email);
        loadDocuments();
        loadInvites(session.email);
      })
      .catch((e) => {
        console.warn("Failed to load user session:", e);
        loadDocuments();
      });
  }, []);

  const handleRedeemInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeemError(null);
    const input = redeemInput.trim();
    if (!input) return;

    setRedeeming(true);
    try {
      let inviteToken = "";
      let inviteKey = "";

      const inviteMatch = input.match(/[?&]invite=([^&#]+)/);
      const inviteKeyMatch = input.match(/(?:#|&)inviteKey=([^&]+)/);

      if (inviteMatch && inviteKeyMatch) {
        inviteToken = decodeURIComponent(inviteMatch[1]);
        inviteKey = decodeURIComponent(inviteKeyMatch[1]);
      } else {
        throw new Error("Invalid invitation URL format. Ensure the link contains #inviteKey=...");
      }

      const res = await redeemDocumentInvitation(inviteToken, inviteKey);
      if (res.success && res.documentId) {
        setRedeemInput("");
        await loadDocuments();
        if (userEmail) await loadInvites(userEmail);
        router.push(`/documents/${res.documentId}`);
      } else {
        setRedeemError(res.error || "Failed to redeem invitation.");
      }
    } catch (err: any) {
      setRedeemError(err.message || "Invalid invitation link.");
    } finally {
      setRedeeming(false);
    }
  };

  const handleCreateNew = async (
    contentType: DocumentContentType = "rich_text"
  ) => {
    try {
      setCreating(true);
      const defaultTitle =
        contentType === "rich_text"
          ? "Untitled Document"
          : contentType === "markdown"
          ? "Untitled Markdown"
          : "Untitled Document";

      const newDoc = await createDocument(defaultTitle, contentType, undefined, true);
      router.push(`/documents/${newDoc.id}`);
    } catch (error) {
      console.error("Failed to create document:", error);
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (confirm("Delete this document? This action cannot be undone.")) {
      try {
        await deleteDocument(id);
        setDocuments((prev) => prev.filter((d) => d.id !== id));
      } catch (error) {
        console.error("Failed to delete document:", error);
      }
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const getContentTypeLabel = (type: DocumentContentType) => {
    switch (type) {
      case "rich_text":
        return "RICH_TEXT";
      case "markdown":
        return "MARKDOWN";
      case "latex":
        return "LATEX";
      case "typst":
        return "TYPST";
      default:
        return "DOCUMENT";
    }
  };

  const getStyleIcon = (type: DocumentContentType) => {
    switch (type) {
      case "rich_text":
        return <FileText className="w-4 h-4 text-ink" />;
      case "markdown":
        return <FileCode className="w-4 h-4 text-ink" />;
      case "latex":
      case "typst":
        return <FileSpreadsheet className="w-4 h-4 text-ink" />;
      default:
        return <FileText className="w-4 h-4 text-ink" />;
    }
  };

  const handleCopyLink = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window !== "undefined") {
      const url = `${window.location.origin}/documents/${id}`;
      navigator.clipboard.writeText(url);
      setCopiedDocId(id);
      setTimeout(() => setCopiedDocId(null), 2000);
    }
  };

  const filteredDocs = documents.filter((d) =>
    (d.title || "Untitled Document")
      .toLowerCase()
      .includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="min-h-screen bg-canvas flex flex-col selection:bg-sage-soft selection:text-ink">
      {/* Top Architectural Navigation Bar */}
      <header className="border-b border-border bg-canvas-surface sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-sage text-canvas-DEFAULT flex items-center justify-center font-mono font-bold text-xs rounded-xs border border-sage-hover">
              SD
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight text-ink uppercase">
                  SyncDocs
                </span>
                <span className="hidden sm:inline-block font-mono text-[10px] text-ink-muted border-l border-border pl-2">
                  v0.4.0 / E2EE
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Supabase / Local storage status badge */}
            <div className="hidden md:flex items-center gap-1.5 font-mono text-[11px] text-ink-secondary px-2 py-1 bg-canvas-subtle border border-border rounded-xs">
              {isSupabase ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-status-success" />
                  <span>STORAGE / POSTGRES</span>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-status-warning" />
                  <span>STORAGE / LOCAL</span>
                </>
              )}
            </div>

            {/* Profile / Identity Button */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-ink-secondary hover:text-ink bg-canvas-subtle hover:bg-canvas-neutral border border-border rounded-xs transition-colors"
              title="Manage your email identity & cryptographic keys"
            >
              <User className="w-3.5 h-3.5 text-ink-muted" />
              <span className="max-w-[130px] truncate">{userEmail || "IDENTITY"}</span>
            </button>

            <button
              onClick={() => handleCreateNew("rich_text")}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-canvas-DEFAULT bg-sage hover:bg-sage-hover border border-sage rounded-xs transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>NEW DOCUMENT</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main 2D Canvas Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Supabase Notice Banner */}
        {!isSupabase && (
          <div className="p-4 bg-canvas-subtle border border-border rounded-xs flex items-start gap-3 text-xs text-ink">
            <Info className="w-4 h-4 text-sage mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-mono font-semibold uppercase text-ink">
                SYSTEM / LOCAL STORAGE FALLBACK ACTIVE
              </p>
              <p className="text-ink-secondary leading-relaxed">
                Supabase credentials are not detected. Operating in local mode with client-side E2EE. To connect to Supabase Postgres, provide{" "}
                <code className="bg-canvas-DEFAULT border border-border px-1 py-0.5 rounded-xs font-mono text-[11px]">
                  NEXT_PUBLIC_SUPABASE_URL
                </code>{" "}
                and{" "}
                <code className="bg-canvas-DEFAULT border border-border px-1 py-0.5 rounded-xs font-mono text-[11px]">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </code>
                .
              </p>
            </div>
          </div>
        )}

        {/* Incoming Invitations Panel */}
        {incomingInvites.length > 0 && (
          <section className="bg-canvas-surface border border-border rounded-xs p-5 space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-sage rounded-xs" />
                <h3 className="font-mono text-xs font-bold uppercase text-ink">
                  00 / INCOMING INVITATIONS [{incomingInvites.length}]
                </h3>
              </div>
              <span className="font-mono text-[11px] text-ink-muted">
                RECIPIENT: {userEmail}
              </span>
            </div>

            <form onSubmit={handleRedeemInvite} className="flex flex-col sm:flex-row gap-2 pt-1">
              <div className="relative flex-1">
                <Key className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={redeemInput}
                  onChange={(e) => setRedeemInput(e.target.value)}
                  placeholder="Paste invitation URL (e.g. /documents/...#inviteKey=...)"
                  className="w-full text-xs font-mono bg-canvas-DEFAULT border border-border pl-8 pr-3 py-2 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage"
                />
              </div>
              <button
                type="submit"
                disabled={redeeming}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-sage hover:bg-sage-hover text-canvas-DEFAULT text-xs font-medium rounded-xs border border-sage transition-colors disabled:opacity-50 shrink-0"
              >
                <span>{redeeming ? "CLAIMING..." : "CLAIM & OPEN"}</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </form>
            {redeemError && (
              <p className="font-mono text-[11px] text-status-danger">{redeemError}</p>
            )}
          </section>
        )}

        {/* Document Section Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <h2 className="font-mono text-xs font-bold uppercase text-ink tracking-wider">
              01 / ALL DOCUMENTS
            </h2>
            <span className="font-mono text-[11px] text-ink-muted bg-canvas-subtle border border-border px-1.5 py-0.5 rounded-xs">
              [{filteredDocs.length.toString().padStart(2, "0")}]
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-72">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by title..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-canvas-surface border border-border rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Document Grid / Structural Panels */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-40 bg-canvas-subtle border border-border animate-pulse rounded-xs"
              />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="border border-border bg-canvas-surface p-12 text-center rounded-xs space-y-4">
            <div className="w-10 h-10 bg-canvas-subtle border border-border text-ink-muted mx-auto flex items-center justify-center rounded-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-mono text-xs font-bold uppercase text-ink">
                NO DOCUMENTS RECORDED
              </h3>
              <p className="text-xs text-ink-secondary max-w-sm mx-auto">
                Create a new end-to-end encrypted document to begin writing on a secure 2D canvas.
              </p>
            </div>
            <button
              onClick={() => handleCreateNew("rich_text")}
              disabled={creating}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-canvas-DEFAULT bg-sage hover:bg-sage-hover border border-sage rounded-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>CREATE ENCRYPTED DOCUMENT</span>
            </button>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="border border-border bg-canvas-surface p-8 text-center rounded-xs space-y-2">
            <p className="font-mono text-xs text-ink-secondary">
              NO MATCHES FOR &quot;{searchQuery}&quot;
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="font-mono text-xs text-sage hover:underline"
            >
              RESET FILTER
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocs.map((doc, idx) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="group bg-canvas-surface border border-border hover:border-sage rounded-xs transition-colors flex flex-col justify-between"
              >
                {/* Structural Panel Header */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-border/70">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-ink-muted">
                        {(idx + 1).toString().padStart(2, "0")}
                      </span>
                      <span className="font-mono text-[10px] font-semibold tracking-wider text-ink-secondary bg-canvas-subtle border border-border px-1.5 py-0.5 rounded-xs">
                        {getContentTypeLabel(doc.content_type)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleCopyLink(doc.id, e)}
                        title={copiedDocId === doc.id ? "Copied" : "Copy link"}
                        className="p-1 text-ink-muted hover:text-ink hover:bg-canvas-subtle rounded-xs transition-colors"
                      >
                        {copiedDocId === doc.id ? (
                          <Check className="w-3.5 h-3.5 text-status-success" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedShareDoc(doc);
                        }}
                        title="Share & permissions"
                        className="p-1 text-ink-muted hover:text-ink hover:bg-canvas-subtle rounded-xs transition-colors"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(doc.id, e)}
                        title="Delete document"
                        className="p-1 text-ink-muted hover:text-status-danger hover:bg-canvas-subtle rounded-xs transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Document Title */}
                  <h3 className="font-semibold text-sm text-ink group-hover:text-sage-hover transition-colors line-clamp-2 leading-snug">
                    {doc.title || "Untitled Document"}
                  </h3>

                  {/* Badges / Metadata */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {doc.role && (
                      <span className="font-mono text-[10px] font-medium uppercase text-ink-secondary bg-canvas-subtle border border-border px-1.5 py-0.5 rounded-xs">
                        {doc.role}
                      </span>
                    )}
                    {doc.is_encrypted && (
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-status-success bg-canvas-subtle border border-border px-1.5 py-0.5 rounded-xs">
                        <ShieldCheck className="w-3 h-3 text-status-success" />
                        E2EE
                      </span>
                    )}
                  </div>
                </div>

                {/* Structural Panel Footer */}
                <div className="px-4 py-2.5 bg-canvas-subtle border-t border-border flex items-center justify-between font-mono text-[10px] text-ink-muted">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(doc.updated_at)}
                  </span>
                  <span className="text-ink-muted group-hover:text-ink transition-colors">
                    OPEN &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Share Modal */}
      <ShareModal
        isOpen={Boolean(selectedShareDoc)}
        onClose={() => setSelectedShareDoc(null)}
        documentId={selectedShareDoc?.id || ""}
        documentTitle={selectedShareDoc?.title || ""}
        currentUserRole={selectedShareDoc?.role || "owner"}
      />

      {/* User Identity / Profile Modal */}
      <UserProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onProfileUpdated={(newEmail) => {
          setUserEmail(newEmail);
          loadDocuments();
        }}
      />

      {/* First-Time Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onComplete={(newEmail) => {
          setIsOnboardingOpen(false);
          setUserEmail(newEmail);
          loadDocuments();
        }}
      />
    </div>
  );
}

