/** NZD display — single home currency v1 */

export function formatMoney(cents: number, currency = "NZD"): string {
  const v = cents / 100;
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(v);
}
