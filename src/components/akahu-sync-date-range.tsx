import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatYmd, parseYmd } from "@/lib/date-ymd";
import { presetLastCalendarMonth, presetRollingMonths } from "@/lib/date-presets";

type PresetId = "last_month" | "m3" | "m6" | "m12";

function DatePickerField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const d = parseYmd(value);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-auto min-h-10 w-full min-w-[12rem] justify-start gap-2 rounded-xl border-border px-4 py-2.5 font-sans text-sm tabular-nums leading-snug",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarDays className="h-4 w-4 shrink-0 opacity-70" />
            <span className="min-w-0 flex-1 text-left">{value || "Choose date"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto rounded-2xl border-border p-0 shadow-lg" align="start">
          <Calendar
            mode="single"
            selected={d}
            onSelect={(date) => {
              if (date) {
                onChange(formatYmd(date));
                setOpen(false);
              }
            }}
            defaultMonth={d ?? new Date()}
            disabled={disabled}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

const PRESETS: { id: PresetId; label: string; title: string }[] = [
  {
    id: "last_month",
    label: "Last month",
    title: "Previous calendar month (first day through last day), local time",
  },
  {
    id: "m3",
    label: "Last 3 months",
    title: "Rolling window: from the same day three months ago through today",
  },
  {
    id: "m6",
    label: "Last 6 months",
    title: "Rolling window: from the same day six months ago through today",
  },
  {
    id: "m12",
    label: "Last 12 months",
    title: "Rolling window: from the same day twelve months ago through today",
  },
];

function applyPreset(id: PresetId): { start: string; end: string } {
  if (id === "last_month") return presetLastCalendarMonth();
  if (id === "m3") return presetRollingMonths(3);
  if (id === "m6") return presetRollingMonths(6);
  return presetRollingMonths(12);
}

export function AkahuSyncDateRange({
  start,
  end,
  onStartChange,
  onEndChange,
  disabled,
}: {
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            title={p.title}
            className="rounded-lg text-xs"
            onClick={() => {
              const r = applyPreset(p.id);
              onStartChange(r.start);
              onEndChange(r.end);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <DatePickerField label="Start" value={start} onChange={onStartChange} disabled={disabled} />
        <DatePickerField label="End" value={end} onChange={onEndChange} disabled={disabled} />
      </div>
      <p className="text-xs text-muted-foreground">Inclusive dates (yyyy-mm-dd), local calendar.</p>
    </div>
  );
}
