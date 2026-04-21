import { DayPicker, type DayPickerProps } from "react-day-picker";

import { cn } from "@/lib/utils";

import "react-day-picker/style.css";

export type CalendarProps = DayPickerProps;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  navLayout = "after",
  fixedWeeks = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      navLayout={navLayout}
      fixedWeeks={fixedWeeks}
      className={cn("p-2", className)}
      classNames={{
        root: cn("rdp-root"),
        months: cn("rdp-months", "flex flex-col gap-3 sm:flex-row sm:gap-4"),
        month: cn("rdp-month", "relative space-y-3"),
        month_caption: cn(
          "rdp-month_caption",
          "flex min-h-11 items-center justify-start gap-1 pt-1 pr-[5.25rem] text-sm font-semibold text-foreground",
        ),
        dropdowns: cn("rdp-dropdowns", "flex items-center gap-1.5"),
        dropdown_root: cn(
          "rdp-dropdown_root",
          "relative inline-flex h-9 min-w-[4.25rem] items-center rounded-lg border border-border bg-card px-2 text-sm text-foreground shadow-sm",
        ),
        caption_label: cn("rdp-caption_label", "pointer-events-none flex items-center gap-1 text-sm font-medium"),
        dropdown: cn("rdp-dropdown", "cursor-pointer opacity-0"),
        months_dropdown: cn("rdp-months_dropdown", "min-w-[5.5rem]"),
        years_dropdown: cn("rdp-years_dropdown", "min-w-[4rem]"),
        chevron: cn("rdp-chevron", "size-4 text-primary opacity-80"),
        nav: cn("rdp-nav", "end-1 top-1 z-20 flex h-9 items-center gap-0.5"),
        button_previous: cn(
          "rdp-button_previous",
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
        ),
        button_next: cn(
          "rdp-button_next",
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
        ),
        month_grid: cn("rdp-month_grid", "w-full border-collapse"),
        weekdays: cn("rdp-weekdays", "flex"),
        weekday: cn("rdp-weekday", "w-9 text-center text-[0.7rem] font-medium text-muted-foreground"),
        week: cn("rdp-week", "mt-1 flex w-full"),
        weeks: cn("rdp-weeks"),
        day: cn("rdp-day", "relative p-0 text-center text-sm focus-within:relative"),
        day_button: cn(
          "rdp-day_button",
          "inline-flex h-9 w-9 items-center justify-center rounded-lg text-sm font-normal transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:opacity-100",
        ),
        selected: cn(
          "rdp-selected",
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-lg font-medium",
        ),
        today: cn("rdp-today", "bg-muted/80 font-medium text-foreground"),
        outside: cn("rdp-outside", "text-muted-foreground/60"),
        disabled: cn("rdp-disabled", "text-muted-foreground/40"),
        hidden: cn("rdp-hidden", "invisible"),
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
