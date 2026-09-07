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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner Header */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 px-6 py-7 text-white text-center relative">
          <div className="w-12 h-12 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mx-auto mb-3 shadow-inner">
            <ShieldCheck className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Welcome to SyncDocs
          </h2>
          <p className="text-xs text-blue-100 mt-1 max-w-xs mx-auto">
            Zero-knowledge, end-to-end encrypted collaborative documents.
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 space-y-2">
            <div className="flex items-start gap-2.5 text-xs text-slate-600">
              <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Your browser generates a local <strong>ECDH cryptographic keypair</strong>. Plaintext never touches our servers.
              </span>
            </div>
            <div className="flex items-start gap-2.5 text-xs text-slate-600">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <span>
                Enter your email so team members can share encrypted files directly with your account.
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Your Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@company.com"
                  autoFocus
                  required
                  className="w-full text-sm bg-white border border-slate-200 pl-10 pr-3 py-2.5 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm"
                />
              </div>
              {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-md hover:shadow transition-all disabled:opacity-50"
              >
                <span>{loading ? "Generating Keys..." : "Get Started"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                Skip for now (use anonymous key)
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
