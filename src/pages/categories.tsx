import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CategoryCombobox } from "@/components/category-combobox";
import { PageHeader } from "@/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { budgetPeriodPhrase } from "@/lib/budget-period-label";
import { formatMoney } from "@/lib/format";
import { describeRulePattern } from "@/lib/rule-description";
import { cn } from "@/lib/utils";

type CategoryRow = {
  key: string;
  display_name: string;
  source: string;
  sort_order: number;
  archived: boolean;
};

type RuleRow = { id: number; pattern: string; category_key: string; sort_order: number };
type BudgetPeriod = "weekly" | "monthly" | "custom";
type BudgetRow = {
  category_key: string;
  display_name: string;
  amount_cents: number;
  monthly_cents: number;
  period: BudgetPeriod;
  custom_period_days: number | null;
};

export function CategoriesPage() {
  const [items, setItems] = useState<CategoryRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [ruleMatchKind, setRuleMatchKind] = useState<"contains_any" | "contains_all" | "regex">("contains_any");
  const [ruleTerms, setRuleTerms] = useState("");
  const [ruleRegex, setRuleRegex] = useState("");
  const [ruleAmountSign, setRuleAmountSign] = useState<"any" | "negative" | "positive">("negative");
  const [ruleCategoryKey, setRuleCategoryKey] = useState<string | null>(null);
  const [rulesShowAdvanced, setRulesShowAdvanced] = useState(false);
  const [rulePatternAdvanced, setRulePatternAdvanced] = useState(
    '{"kind":"contains_any","terms":["coffee"],"amount_sign":"negative"}',
  );
  const [budgetCategoryKey, setBudgetCategoryKey] = useState<string | null>(null);
  const [budgetDollars, setBudgetDollars] = useState("");
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>("monthly");
  const [budgetCustomDays, setBudgetCustomDays] = useState("30");
  const [msg, setMsg] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [editRow, setEditRow] = useState<CategoryRow | null>(null);
  const [editName, setEditName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [reapplying, setReapplying] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch("/categories?include_archived=true");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const [rr, br] = await Promise.all([apiFetch("/rules"), apiFetch("/budgets")]);
      if (rr.ok) {
        const data = (await rr.json()) as { items?: RuleRow[] };
        setRules(data.items ?? []);
      }
      if (br.ok) {
        const data = (await br.json()) as { items?: BudgetRow[] };
        const itemsRaw = data.items ?? [];
        setBudgets(
          itemsRaw.map((b) => ({
            ...b,
            period: (b.period ?? "monthly") as BudgetPeriod,
            amount_cents: b.amount_cents ?? b.monthly_cents,
            monthly_cents: b.monthly_cents ?? b.amount_cents,
            custom_period_days: b.custom_period_days ?? null,
          })),
        );
      }
    })();
  }, []);

  const categoryOptions = useMemo(
    () => items.filter((c) => !c.archived).map((c) => ({ key: c.key, display_name: c.display_name })),
    [items],
  );

  function buildRulePatternJson(): string {
    if (rulesShowAdvanced && rulePatternAdvanced.trim()) {
      return rulePatternAdvanced.trim();
    }
    const sign = ruleAmountSign;
    if (ruleMatchKind === "regex") {
      return JSON.stringify({ kind: "regex", pattern: ruleRegex.trim(), amount_sign: sign });
    }
    const terms = ruleTerms
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return JSON.stringify({ kind: ruleMatchKind, terms, amount_sign: sign });
  }

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => {
      const name = r.display_name.toLowerCase();
      const key = r.key.toLowerCase();
      return name.includes(q) || key.includes(q);
    });
  }, [items, searchQuery]);

  const budgetFormPeriodPhrase = useMemo(() => {
    if (budgetPeriod === "custom") {
      const d = Number.parseInt(budgetCustomDays, 10);
      return budgetPeriodPhrase("custom", Number.isFinite(d) && d >= 1 ? d : null);
    }
    return budgetPeriodPhrase(budgetPeriod, null);
  }, [budgetPeriod, budgetCustomDays]);

  async function reapply() {
    if (!confirm("Re-run categorisation for all non-overridden transactions? This may change auto-assigned categories.")) {
      return;
    }
    setMsg(null);
    setReapplying(true);
    try {
      const res = await apiFetch("/categorisation/reapply", {
        method: "POST",
        body: JSON.stringify({ mode: "reapply" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg(`Updated: ${data.assigned ?? 0} assignments. Skipped ${data.skipped_override ?? 0} overrides.`);
      } else {
        setMsg(`Error: ${JSON.stringify(data)}`);
      }
    } finally {
      setReapplying(false);
    }
  }

  async function createCategory() {
    setMsg(null);
    const res = await apiFetch("/categories", {
      method: "POST",
      body: JSON.stringify({
        key: newKey.trim().toLowerCase().replace(/\s+/g, "_"),
        display_name: newName.trim(),
      }),
    });
    if (res.ok) {
      setAddOpen(false);
      setNewKey("");
      setNewName("");
      await load();
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.detail ?? "Could not create");
    }
  }

  async function saveEdit() {
    if (!editRow) return;
    setMsg(null);
    const res = await apiFetch(`/categories/${encodeURIComponent(editRow.key)}`, {
      method: "PATCH",
      body: JSON.stringify({ display_name: editName }),
    });
    if (res.ok) {
      setEditRow(null);
      await load();
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.detail ?? "Could not save");
    }
  }

  async function addRule() {
    setMsg(null);
    const pattern = buildRulePatternJson();
    const key = ruleCategoryKey?.trim();
    if (!key) {
      setMsg("Choose a category for this rule.");
      return;
    }
    const res = await apiFetch("/rules", {
      method: "POST",
      body: JSON.stringify({ pattern, category_key: key, sort_order: 200 }),
    });
    if (res.ok) {
      setRuleTerms("");
      setRuleRegex("");
      setRuleCategoryKey(null);
      setRuleMatchKind("contains_any");
      setRuleAmountSign("negative");
      setRulePatternAdvanced('{"kind":"contains_any","terms":["coffee"],"amount_sign":"negative"}');
      const r = await apiFetch("/rules");
      if (r.ok) setRules(((await r.json()) as { items?: RuleRow[] }).items ?? []);
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(typeof e.detail === "string" ? e.detail : "Could not add rule");
    }
  }

  async function deleteRule(id: number) {
    if (!confirm("Delete this rule?")) return;
    setMsg(null);
    const res = await apiFetch(`/rules/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRules((prev) => prev.filter((x) => x.id !== id));
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(typeof e.detail === "string" ? e.detail : "Could not delete rule");
    }
  }

  async function saveBudget() {
    setMsg(null);
    const key = budgetCategoryKey?.trim();
    const dollars = Number.parseFloat(budgetDollars);
    if (!key || Number.isNaN(dollars) || dollars < 0) {
      setMsg("Choose a category and enter a non-negative amount in dollars.");
      return;
    }
    if (budgetPeriod === "custom") {
      const d = Number.parseInt(budgetCustomDays, 10);
      if (!Number.isFinite(d) || d < 1 || d > 366) {
        setMsg("For a custom period, enter the number of days (1–366).");
        return;
      }
    }
    const cents = Math.round(dollars * 100);
    const body: Record<string, unknown> = {
      amount_cents: cents,
      period: budgetPeriod,
    };
    if (budgetPeriod === "custom") {
      body.custom_period_days = Number.parseInt(budgetCustomDays, 10);
    }
    const res = await apiFetch(`/budgets/${encodeURIComponent(key)}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setBudgetCategoryKey(null);
      setBudgetDollars("");
      setBudgetPeriod("monthly");
      setBudgetCustomDays("30");
      const br = await apiFetch("/budgets");
      if (br.ok) {
        const data = (await br.json()) as { items?: BudgetRow[] };
        const itemsRaw = data.items ?? [];
        setBudgets(
          itemsRaw.map((b) => ({
            ...b,
            period: (b.period ?? "monthly") as BudgetPeriod,
            amount_cents: b.amount_cents ?? b.monthly_cents,
            monthly_cents: b.monthly_cents ?? b.amount_cents,
            custom_period_days: b.custom_period_days ?? null,
          })),
        );
      }
    } else {
      const e = await res.json().catch(() => ({}));
      const det = e.detail;
      setMsg(typeof det === "string" ? det : Array.isArray(det) ? det.map((x: { msg?: string }) => x.msg).join("; ") : "Could not save budget");
    }
  }

  async function deleteBudget(key: string) {
    if (!confirm("Remove this budget?")) return;
    const res = await apiFetch(`/budgets/${encodeURIComponent(key)}`, { method: "DELETE" });
    if (res.ok) {
      setBudgets((prev) => prev.filter((b) => b.category_key !== key));
    }
  }

  async function removeRow(row: CategoryRow) {
    if (row.source === "preset") return;
    if (!confirm(`Delete “${row.display_name}” and move transactions to Other?`)) return;
    setMsg(null);
    const res = await apiFetch(`/categories/${encodeURIComponent(row.key)}`, { method: "DELETE" });
    if (res.ok) {
      await load();
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(e.detail ?? "Could not delete");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <>
            <Tags className="h-7 w-7 shrink-0" aria-hidden />
            Categories
          </>
        }
        titleClassName="flex items-center gap-2"
        description={
          <>
            Preset categories cover common spending (including investments and KiwiSaver keywords). You can add your own
            and rename labels. Re-run categorisation after changes to auto-assigned rows (manual category overrides are
            untouched). <strong>Budgets</strong> apply to categories here — not to tags. Optional{" "}
            <Link to="/tags" className="text-primary underline underline-offset-2">
              tags
            </Link>{" "}
            on the Transactions page are for cross-cutting labels and the Tags analytics page.
          </>
        }
      />

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="space-y-1.5">
            <CardTitle>All categories</CardTitle>
            <CardDescription>Preset rows can be renamed; only your categories can be deleted.</CardDescription>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAddOpen(true)}>
              Add category
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl font-medium shadow-sm transition-[color,transform,box-shadow] duration-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] active:bg-muted active:shadow-inner"
              disabled={reapplying}
              aria-busy={reapplying}
              aria-label={reapplying ? "Re-running categorisation…" : "Re-run categorisation"}
              onClick={reapply}
            >
              <RefreshCw
                className={cn("h-4 w-4 shrink-0", reapplying && "animate-spin")}
                aria-hidden
              />
              Re-run categorisation
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or key…"
              className="rounded-xl pl-9"
              aria-label="Filter categories by name or key"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Key</th>
                  <th className="p-3 font-medium">Source</th>
                  <th className="p-3 font-medium">Details</th>
                  <th className="p-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((r) => (
                  <tr key={r.key} className="border-b border-border/60 hover:bg-muted/30">
                    <td className="p-3 font-medium">{r.display_name}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{r.key}</td>
                    <td className="p-3">
                      <Badge variant={r.source === "preset" ? "secondary" : "default"}>
                        {r.source === "preset" ? "Preset" : "Yours"}
                      </Badge>
                      {r.archived && (
                        <Badge variant="outline" className="ml-2">
                          Archived
                        </Badge>
                      )}
                    </td>
                    <td className="p-3">
                      <Button type="button" variant="link" className="h-auto p-0 text-sm" asChild>
                        <Link to={`/categories/${encodeURIComponent(r.key)}`}>View trends</Link>
                      </Button>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditRow(r);
                          setEditName(r.display_name);
                        }}
                      >
                        Rename
                      </Button>
                      {r.source === "user" && (
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeRow(r)}>
                          Delete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                      {items.length === 0
                        ? "No categories loaded."
                        : searchQuery.trim()
                          ? "No categories match your search."
                          : "No categories loaded."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Matching rules</CardTitle>
          <CardDescription>
            Teach Cash Cat how to label transactions that slip past the built-in hints. Rules run in order (see the table
            below). After adding rules, use <strong>Re-run categorisation</strong> above so existing transactions can update.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!rulesShowAdvanced ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Category</Label>
                <CategoryCombobox
                  categories={categoryOptions}
                  valueKey={ruleCategoryKey}
                  displayName={ruleCategoryKey ? (items.find((i) => i.key === ruleCategoryKey)?.display_name ?? null) : null}
                  onSelect={(key) => setRuleCategoryKey(key)}
                  showCategoryKey={false}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-match-kind">Match type</Label>
                <Select value={ruleMatchKind} onValueChange={(v) => setRuleMatchKind(v as typeof ruleMatchKind)}>
                  <SelectTrigger id="rule-match-kind" className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="contains_any">Text contains any of these words</SelectItem>
                    <SelectItem value="contains_all">Text contains all of these words</SelectItem>
                    <SelectItem value="regex">Text matches a pattern (advanced)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-amount-sign">Applies to</Label>
                <Select value={ruleAmountSign} onValueChange={(v) => setRuleAmountSign(v as typeof ruleAmountSign)}>
                  <SelectTrigger id="rule-amount-sign" className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="negative">Money out (debits)</SelectItem>
                    <SelectItem value="positive">Money in (credits)</SelectItem>
                    <SelectItem value="any">Either</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {ruleMatchKind === "regex" ? (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="rule-regex">Pattern</Label>
                  <Input
                    id="rule-regex"
                    value={ruleRegex}
                    onChange={(e) => setRuleRegex(e.target.value)}
                    placeholder="e.g. countdown|new world"
                    className="rounded-xl"
                    spellCheck={false}
                  />
                  <p className="text-xs text-muted-foreground">
                    Uses a regular expression (case-insensitive). Prefer word rules unless you are comfortable with
                    patterns.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="rule-words">Words or phrases</Label>
                  <Input
                    id="rule-words"
                    value={ruleTerms}
                    onChange={(e) => setRuleTerms(e.target.value)}
                    placeholder="Separate with commas — e.g. paknsave, new world, countdown"
                    className="rounded-xl"
                  />
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                <Button type="button" className="rounded-xl" onClick={() => void addRule()}>
                  Add rule
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRulesShowAdvanced(true)}>
                  Advanced (edit as raw JSON)
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <CategoryCombobox
                  categories={categoryOptions}
                  valueKey={ruleCategoryKey}
                  displayName={ruleCategoryKey ? (items.find((i) => i.key === ruleCategoryKey)?.display_name ?? null) : null}
                  onSelect={(key) => setRuleCategoryKey(key)}
                  showCategoryKey={false}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-adv-json">Rule (advanced JSON)</Label>
                <Input
                  id="rule-adv-json"
                  value={rulePatternAdvanced}
                  onChange={(e) => setRulePatternAdvanced(e.target.value)}
                  className="font-mono text-xs rounded-xl"
                  spellCheck={false}
                />
                <p className="text-xs text-muted-foreground">
                  For developers and power users. Must include a supported <code className="text-xs">kind</code> (
                  <code className="text-xs">contains_any</code>, <code className="text-xs">contains_all</code>, or{" "}
                  <code className="text-xs">regex</code>).
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="rounded-xl" onClick={() => void addRule()}>
                  Add rule
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setRulesShowAdvanced(false)}>
                  Simple form
                </Button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <th className="p-2 font-medium">ID</th>
                  <th className="p-2 font-medium">Category</th>
                  <th className="p-2 font-medium">Rule</th>
                  <th className="p-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="p-2 font-mono text-xs">{r.id}</td>
                    <td className="p-2 text-xs">{items.find((i) => i.key === r.category_key)?.display_name ?? r.category_key}</td>
                    <td className="max-w-md p-2 text-xs leading-snug text-muted-foreground">{describeRulePattern(r.pattern)}</td>
                    <td className="p-2 text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => void deleteRule(r.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      No custom rules yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Budgets</CardTitle>
          <CardDescription>
            Set how much you plan to spend per category for a week, month, or your own number of days. The dashboard
            compares your actual spending in the selected date range to the total budget across that range.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1 space-y-2">
              <Label htmlFor="bud-category">Category</Label>
              <CategoryCombobox
                id="bud-category"
                triggerClassName="max-w-none"
                categories={categoryOptions}
                valueKey={budgetCategoryKey}
                displayName={
                  budgetCategoryKey ? (items.find((i) => i.key === budgetCategoryKey)?.display_name ?? null) : null
                }
                onSelect={(key) => setBudgetCategoryKey(key)}
                showCategoryKey={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bud-period">Period</Label>
              <Select value={budgetPeriod} onValueChange={(v) => setBudgetPeriod(v as BudgetPeriod)}>
                <SelectTrigger id="bud-period" className="h-10 w-[11rem] rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="custom">Custom (days)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {budgetPeriod === "custom" ? (
              <div className="space-y-2">
                <Label htmlFor="bud-days">Days in period</Label>
                <Input
                  id="bud-days"
                  type="number"
                  min={1}
                  max={366}
                  value={budgetCustomDays}
                  onChange={(e) => setBudgetCustomDays(e.target.value)}
                  className="h-10 w-24 tabular-nums rounded-xl"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="bud-amt">
                Amount (NZD) {budgetFormPeriodPhrase}
              </Label>
              <Input
                id="bud-amt"
                type="number"
                min={0}
                step={0.01}
                value={budgetDollars}
                onChange={(e) => setBudgetDollars(e.target.value)}
                className="h-10 w-40 tabular-nums rounded-xl"
              />
            </div>
            <Button type="button" className="h-10 shrink-0 rounded-xl" onClick={() => void saveBudget()}>
              Save budget
            </Button>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {budgets.map((b) => {
              const periodWords = budgetPeriodPhrase(b.period, b.custom_period_days);
              return (
                <li key={b.category_key} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span>
                    <span className="font-medium">{b.display_name}</span>
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    {formatMoney(b.amount_cents)} {periodWords}
                    <Button type="button" variant="ghost" size="sm" onClick={() => void deleteBudget(b.category_key)}>
                      Remove
                    </Button>
                  </span>
                </li>
              );
            })}
            {budgets.length === 0 && <li className="px-3 py-6 text-center text-muted-foreground">No budgets yet.</li>}
          </ul>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
            <DialogDescription>
              Use a short machine key (lowercase, underscores). Example: <code className="text-xs">coffee_sub</code>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="nk">Key</Label>
              <Input id="nk" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. coffee_sub" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nn">Display name</Label>
              <Input id="nn" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Coffee subscriptions" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={createCategory} disabled={!newKey.trim() || !newName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename category</DialogTitle>
            <DialogDescription>Key stays the same: {editRow?.key}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="en">Display name</Label>
            <Input id="en" value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditRow(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveEdit}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
