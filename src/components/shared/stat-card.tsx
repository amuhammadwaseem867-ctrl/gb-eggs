import type { ReactNode } from "react";
import type { LucideIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "warning" | "danger" | "info" | "violet";
}

const tones = {
  default: { tile: "from-[oklch(0.45_0.05_266)] to-[oklch(0.3_0.05_268)]", glow: "bg-[oklch(0.5_0.05_266/0.18)]", shadow: "shadow-[0_8px_20px_-8px_oklch(0.3_0.05_268/0.55)]" },
  primary: { tile: "from-[oklch(0.74_0.16_155)] to-[oklch(0.56_0.12_192)]", glow: "bg-[oklch(0.75_0.15_160/0.35)]", shadow: "shadow-[0_8px_20px_-8px_oklch(0.6_0.15_165/0.7)]" },
  warning: { tile: "from-[oklch(0.86_0.15_85)] to-[oklch(0.72_0.17_55)]", glow: "bg-[oklch(0.85_0.15_80/0.4)]", shadow: "shadow-[0_8px_20px_-8px_oklch(0.75_0.17_65/0.7)]" },
  danger: { tile: "from-[oklch(0.72_0.18_15)] to-[oklch(0.58_0.21_355)]", glow: "bg-[oklch(0.72_0.18_15/0.3)]", shadow: "shadow-[0_8px_20px_-8px_oklch(0.62_0.2_10/0.7)]" },
  info: { tile: "from-[oklch(0.76_0.12_225)] to-[oklch(0.56_0.16_258)]", glow: "bg-[oklch(0.75_0.12_235/0.35)]", shadow: "shadow-[0_8px_20px_-8px_oklch(0.6_0.15_250/0.7)]" },
  violet: { tile: "from-[oklch(0.72_0.16_300)] to-[oklch(0.55_0.2_285)]", glow: "bg-[oklch(0.7_0.16_295/0.3)]", shadow: "shadow-[0_8px_20px_-8px_oklch(0.58_0.2_290/0.7)]" },
};

export function StatCard({ label, value, sub, icon: Icon, tone = "default" }: Props) {
  const t = tones[tone];
  return (
    <div className="group relative overflow-hidden rounded-2xl glass p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-18px_oklch(0.25_0.06_266/0.35)] sm:p-5">
      <div className={cn("pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100", t.glow)} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-xs font-medium text-muted-foreground sm:truncate">{label}</p>
          <p className="tabular mt-2 font-heading text-xl font-bold tracking-tight break-words text-foreground sm:truncate sm:text-[1.65rem]">{value}</p>
          {sub ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:truncate">{sub}</div> : null}
        </div>
        {Icon ? (
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white ring-1 ring-white/40 sm:size-11", t.tile, t.shadow)}>
            <Icon className="size-5 sm:size-[22px]" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
