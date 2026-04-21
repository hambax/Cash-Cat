import { Building2, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

/** Approximate NZ bank chip tints — recognition only; not official marks. */
const INSTITUTION_CHIP: Record<string, { bg: string; fg: string; card?: boolean }> = {
  westpac: { bg: "bg-[#D5002B]", fg: "text-white" },
  bnz: { bg: "bg-[#002F6C]", fg: "text-white" },
  anz: { bg: "bg-[#007DBA]", fg: "text-white" },
  asb: { bg: "bg-[#F5B800]", fg: "text-neutral-900" },
  amex: { bg: "bg-[#006FCF]", fg: "text-white", card: true },
  tsb: { bg: "bg-[#00843D]", fg: "text-white" },
  kiwibank: { bg: "bg-[#00A651]", fg: "text-white" },
};

function normaliseKey(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (n.includes("westpac")) return "westpac";
  if (n.includes("anz")) return "anz";
  if (n.includes("asb")) return "asb";
  if (n.includes("bnz") || n.includes("national bank")) return "bnz";
  if (n.includes("american express") || n === "amex") return "amex";
  if (n.includes("tsb")) return "tsb";
  if (n.includes("kiwibank")) return "kiwibank";
  return "";
}

type Props = {
  institutionName: string;
  logoUrl?: string | null;
  className?: string;
  size?: "sm" | "md";
};

export function InstitutionAvatar({ institutionName, logoUrl, className, size = "md" }: Props) {
  const dim = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={cn("rounded-xl object-contain bg-card", dim, className)}
      />
    );
  }
  const key = normaliseKey(institutionName);
  const chip = key ? INSTITUTION_CHIP[key] : { bg: "bg-muted", fg: "text-muted-foreground", card: false };
  const Icon = chip.card ? CreditCard : Building2;
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl",
        chip.bg,
        chip.fg,
        dim,
        className,
      )}
      title={institutionName}
    >
      <Icon className="h-1/2 w-1/2" aria-hidden />
    </div>
  );
}
