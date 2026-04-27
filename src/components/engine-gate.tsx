import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import type { EngineStatusView } from "@/lib/engine-tauri";
import { clearEngineBaseUrlCache } from "@/lib/api";
import { isTauriShell } from "@/lib/engine-tauri";

/** Ocean Navy — engine boot progress (product spec). */
const ENGINE_BOOT_BAR_HEX = "#2E5BFF";

/** Align with Rust readiness watcher (~10 s max). */
const BOOT_CAP_MS = 10_000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function useBootProgressPercent(engineReady: boolean): number {
  const [pct, setPct] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (engineReady) {
      setPct(100);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - t0;
      let p: number;
      if (reducedMotion) {
        p = Math.min(90, (elapsed / BOOT_CAP_MS) * 90);
      } else {
        const tau = 4200;
        p = Math.min(90, 90 * (1 - Math.exp(-elapsed / tau)));
      }
      setPct(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engineReady, reducedMotion]);

  return pct;
}

function AnimatedTitleEllipsis({ reducedMotion }: { reducedMotion: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => setN((x) => (x + 1) % 4), 420);
    return () => window.clearInterval(id);
  }, [reducedMotion]);
  if (reducedMotion) {
    return <span aria-hidden>…</span>;
  }
  return <span aria-hidden>{"".padEnd(n, ".")}</span>;
}

function EngineStartingScreen({
  phase,
  progressPercent,
  reducedMotion,
}: {
  phase: "initial" | "waiting";
  progressPercent: number;
  reducedMotion: boolean;
}) {
  const title = "Getting Cash Cat ready";
  const description =
    phase === "initial"
      ? "Preparing everything on your device. This should only take a moment."
      : "Still preparing—this should only take a moment.";

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-5 bg-background px-6 py-10 text-center text-foreground">
      <img src="/cash-cat-logo.svg" alt="" width={56} height={56} className="h-14 w-14 shrink-0 object-contain" />
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-lg font-semibold">
          {title}
          <span className="inline-block min-w-[1.25em] text-left">
            <AnimatedTitleEllipsis reducedMotion={reducedMotion} />
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
        <div
          className={reducedMotion ? "h-full rounded-full" : "h-full rounded-full transition-[width] duration-200 ease-out"}
          style={{
            width: `${progressPercent}%`,
            backgroundColor: ENGINE_BOOT_BAR_HEX,
          }}
        />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">{Math.round(progressPercent)}%</p>
    </div>
  );
}

/**
 * In the Tauri shell, blocks the main app until the engine is ready or shows an error.
 * In the browser, renders children immediately (Vite + engine on a fixed port).
 */
export function EngineGate({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<EngineStatusView | null>(null);
  const [unveilMain, setUnveilMain] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const engineReady = view?.state === "ready";
  const bootProgress = useBootProgressPercent(engineReady);

  useEffect(() => {
    if (!engineReady) {
      setUnveilMain(false);
      return;
    }
    const t = window.setTimeout(() => setUnveilMain(true), reducedMotion ? 0 : 280);
    return () => window.clearTimeout(t);
  }, [engineReady, reducedMotion]);

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
            error: "Could not read startup status from the native shell.",
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
    return <EngineStartingScreen phase="initial" progressPercent={bootProgress} reducedMotion={reducedMotion} />;
  }

  if (view.state === "starting") {
    return <EngineStartingScreen phase="waiting" progressPercent={bootProgress} reducedMotion={reducedMotion} />;
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
                "Could not restart Cash Cat. Try again, or open the logs folder to see the latest output.",
              log_path: null,
              port: 0,
              base_url: "",
            } as EngineStatusView);
          }
        }}
      />
    );
  }

  if (view.state === "ready" && !unveilMain) {
    return <EngineStartingScreen phase="waiting" progressPercent={bootProgress} reducedMotion={reducedMotion} />;
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
    <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-background px-6 py-10 text-center text-foreground">
      <h1 className="text-lg font-semibold">Cash Cat could not start on this machine.</h1>
      <p className="text-muted-foreground text-sm max-w-md">
        {status.error?.trim() ||
          "The local background process did not start or stopped before it was ready. The log file may contain more detail."}
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
