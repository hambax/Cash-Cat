/** Plain-language summary of a stored rule pattern JSON for tables and previews. */
export function describeRulePattern(patternJson: string): string {
  const raw = patternJson.trim();
  if (!raw) return "—";
  try {
    const j = JSON.parse(raw) as {
      kind?: string;
      terms?: string[];
      pattern?: string;
      amount_sign?: string;
    };
    const sign =
      j.amount_sign && j.amount_sign !== "any"
        ? j.amount_sign === "negative"
          ? " · debits only"
          : j.amount_sign === "positive"
            ? " · credits only"
            : ""
        : "";
    if (j.kind === "contains_any" && Array.isArray(j.terms) && j.terms.length > 0) {
      return `If text contains any of: ${j.terms.join(", ")}${sign}`;
    }
    if (j.kind === "contains_all" && Array.isArray(j.terms) && j.terms.length > 0) {
      return `If text contains all of: ${j.terms.join(", ")}${sign}`;
    }
    if (j.kind === "regex" && typeof j.pattern === "string" && j.pattern.length > 0) {
      const p = j.pattern.length > 48 ? `${j.pattern.slice(0, 45)}…` : j.pattern;
      return `Regular expression: ${p}${sign}`;
    }
  } catch {
    /* fall through */
  }
  return raw.length > 72 ? `${raw.slice(0, 69)}…` : raw;
}
