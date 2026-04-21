import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface MagicActionButtonProps extends ButtonProps {
  loading?: boolean;
  /** Label while loading (with spinner). Defaults to children if omitted. */
  loadingLabel?: React.ReactNode;
}

const MagicActionButton = React.forwardRef<HTMLButtonElement, MagicActionButtonProps>(
  ({ loading, loadingLabel, children, className, disabled, ...props }, ref) => {
    const showLabel = loading && loadingLabel !== undefined ? loadingLabel : children;

    const button = (
      <Button
        ref={ref}
        className={cn(loading && "relative z-[1]", className)}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin shrink-0" aria-hidden />
            {showLabel}
          </>
        ) : (
          children
        )}
      </Button>
    );

    if (!loading) {
      return button;
    }

    return (
      <span className="relative inline-flex rounded-xl p-[2px] shadow-[0_0_20px_-4px_hsl(var(--primary)/0.45)]">
        <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[10px]" aria-hidden>
          <span
            className="absolute left-1/2 top-1/2 h-[220%] w-[220%] animate-magic-spin bg-[conic-gradient(from_0deg,hsl(var(--chart-2)),hsl(var(--primary)),hsl(var(--accent)),hsl(var(--chart-5)),hsl(var(--chart-2)))]"
          />
        </span>
        {button}
      </span>
    );
  },
);
MagicActionButton.displayName = "MagicActionButton";

export { MagicActionButton };
