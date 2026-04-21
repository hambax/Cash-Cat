import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Preset keys users can add in one click; values are lowercase slug keys. */
export const TAG_SUGGESTIONS: { key: string; label: string }[] = [
  { key: "transfer", label: "Transfer" },
  { key: "internal_transfer", label: "Internal transfer" },
  { key: "card_repayment", label: "Card repayment" },
  { key: "business", label: "Business" },
  { key: "personal", label: "Personal" },
  { key: "review", label: "Review" },
  { key: "reimbursement", label: "Reimbursement" },
  { key: "subscription", label: "Subscription" },
];

/** Human-readable label for a stored tag key (fallback: title-style underscores). */
export function formatTagLabel(key: string): string {
  const hit = TAG_SUGGESTIONS.find((s) => s.key === key);
  if (hit) return hit.label;
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugifyTagInput(raw: string): string | null {
  const x = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!x) return null;
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(x)) return null;
  return x;
}

function transferPairChipLabel(transferPairType: string | null | undefined): string | null {
  if (!transferPairType) return null;
  if (transferPairType === "card_repayment") return "Card repayment";
  if (transferPairType === "internal_transfer") return "Transfer";
  return "Paired";
}

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void | Promise<void>;
  disabled?: boolean;
  /** Detected transfer pair — shown as read-only chips in this column (not stored as tags). */
  transferPairType?: string | null;
};

export function TransactionTagEditor({ tags, onChange, disabled, transferPairType }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(() => [...tags].sort(), [tags]);
  const pairLabel = transferPairChipLabel(transferPairType);
  const hasAnyChips = sorted.length > 0 || pairLabel != null;

  useEffect(() => {
    if (!open) {
      setDraft("");
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  async function commit(next: string[]) {
    if (busy) return;
    const a = [...next].sort().join("|");
    const b = [...tags].sort().join("|");
    if (a === b) return;
    setBusy(true);
    try {
      await onChange(next);
    } finally {
      setBusy(false);
    }
  }

  async function addKey(key: string) {
    if (key && !tags.includes(key)) {
      await commit([...tags, key]);
    }
  }

  async function removeKey(key: string) {
    await commit(tags.filter((t) => t !== key));
  }

  async function onAddDraft() {
    const slug = slugifyTagInput(draft);
    setDraft("");
    if (slug) await addKey(slug);
  }

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-auto min-h-9 w-full max-w-[18rem] justify-start gap-1 px-2 py-1.5 font-normal",
            disabled && "opacity-60",
          )}
          disabled={disabled || busy}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {!hasAnyChips ? (
              <span className="text-muted-foreground">Add tags…</span>
            ) : (
              <>
                {pairLabel ? (
                  <Badge variant="outline" className="shrink-0 font-normal">
                    {pairLabel}
                  </Badge>
                ) : null}
                {sorted.map((t) => (
                  <Badge key={t} variant="secondary" className="max-w-[9rem] truncate font-normal">
                    {formatTagLabel(t)}
                  </Badge>
                ))}
              </>
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-[min(22rem,calc(100vw-2rem))] p-3"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-3">
          {pairLabel ? (
            <p className="text-xs text-muted-foreground">
              Transfer pair: <span className="font-medium text-foreground">{pairLabel}</span> (automatic).
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Lowercase letters, digits, and underscores. Replaces the full tag list for this row.
          </p>
          <div className="flex flex-wrap gap-1">
            {sorted.map((t) => (
              <Badge key={t} variant="secondary" className="gap-1 pr-1 font-normal">
                {formatTagLabel(t)}
                <button
                  type="button"
                  className="rounded-sm p-0.5 hover:bg-muted"
                  aria-label={`Remove ${t}`}
                  onClick={() => void removeKey(t)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="new_tag"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-9 font-mono text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onAddDraft();
                }
              }}
              aria-label="Add tag"
            />
            <Button type="button" size="sm" className="h-9 shrink-0" onClick={() => void onAddDraft()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Suggestions</p>
            <div className="flex flex-wrap gap-1">
              {TAG_SUGGESTIONS.map((s) => (
                <Button
                  key={s.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={tags.includes(s.key)}
                  onClick={() => void addKey(s.key)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
