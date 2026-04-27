/** Canonical chart palette preset identifiers (persisted as `chart_theme_id`). */

export type ChartThemeId =
  | "ocean"
  | "forest"
  | "rainbow"
  | "soft"
  | "cyberpunk"
  | "monochrome"
  | "midnight_lavender";

export const DEFAULT_CHART_THEME_ID: ChartThemeId = "ocean";

export const CHART_THEME_OPTIONS: { id: ChartThemeId; label: string }[] = [
  { id: "ocean", label: "Ocean" },
  { id: "forest", label: "Forest" },
  { id: "rainbow", label: "Rainbow" },
  { id: "soft", label: "Soft palette" },
  { id: "cyberpunk", label: "Cyberpunk" },
  { id: "monochrome", label: "Monochrome professional" },
  { id: "midnight_lavender", label: "Midnight lavender" },
];

const PRESETS: Record<ChartThemeId, readonly string[]> = {
  /** Deep sea blues → light teal; last three are soft coral-reef pastels (peach, pink, butter). */
  ocean: [
    "#031D40",
    "#053462",
    "#0A5C8F",
    "#1384B0",
    "#2A9FBC",
    "#4DB8C8",
    "#7FD0DE",
    "#F4C4B0",
    "#F5B5CA",
    "#F9E8A8",
  ],
  forest: [
    "#2D5A27",
    "#4B6F44",
    "#8F9779",
    "#D2B48C",
    "#8B4513",
    "#A0522D",
    "#DEB887",
    "#556B2F",
    "#6B8E23",
    "#BC8F8F",
  ],
  rainbow: [
    "#E60000",
    "#FF8E00",
    "#FFE600",
    "#008121",
    "#004CFF",
    "#760188",
    "#8B4513",
    "#FF00FF",
    "#00FFFF",
    "#C0C0C0",
  ],
  soft: [
    "#FFB7B2",
    "#FFDAC1",
    "#E2F0CB",
    "#B5EAD7",
    "#C7CEEA",
    "#F3FFE3",
    "#D4A5A5",
    "#97C1A9",
    "#8076A3",
    "#B99095",
  ],
  cyberpunk: [
    "#00FFF7",
    "#FF00FF",
    "#39FF14",
    "#FF073A",
    "#7B00FF",
    "#00F7FF",
    "#FF6B00",
    "#E0FF4F",
    "#FF00AA",
    "#00FF9F",
  ],
  monochrome: [
    "#64748B",
    "#475569",
    "#334155",
    "#1E293B",
    "#0F172A",
    "#94A3B8",
    "#CBD5E1",
    "#E2E8F0",
    "#FBBF24",
    "#38BDF8",
  ],
  midnight_lavender: [
    "#1A0A2E",
    "#2D1B4E",
    "#432371",
    "#714674",
    "#A855F7",
    "#C084FC",
    "#E9D5FF",
    "#7C3AED",
    "#6B21A8",
    "#581C87",
  ],
};

export function getThemeColors(themeId: string): string[] {
  const id = themeId as ChartThemeId;
  const row = PRESETS[id];
  if (!row) return [...PRESETS.ocean];
  return [...row];
}

export function isChartThemeId(s: string): s is ChartThemeId {
  return s in PRESETS;
}

function normaliseHex(h: string): string {
  const t = h.trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (!m) return "";
  let x = m[1];
  if (x.length === 3) {
    x = x
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${x.toLowerCase()}`;
}

export function normaliseChartHexes(hexes: string[]): string[] {
  return hexes.map(normaliseHex).filter(Boolean);
}

/** Match a saved `chart` array back to a preset (exact normalised sequence). */
export function findPresetIdByChartHexes(hexes: string[] | undefined | null): ChartThemeId | null {
  if (!hexes || hexes.length !== 10) return null;
  const a = normaliseChartHexes(hexes);
  if (a.length !== 10) return null;
  for (const id of Object.keys(PRESETS) as ChartThemeId[]) {
    const b = normaliseChartHexes([...PRESETS[id]]);
    if (a.every((v, i) => v === b[i])) return id;
  }
  return null;
}

export function isValidChartPalette(hexes: string[]): boolean {
  if (hexes.length !== 10) return false;
  return normaliseChartHexes(hexes).length === 10;
}
