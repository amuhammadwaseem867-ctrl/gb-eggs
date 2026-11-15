"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/forms/search-select";
import type { Option } from "@/lib/types";
import { cn } from "@/lib/utils";

function useParamSetter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return React.useCallback(
    (updates: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (resetPage) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
}

export function SearchInput({ placeholder = "Search…", param = "q", className }: { placeholder?: string; param?: string; className?: string }) {
  const params = useSearchParams();
  const set = useParamSetter();
  const [value, setValue] = React.useState(params.get(param) ?? "");
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => set({ [param]: value.trim() || null }), 350);
    return () => clearTimeout(t);
  }, [value, param, set]);
  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="h-9 pl-8" aria-label={placeholder} />
    </div>
  );
}

export function FilterSelect({ param, options, placeholder, className }: { param: string; options: Option[]; placeholder: string; className?: string }) {
  const params = useSearchParams();
  const set = useParamSetter();
  return (
    <div className={cn("w-full sm:w-52", className)}>
      <SearchSelect value={params.get(param) ?? ""} onChange={(v) => set({ [param]: v || null })} options={options} placeholder={placeholder} />
    </div>
  );
}

export function DateRangeFilter({ fromParam = "from", toParam = "to", defaultFrom, defaultTo }: { fromParam?: string; toParam?: string; defaultFrom?: string; defaultTo?: string }) {
  const params = useSearchParams();
  const set = useParamSetter();
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="date"
        aria-label="From date"
        className="h-9 w-[9.5rem]"
        value={params.get(fromParam) ?? defaultFrom ?? ""}
        onChange={(e) => set({ [fromParam]: e.target.value || null })}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <Input
        type="date"
        aria-label="To date"
        className="h-9 w-[9.5rem]"
        value={params.get(toParam) ?? defaultTo ?? ""}
        onChange={(e) => set({ [toParam]: e.target.value || null })}
      />
    </div>
  );
}

export function Pagination({ total, page, pageSize }: { total: number; page: number; pageSize: number }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-white/60 bg-white/30 px-4 py-2.5 text-sm">
      <p className="text-muted-foreground">
        <span className="tabular">{from.toLocaleString()}–{to.toLocaleString()}</span> of <span className="tabular">{total.toLocaleString()}</span>
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" asChild disabled={page <= 1} aria-disabled={page <= 1} className={cn(page <= 1 && "pointer-events-none opacity-50")}>
          <Link href={href(page - 1)} scroll={false} aria-label="Previous page">
            <ChevronLeft />
          </Link>
        </Button>
        <span className="tabular px-2 text-muted-foreground">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" asChild className={cn(page >= pages && "pointer-events-none opacity-50")}>
          <Link href={href(page + 1)} scroll={false} aria-label="Next page">
            <ChevronRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function LinkTabs({ tabs, param = "tab" }: { tabs: { value: string; label: string; count?: number }[]; param?: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const current = params.get(param) ?? tabs[0]?.value;
  return (
    <nav className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl glass-subtle p-1" aria-label="Sections">
      {tabs.map((t) => {
        const next = new URLSearchParams();
        if (t.value !== tabs[0].value) next.set(param, t.value);
        const active = current === t.value;
        return (
          <Link
            key={t.value}
            href={next.toString() ? `${pathname}?${next}` : pathname}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative shrink-0 rounded-xl px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200",
              active ? "bg-white text-foreground shadow-[0_4px_14px_-6px_oklch(0.25_0.06_266/0.3)] ring-1 ring-white" : "text-muted-foreground hover:bg-white/50 hover:text-foreground",
            )}
          >
            {t.label}
            {t.count !== undefined ? <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[11px]", active ? "bg-brand text-white" : "bg-muted text-muted-foreground")}>{t.count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>;
}
