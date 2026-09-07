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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 selection:bg-sage-soft selection:text-ink">
      <div
        className="w-full max-w-lg bg-canvas-surface border border-border rounded-xs overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-canvas-surface">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-sage rounded-xs" />
            <div>
              <h2 className="font-mono text-xs font-bold uppercase text-ink">
                SHARE & PERMISSIONS
              </h2>
              <p className="font-mono text-[10px] text-ink-muted truncate max-w-xs">
                {documentTitle || "UNTITLED DOCUMENT"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-ink-muted hover:text-ink hover:bg-canvas-subtle rounded-xs transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Section 1: Direct Hash Link */}
          <div className="space-y-2">
            <label className="block font-mono text-[10px] font-bold uppercase text-ink-muted">
              01 / DIRECT ACCESS KEY LINK (E2EE)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl || "Generating secure key..."}
                className="flex-1 text-xs font-mono bg-canvas-DEFAULT border border-border px-3 py-2 rounded-xs text-ink select-all focus:outline-none focus:border-sage"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!shareUrl}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono font-medium rounded-xs border transition-colors shrink-0 ${
                  copied
                    ? "bg-sage-soft border-sage text-ink"
                    : "bg-sage hover:bg-sage-hover text-canvas-DEFAULT border-sage"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-status-success" />
                    <span>COPIED</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>COPY LINK</span>
                  </>
                )}
              </button>
            </div>
            <p className="font-mono text-[10px] text-ink-muted flex items-center gap-1">
              <Lock className="w-3 h-3 text-sage" />
              Document Key is appended in URL hash (<code className="text-ink font-semibold">#key=...</code>) and never transmitted to server.
            </p>
          </div>

          <div className="border-t border-border" />

          {/* Section 2: Invite by Email */}
          {canManageAccess ? (
            <div className="space-y-2">
              <label className="block font-mono text-[10px] font-bold uppercase text-ink-muted">
                02 / INVITE COLLABORATOR BY EMAIL
              </label>
              <form onSubmit={handleInvite} className="space-y-2.5">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    required
                    className="flex-1 text-xs font-mono bg-canvas-DEFAULT border border-border px-3 py-2 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as DocumentRole)}
                    className="text-xs font-mono bg-canvas-DEFAULT border border-border px-2.5 py-2 rounded-xs text-ink focus:outline-none focus:border-sage"
                  >
                    <option value="editor">EDITOR</option>
                    <option value="viewer">VIEWER</option>
                  </select>
                  <button
                    type="submit"
                    disabled={isInviting || !inviteEmail.trim()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-medium text-canvas-DEFAULT bg-sage hover:bg-sage-hover border border-sage rounded-xs transition-colors disabled:opacity-50 shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isInviting ? "CREATING..." : "INVITE"}</span>
                  </button>
                </div>

                {inviteError && (
                  <div className="p-2.5 rounded-xs bg-canvas-subtle border border-status-danger text-xs font-mono text-status-danger">
                    {inviteError}
                  </div>
                )}
                {inviteSuccess && (
                  <div className="p-3 rounded-xs bg-canvas-subtle border border-sage text-xs font-mono text-ink space-y-2">
                    <p className="font-semibold text-status-success">{inviteSuccess.message}</p>
                    {inviteSuccess.inviteUrl && (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          readOnly
                          value={inviteSuccess.inviteUrl}
                          className="flex-1 text-[11px] font-mono bg-canvas-DEFAULT border border-border px-2 py-1 rounded-xs text-ink select-all"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopySpecificInvite(inviteSuccess.inviteUrl!, "latest")}
                          className="px-2.5 py-1 bg-sage hover:bg-sage-hover text-canvas-DEFAULT rounded-xs text-xs font-mono shrink-0 flex items-center gap-1"
                        >
                          {copiedInviteId === "latest" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedInviteId === "latest" ? "COPIED" : "COPY"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
          ) : (
            <div className="p-3 bg-canvas-subtle rounded-xs border border-border text-xs font-mono text-ink-muted">
              VIEW_ONLY: ONLY OWNERS AND EDITORS MAY ISSUE INVITATIONS.
            </div>
          )}

          {/* Section 3: Pending Invitations */}
          {invitations.length > 0 && (
            <>
              <div className="border-t border-border" />
              <div className="space-y-2">
                <label className="block font-mono text-[10px] font-bold uppercase text-status-warning flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  03 / PENDING INVITATIONS [{invitations.length}]
                </label>
                <div className="divide-y divide-border border border-border rounded-xs max-h-40 overflow-y-auto">
                  {invitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="py-2 px-3 flex items-center justify-between gap-2 text-xs bg-canvas-surface"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-medium text-ink truncate">{inv.email}</p>
                        <p className="font-mono text-[10px] text-ink-muted">
                          ROLE: {inv.role.toUpperCase()} • PENDING FIRST VISIT
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleCopySpecificInvite(inv.invite_url || "", inv.id)}
                          className="px-2 py-0.5 text-[11px] font-mono text-ink bg-canvas-subtle hover:bg-canvas-neutral border border-border rounded-xs flex items-center gap-1"
                          title="Copy personalized invite link"
                        >
                          {copiedInviteId === inv.id ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedInviteId === inv.id ? "COPIED" : "LINK"}</span>
                        </button>
                        <button
                          onClick={() => handleRevokeInvite(inv.id)}
                          className="p-1 text-ink-muted hover:text-status-danger rounded-xs transition-colors"
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

          <div className="border-t border-border" />

          {/* Section 4: Active Collaborators List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-mono text-[10px] font-bold uppercase text-ink-muted flex items-center gap-1">
                <Users className="w-3 h-3" />
                04 / ACTIVE MEMBERS [{collaborators.length}]
              </label>
            </div>

            {isLoading ? (
              <div className="py-4 text-center font-mono text-xs text-ink-muted">
                LOADING COLLABORATOR REGISTRY...
              </div>
            ) : collaborators.length === 0 ? (
              <div className="py-4 text-center font-mono text-xs text-ink-muted bg-canvas-subtle rounded-xs border border-border">
                NO OTHER ACTIVE COLLABORATORS RECORDED.
              </div>
            ) : (
              <div className="divide-y divide-border border border-border rounded-xs max-h-48 overflow-y-auto">
                {collaborators.map((c) => (
                  <div
                    key={c.userId}
                    className="py-2 px-3 flex items-center justify-between gap-3 text-xs bg-canvas-surface"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs font-medium text-ink truncate">
                        {c.email || c.userId}
                      </p>
                      <p className="font-mono text-[10px] text-ink-muted">
                        {c.role === "owner" ? "DOCUMENT OWNER" : "MEMBER"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {c.role === "owner" ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-ink bg-canvas-subtle border border-border px-1.5 py-0.5 rounded-xs">
                          <Crown className="w-3 h-3 text-sage" />
                          OWNER
                        </span>
                      ) : canManageAccess ? (
                        <>
                          <select
                            value={c.role}
                            onChange={(e) =>
                              handleRoleChange(c.userId, e.target.value as DocumentRole)
                            }
                            className="text-[11px] font-mono bg-canvas-DEFAULT border border-border px-1.5 py-0.5 rounded-xs text-ink focus:outline-none"
                          >
                            <option value="editor">EDITOR</option>
                            <option value="viewer">VIEWER</option>
                          </select>
                          <button
                            onClick={() => handleRevokeCollaborator(c.userId)}
                            className="p-1 text-ink-muted hover:text-status-danger hover:bg-canvas-subtle rounded-xs transition-colors"
                            title="Revoke access"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <span className="font-mono text-[10px] text-ink-secondary uppercase">
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
        <div className="px-5 py-3 bg-canvas-subtle border-t border-border flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-mono font-medium text-ink hover:text-ink bg-canvas-surface hover:bg-canvas-neutral border border-border rounded-xs transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

