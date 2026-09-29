"use client";

import React, { useState } from "react";
import { LocalAgentConfig } from "@/lib/latex/types";
import { testLocalAgentConnection } from "@/lib/latex/local-agent";
import { X, Server, CheckCircle2, AlertCircle, Loader2, Key, Link2 } from "lucide-react";

interface LocalAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: LocalAgentConfig;
  onSave: (config: LocalAgentConfig) => void;
}

export function LocalAgentModal({ isOpen, onClose, config, onSave }: LocalAgentModalProps) {
  const [endpoint, setEndpoint] = useState(config.endpoint);
  const [token, setToken] = useState(config.token);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await testLocalAgentConnection({ endpoint, token });
      setTestResult(ok ? "success" : "error");
    } catch {
      setTestResult("error");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ endpoint, token });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-canvas-surface border border-border rounded-xs shadow-none overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-canvas-subtle">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-sage" />
            <h3 className="font-mono text-xs font-bold uppercase text-ink">
              TIER 2 / LOCAL COMPILE AGENT
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink p-1 rounded-xs transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <p className="text-xs text-ink-secondary leading-relaxed">
            The Local Agent runs on your machine (<code className="font-mono text-[11px] bg-canvas px-1 py-0.5 border border-border rounded-xs">127.0.0.1</code>), preserving 100% zero-knowledge privacy while unlocking full TeXLive package compilation.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block font-mono text-[10px] font-bold uppercase text-ink-secondary mb-1">
                AGENT HTTP ENDPOINT
              </label>
              <div className="relative">
                <Link2 className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="http://127.0.0.1:4567"
                  className="w-full text-xs font-mono bg-canvas border border-border pl-8 pr-3 py-2 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] font-bold uppercase text-ink-secondary mb-1">
                PAIRING TOKEN (OPTIONAL)
              </label>
              <div className="relative">
                <Key className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste local pairing token if configured"
                  className="w-full text-xs font-mono bg-canvas border border-border pl-8 pr-3 py-2 rounded-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-sage"
                />
              </div>
            </div>
          </div>

          {/* Test connection row */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-canvas-subtle hover:bg-canvas border border-border text-ink font-mono text-xs rounded-xs transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-3 h-3 animate-spin text-sage" /> : <Server className="w-3 h-3" />}
              <span>TEST CONNECTION</span>
            </button>

            {testResult === "success" && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-status-success">
                <CheckCircle2 className="w-3.5 h-3.5" />
                ONLINE (127.0.0.1)
              </span>
            )}
            {testResult === "error" && (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-status-danger">
                <AlertCircle className="w-3.5 h-3.5" />
                OFFLINE / UNREACHABLE
              </span>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 font-mono text-xs text-ink-secondary hover:text-ink border border-transparent hover:border-border rounded-xs transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-sage hover:bg-sage-hover text-canvas font-mono text-xs font-medium border border-sage rounded-xs transition-colors"
            >
              SAVE CONFIGURATION
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
