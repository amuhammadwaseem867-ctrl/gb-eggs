import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";

const styles: Record<string, string> = {
  confirmed: "bg-accent text-accent-foreground border-primary/20",
  posted: "bg-accent text-accent-foreground border-primary/20",
  paid: "bg-accent text-accent-foreground border-primary/20",
  active: "bg-accent text-accent-foreground border-primary/20",
  present: "bg-accent text-accent-foreground border-primary/20",
  in: "bg-accent text-accent-foreground border-primary/20",
  draft: "bg-muted text-muted-foreground",
  pending: "bg-warning/15 text-[oklch(0.5_0.12_70)] border-warning/30",
  partial: "bg-warning/15 text-[oklch(0.5_0.12_70)] border-warning/30",
  leave: "bg-warning/15 text-[oklch(0.5_0.12_70)] border-warning/30",
  half_day: "bg-warning/15 text-[oklch(0.5_0.12_70)] border-warning/30",
  unpaid: "bg-destructive/10 text-destructive border-destructive/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  void: "bg-destructive/10 text-destructive border-destructive/20 line-through",
  absent: "bg-destructive/10 text-destructive border-destructive/20",
  out: "bg-destructive/10 text-destructive border-destructive/20",
  closed: "bg-muted text-muted-foreground",
  inactive: "bg-muted text-muted-foreground",
  terminated: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, label }: { status: string | null | undefined; label?: string }) {
  const s = status ?? "";
  return (
    <Badge variant="outline" className={cn("gap-1.5 rounded-full px-2.5 backdrop-blur-sm", styles[s] ?? "bg-muted text-muted-foreground")}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label ?? titleCase(s)}
    </Badge>
  );
}

export function paymentStatus(total: number, balance: number) {
  if (total <= 0) return "paid";
  if (balance <= 0.004) return "paid";
  if (balance < total) return "partial";
  return "unpaid";
}
