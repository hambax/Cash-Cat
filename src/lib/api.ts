import { invoke } from "@tauri-apps/api/core";
import type {
  AIProviderConfig,
  AIProviderModelsResponse,
  AIProviderResponse,
  AIProviderTestResult,
} from "@/types/ai-provider";

let cachedBase: string | null = null;

export async function getEngineBaseUrl(): Promise<string> {
  if (cachedBase) return cachedBase;
  try {
    cachedBase = await invoke<string>("engine_base_url");
    return cachedBase;
  } catch {
    // Dev fallback when not running inside Tauri
    const envUrl = import.meta.env.VITE_ENGINE_URL as string | undefined;
    cachedBase = envUrl && envUrl.length > 0 ? envUrl : "http://127.0.0.1:8787";
    return cachedBase;
  }
}

/** Browser/network errors where our own copy already explains the failure. */
const REDUNDANT_ENGINE_ERROR_MESSAGES = new Set([
  "Failed to fetch",
  "Load failed",
  "NetworkError when attempting to fetch resource.",
  "The Internet connection appears to be offline.",
  "Network request failed",
]);

/**
 * User-facing message when the UI cannot reach the engine (fetch threw before HTTP).
 * Includes the base URL tried; in dev, appends the underlying error only when it adds detail.
 */
export function formatEngineUnreachableMessage(
  err: unknown,
  baseUrl: string,
  includeDevDetail: boolean,
): string {
  let suffix = "";
  if (includeDevDetail && err instanceof Error) {
    const msg = err.message.trim();
    if (msg && !REDUNDANT_ENGINE_ERROR_MESSAGES.has(msg)) {
      suffix = ` (${msg})`;
    }
  }
  return `Could not reach the Cash Cat engine at ${baseUrl}. Is it running? In development, run \`npm run dev\` from the project root to start the UI and engine together, or run \`npm run dev:ui\` and \`npm run engine\` in separate terminals. Set \`VITE_ENGINE_URL\` if the engine uses another host or port.${suffix}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = await getEngineBaseUrl();
  const hasBody = init?.body != null && init.body !== "";
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
}

async function parseJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    const d = body.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d))
      return d.map((x: { msg?: string }) => x.msg ?? JSON.stringify(x)).join("; ");
  } catch {
    /* ignore */
  }
  return `HTTP ${res.status}`;
}

export async function getAIProvider(): Promise<AIProviderResponse> {
  const res = await apiFetch("/settings/ai-provider");
  if (!res.ok) throw new Error(await parseJsonError(res));
  return (await res.json()) as AIProviderResponse;
}

export async function saveAIProvider(config: AIProviderConfig): Promise<AIProviderResponse> {
  const res = await apiFetch("/settings/ai-provider", {
    method: "POST",
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return (await res.json()) as AIProviderResponse;
}

export async function testAIProvider(config: AIProviderConfig): Promise<AIProviderTestResult> {
  const res = await apiFetch("/settings/ai-provider/test", {
    method: "POST",
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(await parseJsonError(res));
  return (await res.json()) as AIProviderTestResult;
}

export async function getAIProviderModels(
  provider: string,
  baseUrl?: string | null,
): Promise<AIProviderModelsResponse> {
  const q = new URLSearchParams({ provider });
  if (baseUrl && baseUrl.trim()) q.set("base_url", baseUrl.trim());
  const res = await apiFetch(`/settings/ai-provider/models?${q.toString()}`);
  if (!res.ok) throw new Error(await parseJsonError(res));
  return (await res.json()) as AIProviderModelsResponse;
}
