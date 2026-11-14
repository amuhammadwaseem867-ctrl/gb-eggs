import { cn } from "@/lib/utils";

/** GB Eggs mark: a stylised egg with a leaf, drawn inline so it prints crisply. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="oklch(0.596 0.145 163.2)" />
      <path d="M20 8c-5.6 0-9.5 8.2-9.5 13.6C10.5 27.4 14.7 32 20 32s9.5-4.6 9.5-10.4C29.5 16.2 25.6 8 20 8Z" fill="#fff" />
      <path d="M20.5 17.5c2.6-2.9 5.7-3.4 6.9-3.3.1 1.3-.6 4.4-3.5 6.4-1.9 1.3-3.7 1.3-4.7 1.1-.3-1.1.1-2.7 1.3-4.2Z" fill="oklch(0.596 0.145 163.2)" />
    </svg>
  );
}

export function BrandName({ name = "GB Eggs", className, sub = true }: { name?: string; className?: string; sub?: boolean }) {
  return (
    <div className={cn("min-w-0 leading-tight", className)}>
      <p className="truncate font-heading text-[15px] font-bold tracking-tight">{name}</p>
      {sub ? <p className="truncate text-[11px] opacity-70">Poultry &amp; Egg ERP</p> : null}
    </div>
  );
}
