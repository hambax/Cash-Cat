import type { BudgetPeriod } from "@/lib/budget-proration";

/** User-facing suffix for budget amounts, e.g. "per week", "per month", "per 10 days". */
export function budgetPeriodPhrase(
  period: BudgetPeriod,
  customPeriodDays: number | null | undefined,
): string {
  if (period === "weekly") return "per week";
  if (period === "monthly") return "per month";
  if (period === "custom") {
    const d = customPeriodDays;
    if (typeof d === "number" && d >= 1) return `per ${d} days`;
    return "per custom period";
  }
  return "per month";
}
