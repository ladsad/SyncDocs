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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Your Cryptographic Identity
              </h2>
              <p className="text-xs text-slate-500">
                Manage your E2EE keypair & email address
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

        <div className="p-6 space-y-5">
          {/* Email Edit Form */}
          <form onSubmit={handleSaveEmail} className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Your Email Address
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  required
                  className="w-full text-sm bg-white border border-slate-200 pl-9 pr-3 py-2 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? "Saving..." : "Save"}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Collaborators can invite you to documents using this email.
            </p>

            {successMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">
                {successMsg}
              </div>
            )}
            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {errorMsg}
              </div>
            )}
          </form>

          <div className="border-t border-slate-100" />

          {/* User ID & Public Key Info */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Fingerprint className="w-3.5 h-3.5 text-slate-400" />
                  User UUID
                </label>
                <button
                  onClick={copyUserId}
                  className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
                >
                  {copiedId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedId ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <p className="text-xs font-mono bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 truncate">
                {userId || "Loading..."}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-slate-400" />
                  ECDH P-256 Public Key (SPKI)
                </label>
                <button
                  onClick={copyPublicKey}
                  className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
                >
                  {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <p className="text-xs font-mono bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-slate-600 truncate select-all">
                {publicKey || "Loading..."}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Shield className="w-3 h-3 text-emerald-600" />
            Private key stored only in this browser
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
