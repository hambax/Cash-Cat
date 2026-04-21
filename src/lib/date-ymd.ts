import { format } from "date-fns";

/** Parse yyyy-mm-dd as local calendar date. */
export function parseYmd(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return undefined;
  return dt;
}

export function formatYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}
