import { differenceInCalendarDays, eachMonthOfInterval, max, min } from "date-fns";
import { parseYmd } from "@/lib/date-ymd";

export type BudgetPeriod = "weekly" | "monthly" | "custom";

/**
 * How many full budget periods overlap the inclusive filter range [dateFrom, dateTo].
 * Used to compare total spend in range against (amount per period × count).
 */
export function countBudgetPeriodsInRange(
  dateFrom: string,
  dateTo: string,
  period: BudgetPeriod,
  customPeriodDays: number | null | undefined,
): number {
  const from = parseYmd(dateFrom.trim());
  const to = parseYmd(dateTo.trim());
  if (!from || !to) return 1;
  const start = min([from, to]);
  const end = max([from, to]);

  if (period === "monthly") {
    return Math.max(1, eachMonthOfInterval({ start, end }).length);
  }

  const inclusiveDays = differenceInCalendarDays(end, start) + 1;

  if (period === "weekly") {
    return Math.max(1, Math.ceil(inclusiveDays / 7));
  }

  const d = Math.max(1, Math.min(366, customPeriodDays ?? 30));
  return Math.max(1, Math.ceil(inclusiveDays / d));
}
