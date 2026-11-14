import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "primary" | "warning" | "danger" | "info";
}

const tones = {
  default: "bg-muted text-foreground/70",
  primary: "bg-accent text-primary",
  warning: "bg-warning/15 text-[oklch(0.55_0.13_70)]",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-[oklch(0.95_0.03_250)] text-[oklch(0.5_0.15_250)] dark:bg-[oklch(0.3_0.05_250)] dark:text-[oklch(0.8_0.1_250)]",
};

export function StatCard({ label, value, sub, icon: Icon, tone = "default" }: Props) {
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-3.5 shadow-xs sm:p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-xs font-medium text-muted-foreground sm:truncate">{label}</p>
          <p className="tabular mt-1.5 text-lg font-semibold tracking-tight break-words sm:truncate sm:text-2xl">{value}</p>
          {sub ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:truncate">{sub}</div> : null}
        </div>
        {Icon ? (
          <span className={cn("hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex", tones[tone])}>
            <Icon className="size-4.5" />
          </span>
        ) : null}
      </div>
    </div>
  );
}
