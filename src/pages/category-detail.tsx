import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/format";

type MonthlyRow = { period: string; by_category: Record<string, number> };

export function CategoryDetailPage() {
  const { key } = useParams<{ key: string }>();
  const categoryKey = key ?? "";
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [txnPreview, setTxnPreview] = useState<{ id: number; txn_date: string; amount_cents: number; description_raw: string }[]>(
    [],
  );

  const load = useCallback(async () => {
    if (!categoryKey) return;
    setLoading(true);
    try {
      const [catRes, boundsRes] = await Promise.all([
        apiFetch(`/categories?include_archived=true`),
        apiFetch("/analytics/txn-date-bounds"),
      ]);
      if (catRes.ok) {
        const data = (await catRes.json()) as { items?: { key: string; display_name: string }[] };
        const row = (data.items ?? []).find((c) => c.key === categoryKey);
        setDisplayName(row?.display_name ?? categoryKey);
      }
      let dateFrom: string | null = null;
      let dateTo: string | null = null;
      if (boundsRes.ok) {
        const b = await boundsRes.json();
        dateFrom = (b.min_date as string) ?? null;
        dateTo = (b.max_date as string) ?? null;
      }
      const body = JSON.stringify({
        exclude_paired_transfer_legs: true,
        exclude_expense_category_keys: [],
        date_from: dateFrom ?? undefined,
        date_to: dateTo ?? undefined,
      });
      const mRes = await apiFetch("/analytics/monthly-by-category", { method: "POST", body });
      if (mRes.ok) {
        const md = (await mRes.json()) as { series?: MonthlyRow[] };
        setMonthly(md.series ?? []);
      }
      const txRes = await apiFetch(
        `/transactions?limit=25&offset=0&category_key=${encodeURIComponent(categoryKey)}`,
      );
      if (txRes.ok) {
        const td = (await txRes.json()) as {
          items?: { id: number; txn_date: string; amount_cents: number; description_raw: string }[];
        };
        setTxnPreview(td.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [categoryKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartData = useMemo(() => {
    return monthly.map((row) => ({
      label: row.period,
      spend: row.by_category[categoryKey] ?? 0,
    }));
  }, [monthly, categoryKey]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" className="rounded-xl" asChild>
          <Link to="/categories">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Categories
          </Link>
        </Button>
      </div>
      <PageHeader
        title={displayName ?? (loading ? "…" : categoryKey)}
        description={
          <>
            Monthly spend for this category (same exclusions as the dashboard when a full date range is available).{" "}
            <Link to="/transactions" className="text-primary underline underline-offset-2">
              View all transactions
            </Link>
          </>
        }
      />

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Spend by month</CardTitle>
          <CardDescription>Based on imported transaction dates.</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {loading ? (
            <Skeleton className="h-full w-full rounded-xl" />
          ) : chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data for this category in range.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => formatMoney(typeof v === "number" ? Math.round(v) : 0).replace(/\.00$/, "")}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                  }}
                  formatter={(v: number) => [formatMoney(Math.round(v)), "Spend"]}
                />
                <Bar dataKey="spend" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Spend" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>Latest rows tagged with this category.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" className="rounded-xl" asChild>
            <Link to={`/transactions?category=${encodeURIComponent(categoryKey)}`} title="Filter the Transactions page by this category">
              Open transactions
              <ExternalLink className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {txnPreview.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-sm">
                <span className="tabular-nums text-muted-foreground">{t.txn_date}</span>
                <span className="min-w-0 flex-1 truncate">{t.description_raw}</span>
                <span className="tabular-nums font-medium">{formatMoney(t.amount_cents)}</span>
              </li>
            ))}
            {txnPreview.length === 0 && !loading && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">No transactions in this category yet.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
