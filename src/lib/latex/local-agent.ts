import { CompileResult, LocalAgentConfig } from "./types";

export const DEFAULT_AGENT_CONFIG: LocalAgentConfig = {
  endpoint: "http://127.0.0.1:4567",
  token: "",
};

export async function testLocalAgentConnection(config: LocalAgentConfig): Promise<boolean> {
  try {
    const url = `${config.endpoint.replace(/\/+$/, "")}/health`;
    const res = await fetch(url, {
      method: "GET",
      headers: config.token ? { Authorization: `Bearer ${config.token}` } : {},
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function compileViaLocalAgent(
  source: string,
  config: LocalAgentConfig
): Promise<CompileResult> {
  const startTime = performance.now();
  const baseUrl = config.endpoint.replace(/\/+$/, "");

  try {
    const res = await fetch(`${baseUrl}/compile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      },
      body: JSON.stringify({
        source,
        format: "pdf",
      }),
      signal: AbortSignal.timeout(30000),
    });

    const durationMs = Math.round(performance.now() - startTime);

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        logs: `[Local Agent Error (${res.status})]: ${errText || res.statusText}`,
        errors: [{ message: errText || `Local Agent responded with status ${res.status}` }],
        warnings: [],
        durationMs,
        tierUsed: "tier2_agent",
      };
    }

    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/pdf")) {
      const blob = await res.blob();
      const pdfUrl = URL.createObjectURL(blob);
      return {
        success: true,
        pdfBlob: blob,
        pdfUrl,
        logs: `Compilation completed via Local Agent (127.0.0.1) in ${durationMs}ms.\nOutput format: PDF`,
        errors: [],
        warnings: [],
        durationMs,
        tierUsed: "tier2_agent",
      };
    }

    // JSON response with base64 PDF and logs
    const data = await res.json();
    let pdfUrl: string | undefined = undefined;
    let pdfBlob: Blob | undefined = undefined;

    if (data.pdfBase64) {
      const byteCharacters = atob(data.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      pdfBlob = new Blob([byteArray as unknown as BlobPart], { type: "application/pdf" });
      pdfUrl = URL.createObjectURL(pdfBlob);
    }

    return {
      success: Boolean(data.success),
      pdfBlob,
      pdfUrl,
      logs: data.logs || (data.success ? "Compiled successfully via Local Agent." : "Compilation failed."),
      errors: data.errors || [],
      warnings: data.warnings || [],
      durationMs: data.durationMs || durationMs,
      tierUsed: "tier2_agent",
    };
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - startTime);
    const msg =
      err.name === "TimeoutError"
        ? "Compilation timed out after 30 seconds."
        : `Could not connect to Local Agent at ${config.endpoint}. Please verify that the agent is running on 127.0.0.1 with the correct pairing token.`;

    return {
      success: false,
      logs: `[Local Agent Error]: ${msg}`,
      errors: [{ message: msg }],
      warnings: [],
      durationMs,
      tierUsed: "tier2_agent",
    };
  }
}
