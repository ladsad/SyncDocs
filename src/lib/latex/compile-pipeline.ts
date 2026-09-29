import { CompileResult, CompileTier, LaTeXCompilerOptions, LocalAgentConfig } from "./types";
import { compileLaTeXWasm } from "./wasm-compiler";
import { compileViaLocalAgent, DEFAULT_AGENT_CONFIG, testLocalAgentConnection } from "./local-agent";

const LOCAL_STORAGE_AGENT_KEY = "syncdocs_latex_agent_config";
const LOCAL_STORAGE_TIER_KEY = "syncdocs_latex_compile_tier";

export function getStoredAgentConfig(): LocalAgentConfig {
  if (typeof window === "undefined") return DEFAULT_AGENT_CONFIG;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_AGENT_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_AGENT_CONFIG;
  } catch {
    return DEFAULT_AGENT_CONFIG;
  }
}

export function saveStoredAgentConfig(config: LocalAgentConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_AGENT_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn("Failed to persist local agent config:", e);
  }
}

export function getStoredCompileTier(): CompileTier {
  if (typeof window === "undefined") return "tier1_wasm";
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_TIER_KEY);
    return raw === "tier2_agent" ? "tier2_agent" : "tier1_wasm";
  } catch {
    return "tier1_wasm";
  }
}

export function saveStoredCompileTier(tier: CompileTier): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_TIER_KEY, tier);
  } catch (e) {
    console.warn("Failed to persist compile tier:", e);
  }
}

export async function compileLaTeX(
  source: string,
  options: LaTeXCompilerOptions = {}
): Promise<CompileResult> {
  const tier = options.tier || getStoredCompileTier();

  if (tier === "tier2_agent") {
    const config = options.agentConfig || getStoredAgentConfig();
    return compileViaLocalAgent(source, config);
  }

  // Default to Tier 1 Browser WASM
  return compileLaTeXWasm(source);
}

export { testLocalAgentConnection };
