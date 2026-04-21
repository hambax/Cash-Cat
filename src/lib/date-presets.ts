import { endOfMonth, startOfDay, startOfMonth, subMonths } from "date-fns";
import { formatYmd } from "@/lib/date-ymd";

/** Previous calendar month, inclusive. */
export function presetLastCalendarMonth(): { start: string; end: string } {
  const now = new Date();
  const prev = subMonths(now, 1);
  return {
    start: formatYmd(startOfMonth(prev)),
    end: formatYmd(endOfMonth(prev)),
  };
}

export type RollingMonthsPreset = 3 | 6 | 12 | 18 | 24;

/**
 * Rolling window: end = latest day in range (defaults to today), start = same calendar day N months earlier.
 * Pass the latest imported transaction date so the window aligns with your data, not “today” past last txn.
 */
export function presetRollingMonths(months: RollingMonthsPreset, endDate: Date = new Date()): { start: string; end: string } {
  const end = startOfDay(endDate);
  const start = startOfDay(subMonths(end, months));
  return { start: formatYmd(start), end: formatYmd(end) };
}

/** Clamp an inclusive [from, to] range to [minDate, maxDate] (yyyy-mm-dd strings). */
export function clampRangeToBounds(
  minDate: string,
  maxDate: string,
  from: string,
  to: string,
): { from: string; to: string } {
  let a = from <= to ? from : to;
  let b = from <= to ? to : from;
  if (a < minDate) a = minDate;
  if (b > maxDate) b = maxDate;
  if (a > b) return { from: minDate, to: maxDate };
  return { from: a, to: b };
}
