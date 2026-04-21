import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAIProvider,
  getAIProviderModels,
  saveAIProvider,
  testAIProvider,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  CLOUD_MODEL_SUGGESTIONS,
  DEFAULT_MODEL_BY_PROVIDER,
  DEFAULT_OLLAMA_BASE_URL,
  type AIProviderName,
} from "@/types/ai-provider";

const PROVIDER_OPTIONS: { value: AIProviderName; label: string }[] = [
  { value: "none", label: "None" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Google Gemini" },
  { value: "ollama", label: "Ollama (local)" },
];

type TestLine = { success: boolean; message: string; latency_ms?: number | null };

/** One width for every control in this card (matches design-system Select). */
const FIELD_CLASS = "w-full max-w-md";

/** Sentinel value for “type a custom model ID” in the cloud model Select. */
const CLOUD_MODEL_CUSTOM = "__custom__";

export function AIProviderCard() {
  const [provider, setProvider] = useState<AIProviderName>("none");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_OLLAMA_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [serverHasKey, setServerHasKey] = useState(false);
  const [keyEditMode, setKeyEditMode] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testLine, setTestLine] = useState<TestLine | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaWarn, setOllamaWarn] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTest = useCallback(() => setTestLine(null), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAIProvider();
      setProvider(data.provider);
      setModel(data.model ?? "");
      setBaseUrl(data.base_url?.trim() || DEFAULT_OLLAMA_BASE_URL);
      setKeyHint(data.key_hint ?? null);
      setServerHasKey(data.has_key);
      const cloud = ["anthropic", "openai", "gemini"].includes(data.provider);
      setKeyEditMode(!data.has_key || !cloud);
      setApiKey("");
    } catch {
      toast.error("Could not load AI provider settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchOllamaModels = useCallback(async (url: string) => {
    try {
      const res = await getAIProviderModels("ollama", url);
      setOllamaModels(res.models);
      setOllamaWarn(res.models.length === 0);
    } catch {
      setOllamaModels([]);
      setOllamaWarn(true);
    }
  }, []);

  useEffect(() => {
    if (provider !== "ollama") {
      setOllamaModels([]);
      setOllamaWarn(false);
      return;
    }
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void fetchOllamaModels(baseUrl || DEFAULT_OLLAMA_BASE_URL);
    }, 500);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [provider, baseUrl, fetchOllamaModels]);

  useEffect(() => {
    if (provider !== "ollama" || ollamaModels.length === 0) return;
    if (!ollamaModels.includes(model)) {
      setModel(ollamaModels[0]);
    }
  }, [provider, ollamaModels, model]);

  const onProviderSelect = (v: string) => {
    clearTest();
    const p = v as AIProviderName;
    setProvider(p);
    setApiKey("");
    setKeyHint(null);
    setServerHasKey(false);
    setKeyEditMode(true);
    setShowKey(false);
    if (p === "none") {
      setModel("");
      setBaseUrl(DEFAULT_OLLAMA_BASE_URL);
    } else if (p === "ollama") {
      setBaseUrl(DEFAULT_OLLAMA_BASE_URL);
      setModel(DEFAULT_MODEL_BY_PROVIDER.ollama);
    } else {
      setModel(DEFAULT_MODEL_BY_PROVIDER[p]);
      setBaseUrl("");
    }
  };

  const buildPayload = (): {
    provider: AIProviderName;
    api_key?: string | null;
    base_url?: string | null;
    model?: string | null;
  } => {
    if (provider === "none") {
      return { provider: "none" };
    }
    if (provider === "ollama") {
      return {
        provider,
        base_url: baseUrl.trim() || DEFAULT_OLLAMA_BASE_URL,
        model: model.trim() || DEFAULT_MODEL_BY_PROVIDER.ollama,
      };
    }
    const body: {
      provider: AIProviderName;
      api_key?: string | null;
      model?: string | null;
    } = {
      provider,
      model: model.trim() || undefined,
    };
    if (keyEditMode && apiKey.trim()) {
      body.api_key = apiKey.trim();
    }
    return body;
  };

  const handleTest = async () => {
    clearTest();
    setTesting(true);
    try {
      const payload = buildPayload();
      if (payload.provider !== "none" && ["anthropic", "openai", "gemini"].includes(payload.provider)) {
        if (!payload.api_key?.trim() && !serverHasKey) {
          setTestLine({ success: false, message: "Enter an API key to test." });
          setTesting(false);
          return;
        }
      }
      const result = await testAIProvider(payload);
      setTestLine({
        success: result.success,
        message: result.message,
        latency_ms: result.latency_ms,
      });
    } catch (e) {
      setTestLine({
        success: false,
        message: e instanceof Error ? e.message : "Test failed.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await saveAIProvider(buildPayload());
      toast.success("AI provider settings saved.");
      if (saved.warnings && saved.warnings.length > 0) {
        for (const w of saved.warnings) toast.message(w);
      }
      setProvider(saved.provider);
      setModel(saved.model ?? "");
      setBaseUrl(saved.base_url?.trim() || DEFAULT_OLLAMA_BASE_URL);
      setKeyHint(saved.key_hint ?? null);
      setServerHasKey(saved.has_key);
      const cloud = ["anthropic", "openai", "gemini"].includes(saved.provider);
      setKeyEditMode(!saved.has_key || !cloud);
      setApiKey("");
      clearTest();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const fieldDepsKey = `${provider}|${model}|${baseUrl}|${apiKey}|${keyEditMode}`;
  useEffect(() => {
    setTestLine(null);
  }, [fieldDepsKey]);

  const cloud = provider === "anthropic" || provider === "openai" || provider === "gemini";
  const suggestionList = useMemo(
    () =>
      provider === "anthropic"
        ? CLOUD_MODEL_SUGGESTIONS.anthropic
        : provider === "openai"
          ? CLOUD_MODEL_SUGGESTIONS.openai
          : CLOUD_MODEL_SUGGESTIONS.gemini,
    [provider],
  );

  const cloudModelSelectValue = useMemo(() => {
    if (!cloud) return "";
    return suggestionList.includes(model) ? model : CLOUD_MODEL_CUSTOM;
  }, [cloud, model, suggestionList]);

  const onCloudModelSelect = (v: string) => {
    clearTest();
    if (v === CLOUD_MODEL_CUSTOM) {
      if (suggestionList.includes(model)) setModel("");
      return;
    }
    setModel(v);
  };

  return (
    <Card className="rounded-2xl lg:col-span-12">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>AI assistant</CardTitle>
            <Badge variant="secondary">Optional</Badge>
          </div>
          <CardDescription>
            Connect an AI provider for intelligent features (stored locally in your database, same as other connections).
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="ai-provider-select">Provider</Label>
              <Select value={provider} onValueChange={onProviderSelect}>
                <SelectTrigger id="ai-provider-select" className={cn(FIELD_CLASS, "rounded-xl")}>
                  <SelectValue placeholder="Choose provider" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {PROVIDER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="rounded-lg">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {provider === "none" && (
              <p className="rounded-xl border border-dashed bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
                No AI provider connected.
              </p>
            )}

            {cloud && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>API key</Label>
                  {!keyEditMode && serverHasKey && keyHint ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="rounded-lg bg-muted px-2 py-1.5 text-sm">{keyHint}</code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          setKeyEditMode(true);
                          setApiKey("");
                          clearTest();
                        }}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className={cn("relative", FIELD_CLASS)}>
                      <div className="relative w-full">
                        <Input
                          type={showKey ? "text" : "password"}
                          autoComplete="off"
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder="sk-…"
                          className="rounded-xl pr-10"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                          aria-label={showKey ? "Hide key" : "Show key"}
                          onClick={() => setShowKey((s) => !s)}
                        >
                          {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ai-model-cloud">Model</Label>
                  <Select value={cloudModelSelectValue} onValueChange={onCloudModelSelect}>
                    <SelectTrigger id="ai-model-cloud" className={cn(FIELD_CLASS, "rounded-xl")}>
                      <SelectValue placeholder="Choose a model" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {suggestionList.map((m) => (
                        <SelectItem key={m} value={m} className="rounded-lg">
                          {m}
                        </SelectItem>
                      ))}
                      <SelectItem value={CLOUD_MODEL_CUSTOM} className="rounded-lg">
                        Custom model…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {cloudModelSelectValue === CLOUD_MODEL_CUSTOM && (
                    <Input
                      className={cn(FIELD_CLASS, "rounded-xl")}
                      value={model}
                      onChange={(e) => {
                        clearTest();
                        setModel(e.target.value);
                      }}
                      placeholder="Enter model ID (e.g. claude-sonnet-4-20250514)"
                      aria-label="Custom model ID"
                    />
                  )}
                </div>
              </div>
            )}

            {provider === "ollama" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Ollama must be installed and running separately. Download from{" "}
                  <a
                    href="https://ollama.com"
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    ollama.com
                  </a>
                  , then run <code className="rounded bg-muted px-1 py-0.5 text-xs">ollama serve</code>.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="ai-ollama-base">Base URL</Label>
                  <Input
                    id="ai-ollama-base"
                    className={cn(FIELD_CLASS, "rounded-xl")}
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={DEFAULT_OLLAMA_BASE_URL}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  {ollamaModels.length > 0 ? (
                    <Select
                      value={ollamaModels.includes(model) ? model : ollamaModels[0]}
                      onValueChange={setModel}
                    >
                      <SelectTrigger className={cn(FIELD_CLASS, "rounded-xl")}>
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {ollamaModels.map((m) => (
                          <SelectItem key={m} value={m} className="rounded-lg">
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      className={cn(FIELD_CLASS, "rounded-xl")}
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      placeholder={DEFAULT_MODEL_BY_PROVIDER.ollama}
                    />
                  )}
                  {ollamaWarn && (
                    <p className="text-sm text-amber-600 dark:text-amber-500">
                      Could not list models from Ollama. Check the base URL and that Ollama is running.
                    </p>
                  )}
                </div>
              </div>
            )}

            {provider !== "none" && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  disabled={testing}
                  onClick={() => void handleTest()}
                >
                  {testing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing…
                    </>
                  ) : (
                    "Test connection"
                  )}
                </Button>
                <Button type="button" className="rounded-xl" disabled={saving} onClick={() => void handleSave()}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    "Save"
                  )}
                </Button>
              </div>
            )}

            {testLine && (
              <p
                className={cn(
                  "text-sm",
                  testLine.success ? "text-green-600 dark:text-green-500" : "text-destructive",
                )}
              >
                {testLine.success && testLine.latency_ms != null
                  ? `${testLine.message} (${testLine.latency_ms} ms)`
                  : testLine.message}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
