"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bird, Boxes, Egg, FileBarChart, IdCard, Landmark, LayoutDashboard, PanelLeftClose, PanelLeftOpen, ReceiptText,
  Settings, ShoppingCart, Syringe, Truck, Users, Wallet, Wheat, type LucideIcon,
} from "lucide-react";
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
        "no-print sticky top-0 hidden h-svh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out lg:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center gap-3 border-b border-sidebar-border px-4", collapsed && "justify-center px-0")}>
        <BrandMark />
        {!collapsed ? <BrandName name={companyName} className="text-sidebar-accent-foreground" /> : null}
      </div>
      <NavList items={items} pathname={pathname} collapsed={collapsed} />
      <div className="border-t border-sidebar-border p-3">
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-0",
          )}
          aria-label={collapseLabel}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed ? <span>{collapseLabel}</span> : null}
        </button>
      </div>
    </aside>
  );
}

export function NavList({ items, pathname, collapsed = false, onNavigate }: { items: SidebarItem[]; pathname: string; collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutDashboard;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const link = (
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-sidebar-primary" aria-hidden /> : null}
              <Icon className={cn("size-[18px] shrink-0", active ? "text-sidebar-primary" : "opacity-80")} />
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
