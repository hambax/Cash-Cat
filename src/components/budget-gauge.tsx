import { useId } from "react";
import { cn } from "@/lib/utils";

const R = 76;
const CX = 100;
/** Baseline Y — arc sits above this line. */
const CY = 96;

/** Upper semicircle from left to right (angle π at left, 0 at right). */
const ARC_D = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

const ARC_LEN = Math.PI * R;

/** Point on the upper semicircle: progress 0 = left end of arc, 1 = right end (matches stroke-dashoffset fill). */
function needlePosition(progressFrac: number) {
  const phi = Math.PI * (1 - Math.min(1, Math.max(0, progressFrac)));
  return {
    cx: CX + R * Math.cos(phi),
    cy: CY - R * Math.sin(phi),
  };
}

type BudgetGaugeProps = {
  /** spent / allowance; values above 1 fill the arc in red. */
  ratio: number;
  loading?: boolean;
  className?: string;
};

/**
 * 180° semicircular dial (flat base). Zone tint follows chart / accent / destructive tokens from the app theme.
 */
export function BudgetGauge({ ratio, loading, className }: BudgetGaugeProps) {
  const gid = useId().replace(/:/g, "");
  const zoneGradId = `budget-zone-${gid}`;
  const trackGradId = `budget-track-${gid}`;

  const util = loading ? 0 : Math.max(0, ratio);
  const over = !loading && util > 1;
  const progressFrac = over ? 1 : Math.min(util, 1);
  const dashOffset = ARC_LEN * (1 - progressFrac);

  let progressStroke: string;
  if (loading) {
    progressStroke = "hsl(var(--muted-foreground) / 0.35)";
  } else if (over) {
    progressStroke = "hsl(var(--destructive))";
  } else if (util >= 0.88) {
    progressStroke = "hsl(var(--accent))";
  } else {
    progressStroke = "hsl(var(--primary))";
  }

  const cap = !loading && progressFrac > 0.02 ? needlePosition(progressFrac) : null;

  return (
    <svg
      viewBox="0 0 200 108"
      className={cn("mx-auto block w-full max-w-[220px]", className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={zoneGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--chart-5))" stopOpacity={0.24} />
          <stop offset="48%" stopColor="hsl(var(--chart-7))" stopOpacity={0.2} />
          <stop offset="72%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
          <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.36} />
        </linearGradient>
        <linearGradient id={trackGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--muted-foreground) / 0.2)" />
          <stop offset="100%" stopColor="hsl(var(--muted-foreground) / 0.35)" />
        </linearGradient>
      </defs>
      {/* Zone wash */}
      <path
        d={ARC_D}
        fill="none"
        stroke={`url(#${zoneGradId})`}
        strokeWidth={14}
        strokeLinecap="round"
        className="opacity-90"
      />
      {/* Neutral track */}
      <path
        d={ARC_D}
        fill="none"
        stroke={`url(#${trackGradId})`}
        strokeWidth={10}
        strokeLinecap="round"
      />
      {/* Progress */}
      <path
        d={ARC_D}
        fill="none"
        stroke={progressStroke}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={ARC_LEN}
        strokeDashoffset={loading ? ARC_LEN : dashOffset}
        className="transition-[stroke-dashoffset,stroke] duration-500 ease-out"
        style={{ filter: over ? "drop-shadow(0 0 3px hsl(var(--destructive) / 0.45))" : undefined }}
      />
      {cap ? (
        <circle
          cx={cap.cx}
          cy={cap.cy}
          r={4}
          fill={progressStroke}
          stroke="hsl(var(--background))"
          strokeWidth={1.5}
          className="transition-[cx,cy,fill] duration-500 ease-out"
        />
      ) : null}
    </svg>
  );
}
