import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, differenceInCalendarDays, format, startOfMonth, subMonths } from "date-fns";
import { enNZ } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Customized,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CategoryOption } from "@/components/category-combobox";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiFetch } from "@/lib/api";
import {
  clampRangeToBounds,
  presetLastCalendarMonth,
  presetRollingMonths,
  type RollingMonthsPreset,
} from "@/lib/date-presets";
import { formatYmd, parseYmd } from "@/lib/date-ymd";
import { formatMoney } from "@/lib/format";
import { measureParagraphHeight } from "@/lib/pretext-metrics";
import { cn } from "@/lib/utils";

/** Must match `CardDescription` copy below for pretext height sync. */
const DASH_DESC_SPENDING =
  "Share of spending using the same rules as What's included (paired transfer legs excluded when that switch is on).";
const DASH_DESC_INCLUDED =
  'Net, category share, and cash flow follow these rules. Adjust to focus on day-to-day spend (for example, hide "Other" or transfer categories).';

const HEATMAP_ACCOUNT_ALL = "__all__";
/** Align with `CardDescription` (`text-sm`) and `App.css` font stack. */
const DASH_CARD_DESC_FONT = '14px Inter, Avenir, Helvetica, Arial, sans-serif';
const DASH_CARD_DESC_LINE_HEIGHT_PX = 20;

/**
 * Rotation pool: excludes chart-4–6 (mobility — consecutive sky blues in the product palette).
 */
const CHART_FILLS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-8))",
  "hsl(var(--chart-9))",
  "hsl(var(--chart-10))",
];

/** Mobility: Cloudy Sky / Fresh Sky / Sky Surge (palette positions 4–6). */
const CATEGORY_CHART_FILL: Partial<Record<string, string>> = {
  transport: "hsl(var(--chart-4))",
  vehicle_maintenance: "hsl(var(--chart-5))",
  rideshare: "hsl(var(--chart-6))",
};

function chartFillForCategoryKey(categoryKey: string, orderIndex: number): string {
  const fixed = CATEGORY_CHART_FILL[categoryKey];
  if (fixed) return fixed;
  return CHART_FILLS[orderIndex % CHART_FILLS.length];
}

type Summary = {
  transaction_count: number;
  income_cents: number;
  expense_cents: number;
  investments_cents?: number;
  net_cents: number;
};

type CategoryRow = {
  key: string;
  label: string;
  amount_cents: number;
  pct: number;
};

type CashflowRow = { period: string; income: number; expense: number };

export type CashflowBucketMode = "auto" | "day" | "week" | "month";

type DonutDatum = { key: string; name: string; value: number; pct: number };

const FILTER_STORAGE_KEY = "cashcat.dashboard.analyticsFilters";

export type DatePresetKind = "last_month" | "m3" | "m6" | "m12" | "m18" | "m24";

function parseDatePreset(raw: unknown): DatePresetKind | null {
  if (
    raw === "last_month" ||
    raw === "m3" ||
    raw === "m6" ||
    raw === "m12" ||
    raw === "m18" ||
    raw === "m24"
  ) {
    return raw;
  }
  return null;
}

type DashboardFilters = {
  excludePairedTransferLegs: boolean;
  excludeExpenseCategoryKeys: string[];
  /** Quick range button; cleared when the user drags the date slider. */
  datePreset: DatePresetKind | null;
  /** Inclusive yyyy-mm-dd; both set to apply chart date filter */
  dateFrom: string | null;
  dateTo: string | null;
  cashflowBucket: CashflowBucketMode;
};

function loadDashboardFilters(): DashboardFilters {
  if (typeof window === "undefined") {
    return {
      excludePairedTransferLegs: true,
      excludeExpenseCategoryKeys: [],
      datePreset: null,
      dateFrom: null,
      dateTo: null,
      cashflowBucket: "auto",
    };
  }
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw)
      return {
        excludePairedTransferLegs: true,
        excludeExpenseCategoryKeys: [],
        datePreset: null,
        dateFrom: null,
        dateTo: null,
        cashflowBucket: "auto",
      };
    const p = JSON.parse(raw) as Partial<DashboardFilters>;
    const gran = p.cashflowBucket;
    const bucket: CashflowBucketMode =
      gran === "day" || gran === "week" || gran === "month" || gran === "auto" ? gran : "auto";
    return {
      excludePairedTransferLegs: typeof p.excludePairedTransferLegs === "boolean" ? p.excludePairedTransferLegs : true,
      excludeExpenseCategoryKeys: Array.isArray(p.excludeExpenseCategoryKeys)
        ? p.excludeExpenseCategoryKeys.filter((x): x is string => typeof x === "string")
        : [],
      datePreset: parseDatePreset(p.datePreset),
      dateFrom: typeof p.dateFrom === "string" && p.dateFrom ? p.dateFrom : null,
      dateTo: typeof p.dateTo === "string" && p.dateTo ? p.dateTo : null,
      cashflowBucket: bucket,
    };
  } catch {
    return {
      excludePairedTransferLegs: true,
      excludeExpenseCategoryKeys: [],
      datePreset: null,
      dateFrom: null,
      dateTo: null,
      cashflowBucket: "auto",
    };
  }
}

function saveDashboardFilters(f: DashboardFilters) {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* ignore quota */
  }
}

function buildAnalyticsBody(f: DashboardFilters): Record<string, unknown> {
  const body: Record<string, unknown> = {
    exclude_paired_transfer_legs: f.excludePairedTransferLegs,
    exclude_expense_category_keys: [...f.excludeExpenseCategoryKeys].sort(),
  };
  if (f.dateFrom && f.dateTo) {
    body.date_from = f.dateFrom;
    body.date_to = f.dateTo;
  }
  return body;
}

/** Daily heatmap only: optional Akahu account id (matches `transactions.account_label`). */
function buildDailySpendRequestBody(f: DashboardFilters, akahuAccountId: string | null): string {
  const body: Record<string, unknown> = { ...buildAnalyticsBody(f) };
  if (akahuAccountId) {
    body.sources = [akahuAccountId];
  }
  return JSON.stringify(body);
}

function buildCashflowRequestBody(f: DashboardFilters): string {
  return JSON.stringify({ ...buildAnalyticsBody(f), bucket: f.cashflowBucket });
}

function formatCashflowPeriodLabel(period: string, resolvedBucket: string): string {
  if (resolvedBucket === "month") {
    const parts = period.split("-");
    if (parts.length >= 2) {
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        return format(new Date(y, m - 1, 1), "MMM yyyy", { locale: enNZ });
      }
    }
    return period;
  }
  const d = parseYmd(period);
  return d ? format(d, "d MMM yyyy", { locale: enNZ }) : period;
}

function formatYmdDisplay(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return ymd;
  return format(d, "d MMM yyyy", { locale: enNZ });
}

function setCategoryKey(keys: string[], key: string, on: boolean): string[] {
  const s = new Set(keys);
  if (on) s.add(key);
  else s.delete(key);
  return Array.from(s).sort();
}

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [cashflow, setCashflow] = useState<{ series: CashflowRow[]; bucket: string } | null>(null);
  const [insights, setInsights] = useState<{ template: string; facts: Record<string, number | string> }[]>([]);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [monthlyByCat, setMonthlyByCat] = useState<{ period: string; by_category: Record<string, number> }[]>([]);
  const [savingsSeries, setSavingsSeries] = useState<{ period: string; savings_rate_pct: number | null }[]>([]);
  const [dailySpend, setDailySpend] = useState<{ day: string; expense_cents: number }[]>([]);
  const [recurring, setRecurring] = useState<
    { normalised_merchant: string; amount_cents: number; occurrence_count: number }[]
  >([]);
  const [budgetRows, setBudgetRows] = useState<{ category_key: string; display_name: string; monthly_cents: number }[]>(
    [],
  );
  const [filters, setFilters] = useState<DashboardFilters>(() => loadDashboardFilters());
  const [donutActive, setDonutActive] = useState<number | undefined>(undefined);
  const [lineHidden, setLineHidden] = useState<{ income: boolean; expense: boolean }>({
    income: false,
    expense: false,
  });
  const [yFromZero, setYFromZero] = useState(true);
  const [cashflowLineStyle, setCashflowLineStyle] = useState<"sharp" | "smooth">("smooth");
  const [flowTab, setFlowTab] = useState<"both" | "expense">("both");
  const [txnBounds, setTxnBounds] = useState<{ min: string; max: string } | null>(null);
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [heatmapAccounts, setHeatmapAccounts] = useState<
    { akahu_account_id: string; institution_name: string; account_name: string; mask: string }[]
  >([]);
  /** `null` = all linked accounts; otherwise Akahu account id (matches imported `account_label`). */
  const [heatmapAccountId, setHeatmapAccountId] = useState<string | null>(null);
  const spendingHeaderRef = useRef<HTMLDivElement>(null);
  const [syncCardDescriptionMinH, setSyncCardDescriptionMinH] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = spendingHeaderRef.current;
    if (!el) return;
    const run = () => {
      const w = Math.max(0, el.clientWidth - 48);
      const h1 = measureParagraphHeight(
        DASH_DESC_SPENDING,
        DASH_CARD_DESC_FONT,
        w,
        DASH_CARD_DESC_LINE_HEIGHT_PX,
      );
      const h2 = measureParagraphHeight(
        DASH_DESC_INCLUDED,
        DASH_CARD_DESC_FONT,
        w,
        DASH_CARD_DESC_LINE_HEIGHT_PX,
      );
      setSyncCardDescriptionMinH(Math.max(h1, h2));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch("/categories");
        if (cancelled || !r.ok) return;
        const data = (await r.json()) as { items?: { key: string; display_name: string; archived?: boolean }[] };
        const items = (data.items ?? []).filter((c) => !c.archived);
        setAllCategories(
          items.map((c) => ({
            key: c.key,
            display_name: c.display_name,
          })),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await apiFetch("/analytics/txn-date-bounds");
      if (cancelled || !r.ok) return;
      const b = await r.json();
      const minD = b.min_date as string | null;
      const maxD = b.max_date as string | null;
      if (!minD || !maxD) {
        setTxnBounds(null);
        return;
      }
      setTxnBounds({ min: minD, max: maxD });
      setFilters((prev) => {
        let df = prev.dateFrom;
        let dt = prev.dateTo;
        if (!df || !dt) {
          return { ...prev, dateFrom: minD, dateTo: maxD };
        }
        const c = clampRangeToBounds(minD, maxD, df, dt);
        if (prev.dateFrom === c.from && prev.dateTo === c.to) return prev;
        return { ...prev, dateFrom: c.from, dateTo: c.to };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveDashboardFilters(filters);
  }, [filters]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await apiFetch("/akahu/accounts");
      if (cancelled || !r.ok) return;
      const data = (await r.json()) as {
        accounts?: { akahu_account_id: string; institution_name: string; account_name: string; mask: string }[];
      };
      const list = data.accounts ?? [];
      setHeatmapAccounts(list);
      setHeatmapAccountId((prev) => {
        if (prev == null) return null;
        return list.some((a) => a.akahu_account_id === prev) ? prev : null;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const summaryBody = JSON.stringify(buildAnalyticsBody(filters));
    const cfBody = buildCashflowRequestBody(filters);
    let cancelled = false;
    (async () => {
      const [res, cf] = await Promise.all([
        apiFetch("/analytics/summary", { method: "POST", body: summaryBody }),
        apiFetch("/analytics/cashflow", { method: "POST", body: cfBody }),
      ]);
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
        setCategories(data.categories ?? []);
        setInsights(data.insights ?? []);
      } else {
        setSummary(null);
        setCategories([]);
        setInsights([]);
      }
      if (cf.ok) {
        const cd = await cf.json();
        setCashflow({ series: cd.series ?? [], bucket: String(cd.bucket ?? "month") });
      } else {
        setCashflow(null);
      }
      if (!res.ok && !cf.ok) {
        setAnalyticsError("Could not load dashboard analytics. Is the engine running?");
      } else if (!res.ok) {
        setAnalyticsError("Could not load summary metrics.");
      } else if (!cf.ok) {
        setAnalyticsError("Could not load cash flow series.");
      } else {
        setAnalyticsError(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    const body = JSON.stringify(buildAnalyticsBody(filters));
    let cancelled = false;
    (async () => {
      const [m, s, r, b] = await Promise.all([
        apiFetch("/analytics/monthly-by-category", { method: "POST", body }),
        apiFetch("/analytics/savings-rate", { method: "POST", body }),
        apiFetch("/analytics/recurring", { method: "POST", body }),
        apiFetch("/budgets"),
      ]);
      if (cancelled) return;
      if (m.ok) {
        const md = (await m.json()) as { series?: { period: string; by_category: Record<string, number> }[] };
        setMonthlyByCat(md.series ?? []);
      } else setMonthlyByCat([]);
      if (s.ok) {
        const sd = (await s.json()) as {
          series?: { period: string; savings_rate_pct: number | null }[];
        };
        setSavingsSeries(sd.series ?? []);
      } else setSavingsSeries([]);
      if (r.ok) {
        const rd = (await r.json()) as {
          candidates?: { normalised_merchant: string; amount_cents: number; occurrence_count: number }[];
        };
        setRecurring(rd.candidates ?? []);
      } else setRecurring([]);
      if (b.ok) {
        const bd = (await b.json()) as {
          items?: { category_key: string; display_name: string; monthly_cents: number }[];
        };
        setBudgetRows(bd.items ?? []);
      } else setBudgetRows([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    const body = buildDailySpendRequestBody(filters, heatmapAccountId);
    let cancelled = false;
    (async () => {
      const d = await apiFetch("/analytics/daily-spend", { method: "POST", body });
      if (cancelled) return;
      if (d.ok) {
        const dd = (await d.json()) as { days?: { day: string; expense_cents: number }[] };
        setDailySpend(dd.days ?? []);
      } else setDailySpend([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, heatmapAccountId]);

  const stackedMonthlyData = useMemo(() => {
    if (monthlyByCat.length === 0) return { keys: [] as string[], rows: [] as Record<string, number | string>[] };
    const totals: Record<string, number> = {};
    for (const row of monthlyByCat) {
      for (const [k, v] of Object.entries(row.by_category)) {
        totals[k] = (totals[k] ?? 0) + v;
      }
    }
    const topKeys = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k);
    const rows = monthlyByCat.map((row) => {
      const o: Record<string, number | string> = {
        name: formatCashflowPeriodLabel(row.period, "month"),
      };
      for (const k of topKeys) {
        o[k] = (row.by_category[k] ?? 0) / 100;
      }
      return o;
    });
    return { keys: topKeys, rows };
  }, [monthlyByCat]);

  const donutData: DonutDatum[] = useMemo(() => {
    return categories
      .filter((c) => c.amount_cents > 0)
      .map((c) => ({
        key: c.key,
        name: c.label,
        value: c.amount_cents / 100,
        pct: c.pct,
      }));
  }, [categories]);

  const totalSpendCents = useMemo(
    () => categories.reduce((acc, c) => acc + (c.amount_cents > 0 ? c.amount_cents : 0), 0),
    [categories],
  );

  const lineData = useMemo(() => {
    if (!cashflow?.series.length) return [];
    const b = cashflow.bucket;
    return cashflow.series.map((r) => ({
      name: formatCashflowPeriodLabel(r.period, b),
      Income: r.income / 100,
      Expenses: r.expense / 100,
    }));
  }, [cashflow]);

  /** Remount cash-flow charts when series or bucket changes so Recharts runs a draw animation instead of morphing paths. */
  const cashflowChartKey = useMemo(() => {
    if (!cashflow?.series.length) return "empty";
    return [
      filters.cashflowBucket,
      cashflow.bucket,
      cashflow.series.map((r) => `${r.period}:${r.income}:${r.expense}`).join("|"),
    ].join("::");
  }, [cashflow, filters.cashflowBucket]);

  const yDomain = yFromZero ? ([0, "auto"] as [number, string]) : (["auto", "auto"] as [string, string]);

  const excludeOtherCategory = filters.excludeExpenseCategoryKeys.includes("other");
  const excludeTransferCategory = filters.excludeExpenseCategoryKeys.includes("transfer");

  const categoryLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of allCategories) m.set(c.key, c.display_name);
    for (const c of categories) {
      if (!m.has(c.key)) m.set(c.key, c.label);
    }
    return m;
  }, [allCategories, categories]);

  const categoryToggleKeys = useMemo(() => {
    const top = new Set(["other", "transfer"]);
    return allCategories
      .filter((c) => !top.has(c.key))
      .map((c) => c.key)
      .sort((a, b) => {
        const la = categoryLabelByKey.get(a) ?? a;
        const lb = categoryLabelByKey.get(b) ?? b;
        return la.localeCompare(lb);
      });
  }, [allCategories, categoryLabelByKey]);

  const allListCategoriesIncluded = useMemo(() => {
    if (categoryToggleKeys.length === 0) return true;
    return categoryToggleKeys.every((k) => !filters.excludeExpenseCategoryKeys.includes(k));
  }, [categoryToggleKeys, filters.excludeExpenseCategoryKeys]);

  const donutKeyToColorIdx = useMemo(() => {
    const m = new Map<string, number>();
    donutData.forEach((d, i) => m.set(d.key, i));
    return m;
  }, [donutData]);

  const renderActiveShape = useCallback((props: unknown) => {
    const p = props as Record<string, unknown>;
    const cx = p.cx as number;
    const cy = p.cy as number;
    const innerRadius = (p.innerRadius as number) ?? 0;
    const outerRadius = (p.outerRadius as number) ?? 0;
    const startAngle = p.startAngle as number;
    const endAngle = p.endAngle as number;
    const fill = p.fill as string;
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 8}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
          cornerRadius={2}
          className="drop-shadow-sm"
        />
      </g>
    );
  }, []);

  const onDonutEnter = (_: unknown, index: number) => {
    setDonutActive(index);
  };

  const onDonutLeave = () => {
    setDonutActive(undefined);
  };

  const onLegendClick = (data: { dataKey?: unknown }) => {
    const key = data.dataKey != null ? String(data.dataKey) : "";
    if (key === "Income") setLineHidden((h) => ({ ...h, income: !h.income }));
    if (key === "Expenses") setLineHidden((h) => ({ ...h, expense: !h.expense }));
  };

  const slideRange = useMemo(() => {
    if (!txnBounds || !filters.dateFrom || !filters.dateTo) return null;
    const base = parseYmd(txnBounds.min);
    const from = parseYmd(filters.dateFrom);
    const toD = parseYmd(filters.dateTo);
    const maxDay = parseYmd(txnBounds.max);
    if (!base || !from || !toD || !maxDay) return null;
    const maxIdx = differenceInCalendarDays(maxDay, base);
    return {
      maxIdx,
      value: [differenceInCalendarDays(from, base), differenceInCalendarDays(toD, base)] as [number, number],
    };
  }, [txnBounds, filters.dateFrom, filters.dateTo]);

  const sliderMonthTicks = useMemo(() => {
    if (!txnBounds || !slideRange || !filters.dateFrom || !filters.dateTo) {
      return { base: [] as number[], emphasis: [] as number[] };
    }
    const maxIdx = slideRange.maxIdx;
    const minD = parseYmd(txnBounds.min);
    const maxD = parseYmd(txnBounds.max);
    if (!minD || !maxD) return { base: [], emphasis: [] };

    const base: number[] = [];
    let d = startOfMonth(minD);
    while (d <= maxD) {
      const idx = differenceInCalendarDays(d, minD);
      if (idx >= 0 && idx <= maxIdx) base.push(idx);
      d = addMonths(d, 1);
    }
    const baseUnique = [...new Set(base)].sort((a, b) => a - b);

    const emphasis: number[] = [];
    const preset = filters.datePreset;
    if (preset) {
      if (preset === "last_month") {
        const raw = presetLastCalendarMonth();
        const t = parseYmd(raw.start);
        if (t) {
          const idx = differenceInCalendarDays(startOfMonth(t), minD);
          if (idx >= 0 && idx <= maxIdx) emphasis.push(idx);
        }
      } else {
        const monthsRoll: Record<Exclude<DatePresetKind, "last_month">, number> = {
          m3: 3,
          m6: 6,
          m12: 12,
          m18: 18,
          m24: 24,
        };
        const n = monthsRoll[preset];
        const end = parseYmd(filters.dateTo);
        if (end) {
          const eff = end > maxD ? maxD : end;
          for (let i = 0; i < n; i++) {
            const dm = startOfMonth(subMonths(eff, i));
            const idx = differenceInCalendarDays(dm, minD);
            if (idx >= 0 && idx <= maxIdx) emphasis.push(idx);
          }
        }
      }
    }
    const emphasisUnique = [...new Set(emphasis)].sort((a, b) => a - b);
    const cappedBase = baseUnique.length > 100 ? baseUnique.filter((_, i) => i % 2 === 0) : baseUnique;
    return { base: cappedBase, emphasis: emphasisUnique };
  }, [txnBounds, slideRange, filters.datePreset, filters.dateFrom, filters.dateTo]);

  const heatmapDays = useMemo(() => dailySpend.slice(-56), [dailySpend]);
  const heatmapMaxCents = useMemo(
    () => (heatmapDays.length === 0 ? 1 : Math.max(1, ...heatmapDays.map((x) => x.expense_cents))),
    [heatmapDays],
  );

  const applyDashboardPreset = useCallback(
    (kind: DatePresetKind) => {
      if (!txnBounds) return;
      const maxEnd = parseYmd(txnBounds.max);
      if (!maxEnd) return;
      const raw =
        kind === "last_month"
          ? presetLastCalendarMonth()
          : presetRollingMonths(
              (
                {
                  m3: 3,
                  m6: 6,
                  m12: 12,
                  m18: 18,
                  m24: 24,
                } satisfies Record<Exclude<DatePresetKind, "last_month">, RollingMonthsPreset>
              )[kind],
              maxEnd,
            );
      const c = clampRangeToBounds(txnBounds.min, txnBounds.max, raw.start, raw.end);
      setFilters((f) => ({ ...f, dateFrom: c.from, dateTo: c.to, datePreset: kind }));
    },
    [txnBounds],
  );

  const dateRangeDays =
    filters.dateFrom && filters.dateTo
      ? (() => {
          const a = parseYmd(filters.dateFrom);
          const b = parseYmd(filters.dateTo);
          if (!a || !b) return 0;
          return Math.abs(differenceInCalendarDays(b, a)) + 1;
        })()
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview for all imported transactions" />

      {analyticsError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-medium">Analytics unavailable</p>
          <p className="mt-1 text-destructive/90">{analyticsError}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardDescription>Net</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary ? formatMoney(summary.net_cents) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardDescription>Income</CardDescription>
            <CardTitle className="text-2xl tabular-nums" style={{ color: "hsl(var(--color-income))" }}>
              {summary ? formatMoney(summary.income_cents) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardDescription>Expenses</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-muted-foreground">
              {summary ? formatMoney(summary.expense_cents) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardDescription>Investments</CardDescription>
            <CardTitle className="text-2xl tabular-nums" style={{ color: "hsl(var(--chart-3))" }}>
              {summary ? formatMoney(summary.investments_cents ?? 0) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <Card className="flex h-full flex-col rounded-2xl">
          <CardHeader ref={spendingHeaderRef}>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription style={syncCardDescriptionMinH != null ? { minHeight: syncCardDescriptionMinH } : undefined}>
              {DASH_DESC_SPENDING}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col min-h-0">
            {donutData.length === 0 ? (
              <p className="flex-1 text-sm text-muted-foreground">Import transactions and categorise them to see this chart.</p>
            ) : (
              <div className="relative flex min-h-0 w-full flex-1 flex-col items-center justify-center px-1 py-2 sm:px-2">
                <div className="relative aspect-square w-full max-w-[min(100%,20rem)] shrink-0 sm:max-w-[22rem] lg:max-w-[min(100%,32rem)] xl:max-w-[min(100%,36rem)]">
                  <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center pb-2">
                    <div className="text-center">
                      <p className="text-xs font-medium text-muted-foreground">Total spend</p>
                      <p className="text-lg font-semibold tabular-nums sm:text-xl">{formatMoney(totalSpendCents)}</p>
                    </div>
                  </div>
                  <div className="relative z-10 h-full w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius="58%"
                          outerRadius="88%"
                          paddingAngle={2}
                          cornerRadius={2}
                          activeIndex={donutActive}
                          activeShape={renderActiveShape}
                          onMouseEnter={onDonutEnter}
                          onMouseLeave={onDonutLeave}
                        >
                          {donutData.map((_, i) => (
                            <Cell
                              key={donutData[i].key}
                              stroke="hsl(var(--card))"
                              strokeWidth={2}
                              fill={chartFillForCategoryKey(donutData[i].key, i)}
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
                          formatter={(value: number, _n, item) => [
                            `${formatMoney(Math.round(value * 100))} (${(item.payload as DonutDatum).pct.toFixed(1)}%)`,
                            (item.payload as DonutDatum).name,
                          ]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex h-full flex-col rounded-2xl">
          <CardHeader>
            <CardTitle>What&apos;s included</CardTitle>
            <CardDescription style={syncCardDescriptionMinH != null ? { minHeight: syncCardDescriptionMinH } : undefined}>
              {DASH_DESC_INCLUDED}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col min-h-0 gap-4">
            <div className="flex shrink-0 flex-col gap-4">
              <div className="flex items-start gap-2">
                <Switch
                  id="dash-exclude-pairs"
                  className="mt-0.5"
                  checked={filters.excludePairedTransferLegs}
                  onCheckedChange={(v) => setFilters((f) => ({ ...f, excludePairedTransferLegs: v }))}
                />
                <Label htmlFor="dash-exclude-pairs" className="cursor-pointer font-normal leading-snug">
                  <span className="block text-sm">Exclude paired transfers</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Matched moves between linked accounts (internal transfers and card repayments).
                  </span>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="dash-exclude-other"
                  checked={excludeOtherCategory}
                  onCheckedChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      excludeExpenseCategoryKeys: setCategoryKey(f.excludeExpenseCategoryKeys, "other", v),
                    }))
                  }
                />
                <Label htmlFor="dash-exclude-other" className="cursor-pointer text-sm font-normal leading-snug">
                  Exclude Other from spending
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <Switch
                  id="dash-exclude-transfer-cat"
                  className="mt-0.5"
                  checked={excludeTransferCategory}
                  onCheckedChange={(v) =>
                    setFilters((f) => ({
                      ...f,
                      excludeExpenseCategoryKeys: setCategoryKey(f.excludeExpenseCategoryKeys, "transfer", v),
                    }))
                  }
                />
                <Label htmlFor="dash-exclude-transfer-cat" className="cursor-pointer font-normal leading-snug">
                  <span className="block text-sm">Exclude Transfer from spending</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Hides outflows with the Transfer category. Independent of pair detection above.
                  </span>
                </Label>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 border-t border-border pt-4">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
                <Label className="text-sm font-medium">Categories in spending</Label>
                <Button variant="link" asChild className="h-auto p-0 text-sm font-normal">
                  <Link to="/categories">Edit categories</Link>
                </Button>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">
                Toggle whether each category counts towards expense totals. Use the switch below to include or exclude
                every category in the list at once.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  id="dash-master-categories"
                  checked={categoryToggleKeys.length === 0 ? false : allListCategoriesIncluded}
                  disabled={categoryToggleKeys.length === 0}
                  onCheckedChange={(checked) => {
                    setFilters((f) => {
                      if (categoryToggleKeys.length === 0) return f;
                      const next = new Set(f.excludeExpenseCategoryKeys);
                      if (checked) {
                        categoryToggleKeys.forEach((k) => next.delete(k));
                      } else {
                        categoryToggleKeys.forEach((k) => next.add(k));
                      }
                      return { ...f, excludeExpenseCategoryKeys: Array.from(next).sort() };
                    });
                  }}
                />
                <Label htmlFor="dash-master-categories" className="cursor-pointer text-sm font-normal leading-snug">
                  Include all categories below in spending
                </Label>
              </div>
              <ScrollArea className="min-h-[12rem] max-h-64 flex-1 rounded-xl border border-border">
                <div className="space-y-0 p-2">
                  {categoryToggleKeys.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No categories yet.{" "}
                      <Link to="/categories" className="text-primary underline underline-offset-2">
                        Create categories
                      </Link>{" "}
                      to organise spending.
                    </p>
                  ) : (
                    categoryToggleKeys.map((key) => {
                      const row = categories.find((c) => c.key === key);
                      const amountCents = row?.amount_cents ?? 0;
                      const pct = row?.pct;
                      const included = !filters.excludeExpenseCategoryKeys.includes(key);
                      const ci = donutKeyToColorIdx.get(key);
                      const dot =
                        ci !== undefined
                          ? chartFillForCategoryKey(key, ci)
                          : "hsl(var(--muted-foreground) / 0.35)";
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted/40"
                        >
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
                            <span className="min-w-0 truncate font-medium">{categoryLabelByKey.get(key) ?? key}</span>
                          </span>
                          <span className="hidden shrink-0 tabular-nums text-xs text-muted-foreground sm:inline">
                            {pct != null && amountCents > 0 ? `${pct.toFixed(0)}% · ` : ""}
                            {amountCents > 0 ? formatMoney(amountCents) : "—"}
                          </span>
                          <div className="flex shrink-0 items-center">
                            <Switch
                              id={`dash-cat-${key}`}
                              checked={included}
                              onCheckedChange={(include) =>
                                setFilters((f) => ({
                                  ...f,
                                  excludeExpenseCategoryKeys: setCategoryKey(f.excludeExpenseCategoryKeys, key, !include),
                                }))
                              }
                              aria-label={`Include ${categoryLabelByKey.get(key) ?? key} in spending`}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>
      </div>

      {txnBounds && filters.dateFrom && filters.dateTo && slideRange && (
        <Card
          className="rounded-2xl"
          title="Presets and the slider use your imported transaction dates. Dragging a handle clears the preset."
        >
          <CardHeader className="pb-3">
            <CardTitle>Date range</CardTitle>
            <CardDescription>Applies to dashboard totals and every chart on this page.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Imported data: {formatYmdDisplay(txnBounds.min)} – {formatYmdDisplay(txnBounds.max)}
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "last_month" as const, label: "Last month", title: "Previous calendar month" },
                  { id: "m3" as const, label: "Last 3 months", title: "Rolling last three months (by latest transaction date)" },
                  { id: "m6" as const, label: "Last 6 months", title: "Rolling last six months (by latest transaction date)" },
                  { id: "m12" as const, label: "Last 12 months", title: "Rolling last twelve months (by latest transaction date)" },
                  { id: "m18" as const, label: "Last 18 months", title: "Rolling last eighteen months (by latest transaction date)" },
                  { id: "m24" as const, label: "Last 24 months", title: "Rolling last twenty-four months (by latest transaction date)" },
                ] as const
              ).map(({ id, label, title }) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={filters.datePreset === id ? "default" : "secondary"}
                  className="rounded-lg text-xs"
                  title={title}
                  onClick={() => applyDashboardPreset(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="flex w-full flex-col gap-2">
              <p className="text-center text-sm tabular-nums text-foreground">
                {formatYmdDisplay(filters.dateFrom)} – {formatYmdDisplay(filters.dateTo)}
                {dateRangeDays > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {dateRangeDays === 1 ? "1 day" : `${dateRangeDays} days`}
                  </span>
                ) : null}
              </p>
              {filters.datePreset &&
              filters.datePreset !== "last_month" &&
              dateRangeDays > 0 &&
              dateRangeDays < 32 ? (
                <p className="text-xs text-muted-foreground">
                  Your imported transactions only cover part of this window; the range is limited to your data dates.
                </p>
              ) : null}
              <div className="relative w-full pt-3">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-4">
                  {slideRange.maxIdx > 0
                    ? [...new Set([...sliderMonthTicks.base, ...sliderMonthTicks.emphasis])]
                        .sort((a, b) => a - b)
                        .map((idx) => {
                          const emphasise = sliderMonthTicks.emphasis.includes(idx);
                          return (
                            <span
                              key={idx}
                              className={cn(
                                "absolute bottom-0 w-px -translate-x-1/2 rounded-full",
                                emphasise ? "h-3 bg-primary" : "h-2 bg-muted-foreground/30",
                              )}
                              style={{ left: `${(idx / slideRange.maxIdx) * 100}%` }}
                            />
                          );
                        })
                    : null}
                </div>
                <Slider
                  min={0}
                  max={slideRange.maxIdx}
                  step={1}
                  value={slideRange.value}
                  minStepsBetweenThumbs={0}
                  onValueChange={(v) => {
                    if (!txnBounds || v.length < 2) return;
                    const base = parseYmd(txnBounds.min);
                    if (!base) return;
                    const lo = Math.min(v[0], v[1]);
                    const hi = Math.max(v[0], v[1]);
                    setFilters((f) => ({
                      ...f,
                      dateFrom: formatYmd(addDays(base, lo)),
                      dateTo: formatYmd(addDays(base, hi)),
                      datePreset: null,
                    }));
                  }}
                  className="w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl">
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Cash flow over time</CardTitle>
              <CardDescription>
                Income and expenses for the selected date range.
                {cashflow && (
                  <span className="block pt-1 text-xs">
                    {filters.cashflowBucket === "auto"
                      ? `Auto: ${cashflow.bucket === "day" ? "daily" : cashflow.bucket === "week" ? "weekly" : "monthly"} buckets for this span.`
                      : `Using ${cashflow.bucket === "day" ? "daily" : cashflow.bucket === "week" ? "weekly" : "monthly"} buckets.`}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "auto" as const, label: "Auto" },
                  { id: "day" as const, label: "Daily" },
                  { id: "week" as const, label: "Weekly" },
                  { id: "month" as const, label: "Monthly" },
                ] as const
              ).map(({ id, label }) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={filters.cashflowBucket === id ? "default" : "outline"}
                  className="rounded-lg text-xs"
                  onClick={() => setFilters((f) => ({ ...f, cashflowBucket: id }))}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <Tabs
            value={flowTab}
            onValueChange={(v) => setFlowTab(v as "both" | "expense")}
            className="w-full"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="both">Income and expenses</TabsTrigger>
                <TabsTrigger value="expense">Expenses only</TabsTrigger>
              </TabsList>
              <Tabs
                value={cashflowLineStyle}
                onValueChange={(v) => setCashflowLineStyle(v as "sharp" | "smooth")}
                className="w-full max-w-md sm:w-auto"
              >
                <TabsList className="grid w-full grid-cols-2 sm:min-w-[14rem]">
                  <TabsTrigger value="sharp">Sharp</TabsTrigger>
                  <TabsTrigger value="smooth">Smooth</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <TabsContent value="both" className="mt-4 space-y-4">
              {lineData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Import data to see this chart.</p>
              ) : (
                <LineChartBlock
                  animationKey={`${cashflowChartKey}-both`}
                  data={lineData}
                  pointCount={lineData.length}
                  mode="both"
                  lineHidden={lineHidden}
                  onLegendClick={onLegendClick}
                  yDomain={yDomain}
                  yFromZero={yFromZero}
                  onYFromZero={setYFromZero}
                  lineStyle={cashflowLineStyle}
                />
              )}
            </TabsContent>
            <TabsContent value="expense" className="mt-4 space-y-4">
              {lineData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Import data to see this chart.</p>
              ) : (
                <LineChartBlock
                  animationKey={`${cashflowChartKey}-expense`}
                  data={lineData}
                  pointCount={lineData.length}
                  mode="expense"
                  lineHidden={lineHidden}
                  onLegendClick={onLegendClick}
                  yDomain={yDomain}
                  yFromZero={yFromZero}
                  onYFromZero={setYFromZero}
                  lineStyle={cashflowLineStyle}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardHeader>
      </Card>

      {insights.length > 0 && (
        <Card className="rounded-2xl border-primary/20 bg-muted/30">
          <CardHeader>
            <CardTitle className="text-base">Insights</CardTitle>
            <CardDescription>Deterministic summaries from your data (no AI).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {insights.map((i) => (
              <p key={i.template}>{renderInsight(i)}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle>Monthly spend by category</CardTitle>
            <CardDescription>Stacked bars for the six largest categories over the selected range.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {stackedMonthlyData.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Import data to see this chart.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stackedMonthlyData.rows}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => formatMoney(Math.round(Number(v) * 100))} />
                  <Tooltip
                    wrapperStyle={{ zIndex: 50 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as Record<string, number | string>;
                      const keys = stackedMonthlyData.keys;
                      const monthTotal = keys.reduce((acc, k) => acc + Number(row[k] ?? 0), 0);
                      return (
                        <div className="max-w-xs rounded-xl border border-border bg-card p-3 text-sm shadow-md">
                          <p className="mb-2 font-medium text-foreground">{label}</p>
                          <ul className="space-y-2">
                            {payload.map((p) => {
                              const key = String(p.dataKey ?? "");
                              const v = Number(p.value);
                              const pct = monthTotal > 0 ? (v / monthTotal) * 100 : 0;
                              const title = categoryLabelByKey.get(key) ?? key;
                              return (
                                <li
                                  key={key}
                                  className="flex flex-col gap-0.5 border-b border-border/60 pb-2 last:border-0 last:pb-0"
                                >
                                  <span className="flex items-center gap-2 font-medium text-foreground">
                                    <span
                                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                      style={{ background: p.color }}
                                      aria-hidden
                                    />
                                    {title}
                                  </span>
                                  <span className="pl-4 tabular-nums text-muted-foreground">
                                    {formatMoney(Math.round(v * 100))} · {pct.toFixed(1)}% of the month total
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  {stackedMonthlyData.keys.map((k, i) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      stackId="a"
                      fill={chartFillForCategoryKey(k, i)}
                      name={categoryLabelByKey.get(k) ?? k}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Savings rate</CardTitle>
            <CardDescription>Net as a percentage of income by month (when income is greater than zero).</CardDescription>
          </CardHeader>
          <CardContent className="h-56">
            {savingsSeries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={savingsSeries.map((s) => ({
                    name: formatCashflowPeriodLabel(s.period, "month"),
                    rate: s.savings_rate_pct ?? 0,
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    wrapperStyle={{ zIndex: 50 }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      zIndex: 50,
                    }}
                    formatter={(v: number) => [`${Number(v).toFixed(1)}%`, "Savings rate"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="hsl(var(--chart-4))"
                    fill="hsl(var(--chart-4) / 0.2)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Daily spend heatmap</CardTitle>
            <CardDescription>
              Darker cells mean more expense that day (after filters).
              {heatmapAccounts.length > 0 ? " Choose an account to show spending from that card or account only." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {heatmapAccounts.length > 0 ? (
              <div className="flex flex-col gap-2 sm:max-w-md">
                <Label htmlFor="heatmap-account" className="text-sm font-medium">
                  Account
                </Label>
                <Select
                  value={heatmapAccountId ?? HEATMAP_ACCOUNT_ALL}
                  onValueChange={(v) => {
                    setHeatmapAccountId(v === HEATMAP_ACCOUNT_ALL ? null : v);
                  }}
                >
                  <SelectTrigger id="heatmap-account" className="h-10 w-full rounded-xl">
                    <SelectValue placeholder="Account" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value={HEATMAP_ACCOUNT_ALL} className="rounded-lg">
                      All accounts
                    </SelectItem>
                    {heatmapAccounts.map((a) => (
                      <SelectItem key={a.akahu_account_id} value={a.akahu_account_id} className="rounded-lg">
                        {a.institution_name} · {a.account_name}
                        {a.mask ? ` ${a.mask}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {heatmapDays.map((d) => {
                const intensity = d.expense_cents / heatmapMaxCents;
                return (
                  <UiTooltip key={d.day}>
                    <TooltipTrigger asChild>
                      <div
                        className="h-4 w-4 cursor-default rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        style={{
                          background: `hsl(var(--chart-1) / ${0.15 + intensity * 0.85})`,
                        }}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" align="center">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium tabular-nums">{formatYmdDisplay(d.day)}</span>
                        <span className="tabular-nums text-muted-foreground">{formatMoney(d.expense_cents)}</span>
                      </div>
                    </TooltipContent>
                  </UiTooltip>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle>Recurring bills (heuristic)</CardTitle>
            <CardDescription>Same merchant label and amount at least three times in range.</CardDescription>
          </CardHeader>
          <CardContent>
            {recurring.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recurring patterns detected.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border text-sm">
                {recurring.slice(0, 12).map((c) => (
                  <li key={`${c.normalised_merchant}-${c.amount_cents}`} className="flex justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate">{c.normalised_merchant}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      ×{c.occurrence_count} · {formatMoney(Math.abs(c.amount_cents))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl lg:col-span-2">
          <CardHeader>
            <CardTitle>Budgets</CardTitle>
            <CardDescription>
              Compared to category spending in the selected range. Set budgets below under Categories.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {budgetRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No budgets set yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {budgetRows.map((row) => {
                  const spent = categories.find((c) => c.key === row.category_key)?.amount_cents ?? 0;
                  const pct = row.monthly_cents > 0 ? Math.min(100, Math.round((spent / row.monthly_cents) * 100)) : 0;
                  return (
                    <li key={row.category_key} className="flex flex-col gap-1 rounded-lg border border-border/80 p-3">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{row.display_name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatMoney(spent)} / {formatMoney(row.monthly_cents)}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type YAxisMapState = Record<string, { scale: (n: number) => number }>;
type ChartOffsetState = { left: number; top: number; width: number; height: number };

type LineLegendPayloadItem = {
  value?: string;
  color?: string;
  dataKey?: string | number;
};

/** Legend labels use foreground text for contrast; swatches keep the true line colour. */
function CashflowLineLegend({
  payload,
  lineHidden,
  onLegendClick,
}: {
  payload?: LineLegendPayloadItem[];
  lineHidden: { income: boolean; expense: boolean };
  onLegendClick: (data: { dataKey?: unknown }) => void;
}) {
  if (!payload?.length) return null;
  return (
    <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 px-2 pt-1 text-sm">
      {payload.map((entry) => {
        const dataKey = entry.dataKey != null ? String(entry.dataKey) : "";
        const hidden =
          (dataKey === "Income" && lineHidden.income) || (dataKey === "Expenses" && lineHidden.expense);
        const label = entry.value ?? dataKey;
        const stroke = entry.color ?? "hsl(var(--muted-foreground))";
        return (
          <li key={dataKey || String(label)}>
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-transparent bg-transparent p-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onLegendClick({ dataKey: entry.dataKey })}
              style={{ opacity: hidden ? 0.35 : 1 }}
              aria-label={`${hidden ? "Show" : "Hide"} ${label} on chart`}
            >
              <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden className="shrink-0">
                <line
                  x1="0"
                  y1="6"
                  x2="28"
                  y2="6"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <circle
                  cx="14"
                  cy="6"
                  r="3"
                  fill="hsl(var(--card))"
                  stroke={stroke}
                  strokeWidth={2}
                />
              </svg>
              <span className="font-medium text-foreground">{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Clip rect from plot top to the y = $0 line so monotone splines cannot render below the x-axis. */
function CashflowNonNegativeClip({
  yAxisMap,
  offset,
  clipPathId,
  enabled,
}: {
  yAxisMap?: YAxisMapState;
  offset?: ChartOffsetState;
  clipPathId: string;
  enabled: boolean;
}) {
  if (!enabled || !yAxisMap || offset == null || !offset.width) return null;
  const yAxis = Object.values(yAxisMap)[0];
  if (!yAxis?.scale) return null;
  const y0 = yAxis.scale(0);
  const left = offset.left;
  const top = offset.top;
  const w = offset.width;
  const clipBottom = Math.min(y0, top + offset.height);
  const h = Math.max(0, clipBottom - top);
  return (
    <defs>
      <clipPath id={clipPathId}>
        <rect x={left} y={top} width={w} height={h} />
      </clipPath>
    </defs>
  );
}

function LineChartBlock({
  animationKey,
  data,
  pointCount,
  mode,
  lineHidden,
  onLegendClick,
  yDomain,
  yFromZero,
  onYFromZero,
  lineStyle,
}: {
  animationKey: string;
  data: { name: string; Income: number; Expenses: number }[];
  pointCount: number;
  mode: "both" | "expense";
  lineHidden: { income: boolean; expense: boolean };
  onLegendClick: (data: { dataKey?: unknown }) => void;
  yDomain: [number, string] | [string, string];
  yFromZero: boolean;
  onYFromZero: (v: boolean) => void;
  lineStyle: "sharp" | "smooth";
}) {
  const clipPathId = useId().replace(/:/g, "");
  const clipLines = lineStyle === "smooth" && yFromZero;
  const curveType = lineStyle === "smooth" ? "monotone" : "linear";
  const denseAxis = pointCount > 14;
  const showDots = pointCount <= 36;
  const bottomMargin = denseAxis ? 52 : 8;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Switch id="y-zero" checked={yFromZero} onCheckedChange={onYFromZero} />
        <Label htmlFor="y-zero" className="text-sm font-normal cursor-pointer">
          Y axis starts at zero
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">Click legend entries to show or hide a series.</p>
      <div className="h-[22rem] w-full min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            key={animationKey}
            data={data}
            margin={{ top: 8, right: 8, left: 4, bottom: bottomMargin }}
          >
            <Customized
              component={(p: { yAxisMap?: YAxisMapState; offset?: ChartOffsetState }) => (
                <CashflowNonNegativeClip
                  clipPathId={clipPathId}
                  enabled={clipLines}
                  yAxisMap={p.yAxisMap}
                  offset={p.offset}
                />
              )}
            />
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10 }}
              tickLine={false}
              interval="preserveStartEnd"
              angle={denseAxis ? -40 : 0}
              textAnchor={denseAxis ? "end" : "middle"}
              height={denseAxis ? 56 : 28}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              domain={yDomain}
              tickFormatter={(v) => formatMoney(Math.round(Number(v) * 100))}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "12px",
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
              }}
              formatter={(v: number) => [formatMoney(Math.round(Number(v) * 100)), ""]}
            />
            <Legend
              content={(props) => (
                <CashflowLineLegend
                  payload={props.payload as LineLegendPayloadItem[] | undefined}
                  lineHidden={lineHidden}
                  onLegendClick={onLegendClick}
                />
              )}
            />
            {mode === "both" && (
              <Line
                type={curveType}
                dataKey="Income"
                stroke="hsl(var(--chart-10))"
                strokeWidth={2}
                dot={showDots ? { r: 2.5 } : false}
                activeDot={{ r: 5 }}
                hide={lineHidden.income}
                name="Income"
                isAnimationActive={pointCount <= 400}
                animationDuration={1000}
                animationEasing="ease-in-out"
                style={clipLines ? { clipPath: `url(#${clipPathId})` } : undefined}
              />
            )}
            <Line
              type={curveType}
              dataKey="Expenses"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={showDots ? { r: 2.5 } : false}
              activeDot={{ r: 5 }}
              hide={lineHidden.expense}
              name="Expenses"
              isAnimationActive={pointCount <= 400}
              animationDuration={1000}
              animationEasing="ease-in-out"
              style={clipLines ? { clipPath: `url(#${clipPathId})` } : undefined}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function renderInsight(i: { template: string; facts: Record<string, number | string> }) {
  let s = i.template;
  if ("money" in i.facts && typeof i.facts.money === "number") {
    s = s.replace("{money}", formatMoney(Math.round((i.facts.money as number) * 100)));
  }
  if ("label" in i.facts) s = s.replace("{label}", String(i.facts.label));
  if ("pct" in i.facts) s = s.replace("{pct}", String(i.facts.pct));
  return s;
}
