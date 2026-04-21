export type AIProviderName = "anthropic" | "openai" | "gemini" | "ollama" | "none";

export interface AIProviderConfig {
  provider: AIProviderName;
  api_key?: string | null;
  base_url?: string | null;
  model?: string | null;
}

export interface AIProviderResponse {
  provider: AIProviderName;
  has_key: boolean;
  key_hint?: string | null;
  base_url?: string | null;
  model?: string | null;
  updated_at?: string | null;
  warnings?: string[];
}

export interface AIProviderTestResult {
  success: boolean;
  message: string;
  latency_ms?: number | null;
}

export interface AIProviderModelsResponse {
  provider: string;
  models: string[];
}

/** Recommended default model per provider (matches engine defaults). */
export const DEFAULT_MODEL_BY_PROVIDER: Record<Exclude<AIProviderName, "none">, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-5.4",
  gemini: "gemini-3.1-pro-preview",
  ollama: "llama3",
};

export const CLOUD_MODEL_SUGGESTIONS: Record<"anthropic" | "openai" | "gemini", string[]> = {
  anthropic: ["claude-sonnet-4-20250514", "claude-opus-4-7", "claude-haiku-3-5"],
  openai: ["gpt-5.4", "gpt-5.4-thinking", "gpt-4o", "gpt-4o-mini"],
  gemini: ["gemini-3.1-pro-preview", "gemini-2.5-flash", "gemini-2.0-flash"],
};

export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
