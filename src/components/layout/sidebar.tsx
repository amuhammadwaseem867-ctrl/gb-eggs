"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bird, Boxes, Egg, FileBarChart, IdCard, Landmark, LayoutDashboard, PanelLeft, ReceiptText,
  Settings, ShoppingCart, Syringe, Truck, Users, Wallet, Wheat, type LucideIcon,
} from "@/components/icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandMark, BrandName } from "@/components/layout/brand";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Bird, Egg, Boxes, ShoppingCart, ReceiptText, Users, Truck, Wheat, Syringe, Wallet, IdCard, Landmark, FileBarChart, Settings,
};

export interface SidebarItem {
  href: string;
  label: string;
  icon: string;
}

const STORAGE_KEY = "gb-sidebar-collapsed";

function subscribeCollapsed(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(STORAGE_KEY, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(STORAGE_KEY, cb);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar({ items, companyName, collapseLabel }: { items: SidebarItem[]; companyName: string; collapseLabel: string }) {
  const pathname = usePathname();
  const collapsed = React.useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const toggle = () => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "0" : "1");
    } catch {}
    window.dispatchEvent(new Event(STORAGE_KEY));
  };

  return (
    <aside
      className={cn(
        "no-print sticky top-3 z-20 m-3 mr-0 hidden h-[calc(100svh-1.5rem)] shrink-0 flex-col overflow-hidden rounded-3xl glass-dark text-sidebar-foreground transition-[width] duration-300 ease-out lg:flex",
        collapsed ? "w-[4.75rem]" : "w-64",
      )}
    >
      <div className="pointer-events-none absolute -top-16 -left-10 size-48 rounded-full bg-[oklch(0.7_0.16_160/0.35)] blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-20 -right-16 size-56 rounded-full bg-[oklch(0.8_0.15_78/0.18)] blur-3xl" aria-hidden />
      <div className={cn("relative flex h-[4.5rem] items-center gap-3 border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
        <BrandMark />
        {!collapsed ? <BrandName name={companyName} className="text-sidebar-accent-foreground" /> : null}
      </div>
      <NavList items={items} pathname={pathname} collapsed={collapsed} />
      <div className="relative border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapseLabel}
        >
          <PanelLeft className={cn("size-[18px] transition-transform", collapsed && "rotate-180")} />
          {!collapsed ? <span>{collapseLabel}</span> : null}
        </button>
      </div>
    </aside>
  );
}

export function NavList({ items, pathname, collapsed = false, onNavigate }: { items: SidebarItem[]; pathname: string; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="relative flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin]" aria-label="Main">
      <ul className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const link = (
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13.5px] font-medium transition-all duration-200",
                active
                  ? "bg-gradient-to-r from-white/14 to-white/4 text-sidebar-accent-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.12)] ring-1 ring-white/10"
                  : "text-sidebar-foreground/70 hover:bg-white/6 hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                  active ? "bg-brand text-white shadow-glow" : "bg-white/5 text-sidebar-foreground/80 group-hover:bg-white/10 group-hover:text-white",
                )}
              >
                <Icon className="size-[18px]" />
              </span>
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
          return (
            <li key={item.href}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
