export type CompileTier = "tier1_wasm" | "tier2_agent";

export interface CompileError {
  line?: number;
  message: string;
  file?: string;
  raw?: string;
}

export interface CompileResult {
  success: boolean;
  pdfBlob?: Blob;
  pdfUrl?: string;
  logs: string;
  errors: CompileError[];
  warnings: string[];
  durationMs: number;
  tierUsed: CompileTier;
}

export interface LocalAgentConfig {
  endpoint: string;
  token: string;
}

export interface LaTeXCompilerOptions {
  tier?: CompileTier;
  agentConfig?: LocalAgentConfig;
  autoCompile?: boolean;
}
