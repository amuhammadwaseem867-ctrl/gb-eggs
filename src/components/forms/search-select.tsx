"use client";

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Option } from "@/lib/types";

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  clearable?: boolean;
  id?: string;
  className?: string;
}

/** Accessible searchable select (combobox) for long option lists. */
export function SearchSelect({ value, onChange, options, placeholder = "Select…", disabled, invalid, clearable = true, id, className }: Props) {
  const [open, setOpenState] = React.useState(false);
  const listId = React.useId();
  const setOpen = (o: boolean) => {
    setOpenState(o);
    setActive(0);
  };
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 300);
    return options.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q)).slice(0, 300);
  }, [options, query]);


  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active].value);
    }
  };

  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm shadow-xs transition-colors outline-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
            {clearable && selected && !disabled ? (
              <X
                className="size-3.5 hover:text-foreground"
                aria-label="Clear"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }}
              />
            ) : null}
            <ChevronsUpDown className="size-3.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <div className="border-b p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Type to search…"
            className="h-8 w-full rounded-md bg-muted/60 px-2 text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search options"
          />
        </div>
         <div ref={listRef} id={listId} role="listbox" className="max-h-64 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">No matches</p>
          ) : (
            filtered.map((o, i) => (
              <button
                type="button"
                key={o.value}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <Check className={cn("size-3.5 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint ? <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span> : null}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
