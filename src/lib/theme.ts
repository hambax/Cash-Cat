/**
 * Maps saved theme (hex from settings API) onto CSS variables used by Tailwind
 * (`hsl(var(--primary))`, etc.). See `src/index.css` :root tokens.
 */

import {
  DEFAULT_CHART_THEME_ID,
  getThemeColors,
  isChartThemeId,
  isValidChartPalette,
  normaliseChartHexes,
} from "@/lib/chart-theme-presets";

export const DEFAULT_THEME_PRIMARY_HEX = "#3b82f6";
export const DEFAULT_THEME_ACCENT_HEX = "#2563eb";

export type SavedThemePayload = {
  primary?: string | null;
  accent?: string | null;
  chart?: string[] | null;
  chart_theme_id?: string | null;
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return null;
  return [r, g, b];
}

/** Space-separated HSL for `hsl(var(--primary))` — values like `221 83% 53%`. */
export function hexToHslSpaceSeparated(hex: string): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** WCAG relative luminance–based foreground for text on coloured buttons. */
function foregroundHslForHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "210 40% 98%";
  const [rs, gs, bs] = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  return L > 0.45 ? "222 47% 11%" : "210 40% 98%";
}

const CUSTOM_THEME_KEYS = [
  "--primary",
  "--primary-foreground",
  "--ring",
  "--accent",
  "--accent-foreground",
] as const;

const CHART_VAR_COUNT = 20;

/** Buttons, links, rings — does not set `--chart-*` (use with a chart palette). */
export function applyChromeColors(theme: { primary?: string | null; accent?: string | null }): void {
  const root = document.documentElement;

  if (theme.primary) {
    const hsl = hexToHslSpaceSeparated(theme.primary);
    if (hsl) {
      root.style.setProperty("--primary", hsl);
      root.style.setProperty("--ring", hsl);
      root.style.setProperty("--primary-foreground", foregroundHslForHex(theme.primary));
    }
  }

  if (theme.accent) {
    const hsl = hexToHslSpaceSeparated(theme.accent);
    if (hsl) {
      root.style.setProperty("--accent", hsl);
      root.style.setProperty("--accent-foreground", foregroundHslForHex(theme.accent));
    }
  }
}

function writeChartVars(norm: string[]): boolean {
  const root = document.documentElement;
  const hsls: string[] = [];
  for (let i = 0; i < 10; i++) {
    const hsl = hexToHslSpaceSeparated(norm[i]);
    if (!hsl) return false;
    hsls.push(hsl);
  }
  for (let i = 0; i < 10; i++) {
    root.style.setProperty(`--chart-${i + 1}`, hsls[i]);
    root.style.setProperty(`--chart-${i + 11}`, hsls[i]);
  }
  return true;
}

/** Apply 10 analytics colours to `--chart-1`…`--chart-10` and mirror `--chart-11`…`--chart-20`. */
export function applyChartPalette(hexes: string[]): boolean {
  const fallback = normaliseChartHexes(getThemeColors(DEFAULT_CHART_THEME_ID));
  if (!isValidChartPalette(hexes)) {
    writeChartVars(fallback);
    return false;
  }
  const norm = normaliseChartHexes(hexes);
  if (!writeChartVars(norm)) {
    writeChartVars(fallback);
    return false;
  }
  return true;
}

export function clearChartPaletteOverrides(): void {
  for (let i = 1; i <= CHART_VAR_COUNT; i++) {
    document.documentElement.style.removeProperty(`--chart-${i}`);
  }
}

/**
 * Primary/accent only, and maps primary to `--chart-1` (legacy / no saved palette).
 */
export function applySavedTheme(theme: { primary?: string | null; accent?: string | null }): void {
  applyChromeColors(theme);
  const root = document.documentElement;
  if (theme.primary) {
    const hsl = hexToHslSpaceSeparated(theme.primary);
    if (hsl) {
      root.style.setProperty("--chart-1", hsl);
      root.style.setProperty("--chart-11", hsl);
    }
  }
}

function hasAnySavedTheme(t: SavedThemePayload): boolean {
  return Boolean(
    t.primary?.trim() ||
      t.accent?.trim() ||
      (t.chart && t.chart.length > 0) ||
      t.chart_theme_id?.trim(),
  );
}

/**
 * Apply saved JSON from `/settings/theme`: full chart palette when present, otherwise legacy primary→chart-1.
 */
export function applyFullThemeFromSaved(t: SavedThemePayload): void {
  if (!hasAnySavedTheme(t)) {
    clearAppliedTheme();
    return;
  }

  const fromChart =
    t.chart && isValidChartPalette(t.chart) ? normaliseChartHexes(t.chart) : null;
  const fromId =
    t.chart_theme_id && isChartThemeId(t.chart_theme_id.trim())
      ? getThemeColors(t.chart_theme_id.trim())
      : null;
  /* Prefer bundled preset colours when `chart_theme_id` is set so palette tweaks ship without re-saving hex arrays. */
  const palette = fromId ?? fromChart;

  if (palette) {
    applyChartPalette(palette);
    applyChromeColors({ primary: t.primary, accent: t.accent });
    return;
  }

  applySavedTheme({ primary: t.primary, accent: t.accent });
}

/** Remove inline theme overrides so `index.css` defaults (and `.dark`) apply again. */
export function clearAppliedTheme(): void {
  for (const key of CUSTOM_THEME_KEYS) {
    document.documentElement.style.removeProperty(key);
  }
  clearChartPaletteOverrides();
}
