"use client";

import React, { useState } from "react";
import { cryptoVault } from "@/lib/crypto/vault";
import { ShieldCheck, Mail, ArrowRight, Sparkles, Lock } from "lucide-react";

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (email: string) => void;
}

export function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await cryptoVault.initializeUserSession(cleanEmail);
      if (typeof window !== "undefined") {
        localStorage.setItem("syncdocs_onboarded", "true");
      }
      onComplete(cleanEmail);
    } catch (err: any) {
      setError(err.message || "Failed to initialize cryptographic identity.");
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    try {
      const session = await cryptoVault.initializeUserSession();
      if (typeof window !== "undefined") {
        localStorage.setItem("syncdocs_onboarded", "true");
      }
      onComplete(session.email);
    } catch (err: any) {
      console.warn("Failed to initialize default session:", err);
      onComplete("user@syncdocs.local");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 selection:bg-sage-soft selection:text-ink">
      <div
        className="w-full max-w-md bg-canvas-surface border border-border rounded-xs overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner Header */}
        <div className="bg-canvas-surface border-b border-border px-6 py-5">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-6 h-6 bg-sage text-canvas-DEFAULT flex items-center justify-center font-mono font-bold text-xs rounded-xs border border-sage-hover">
              SD
            </div>
            <h2 className="font-mono text-xs font-bold uppercase text-ink tracking-wider">
              SYNCDOCS / INITIALIZE IDENTITY
            </h2>
          </div>
          <p className="font-mono text-[11px] text-ink-muted">
            End-to-End Encrypted Collaborative Documents
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          <div className="bg-canvas-subtle border border-border rounded-xs p-3.5 space-y-2 font-mono text-[11px] text-ink-secondary">
            <div className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-sage shrink-0 mt-0.5" />
              <span>
                Browser initializes a local <strong>ECDH P-256 keypair</strong>. Plaintext never touches servers.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-status-success shrink-0 mt-0.5" />
              <span>
                Register your email so teammates can wrap document keys directly to your public key.
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block font-mono text-[10px] font-bold uppercase text-ink-muted">
                01 / YOUR EMAIL ADDRESS
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  autoFocus
                  required
                  className="w-full text-xs font-mono bg-canvas-DEFAULT border border-border pl-9 pr-3 py-2.5 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage transition-colors"
                />
              </div>
              {error && <p className="font-mono text-[11px] text-status-danger mt-1">{error}</p>}
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-sage hover:bg-sage-hover text-canvas-DEFAULT text-xs font-mono font-medium rounded-xs border border-sage transition-colors disabled:opacity-50"
              >
                <span>{loading ? "GENERATING KEYPAIR..." : "INITIALIZE IDENTITY & ENTER"}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="w-full py-1.5 text-xs font-mono text-ink-muted hover:text-ink transition-colors"
              >
                SKIP (USE LOCAL ANONYMOUS KEYPAIR)
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
