/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENGINE_URL?: string;
  /** Injected by the Tauri + Vite integration when built or served for the shell. */
  readonly TAURI_PLATFORM?: string;
  readonly TAURI_ARCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
