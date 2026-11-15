"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { CalendarDays, LogOut, Menu, UserRound } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NavList, type SidebarItem } from "@/components/layout/sidebar";
import { BrandMark, BrandName } from "@/components/layout/brand";
import { AppearanceMenu } from "@/components/layout/appearance-menu";
import { signOut } from "@/app/actions/auth";

interface Props {
  items: SidebarItem[];
  companyName: string;
  user: { name: string; email: string; role: string };
  today: string;
  signOutLabel: string;
}

export function Topbar({ items, companyName, user, today, signOutLabel }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "U";
  const current = items.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));

  return (
    <header className="no-print sticky top-0 z-30 px-3 pt-3 sm:px-4 lg:px-6">
      <div className="flex h-16 items-center gap-3 rounded-2xl glass px-3 sm:px-4">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" surface="dark" className="w-72 gap-0 border-0 p-0 [&>button]:text-sidebar-foreground">
          <SheetHeader className="flex-row items-center gap-3 border-b border-sidebar-border px-4 py-4">
            <BrandMark />
            <SheetTitle className="text-sidebar-accent-foreground">
              <BrandName name={companyName} />
            </SheetTitle>
          </SheetHeader>
          <NavList items={items} pathname={pathname} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-[15px] font-semibold text-foreground">{current?.label ?? companyName}</p>
        <p className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <CalendarDays className="size-3.5 text-primary" />
          {new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${today}T00:00:00`))}
        </p>
      </div>

      <AppearanceMenu />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="flex items-center gap-2.5 rounded-full border border-surface-line/70 bg-surface/50 p-1 pr-3 transition-colors hover:bg-surface/90" aria-label="Account menu">
            <Avatar className="size-8">
              <AvatarFallback className="bg-brand text-xs font-semibold text-white">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden text-left leading-tight md:block">
              <span className="block max-w-40 truncate text-sm font-medium">{user.name}</span>
              <span className="block text-[11px] text-muted-foreground capitalize">{user.role}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate">{user.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <form action={signOut}>
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <LogOut /> {signOutLabel}
              </button>
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
    </header>
  );
}
