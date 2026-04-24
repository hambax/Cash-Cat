import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import type { EngineStatusView } from "@/lib/engine-tauri";
import { clearEngineBaseUrlCache } from "@/lib/api";
import { isTauriShell } from "@/lib/engine-tauri";

/**
 * In the Tauri shell, blocks the main app until the engine is ready or shows an error.
 * In the browser, renders children immediately (Vite + engine on a fixed port).
 */
export function EngineGate({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<EngineStatusView | null>(null);

  useEffect(() => {
    if (!isTauriShell()) {
      setView({
        state: "ready",
        error: null,
        log_path: null,
        port: 0,
        base_url: "",
      } as EngineStatusView);
      return;
    }
    const signal = { cancelled: false };
    void (async () => {
      try {
        while (!signal.cancelled) {
          const s = await invoke<EngineStatusView>("engine_status");
          if (signal.cancelled) return;
          setView(s);
          if (s.state === "ready" || s.state === "failed") {
            return;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
      } catch {
        if (!signal.cancelled) {
          setView({
            state: "failed",
            error: "Could not read engine status from the native shell.",
            log_path: null,
            port: 0,
            base_url: "",
          } as EngineStatusView);
        }
      }
    })();
    return () => {
      signal.cancelled = true;
    };
  }, []);

  if (!isTauriShell()) {
    return <>{children}</>;
  }

  if (view === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <h1 className="text-lg font-semibold">Starting engine…</h1>
        <p className="text-muted-foreground text-sm max-w-md">
          Cash Cat is starting its local engine. This should only take a moment.
        </p>
      </div>
    );
  }

  if (view.state === "starting") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <h1 className="text-lg font-semibold">Starting engine…</h1>
        <p className="text-muted-foreground text-sm max-w-md">
          Waiting for the engine to respond. This should only take a moment.
        </p>
      </div>
    );
  }

  if (view.state === "failed") {
    return (
      <EngineFailedScreen
        status={view}
        onRetry={async () => {
          clearEngineBaseUrlCache();
          setView({
            state: "starting",
            error: null,
            log_path: null,
            port: 0,
            base_url: "",
          } as EngineStatusView);
          try {
            await invoke("retry_engine");
            for (;;) {
              const s = await invoke<EngineStatusView>("engine_status");
              setView(s);
              if (s.state === "ready" || s.state === "failed") {
                return;
              }
              await new Promise((r) => setTimeout(r, 100));
            }
          } catch {
            setView({
              state: "failed",
              error:
                "Could not restart the engine. Try again, or open the logs folder to see the latest output.",
              log_path: null,
              port: 0,
              base_url: "",
            } as EngineStatusView);
          }
        }}
      />
    );
  }

  return <>{children}</>;
}

function EngineFailedScreen({
  status,
  onRetry,
}: {
  status: EngineStatusView;
  onRetry: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const openLogs = async () => {
    try {
      await invoke("open_engine_logs_dir");
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <h1 className="text-lg font-semibold">Cash Cat could not start its engine on this machine.</h1>
      <p className="text-muted-foreground text-sm max-w-md">
        {status.error?.trim() ||
          "The local engine process did not start or stopped before it was ready. The log file may contain more detail."}
      </p>
      {status.log_path ? (
        <p className="text-muted-foreground break-all text-xs max-w-lg">Log file: {status.log_path}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={openLogs} variant="secondary">
          Open logs folder
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onRetry();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Retrying…" : "Try again"}
        </Button>
      </div>
    </div>
  );
}
