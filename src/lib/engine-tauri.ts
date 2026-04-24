/** Payload from the `engine_status` Tauri command (see `src-tauri/src/lib.rs`). */
export type EngineStatusView = {
  state: "starting" | "ready" | "failed" | string;
  error: string | null;
  log_path: string | null;
  port: number;
  base_url: string;
};

export function isTauriShell(): boolean {
  if (import.meta.env.TAURI_PLATFORM != null && import.meta.env.TAURI_PLATFORM !== "") {
    return true;
  }
  if (import.meta.env.TAURI_ARCH != null && import.meta.env.TAURI_ARCH !== "") {
    return true;
  }
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}
