import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search, X } from "lucide-react";
import { CategoryCombobox, type CategoryOption } from "@/components/category-combobox";
import { TransactionTagEditor } from "@/components/transaction-tag-editor";
import { InstitutionAvatar } from "@/components/institution-avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TransactionDetailDialog } from "@/components/transaction-detail-dialog";
import { PageHeader } from "@/components/page-header";
import { apiFetch, formatEngineUnreachableMessage, getEngineBaseUrl } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type Txn = {
  id: number;
  txn_date: string;
  amount_cents: number;
  description_raw: string | null;
  provider: string | null;
  account_label: string | null;
  source_label: string;
  category_key: string | null;
  category_is_override: number | null;
  category_display_name: string | null;
  transfer_pair_id: number | null;
  transfer_pair_type: string | null;
  tags: string[];
  /** How many transactions (including this row) share the same description_raw. */
  same_description_count?: number;
  /** 1 = included in totals and analytics; 0 = excluded (row shown greyed out). */
  included?: number;
};

type SortKey = "txn_date" | "amount_cents" | "description_raw" | "bank" | "category" | "tags";

type SortDir = "asc" | "desc";

function bankLabel(t: Txn): string {
  const s = (t.provider || t.account_label || t.source_label || "").trim();
  return s.length > 0 ? s : "—";
}

function defaultSortDir(key: SortKey): SortDir {
  return key === "txn_date" || key === "amount_cents" ? "desc" : "asc";
}

function normaliseTxn(raw: Record<string, unknown>): Txn {
  const tags = raw.tags;
  const dr = raw.description_raw;
  const sdc = raw.same_description_count;
  const inc = raw.included;
  return {
    ...(raw as unknown as Txn),
    description_raw: typeof dr === "string" ? dr : dr === null ? null : null,
    same_description_count: typeof sdc === "number" ? sdc : undefined,
    included: typeof inc === "number" ? inc : 1,
    tags: Array.isArray(tags) ? tags.filter((x): x is string => typeof x === "string") : [],
  };
}

type HealthInfo = {
  capabilities: string[] | null;
  version?: string;
  db_path?: string;
};

type DuplicateReport = {
  akahu_cluster_count: number;
  fuzzy_cluster_count: number;
  akahu_duplicate_clusters: { external_id: string; count: number; description_raw: string }[];
};

function parseHealthJson(raw: unknown): HealthInfo {
  if (!raw || typeof raw !== "object") return { capabilities: null };
  const o = raw as Record<string, unknown>;
  const caps = Array.isArray(o.capabilities) ? (o.capabilities as string[]) : null;
  return {
    capabilities: caps,
    version: typeof o.version === "string" ? o.version : undefined,
    db_path: typeof o.db_path === "string" ? o.db_path : undefined,
  };
}

function parseHttpErrorDetail(res: Response, body: unknown): string {
  const d = (body as { detail?: unknown }).detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d))
    return d.map((x: { msg?: string }) => x.msg ?? JSON.stringify(x)).join("; ");
  return `HTTP ${res.status}`;
}

function formatCategoriesLoadError(status: number, detailMsg: string, health: HealthInfo): string {
  if (status === 404) {
    const capHint = health.capabilities?.includes("categories")
      ? "Health reports categories support—try a full restart of the engine process."
      : `Health capabilities: ${health.capabilities?.join(", ") ?? "unknown"}.`;
    const meta =
      health.version != null || health.db_path != null
        ? ` Engine version ${health.version ?? "—"}, database ${health.db_path ?? "—"}.`
        : "";
    return (
      `Categories API returned 404 (Not Found). The process on this URL may not be the Cash Cat engine, or it is an outdated build. ${capHint}${meta} Run \`npm run engine\` from the project root for browser dev, or use the desktop app.`
    );
  }
  return `Could not load categories: ${detailMsg}. Is the engine running?`;
}

function sortTransactions(items: Txn[], sortKey: SortKey, dir: SortDir): Txn[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    if (sortKey === "amount_cents") {
      return (a.amount_cents - b.amount_cents) * mul;
    }
    if (sortKey === "txn_date") {
      return a.txn_date.localeCompare(b.txn_date) * mul;
    }
    if (sortKey === "description_raw") {
      const da = a.description_raw ?? "";
      const db = b.description_raw ?? "";
      return da.localeCompare(db, undefined, { sensitivity: "base" }) * mul;
    }
    if (sortKey === "bank") {
      return bankLabel(a).localeCompare(bankLabel(b), undefined, { sensitivity: "base" }) * mul;
    }
    if (sortKey === "category") {
      const ca = (a.category_display_name || a.category_key || "").toLowerCase();
      const cb = (b.category_display_name || b.category_key || "").toLowerCase();
      return ca.localeCompare(cb) * mul;
    }
    const ta = (a.tags ?? []).slice().sort().join(",");
    const tb = (b.tags ?? []).slice().sort().join(",");
    return ta.localeCompare(tb, undefined, { sensitivity: "base" }) * mul;
  });
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("p-3 font-medium", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-8 gap-1 px-2 font-medium text-muted-foreground hover:text-foreground"
        onClick={onClick}
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 opacity-80" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 opacity-80" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </Button>
    </th>
  );
}

function parseDuplicateReport(raw: unknown): DuplicateReport | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ak = typeof o.akahu_cluster_count === "number" ? o.akahu_cluster_count : 0;
  const fz = typeof o.fuzzy_cluster_count === "number" ? o.fuzzy_cluster_count : 0;
  const clusters = Array.isArray(o.akahu_duplicate_clusters) ? o.akahu_duplicate_clusters : [];
  return {
    akahu_cluster_count: ak,
    fuzzy_cluster_count: fz,
    akahu_duplicate_clusters: clusters.slice(0, 5).map((c) => {
      const row = c as Record<string, unknown>;
      return {
        external_id: typeof row.external_id === "string" ? row.external_id : "",
        count: typeof row.count === "number" ? row.count : 0,
        description_raw: typeof row.description_raw === "string" ? row.description_raw : "",
      };
    }),
  };
}

const TXN_SKELETON_ROWS = 10;

const DUPLICATE_BANNER_FP_KEY = "cashcat.duplicateBannerDismissedFp";

function duplicateReportFingerprint(r: DuplicateReport): string {
  return `${r.akahu_cluster_count}|${r.fuzzy_cluster_count}`;
}

const PAGE_SIZE = 100;

export function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState<Txn[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("txn_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [error, setError] = useState<string | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [duplicateReport, setDuplicateReport] = useState<DuplicateReport | null>(null);
  const [duplicateBannerDismissedFp, setDuplicateBannerDismissedFp] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DUPLICATE_BANNER_FP_KEY);
    } catch {
      return null;
    }
  });
  const [dedupeLoading, setDedupeLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilterKey, setCategoryFilterKey] = useState<string>(() => searchParams.get("category") ?? "");
  const [bulkCategoryKey, setBulkCategoryKey] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [engineDbPath, setEngineDbPath] = useState<string | null>(null);
  const [engineUnreachableBase, setEngineUnreachableBase] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, categoryFilterKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCategoriesError(null);
    setEngineDbPath(null);
    setEngineUnreachableBase(null);
    try {
      const offset = page * PAGE_SIZE;
      const q = new URLSearchParams();
      q.set("limit", String(PAGE_SIZE));
      q.set("offset", String(offset));
      if (debouncedSearch) q.set("q", debouncedSearch);
      if (categoryFilterKey.trim()) q.set("category_key", categoryFilterKey.trim());

      const [txRes, catRes, healthRes, dupRes] = await Promise.all([
        apiFetch(`/transactions?${q.toString()}`),
        apiFetch("/categories?include_archived=true"),
        apiFetch("/health"),
        apiFetch("/transactions/duplicate-report"),
      ]);
      let healthInfo: HealthInfo = { capabilities: null };
      if (healthRes.ok) {
        try {
          healthInfo = parseHealthJson(await healthRes.json());
          setEngineDbPath(healthInfo.db_path ?? null);
        } catch {
          healthInfo = { capabilities: null };
          setEngineDbPath(null);
        }
      } else {
        setEngineDbPath(null);
      }
      if (txRes.ok) {
        let data: unknown;
        try {
          data = await txRes.json();
        } catch {
          setError("Could not read transactions response.");
          setItems([]);
          return;
        }
        const raw = data as { items?: unknown; total?: number };
        const rawItems = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];
        setItems(rawItems.map((row) => normaliseTxn(row)));
        setTotalCount(typeof raw.total === "number" ? raw.total : rawItems.length);
      } else {
        setError("Could not load transactions.");
        setItems([]);
        setTotalCount(0);
      }
      if (dupRes.ok) {
        try {
          setDuplicateReport(parseDuplicateReport(await dupRes.json()));
        } catch {
          setDuplicateReport(null);
        }
      } else {
        setDuplicateReport(null);
      }
      if (catRes.ok) {
        const data = await catRes.json();
        const raw = (data.items ?? []) as { key: string; display_name: string; archived?: boolean }[];
        const next = raw
          .filter((c) => !c.archived)
          .map((c) => ({ key: c.key, display_name: c.display_name }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" }));
        setCategories(next);
        if (next.length === 0) {
          setCategoriesError(
            "No categories returned from the engine. If this is a new database, restart the engine so migrations can run.",
          );
        }
      } else {
        setCategories([]);
        const errBody = await catRes.json().catch(() => ({}));
        const msg = parseHttpErrorDetail(catRes, errBody);
        setCategoriesError(formatCategoriesLoadError(catRes.status, msg, healthInfo));
      }
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error(e);
      }
      const base = await getEngineBaseUrl();
      setEngineUnreachableBase(base);
      setError(formatEngineUnreachableMessage(e, base, import.meta.env.DEV));
      setItems([]);
      setTotalCount(0);
      setDuplicateReport(null);
      setCategories([]);
      setCategoriesError(null);
      setEngineDbPath(null);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, categoryFilterKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => sortTransactions(items, sortKey, sortDir), [items, sortKey, sortDir]);

  async function bulkAssignVisible() {
    if (!bulkCategoryKey) return;
    if (
      !window.confirm(
        `Set category “${bulkCategoryKey}” for all ${sorted.length} transaction(s) on this page? This overrides automatic categories.`,
      )
    ) {
      return;
    }
    const res = await apiFetch("/transactions/bulk-assign", {
      method: "POST",
      body: JSON.stringify({ category_key: bulkCategoryKey, transaction_ids: sorted.map((t) => t.id) }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(typeof err.detail === "string" ? err.detail : "Bulk assign failed.");
      return;
    }
    setError(null);
    await load();
  }

  function onHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(defaultSortDir(key));
    }
  }

  async function assignCategory(
    transactionId: number,
    categoryKey: string,
    descriptionRaw: string | null,
    opts?: { applyToSameDescription?: boolean },
  ) {
    if (opts?.applyToSameDescription) {
      const res = await apiFetch("/transactions/bulk-assign-by-description", {
        method: "POST",
        body: JSON.stringify({
          category_key: categoryKey,
          description_raw: descriptionRaw,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(typeof err.detail === "string" ? err.detail : "Could not update categories.");
        return;
      }
      setError(null);
      setEngineUnreachableBase(null);
      await load();
      return;
    }

    const res = await apiFetch(`/transactions/${transactionId}`, {
      method: "PATCH",
      body: JSON.stringify({ category_key: categoryKey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(typeof err.detail === "string" ? err.detail : "Could not update category.");
      return;
    }
    const data = (await res.json()) as Record<string, unknown>;
    setItems((prev) =>
      prev.map((t) =>
        t.id === transactionId
          ? {
              ...t,
              category_key: (data.category_key as string | null | undefined) ?? categoryKey,
              category_display_name: (data.category_display_name as string | null | undefined) ?? null,
              category_is_override: (data.category_is_override as number | null | undefined) ?? 1,
              tags: Array.isArray(data.tags)
                ? data.tags.filter((x): x is string => typeof x === "string")
                : t.tags,
              included: typeof data.included === "number" ? data.included : t.included,
            }
          : t,
      ),
    );
    setError(null);
    setEngineUnreachableBase(null);
  }

  const duplicateFingerprint = duplicateReport ? duplicateReportFingerprint(duplicateReport) : null;
  const showDuplicateBanner =
    duplicateReport != null &&
    (duplicateReport.akahu_cluster_count > 0 || duplicateReport.fuzzy_cluster_count > 0) &&
    duplicateFingerprint !== duplicateBannerDismissedFp;

  function dismissDuplicateBanner() {
    if (!duplicateFingerprint) return;
    try {
      localStorage.setItem(DUPLICATE_BANNER_FP_KEY, duplicateFingerprint);
    } catch {
      /* ignore */
    }
    setDuplicateBannerDismissedFp(duplicateFingerprint);
  }

  async function removeDuplicateRows() {
    const ok = window.confirm(
      "This permanently deletes extra duplicate rows, keeping the lowest id in each group (same rules as the duplicate report). Continue?",
    );
    if (!ok) return;
    setDedupeLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/transactions/dedupe-duplicate-rows", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (body as { detail?: unknown }).detail;
        setError(typeof detail === "string" ? detail : "Could not remove duplicate rows.");
        return;
      }
      try {
        localStorage.removeItem(DUPLICATE_BANNER_FP_KEY);
      } catch {
        /* ignore */
      }
      setDuplicateBannerDismissedFp(null);
      await load();
    } catch (e) {
      const base = await getEngineBaseUrl();
      setEngineUnreachableBase(base);
      setError(formatEngineUnreachableMessage(e, base, import.meta.env.DEV));
    } finally {
      setDedupeLoading(false);
    }
  }

  function txnIncluded(t: Txn): boolean {
    return (t.included ?? 1) !== 0;
  }

  async function setTransactionIncluded(transactionId: number, included: boolean) {
    const res = await apiFetch(`/transactions/${transactionId}`, {
      method: "PATCH",
      body: JSON.stringify({ included }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(typeof err.detail === "string" ? err.detail : "Could not update inclusion.");
      return;
    }
    const data = (await res.json()) as Record<string, unknown>;
    const inc = data.included;
    setItems((prev) =>
      prev.map((t) =>
        t.id === transactionId
          ? {
              ...t,
              included: typeof inc === "number" ? inc : included ? 1 : 0,
            }
          : t,
      ),
    );
    setError(null);
    setEngineUnreachableBase(null);
  }

  async function assignTags(transactionId: number, tags: string[]) {
    const res = await apiFetch(`/transactions/${transactionId}`, {
      method: "PATCH",
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const detail = err.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Could not update tags. Use lowercase letters, digits, and underscores only.",
      );
      return;
    }
    const data = (await res.json()) as Record<string, unknown>;
    setItems((prev) =>
      prev.map((t) =>
        t.id === transactionId
          ? {
              ...t,
              tags: Array.isArray(data.tags)
                ? data.tags.filter((x): x is string => typeof x === "string")
                : tags,
              category_key: (data.category_key as string | null | undefined) ?? t.category_key,
              category_display_name: (data.category_display_name as string | null | undefined) ?? t.category_display_name,
              category_is_override: (data.category_is_override as number | null | undefined) ?? t.category_is_override,
              included: typeof data.included === "number" ? data.included : t.included,
            }
          : t,
      ),
    );
    setError(null);
    setEngineUnreachableBase(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description={
          <>
            Sort columns by header. Bank shows your institution name where available. Change a category to lock that row
            against automatic re-categorisation. Add manual tags (separate from category) for transfers, reviews, or
            anything else you want to track.
          </>
        }
      />
      {showDuplicateBanner && duplicateReport && (
        <div
          role="status"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-amber-950 dark:text-amber-100">Possible duplicate rows detected</p>
              <p className="mt-1 text-muted-foreground">
                {duplicateReport.akahu_cluster_count > 0 && (
                  <>
                    {duplicateReport.akahu_cluster_count} Akahu transaction
                    {duplicateReport.akahu_cluster_count === 1 ? "" : "s"} appear more than once (same Akahu id stored on
                    multiple rows—often from an older sync bug). Re-sync after updating the app; you can delete extra rows
                    manually if needed.
                  </>
                )}
                {duplicateReport.akahu_cluster_count > 0 && duplicateReport.fuzzy_cluster_count > 0 && " "}
                {duplicateReport.fuzzy_cluster_count > 0 && (
                  <>
                    {duplicateReport.fuzzy_cluster_count} group
                    {duplicateReport.fuzzy_cluster_count === 1 ? "" : "s"} of non-Akahu rows share the same date, amount,
                    and description (for example duplicate CSV imports).
                  </>
                )}
              </p>
              {duplicateReport.akahu_duplicate_clusters.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                  {duplicateReport.akahu_duplicate_clusters.map((c, i) => (
                    <li key={`${c.external_id}-${i}`}>
                      ×{c.count} {c.description_raw ? `— ${c.description_raw.slice(0, 80)}` : ""}
                      {c.description_raw.length > 80 ? "…" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-xl"
                disabled={dedupeLoading || loading}
                onClick={() => void removeDuplicateRows()}
              >
                {dedupeLoading ? "Removing…" : "Remove duplicate rows"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl"
                onClick={dismissDuplicateBanner}
                aria-label="Dismiss duplicate warning"
              >
                <X className="h-4 w-4" aria-hidden />
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
      {error && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          {engineUnreachableBase != null && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit rounded-xl"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
                Retry
              </Button>
              <p className="text-xs text-muted-foreground">
                Check the engine responds:{" "}
                <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">
                  curl -s {engineUnreachableBase}/health
                </code>
              </p>
            </div>
          )}
        </div>
      )}
      {categoriesError && <p className="text-sm text-amber-700 dark:text-amber-500">{categoriesError}</p>}
      <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end lg:gap-4">
        <div className="relative min-w-0 flex-1 lg:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transactions…"
            className="rounded-xl pl-9"
            aria-label="Filter transactions by date, description, bank, category, tags, or amount"
            autoComplete="off"
            spellCheck={false}
            disabled={loading}
          />
        </div>
        <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:max-w-[12rem]">
          <label className="text-xs text-muted-foreground" htmlFor="txn-cat-filter">
            Category
          </label>
          <Input
            id="txn-cat-filter"
            value={categoryFilterKey}
            onChange={(e) => setCategoryFilterKey(e.target.value)}
            placeholder="Filter by category key…"
            className="w-full rounded-xl"
            spellCheck={false}
            aria-label="Filter by category key"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:max-w-xl">
          <label className="text-xs text-muted-foreground" htmlFor="bulk-cat">
            Bulk assign
          </label>
          <div className="flex min-w-0 gap-2">
            <Input
              id="bulk-cat"
              value={bulkCategoryKey}
              onChange={(e) => setBulkCategoryKey(e.target.value)}
              placeholder="category_key"
              className="min-w-0 flex-1 rounded-xl"
              spellCheck={false}
              aria-label="Category key for bulk assign"
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 shrink-0 rounded-xl px-4 font-medium shadow-sm transition-[color,transform,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] active:bg-muted active:shadow-inner"
              disabled={loading || !bulkCategoryKey.trim() || sorted.length === 0}
              onClick={() => void bulkAssignVisible()}
            >
              Apply to this page
            </Button>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {items.length === 0 ? 0 : page * PAGE_SIZE + 1}–{page * PAGE_SIZE + items.length} of {totalCount}{" "}
        matching rows (server search and filters). Uncheck a row to exclude it from dashboard totals and analytics; excluded
        rows are greyed out.
      </p>
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl font-medium shadow-sm transition-[color,transform,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] active:bg-muted active:shadow-inner"
          disabled={loading || page <= 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Previous page
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-xl font-medium shadow-sm transition-[color,transform,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] active:bg-muted active:shadow-inner"
          disabled={loading || (page + 1) * PAGE_SIZE >= totalCount}
          onClick={() => setPage((p) => p + 1)}
        >
          Next page
        </Button>
      </div>
      <div className="max-h-[calc(100vh-12rem)] min-w-0 overflow-auto rounded-2xl border border-border">
        <table className="w-full min-w-[76rem] text-sm">
          <thead className="sticky top-0 z-10 bg-card shadow-sm">
            <tr className="border-b border-border text-left">
              <th scope="col" className="w-10 p-2 pl-3 text-left align-middle">
                <span className="sr-only">Include in totals</span>
              </th>
              <th className="p-3 font-medium w-10" />
              <SortHeader
                label="Date"
                active={sortKey === "txn_date"}
                dir={sortDir}
                onClick={() => onHeaderClick("txn_date")}
              />
              <SortHeader
                label="Bank"
                active={sortKey === "bank"}
                dir={sortDir}
                onClick={() => onHeaderClick("bank")}
                className="min-w-[8rem]"
              />
              <SortHeader
                label="Description"
                active={sortKey === "description_raw"}
                dir={sortDir}
                onClick={() => onHeaderClick("description_raw")}
                className="min-w-[14rem]"
              />
              <SortHeader
                label="Category"
                active={sortKey === "category"}
                dir={sortDir}
                onClick={() => onHeaderClick("category")}
                className="min-w-[12rem] w-[14rem]"
              />
              <SortHeader
                label="Tags"
                active={sortKey === "tags"}
                dir={sortDir}
                onClick={() => onHeaderClick("tags")}
                className="min-w-[11rem] w-[14rem]"
              />
              <SortHeader
                label="Amount"
                active={sortKey === "amount_cents"}
                dir={sortDir}
                onClick={() => onHeaderClick("amount_cents")}
                className="text-right"
              />
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: TXN_SKELETON_ROWS }, (_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-border/40">
                    <td className="p-2 pl-3 align-middle">
                      <Skeleton className="h-4 w-4 rounded-sm" />
                    </td>
                    <td className="p-2 pl-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                    </td>
                    <td className="p-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="p-3">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="p-3">
                      <Skeleton className="h-4 w-full max-w-xs" />
                    </td>
                    <td className="p-2">
                      <Skeleton className="h-9 w-full max-w-[14rem]" />
                    </td>
                    <td className="p-2">
                      <Skeleton className="h-9 w-full max-w-[14rem]" />
                    </td>
                    <td className="p-3 text-right">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </td>
                  </tr>
                ))
              : sorted.map((t) => (
                  <tr
                    key={t.id}
                    className={cn(
                      "cursor-pointer border-b border-border/60",
                      txnIncluded(t) ? "hover:bg-muted/40" : "bg-muted/20 text-muted-foreground opacity-[0.72]",
                    )}
                    onClick={() => {
                      setDetailId(t.id);
                      setDetailOpen(true);
                    }}
                  >
                    <td className="p-2 pl-3 align-middle" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={txnIncluded(t)}
                        onCheckedChange={(v) => {
                          void setTransactionIncluded(t.id, v === true);
                        }}
                        aria-label={
                          txnIncluded(t) ? "Included in totals and analytics" : "Excluded from totals and analytics"
                        }
                      />
                    </td>
                    <td className="p-2 pl-3 align-middle">
                      <InstitutionAvatar institutionName={bankLabel(t)} size="sm" />
                    </td>
                    <td className="p-3 whitespace-nowrap tabular-nums align-middle">{t.txn_date}</td>
                    <td className="p-3 align-middle text-muted-foreground">{bankLabel(t)}</td>
                    <td className="p-3 align-middle">
                      <span className="break-words">{t.description_raw ?? "—"}</span>
                    </td>
                    <td className="p-2 align-middle" onClick={(e) => e.stopPropagation()}>
                      <CategoryCombobox
                        categories={categories}
                        valueKey={t.category_key}
                        displayName={t.category_display_name}
                        sameDescriptionCount={t.same_description_count}
                        onSelect={(key, options) => assignCategory(t.id, key, t.description_raw, options)}
                        disabled={categories.length === 0}
                      />
                    </td>
                    <td className="p-2 align-middle" onClick={(e) => e.stopPropagation()}>
                      <TransactionTagEditor
                        tags={t.tags}
                        transferPairType={t.transfer_pair_id != null ? t.transfer_pair_type : null}
                        onChange={(next) => assignTags(t.id, next)}
                      />
                    </td>
                    <td
                      className="p-3 text-right tabular-nums font-medium text-foreground align-middle"
                      style={t.amount_cents >= 0 ? { color: "hsl(var(--color-income))" } : undefined}
                    >
                      {formatMoney(t.amount_cents)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && !error && !debouncedSearch && !categoryFilterKey.trim() && (
          <div className="space-y-2 p-8 text-center">
            <p className="text-muted-foreground">No transactions yet. Import CSV or sync Akahu.</p>
            {engineDbPath && (
              <p className="text-xs text-muted-foreground">
                Connected engine database:{" "}
                <code className="break-all rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">{engineDbPath}</code>.
                Syncing or importing must use the same engine instance, or set{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8rem]">CASH_CAT_DB_PATH</code> so the
                engine uses the same SQLite file you expect.
              </p>
            )}
          </div>
        )}
        {!loading && items.length === 0 && !error && (debouncedSearch || categoryFilterKey.trim()) && (
          <p className="p-8 text-center text-muted-foreground">No transactions match your search or category filter.</p>
        )}
      </div>
      <TransactionDetailDialog
        transactionId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={() => void load()}
      />
    </div>
  );
}
