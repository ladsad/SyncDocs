"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { CompileResult, CompileTier, LocalAgentConfig } from "@/lib/latex/types";
import {
  compileLaTeX,
  getStoredAgentConfig,
  getStoredCompileTier,
  saveStoredAgentConfig,
  saveStoredCompileTier,
} from "@/lib/latex/compile-pipeline";
import { CodeMirrorEditor } from "../CodeMirrorEditor";
import { LocalAgentModal } from "./LocalAgentModal";
import { SupabaseYjsProvider } from "@/lib/sync/supabase-provider";
import {
  Play,
  Loader2,
  Download,
  ExternalLink,
  Settings,
  Columns,
  Eye,
  FileCode,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

interface LaTeXEditorSurfaceProps {
  initialContent: string;
  onChange: (content: string) => void;
  provider?: SupabaseYjsProvider | null;
  userPresence?: {
    name: string;
    color: string;
  };
  editable?: boolean;
}

type ViewMode = "split" | "editor" | "preview";

export function LaTeXEditorSurface({
  initialContent,
  onChange,
  provider,
  userPresence,
  editable = true,
}: LaTeXEditorSurfaceProps) {
  const [source, setSource] = useState<string>(initialContent || "");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [tier, setTier] = useState<CompileTier>("tier1_wasm");
  const [agentConfig, setAgentConfig] = useState<LocalAgentConfig>({
    endpoint: "http://127.0.0.1:4567",
    token: "",
  });
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [isLogDrawerOpen, setIsLogDrawerOpen] = useState(false);

  // Initialize stored configuration from client storage
  useEffect(() => {
    setTier(getStoredCompileTier());
    setAgentConfig(getStoredAgentConfig());
  }, []);

  const handleSourceChange = (newSource: string) => {
    setSource(newSource);
    onChange(newSource);
  };

  const handleCompile = useCallback(
    async (srcToCompile?: string) => {
      const src = srcToCompile !== undefined ? srcToCompile : source;
      if (isCompiling) return;
      setIsCompiling(true);

      try {
        const result = await compileLaTeX(src, {
          tier,
          agentConfig,
        });
        setCompileResult(result);
        if (!result.success) {
          setIsLogDrawerOpen(true);
        }
      } catch (err: any) {
        setCompileResult({
          success: false,
          logs: `[Internal Pipeline Error]: ${err.message || String(err)}`,
          errors: [{ message: err.message || "Failed to run compile pipeline" }],
          warnings: [],
          durationMs: 0,
          tierUsed: tier,
        });
        setIsLogDrawerOpen(true);
      } finally {
        setIsCompiling(false);
      }
    },
    [source, tier, agentConfig, isCompiling]
  );

  // Initial auto-compile on first mount
  useEffect(() => {
    if (initialContent) {
      handleCompile(initialContent);
    }
  }, []);

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter to compile
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleCompile();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCompile]);

  const handleTierChange = (newTier: CompileTier) => {
    setTier(newTier);
    saveStoredCompileTier(newTier);
  };

  const handleSaveAgentConfig = (newConfig: LocalAgentConfig) => {
    setAgentConfig(newConfig);
    saveStoredAgentConfig(newConfig);
  };

  return (
    <div className="space-y-4">
      {/* LaTeX Control Toolbar */}
      <div className="bg-canvas-surface border border-border rounded-xs p-1.5 flex flex-wrap items-center justify-between gap-2 sticky top-[57px] z-10">
        {/* Left: Primary Compile Action & Tier Selector */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleCompile()}
            disabled={isCompiling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sage hover:bg-sage-hover text-canvas font-mono text-xs font-semibold rounded-xs border border-sage transition-colors disabled:opacity-50"
            title="Compile LaTeX (Ctrl+Enter / Cmd+Enter)"
          >
            {isCompiling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isCompiling ? "COMPILING..." : "COMPILE"}</span>
          </button>

          {/* Tier Switcher Dropdown */}
          <div className="flex items-center border border-border rounded-xs bg-canvas-subtle p-0.5 font-mono text-[10px]">
            <button
              type="button"
              onClick={() => handleTierChange("tier1_wasm")}
              className={`px-2 py-0.5 rounded-xs transition-colors ${
                tier === "tier1_wasm"
                  ? "bg-canvas-DEFAULT text-ink font-bold border border-border"
                  : "text-ink-secondary hover:text-ink border border-transparent"
              }`}
              title="Compile inside browser via WASM TeX engine"
            >
              TIER 1 (WASM)
            </button>
            <button
              type="button"
              onClick={() => handleTierChange("tier2_agent")}
              className={`px-2 py-0.5 rounded-xs transition-colors ${
                tier === "tier2_agent"
                  ? "bg-canvas-DEFAULT text-ink font-bold border border-border"
                  : "text-ink-secondary hover:text-ink border border-transparent"
              }`}
              title="Compile via native helper on 127.0.0.1"
            >
              TIER 2 (LOCAL AGENT)
            </button>
          </div>

          {tier === "tier2_agent" && (
            <button
              type="button"
              onClick={() => setIsAgentModalOpen(true)}
              className="p-1.5 rounded-xs text-ink-secondary hover:text-ink bg-canvas-subtle hover:bg-canvas border border-border transition-colors"
              title="Configure 127.0.0.1 Local Agent"
            >
              <Settings className="w-3.5 h-3.5 text-sage" />
            </button>
          )}
        </div>

        {/* Right: PDF Actions & View Mode Switcher */}
        <div className="flex items-center gap-2">
          {compileResult?.pdfUrl && (
            <div className="flex items-center gap-1 border-r border-border pr-2">
              <a
                href={compileResult.pdfUrl}
                download="document.pdf"
                className="p-1.5 rounded-xs text-ink-secondary hover:text-ink hover:bg-canvas-subtle transition-colors"
                title="Download Compiled PDF"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
              <a
                href={compileResult.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 rounded-xs text-ink-secondary hover:text-ink hover:bg-canvas-subtle transition-colors"
                title="Open PDF in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* View Mode Toggle */}
          <div className="flex items-center border border-border rounded-xs bg-canvas-subtle p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`px-2 py-0.5 font-mono text-[10px] rounded-xs flex items-center gap-1 transition-colors ${
                viewMode === "split"
                  ? "bg-canvas-DEFAULT text-ink font-bold border border-border"
                  : "text-ink-secondary hover:text-ink border border-transparent"
              }`}
              title="Split View"
            >
              <Columns className="w-3 h-3" />
              <span className="hidden md:inline">SPLIT</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("editor")}
              className={`px-2 py-0.5 font-mono text-[10px] rounded-xs flex items-center gap-1 transition-colors ${
                viewMode === "editor"
                  ? "bg-canvas-DEFAULT text-ink font-bold border border-border"
                  : "text-ink-secondary hover:text-ink border border-transparent"
              }`}
              title="Editor Only"
            >
              <FileCode className="w-3 h-3" />
              <span className="hidden md:inline">SOURCE</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("preview")}
              className={`px-2 py-0.5 font-mono text-[10px] rounded-xs flex items-center gap-1 transition-colors ${
                viewMode === "preview"
                  ? "bg-canvas-DEFAULT text-ink font-bold border border-border"
                  : "text-ink-secondary hover:text-ink border border-transparent"
              }`}
              title="PDF Preview Only"
            >
              <Eye className="w-3 h-3" />
              <span className="hidden md:inline">PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Surface Panes */}
      <div
        className={`w-full ${
          viewMode === "split"
            ? "grid grid-cols-1 lg:grid-cols-2 gap-4 items-start"
            : "block"
        }`}
      >
        {/* Left Pane: CodeMirror Source Editor */}
        {(viewMode === "split" || viewMode === "editor") && (
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex items-center justify-between font-mono text-[10px] text-ink-muted px-1">
              <span>01 / LATEX SOURCE (CODEMIRROR 6)</span>
              <span>SHORTCUT: CTRL+ENTER</span>
            </div>
            <CodeMirrorEditor
              initialContent={initialContent}
              contentType="latex"
              onChange={handleSourceChange}
              provider={provider}
              userPresence={userPresence}
              editable={editable}
              minHeight="640px"
            />
          </div>
        )}

        {/* Right Pane: Compiled PDF Preview & Diagnostic Console */}
        {(viewMode === "split" || viewMode === "preview") && (
          <div className="space-y-1.5 flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between font-mono text-[10px] text-ink-muted px-1">
              <span>02 / COMPILED PDF VIEWER</span>
              <span>
                {compileResult?.durationMs !== undefined
                  ? `${compileResult.durationMs}ms [${compileResult.tierUsed.toUpperCase()}]`
                  : "NOT COMPILED YET"}
              </span>
            </div>

            <div className="border border-border rounded-xs bg-canvas-surface overflow-hidden flex flex-col min-h-[640px]">
              {/* PDF Document Display Frame */}
              <div className="flex-1 bg-[#525659] relative min-h-[480px]">
                {compileResult?.pdfUrl ? (
                  <iframe
                    src={`${compileResult.pdfUrl}#toolbar=1&navpanes=0`}
                    className="w-full h-full min-h-[480px] border-0"
                    title="Compiled PDF Preview"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-canvas-surface bg-canvas-surface">
                    <div className="w-10 h-10 bg-canvas-subtle border border-border text-ink-muted mx-auto flex items-center justify-center rounded-xs mb-3">
                      <FileCode className="w-5 h-5 text-sage" />
                    </div>
                    <h4 className="font-mono text-xs font-bold uppercase text-ink">
                      NO COMPILED OUTPUT READY
                    </h4>
                    <p className="text-xs text-ink-secondary max-w-sm mt-1 mb-4">
                      Click the &quot;COMPILE&quot; button above or press Ctrl+Enter to compile your document client-side.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleCompile()}
                      disabled={isCompiling}
                      className="px-3 py-1.5 bg-sage hover:bg-sage-hover text-canvas font-mono text-xs font-semibold rounded-xs border border-sage transition-colors"
                    >
                      COMPILE NOW
                    </button>
                  </div>
                )}
              </div>

              {/* Diagnostic Status Footer & Expandable Drawer */}
              <div className="border-t border-border bg-canvas-surface">
                <div
                  onClick={() => setIsLogDrawerOpen(!isLogDrawerOpen)}
                  className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-canvas-subtle transition-colors select-none"
                >
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <Terminal className="w-3.5 h-3.5 text-ink-muted" />
                    <span className="font-bold text-ink uppercase">COMPILATION LOGS</span>

                    {compileResult && (
                      <span className="flex items-center gap-1.5 ml-2">
                        {compileResult.success ? (
                          <span className="inline-flex items-center gap-1 text-status-success text-[10px]">
                            <CheckCircle2 className="w-3 h-3" />
                            SUCCESS ({compileResult.durationMs}ms)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-status-danger text-[10px]">
                            <XCircle className="w-3 h-3" />
                            {compileResult.errors.length} ERROR{compileResult.errors.length > 1 ? "S" : ""}
                          </span>
                        )}

                        {compileResult.warnings.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-status-warning text-[10px] ml-1">
                            <AlertTriangle className="w-3 h-3" />
                            {compileResult.warnings.length} WARN
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  <div className="text-ink-muted">
                    {isLogDrawerOpen ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronUp className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {/* Expanded Log Output */}
                {isLogDrawerOpen && (
                  <div className="p-3 bg-canvas-subtle border-t border-border max-h-56 overflow-auto font-mono text-[11px] text-ink leading-relaxed space-y-1">
                    {compileResult?.logs ? (
                      <pre className="whitespace-pre-wrap font-inherit text-ink-secondary">
                        {compileResult.logs}
                      </pre>
                    ) : (
                      <p className="text-ink-muted">No compilation logs recorded yet.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Local Agent Settings Modal */}
      <LocalAgentModal
        isOpen={isAgentModalOpen}
        onClose={() => setIsAgentModalOpen(false)}
        config={agentConfig}
        onSave={handleSaveAgentConfig}
      />
    </div>
  );
}
