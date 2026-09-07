"use client";

import React, { useState, useEffect } from "react";
import { cryptoVault } from "@/lib/crypto/vault";
import {
  X,
  User,
  Mail,
  Key,
  Copy,
  Check,
  Save,
  Shield,
  Fingerprint,
} from "lucide-react";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: (newEmail: string) => void;
}

export function UserProfileModal({
  isOpen,
  onClose,
  onProfileUpdated,
}: UserProfileModalProps) {
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    cryptoVault
      .initializeUserSession()
      .then((session) => {
        setEmail(session.email);
        setUserId(session.userId);
        setPublicKey(session.publicKey);
      })
      .catch((e) => console.warn("Failed to load user profile:", e));
  }, [isOpen]);

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || saving) return;

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await cryptoVault.updateUserEmail(email);
      setSuccessMsg("Email identity successfully updated & registered.");
      if (onProfileUpdated) onProfileUpdated(email.trim().toLowerCase());
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update email identity.");
    } finally {
      setSaving(false);
    }
  };

  const copyPublicKey = async () => {
    if (!publicKey) return;
    await navigator.clipboard.writeText(publicKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const copyUserId = async () => {
    if (!userId) return;
    await navigator.clipboard.writeText(userId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 selection:bg-sage-soft selection:text-ink">
      <div
        className="w-full max-w-md bg-canvas-surface border border-border rounded-xs overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-canvas-surface">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-sage rounded-xs" />
            <div>
              <h2 className="font-mono text-xs font-bold uppercase text-ink">
                CRYPTOGRAPHIC IDENTITY
              </h2>
              <p className="font-mono text-[10px] text-ink-muted">
                SESSION KEYS & REGISTRY
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

        <div className="p-5 space-y-5">
          {/* Email Edit Form */}
          <form onSubmit={handleSaveEmail} className="space-y-2.5">
            <label className="block font-mono text-[10px] font-bold uppercase text-ink-muted">
              01 / EMAIL IDENTITY
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-2.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  required
                  className="w-full text-xs font-mono bg-canvas-DEFAULT border border-border pl-8 pr-3 py-2 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-medium text-canvas-DEFAULT bg-sage hover:bg-sage-hover border border-sage rounded-xs transition-colors disabled:opacity-50 shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? "SAVING..." : "SAVE"}</span>
              </button>
            </div>
            <p className="font-mono text-[10px] text-ink-muted">
              Collaborators wrap Document Keys to this registered identity.
            </p>

            {successMsg && (
              <div className="p-2.5 rounded-xs bg-canvas-subtle border border-sage text-xs font-mono text-status-success">
                {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-2.5 rounded-xs bg-canvas-subtle border border-status-danger text-xs font-mono text-status-danger">
                {errorMsg}
              </div>
            )}
          </form>

          <div className="border-t border-border" />

          {/* User ID & Public Key Info */}
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[10px] font-bold uppercase text-ink-muted flex items-center gap-1">
                  <Fingerprint className="w-3 h-3 text-ink-muted" />
                  02 / USER UUID
                </label>
                <button
                  onClick={copyUserId}
                  className="text-[10px] font-mono text-ink-secondary hover:text-ink flex items-center gap-1"
                >
                  {copiedId ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId ? "COPIED" : "COPY"}</span>
                </button>
              </div>
              <p className="text-xs font-mono bg-canvas-DEFAULT border border-border px-3 py-1.5 rounded-xs text-ink truncate">
                {userId || "LOADING..."}
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[10px] font-bold uppercase text-ink-muted flex items-center gap-1">
                  <Key className="w-3 h-3 text-ink-muted" />
                  03 / ECDH P-256 PUBLIC KEY (SPKI)
                </label>
                <button
                  onClick={copyPublicKey}
                  className="text-[10px] font-mono text-ink-secondary hover:text-ink flex items-center gap-1"
                >
                  {copiedKey ? <Check className="w-3 h-3 text-status-success" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey ? "COPIED" : "COPY"}</span>
                </button>
              </div>
              <p className="text-[11px] font-mono bg-canvas-DEFAULT border border-border px-3 py-1.5 rounded-xs text-ink truncate select-all">
                {publicKey || "LOADING..."}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-canvas-subtle border-t border-border flex items-center justify-between font-mono text-[10px] text-ink-muted">
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-sage" />
            PRIVATE KEY PERSISTED IN LOCAL BROWSER
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1 text-xs font-mono font-medium text-ink bg-canvas-surface hover:bg-canvas-neutral border border-border rounded-xs transition-colors"
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

