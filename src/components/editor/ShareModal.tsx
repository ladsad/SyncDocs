"use client";

import React, { useState, useEffect } from "react";
import { DocumentCollaborator, DocumentInvitation, DocumentRole } from "@/types/document";
import {
  shareDocumentWithEmail,
  fetchDocumentCollaborators,
  fetchDocumentInvitations,
  revokeDocumentInvitation,
  updateCollaboratorRole,
  revokeCollaboratorAccess,
} from "@/lib/crypto/document-crypto";
import { cryptoVault } from "@/lib/crypto/vault";
import {
  X,
  Share2,
  Copy,
  Check,
  UserPlus,
  Trash2,
  Lock,
  Users,
  Crown,
  Clock,
  ExternalLink,
  Sparkles,
} from "lucide-react";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
  currentUserRole?: DocumentRole;
}

export function ShareModal({
  isOpen,
  onClose,
  documentId,
  documentTitle,
  currentUserRole = "editor",
}: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<DocumentRole>("editor");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<{ message: string; inviteUrl?: string } | null>(null);

  const [collaborators, setCollaborators] = useState<DocumentCollaborator[]>([]);
  const [invitations, setInvitations] = useState<DocumentInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);

  const canManageAccess = currentUserRole === "owner" || currentUserRole === "editor";

  // Load share URL, collaborators, and pending invites on open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    cryptoVault
      .getShareableUrl(documentId)
      .then((url) => {
        if (isMounted) setShareUrl(url);
      })
      .catch((e) => console.warn("Could not generate shareable URL:", e));

    loadAll();

    return () => {
      isMounted = false;
    };
  }, [isOpen, documentId]);

  const loadAll = async () => {
    setIsLoading(true);
    try {
      const [collabs, invites] = await Promise.all([
        fetchDocumentCollaborators(documentId),
        fetchDocumentInvitations(documentId),
      ]);
      setCollaborators(collabs);
      setInvitations(invites);
    } catch (err) {
      console.warn("Failed to load collaborators/invites:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error("Failed to copy link:", e);
    }
  };

  const handleCopySpecificInvite = async (inviteUrl: string, id: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedInviteId(id);
      setTimeout(() => setCopiedInviteId(null), 2000);
    } catch (e) {
      console.error("Failed to copy invite url:", e);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || isInviting) return;

    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const result = await shareDocumentWithEmail(documentId, inviteEmail, inviteRole);
      if (result.success) {
        if (result.isPendingInvite && result.inviteUrl) {
          setInviteSuccess({
            message: `Pending invite created for ${inviteEmail}. Send this direct link to grant them instant ${inviteRole} access on their first visit:`,
            inviteUrl: result.inviteUrl,
          });
        } else {
          setInviteSuccess({
            message: `Invited ${inviteEmail} as ${inviteRole} (Direct E2EE key wrapped).`,
          });
        }
        setInviteEmail("");
        await loadAll();
      } else {
        setInviteError(result.error || "Failed to send invitation.");
      }
    } catch (err: any) {
      setInviteError(err.message || "An unexpected error occurred.");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: DocumentRole) => {
    try {
      await updateCollaboratorRole(documentId, userId, newRole);
      setCollaborators((prev) =>
        prev.map((c) => (c.userId === userId ? { ...c, role: newRole } : c))
      );
    } catch (err) {
      console.error("Failed to update role:", err);
    }
  };

  const handleRevokeCollaborator = async (userId: string) => {
    if (!confirm("Revoke this user's access?")) return;
    try {
      await revokeCollaboratorAccess(documentId, userId);
      setCollaborators((prev) => prev.filter((c) => c.userId !== userId));
    } catch (err) {
      console.error("Failed to revoke access:", err);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!confirm("Revoke this pending invitation?")) return;
    try {
      await revokeDocumentInvitation(documentId, inviteId);
      setInvitations((prev) => prev.filter((inv) => inv.id !== inviteId));
    } catch (err) {
      console.error("Failed to revoke invitation:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Share & Permissions
              </h2>
              <p className="text-xs text-slate-500 line-clamp-1 max-w-xs">
                {documentTitle || "Untitled Document"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Section 1: Direct Hash Link */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Shareable Key Link (Zero-Knowledge)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl || "Generating secure link..."}
                className="flex-1 text-xs font-mono bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-slate-700 select-all focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!shareUrl}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors shadow-sm shrink-0 ${
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-900 hover:bg-slate-800 text-white"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-600" />
              The key is in the URL hash (<code className="font-mono">#key=...</code>) and is never sent to the server.
            </p>
          </div>

          <div className="border-t border-slate-100" />

          {/* Section 2: Invite by Email */}
          {canManageAccess ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Invite Collaborator by Email
              </label>
              <form onSubmit={handleInvite} className="space-y-2.5">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="friend@example.com"
                    required
                    className="flex-1 text-sm bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as DocumentRole)}
                    className="text-xs bg-slate-50 border border-slate-200 px-2.5 py-2 rounded-lg text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <button
                    type="submit"
                    disabled={isInviting || !inviteEmail.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isInviting ? "Creating..." : "Invite"}</span>
                  </button>
                </div>

                {inviteError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-2">
                    <p className="font-medium">{inviteSuccess.message}</p>
                    {inviteSuccess.inviteUrl && (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          readOnly
                          value={inviteSuccess.inviteUrl}
                          className="flex-1 text-xs font-mono bg-white border border-emerald-300 px-2.5 py-1.5 rounded text-emerald-900 select-all"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopySpecificInvite(inviteSuccess.inviteUrl!, "latest")}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold shrink-0 flex items-center gap-1"
                        >
                          {copiedInviteId === "latest" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedInviteId === "latest" ? "Copied" : "Copy Link"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500">
              You have view-only permissions. Only owners and editors can invite collaborators.
            </div>
          )}

          {/* Section 3: Pending Invitations */}
          {invitations.length > 0 && (
            <>
              <div className="border-t border-slate-100" />
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Pending Invitations ({invitations.length})
                </label>
                <div className="divide-y divide-slate-100 max-h-40 overflow-y-auto">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs bg-amber-50/40 px-3 rounded-lg my-1"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 truncate">{inv.email}</p>
                        <p className="text-[10px] text-amber-700 font-medium">
                          Role: <span className="capitalize">{inv.role}</span> • Unregistered recipient
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopySpecificInvite(inv.invite_url || "", inv.id)}
                          className="px-2.5 py-1 text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded flex items-center gap-1"
                          title="Copy personalized invite link"
                        >
                          {copiedInviteId === inv.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedInviteId === inv.id ? "Copied" : "Copy Link"}</span>
                        </button>
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Revoke invitation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="border-t border-slate-100" />

          {/* Section 4: Active Collaborators List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                Active Members ({collaborators.length})
              </label>
            </div>

            {isLoading ? (
              <div className="py-4 text-center text-xs text-slate-400">
                Loading collaborators...
              </div>
            ) : collaborators.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                No active collaborators yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {collaborators.map((c) => (
                  <div
                    key={c.userId}
                    className="py-2.5 flex items-center justify-between gap-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 text-xs truncate">
                        {c.email || c.userId}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {c.role === "owner" ? "Document Creator" : "Active Member"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {c.role === "owner" ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                          <Crown className="w-3 h-3" />
                          Owner
                        </span>
                      ) : canManageAccess ? (
                        <>
                          <select
                            value={c.role}
                            onChange={(e) =>
                              handleRoleChange(c.userId, e.target.value as DocumentRole)
                            }
                            className="text-xs bg-white border border-slate-200 px-2 py-1 rounded text-slate-700 focus:outline-none"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            onClick={() => handleRevokeCollaborator(c.userId)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Revoke access"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500 font-medium capitalize">
                          {c.role}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
