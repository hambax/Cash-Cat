import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/format";

type Explain = {
  category_key?: string;
  source?: string;
  builtin_rule_index?: number;
  rule_id?: number;
  note?: string;
};

type SplitRow = { id: number; category_key: string; amount_cents: number; note: string | null };

type Detail = {
  id: number;
  txn_date: string;
  amount_cents: number;
  description_raw: string;
  source_label: string | null;
  account_label: string | null;
  provider: string | null;
  external_id: string | null;
  dedupe_hash: string;
  normalised_merchant: string | null;
  category_key: string | null;
  category_display_name: string | null;
  transfer_pair_id: number | null;
  transfer_pair_type: string | null;
  tags: string[];
  splits: SplitRow[];
  categorisation_explain: Explain | null;
};

export function TransactionDetailDialog({
  transactionId,
  open,
  onOpenChange,
  onUpdated,
}: {
  transactionId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || transactionId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await apiFetch(`/transactions/${transactionId}`);
      if (cancelled) return;
      if (res.ok) {
        setDetail((await res.json()) as Detail);
      } else {
        setDetail(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  function explainText(ex: Explain | null): string {
    if (!ex) return "—";
    if (ex.source === "fallback") return ex.note ?? "Falls back to Other.";
    if (ex.source === "builtin" && typeof ex.builtin_rule_index === "number") {
      return `Built-in rule #${ex.builtin_rule_index} → ${ex.category_key ?? ""}`;
    }
    if (ex.source === "user_rule" && ex.rule_id != null) {
      return `Your rule #${ex.rule_id} → ${ex.category_key ?? ""}`;
    }
    return ex.category_key ?? "—";
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transaction details</DialogTitle>
          <DialogDescription>IDs and categorisation hints for support and debugging.</DialogDescription>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && detail && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Date</span>
              <span className="tabular-nums">{detail.txn_date}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Amount</span>
              <span className="tabular-nums font-medium">{formatMoney(detail.amount_cents)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Description</span>
              <p className="mt-1 break-words">{detail.description_raw}</p>
            </div>
            {detail.normalised_merchant && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Merchant (normalised)</span>
                <span className="min-w-0 text-right">{detail.normalised_merchant}</span>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Category</span>
              <span>{detail.category_display_name ?? detail.category_key ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Why this category (rule match)</span>
              <p className="mt-1 text-xs">{explainText(detail.categorisation_explain)}</p>
            </div>
            {detail.transfer_pair_id != null && (
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Transfer pair</span>
                <span className="text-xs">
                  #{detail.transfer_pair_id} ({detail.transfer_pair_type ?? "—"})
                </span>
              </div>
            )}
            {detail.tags.length > 0 && (
              <div>
                <span className="text-muted-foreground">Tags</span>
                <p className="mt-1 font-mono text-xs">{detail.tags.join(", ")}</p>
              </div>
            )}
            {detail.splits.length > 0 && (
              <div>
                <span className="text-muted-foreground">Splits</span>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {detail.splits.map((s) => (
                    <li key={s.id}>
                      {s.category_key}: {formatMoney(s.amount_cents)}
                      {s.note ? ` — ${s.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <details className="rounded-lg border border-border p-2 text-xs">
              <summary className="cursor-pointer font-medium">Technical</summary>
              <dl className="mt-2 space-y-1 font-mono text-[0.7rem] text-muted-foreground">
                <div>
                  <dt className="inline">id:</dt> <dd className="inline">{detail.id}</dd>
                </div>
                <div>
                  <dt className="inline">dedupe_hash:</dt> <dd className="inline break-all">{detail.dedupe_hash}</dd>
                </div>
                {detail.external_id && (
                  <div>
                    <dt className="inline">external_id:</dt> <dd className="inline break-all">{detail.external_id}</dd>
                  </div>
                )}
                <div>
                  <dt className="inline">source:</dt> <dd className="inline">{detail.source_label ?? "—"}</dd>
                </div>
                <div>
                  <dt className="inline">account:</dt> <dd className="inline">{detail.account_label ?? "—"}</dd>
                </div>
              </dl>
            </details>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => {
                onOpenChange(false);
                onUpdated?.();
              }}
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
