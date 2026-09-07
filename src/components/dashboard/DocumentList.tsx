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
  Sparkles,
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
        throw new Error("Invalid invitation URL format. Make sure to paste the full link containing #inviteKey=...");
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
          ? "Untitled Rich Text"
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

    if (confirm("Are you sure you want to delete this document?")) {
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
      }).format(date);
    } catch {
      return dateStr;
    }
  };

  const getStyleIcon = (type: DocumentContentType) => {
    switch (type) {
      case "rich_text":
        return <FileText className="w-5 h-5 text-blue-600" />;
      case "markdown":
        return <FileCode className="w-5 h-5 text-purple-600" />;
      case "latex":
      case "typst":
        return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
      default:
        return <FileText className="w-5 h-5 text-slate-600" />;
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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              S
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                SyncDocs
              </h1>
              <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                End-to-End Encrypted Collaborative Docs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Profile / Identity Button */}
            <button
              onClick={() => setIsProfileModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
              title="Manage your email identity & cryptographic keys"
            >
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="max-w-[140px] truncate">{userEmail || "Your Identity"}</span>
            </button>

            {/* Supabase / Local storage status badge */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 px-3 py-1.5 bg-slate-100 rounded-md border border-slate-200">
              {isSupabase ? (
                <>
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-medium">Supabase Postgres</span>
                </>
              ) : (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-medium">Local Mode</span>
                </>
              )}
            </div>

            <button
              onClick={() => handleCreateNew("rich_text")}
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>New Document</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {!isSupabase && (
          <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200 flex items-start gap-3 text-sm text-blue-900">
            <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-0.5">
                Supabase credentials not detected in .env.local
              </p>
              <p className="text-blue-800 text-xs">
                SyncDocs is currently operating in local storage fallback with client-side E2EE.
                To save/load to Supabase Postgres, set{" "}
                <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">
                  NEXT_PUBLIC_SUPABASE_URL
                </code>{" "}
                and{" "}
                <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </code>{" "}
                in <code className="font-mono">.env.local</code> and run the migration in{" "}
                <code className="font-mono">supabase/schema.sql</code>.
              </p>
            </div>
          </div>
        )}

        {/* Incoming Invitations Notice & Quick Claim */}
        {incomingInvites.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-blue-200/80 rounded-xl p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-600 text-white shadow-sm">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    You have {incomingInvites.length} pending document {incomingInvites.length === 1 ? "invitation" : "invitations"}
                  </h3>
                  <p className="text-xs text-slate-600">
                    A teammate invited <strong>{userEmail}</strong> to collaborate on an encrypted document.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleRedeemInvite} className="flex flex-col sm:flex-row gap-2 pt-1">
              <div className="relative flex-1">
                <Key className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={redeemInput}
                  onChange={(e) => setRedeemInput(e.target.value)}
                  placeholder="Paste your invitation link (e.g. /documents/...#inviteKey=...)"
                  className="w-full text-xs bg-white border border-slate-200 pl-9 pr-3 py-2 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-inner"
                />
              </div>
              <button
                type="submit"
                disabled={redeeming}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50 shrink-0"
              >
                <span>{redeeming ? "Claiming..." : "Claim & Open"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
            {redeemError && (
              <p className="text-xs text-rose-600 font-medium">{redeemError}</p>
            )}
          </div>
        )}

        {/* Toolbar & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">All Documents</h2>
            <span className="text-xs bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full">
              {filteredDocs.length} {filteredDocs.length === 1 ? "document" : "documents"}
            </span>
          </div>

          {documents.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 transition-colors text-slate-800"
              />
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-36 rounded-lg bg-slate-200 animate-pulse border border-slate-300"
              />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-xl p-12 text-center bg-white">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">
              No documents yet
            </h3>
            <p className="text-sm text-slate-500 mb-4 max-w-sm mx-auto">
              Create your first end-to-end encrypted document to start writing privately.
            </p>
            <button
              onClick={() => handleCreateNew("rich_text")}
              disabled={creating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Encrypted Document</span>
            </button>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="border border-slate-200 rounded-xl p-8 text-center bg-white">
            <p className="text-sm text-slate-500 mb-2">
              No documents matching &quot;{searchQuery}&quot;
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear search filter
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocs.map((doc) => (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="group p-5 bg-white border border-slate-200 hover:border-blue-400 rounded-xl shadow-sm hover:shadow transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-colors">
                      {getStyleIcon(doc.content_type)}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleCopyLink(doc.id, e)}
                        title={copiedDocId === doc.id ? "Link copied!" : "Copy document link"}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      >
                        {copiedDocId === doc.id ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedShareDoc(doc);
                        }}
                        title="Share document & permissions"
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(doc.id, e)}
                        title="Delete document"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1 mb-1">
                    {doc.title || "Untitled Document"}
                  </h3>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-block text-[11px] font-medium uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {doc.content_type.replace("_", " ")}
                    </span>
                    {doc.role && (
                      <span className="inline-block text-[11px] font-medium capitalize text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded">
                        {doc.role}
                      </span>
                    )}
                    {doc.is_encrypted && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        E2EE
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Updated {formatTimestamp(doc.updated_at)}
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
