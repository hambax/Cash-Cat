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
import { PageHeader } from "@/components/page-header";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

type CategoryRow = {
  key: string;
  display_name: string;
  source: string;
  sort_order: number;
  archived: boolean;
};

type RuleRow = { id: number; pattern: string; category_key: string; sort_order: number };
type BudgetRow = { category_key: string; display_name: string; monthly_cents: number };

export function CategoriesPage() {
  const [items, setItems] = useState<CategoryRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [rulePattern, setRulePattern] = useState(
    '{"kind":"contains_any","terms":["example"],"amount_sign":"negative"}',
  );
  const [ruleCategory, setRuleCategory] = useState("");
  const [budgetCategory, setBudgetCategory] = useState("");
  const [budgetDollars, setBudgetDollars] = useState("");
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
        setBudgets(data.items ?? []);
      }
    })();
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => {
      const name = r.display_name.toLowerCase();
      const key = r.key.toLowerCase();
      return name.includes(q) || key.includes(q);
    });
  }, [items, searchQuery]);

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
    const res = await apiFetch("/rules", {
      method: "POST",
      body: JSON.stringify({ pattern: rulePattern, category_key: ruleCategory.trim(), sort_order: 200 }),
    });
    if (res.ok) {
      setRulePattern('{"kind":"contains_any","terms":["example"],"amount_sign":"negative"}');
      setRuleCategory("");
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
    const key = budgetCategory.trim();
    const dollars = Number.parseFloat(budgetDollars);
    if (!key || Number.isNaN(dollars) || dollars < 0) {
      setMsg("Enter a category key and a non-negative monthly amount in dollars.");
      return;
    }
    const cents = Math.round(dollars * 100);
    const res = await apiFetch(`/budgets/${encodeURIComponent(key)}`, {
      method: "POST",
      body: JSON.stringify({ monthly_cents: cents }),
    });
    if (res.ok) {
      setBudgetCategory("");
      setBudgetDollars("");
      const br = await apiFetch("/budgets");
      if (br.ok) setBudgets(((await br.json()) as { items?: BudgetRow[] }).items ?? []);
    } else {
      const e = await res.json().catch(() => ({}));
      setMsg(typeof e.detail === "string" ? e.detail : "Could not save budget");
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
            untouched). <strong>Monthly budgets</strong> apply to categories here — not to tags. Optional{" "}
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
            Optional JSON rules, applied after built-ins. Use{" "}
            <code className="text-xs">contains_any</code>, <code className="text-xs">contains_all</code>, or{" "}
            <code className="text-xs">regex</code>. Then run &quot;Re-run categorisation&quot; with missing mode from the
            engine if needed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rule-pat">Pattern (JSON)</Label>
              <Input
                id="rule-pat"
                value={rulePattern}
                onChange={(e) => setRulePattern(e.target.value)}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-cat">Category key</Label>
              <Input
                id="rule-cat"
                value={ruleCategory}
                onChange={(e) => setRuleCategory(e.target.value)}
                placeholder="groceries"
                className="font-mono text-xs"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" className="rounded-xl" onClick={() => void addRule()}>
                Add rule
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                  <th className="p-2 font-medium">ID</th>
                  <th className="p-2 font-medium">Category</th>
                  <th className="p-2 font-medium">Pattern</th>
                  <th className="p-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="p-2 font-mono text-xs">{r.id}</td>
                    <td className="p-2 font-mono text-xs">{r.category_key}</td>
                    <td className="max-w-md truncate p-2 font-mono text-xs">{r.pattern}</td>
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
          <CardTitle>Monthly budgets</CardTitle>
          <CardDescription>Compare to spending on the dashboard for the selected date range.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="bud-key">Category key</Label>
              <Input
                id="bud-key"
                value={budgetCategory}
                onChange={(e) => setBudgetCategory(e.target.value)}
                className="font-mono text-xs"
                placeholder="groceries"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bud-amt">Monthly amount (NZD)</Label>
              <Input
                id="bud-amt"
                type="number"
                min={0}
                step={0.01}
                value={budgetDollars}
                onChange={(e) => setBudgetDollars(e.target.value)}
                className="w-40 tabular-nums"
              />
            </div>
            <Button type="button" className="rounded-xl" onClick={() => void saveBudget()}>
              Save budget
            </Button>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {budgets.map((b) => (
              <li key={b.category_key} className="flex items-center justify-between gap-2 px-3 py-2">
                <span>
                  <span className="font-medium">{b.display_name}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">({b.category_key})</span>
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  {formatMoney(b.monthly_cents)} per month
                  <Button type="button" variant="ghost" size="sm" onClick={() => void deleteBudget(b.category_key)}>
                    Remove
                  </Button>
                </span>
              </li>
            ))}
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
