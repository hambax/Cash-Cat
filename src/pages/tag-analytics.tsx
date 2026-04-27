import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Hash } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/format";

type TagRow = { tag: string; amount_cents: number; pct: number };

const TAG_SLICE_FILLS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
  "hsl(var(--chart-9))",
  "hsl(var(--chart-10))",
];

export function TagAnalyticsPage() {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const boundsRes = await apiFetch("/analytics/txn-date-bounds");
      let dateFrom: string | undefined;
      let dateTo: string | undefined;
      if (boundsRes.ok) {
        const b = await boundsRes.json();
        dateFrom = (b.min_date as string) ?? undefined;
        dateTo = (b.max_date as string) ?? undefined;
      }
      const res = await apiFetch("/analytics/tags", {
        method: "POST",
        body: JSON.stringify({
          // Include paired transfer outflows so auto `transfer` / `internal_transfer` tags (and manual tags on those rows) appear.
          exclude_paired_transfer_legs: false,
          exclude_expense_category_keys: [],
          date_from: dateFrom,
          date_to: dateTo,
        }),
      });
      if (!res.ok) {
        setError("Could not load tag analytics.");
        setTags([]);
        return;
      }
      const data = (await res.json()) as { tags?: TagRow[] };
      setTags(data.tags ?? []);
    } catch {
      setError("Could not load tag analytics.");
      setTags([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pieData = useMemo(
    () =>
      tags.map((t) => ({
        name: t.tag,
        value: t.amount_cents / 100,
        pct: t.pct,
      })),
    [tags],
  );

  const totalTaggedCents = useMemo(() => tags.reduce((acc, t) => acc + t.amount_cents, 0), [tags]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            <Hash className="h-7 w-7 shrink-0" aria-hidden />
            Spending by tag
          </>
        }
        titleClassName="flex items-center gap-2"
        description={
          <>
            This page sums <strong>tags</strong> on each row only — not the category column. The dashboard and{" "}
            <Link to="/categories" className="text-primary underline underline-offset-2">
              budgets
            </Link>{" "}
            use <strong>categories</strong>. Add manual tags for cross-cutting labels (for example{" "}
            <code className="text-xs">renovation</code> or <code className="text-xs">holiday_2025</code>); internal transfers
            can gain auto tags such as <code className="text-xs">transfer</code>.{" "}
            <Link to="/transactions" className="text-primary underline underline-offset-2">
              Edit tags on the Transactions page
            </Link>
            .
          </>
        }
      />

      <Card className="rounded-2xl border-border/80 bg-muted/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">How categories and tags differ</CardTitle>
          <CardDescription className="text-foreground/90">
            Same idea as many finance apps: one main “bucket” per expense, plus optional labels for extra angles.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0 text-sm text-muted-foreground">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium text-foreground">Categories</span> — Each outflow has a category (from your
              rules or set by hand). The dashboard and monthly views use categories. Set{" "}
              <Link to="/categories" className="text-primary underline underline-offset-2">
                budgets per category
              </Link>{" "}
              on the Categories page.
            </li>
            <li>
              <span className="font-medium text-foreground">Tags</span> — Optional labels on a transaction (sticky-note
              style). They can cut across categories — for example <code className="text-xs">business</code> on both
              groceries and travel. Tags do <strong>not</strong> drive budgets in Cash Cat.
            </li>
          </ul>
          <div className="rounded-xl border border-border/60 bg-card/80 px-4 py-3 text-xs leading-relaxed">
            <p className="font-medium text-foreground">Tips</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>
                Want tag totals that behave like separate buckets? Prefer <strong>one</strong> analytical tag per
                outflow; several tags on the same row count the <strong>full amount</strong> under each tag (see the note
                under the chart).
              </li>
              <li>
                If something needs its own budget, use a <strong>category</strong> (and a rule if you like); use tags for
                review flags, projects, or reporting that spans categories.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Tags</CardTitle>
          <CardDescription>
            Tagged outflows only (negative amounts). Paired internal-transfer legs are included here so transfer labels
            show up; headline spending totals elsewhere may still exclude those legs. Percentages are shares of the
            tagged total below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : tags.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Hash className="h-8 w-8 text-muted-foreground" aria-hidden />
              </div>
              <div className="max-w-md space-y-2">
                <p className="font-medium text-foreground">No tagged spending yet</p>
                <p className="text-sm text-muted-foreground">
                  Only the tag column counts here — not the category (for example a &quot;Transfer&quot; category alone
                  does not appear). Add tags to outflow rows on Transactions, or rely on auto tags when a transfer pair
                  is detected.
                </p>
              </div>
              <Button asChild>
                <Link to="/transactions">Go to Transactions</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
                <div className="relative mx-auto aspect-square w-full max-w-[min(100%,18rem)]">
                  <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">Tagged spend</p>
                      <p className="text-lg font-semibold tabular-nums">{formatMoney(totalTaggedCents)}</p>
                    </div>
                  </div>
                  <div className="relative z-10 h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="58%"
                          outerRadius="88%"
                          paddingAngle={2}
                          cornerRadius={2}
                        >
                          {pieData.map((_, i) => (
                            <Cell
                              key={pieData[i].name}
                              stroke="hsl(var(--card))"
                              strokeWidth={2}
                              fill={TAG_SLICE_FILLS[i % TAG_SLICE_FILLS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          wrapperStyle={{ zIndex: 50 }}
                          contentStyle={{
                            borderRadius: "12px",
                            border: "1px solid hsl(var(--border))",
                            background: "hsl(var(--card))",
                            zIndex: 50,
                          }}
                          formatter={(value: number, _n, item) => {
                            const p = item.payload as { name: string; pct: number };
                            return [
                              `${formatMoney(Math.round(Number(value) * 100))} (${p.pct.toFixed(1)}% of tagged total)`,
                              p.name,
                            ];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-border lg:min-w-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                        <th className="p-3 font-medium">Tag</th>
                        <th className="p-3 font-medium text-right">Share</th>
                        <th className="p-3 font-medium text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tags.map((t, i) => (
                        <tr key={t.tag} className="border-b border-border/60">
                          <td className="p-3">
                            <span className="flex items-center gap-2 font-mono text-xs">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: TAG_SLICE_FILLS[i % TAG_SLICE_FILLS.length] }}
                                aria-hidden
                              />
                              {t.tag}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums text-muted-foreground">{t.pct.toFixed(1)}%</td>
                          <td className="p-3 text-right tabular-nums font-medium">{formatMoney(t.amount_cents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                If a single transaction has several tags, the full amount is counted toward each tag. Row percentages
                are shares of tagged spend only, so they can add up to more than 100% across the table.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
