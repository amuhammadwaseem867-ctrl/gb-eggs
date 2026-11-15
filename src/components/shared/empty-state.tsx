import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "@/components/icons";

export function EmptyState({ title = "Nothing here yet", description, action, icon: Icon = Inbox }: { title?: string; description?: string; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="relative mb-1 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-surface to-accent text-primary shadow-[0_10px_24px_-12px_oklch(0.5_0.1_170/0.5)] ring-1 ring-surface-line">
        <Icon className="size-7" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
