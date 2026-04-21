import { layout, prepare } from "@chenglou/pretext";

/**
 * Wrapped paragraph height for a given width, without DOM measurement.
 * Keep `font` aligned with CSS (e.g. `font` on `CardDescription` is `text-sm`).
 */
export function measureParagraphHeight(
  text: string,
  font: string,
  maxWidth: number,
  lineHeightPx: number,
): number {
  if (!text.trim()) return 0;
  const prepared = prepare(text, font);
  return layout(prepared, Math.max(0, maxWidth), lineHeightPx).height;
}
