import { useId } from "react";
import { cn } from "@/lib/utils";

/** GB Eggs mark: a glossy egg with a yolk and leaf on an emerald→teal tile, drawn inline so it prints crisply. */
export function BrandMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9 shrink-0 drop-shadow-[0_6px_14px_oklch(0.6_0.15_165/0.45)]", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.74 0.16 155)" />
          <stop offset="1" stopColor="oklch(0.55 0.12 195)" />
        </linearGradient>
        <linearGradient id={`${id}e`} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="oklch(0.95 0.04 85)" />
        </linearGradient>
        <radialGradient id={`${id}y`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="oklch(0.88 0.16 85)" />
          <stop offset="1" stopColor="oklch(0.74 0.17 60)" />
        </radialGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill={`url(#${id}t)`} />
      <rect x="0.5" y="0.5" width="39" height="39" rx="11.5" fill="none" stroke="#fff" strokeOpacity="0.35" />
      <path d="M20 7.5c-5.8 0-9.8 8.4-9.8 14C10.2 27.5 14.5 32.5 20 32.5s9.8-5 9.8-11c0-5.6-4-14-9.8-14Z" fill={`url(#${id}e)`} />
      <circle cx="20" cy="23" r="4.6" fill={`url(#${id}y)`} />
      <path d="M21 14.8c2.4-2.7 5.3-3.1 6.4-3 .1 1.2-.6 4.1-3.3 5.9-1.7 1.2-3.4 1.2-4.3 1-.3-1 .1-2.5 1.2-3.9Z" fill="oklch(0.62 0.15 160)" />
      <ellipse cx="16.2" cy="14.5" rx="1.6" ry="2.6" fill="#fff" opacity="0.9" transform="rotate(20 16.2 14.5)" />
    </svg>
  );
}

export function BrandName({ name = "GB Eggs", className, sub = true }: { name?: string; className?: string; sub?: boolean }) {
  return (
    <div className={cn("min-w-0 leading-tight", className)}>
      <p className="truncate font-heading text-[15px] font-bold tracking-tight">{name}</p>
      {sub ? <p className="truncate text-[11px] opacity-60">Poultry &amp; Egg ERP</p> : null}
    </div>
  );
}
