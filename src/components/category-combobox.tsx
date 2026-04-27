import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type CategoryOption = {
  key: string;
  display_name: string;
};

export type CategorySelectOptions = {
  /** When true, apply the category to every transaction with the same description (bulk). */
  applyToSameDescription?: boolean;
};

type Props = {
  categories: CategoryOption[];
  valueKey: string | null;
  displayName: string | null;
  onSelect: (categoryKey: string, options?: CategorySelectOptions) => void | Promise<void>;
  disabled?: boolean;
  /** When true, show the internal `key` on the right of each row (transactions table). Default true. */
  showCategoryKey?: boolean;
  /** When set, shows “Add all shown” above the list; receives keys of the current filtered list. */
  onAddAllFiltered?: (keys: string[]) => void | Promise<void>;
  /** When greater than 1, shows a toggle to categorise all transactions with the same exact description. */
  sameDescriptionCount?: number;
  /** Optional id on the trigger for label `htmlFor` (matches Select trigger pattern). */
  id?: string;
  /** Extra classes on the trigger (e.g. `max-w-none`); height matches `SelectTrigger` at `h-10`. */
  triggerClassName?: string;
};

export function CategoryCombobox({
  categories,
  valueKey,
  displayName,
  onSelect,
  disabled,
  showCategoryKey = true,
  onAddAllFiltered,
  sameDescriptionCount,
  id,
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [addAllRowKey, setAddAllRowKey] = useState(0);
  const [applyToSameDescription, setApplyToSameDescription] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addAllId = useId();
  const sameDescId = useId();

  const label =
    displayName ||
    (valueKey ? categories.find((c) => c.key === valueKey)?.display_name : null) ||
    valueKey ||
    "Unassigned";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) => c.display_name.toLowerCase().includes(q) || c.key.toLowerCase().includes(q),
    );
  }, [categories, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setApplyToSameDescription(false);
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const showSameDescriptionToggle =
    typeof sameDescriptionCount === "number" && sameDescriptionCount > 1;

  async function pick(key: string) {
    if (busy) return;
    const bulkSame = showSameDescriptionToggle && applyToSameDescription;
    if (key === valueKey && !bulkSame) return;
    setBusy(true);
    try {
      await onSelect(key, {
        applyToSameDescription: showSameDescriptionToggle && applyToSameDescription,
      });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function addAllShown() {
    if (!onAddAllFiltered || filtered.length === 0 || busy) return;
    setBusy(true);
    try {
      await onAddAllFiltered(filtered.map((c) => c.key));
      setAddAllRowKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || busy}
          className={cn(
            "h-10 w-full min-w-[10rem] max-w-[16rem] justify-between border-input bg-background px-3 py-2 font-normal shadow-sm",
            triggerClassName,
          )}
        >
          <span className="truncate text-left">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-[min(20rem,calc(100vw-2rem))] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-1 p-2">
          <Input
            ref={inputRef}
            placeholder="Search categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
            autoComplete="off"
            aria-label="Search categories"
          />
          {showSameDescriptionToggle ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/80 bg-muted/30 px-2 py-2">
              <Label
                htmlFor={sameDescId}
                className="cursor-pointer text-sm font-normal leading-snug peer-disabled:cursor-not-allowed"
              >
                Apply to all {sameDescriptionCount} transactions with this exact description
              </Label>
              <Switch
                id={sameDescId}
                checked={applyToSameDescription}
                onCheckedChange={setApplyToSameDescription}
                disabled={disabled || busy}
                aria-label="Apply category to all transactions with this exact description"
              />
            </div>
          ) : null}
          {onAddAllFiltered && filtered.length > 0 ? (
            <div
              key={addAllRowKey}
              className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/30 px-2 py-2"
            >
              <Checkbox
                id={addAllId}
                disabled={disabled || busy}
                onCheckedChange={(checked) => {
                  if (checked === true) void addAllShown();
                }}
              />
              <Label htmlFor={addAllId} className="cursor-pointer text-sm font-normal leading-snug peer-disabled:cursor-not-allowed">
                Add all shown
              </Label>
            </div>
          ) : null}
          <ScrollArea className="h-[min(18rem,50vh)]">
            <div className="flex flex-col gap-0.5 pr-3 pb-1">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No category found.</p>
              ) : (
                filtered.map((c) => (
                  <Button
                    key={c.key}
                    type="button"
                    variant="ghost"
                    className="h-auto min-h-9 w-full justify-start gap-2 px-2 py-1.5 font-normal"
                    onClick={() => void pick(c.key)}
                  >
                    <Check className={cn("h-4 w-4 shrink-0", valueKey === c.key ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1 truncate text-left">{c.display_name}</span>
                    {showCategoryKey ? (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{c.key}</span>
                    ) : null}
                  </Button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}
