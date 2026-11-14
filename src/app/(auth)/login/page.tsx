import type { PageSearchProps } from "@/lib/data/query";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/layout/brand";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageSearchProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: hasUsers, error } = await supabase.rpc("app_has_users");
  const next = typeof sp.next === "string" ? sp.next : "/dashboard";

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-sidebar-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 size-80 rounded-full bg-sidebar-primary/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <BrandMark className="size-11" />
          <div>
            <p className="font-heading text-xl font-bold text-sidebar-accent-foreground">GB Eggs</p>
            <p className="text-sm opacity-70">Poultry &amp; Egg Management ERP</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h1 className="font-heading text-4xl leading-tight font-semibold text-sidebar-accent-foreground">
            Every flock, egg and rupee — accounted for.
          </h1>
          <p className="mt-4 text-base leading-relaxed opacity-80">
            Track production by shed, grade and pack inventory, invoice customers, settle suppliers and close your books from one place.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-6 text-sm">
            {[["Flocks", "Live bird ledger"], ["Inventory", "Locked, no double-selling"], ["Accounts", "Accrual P&L + cashbook"]].map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold text-sidebar-primary">{k}</dt>
                <dd className="mt-1 opacity-75">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-xs opacity-50">© {new Date().getFullYear()} GB Eggs</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <p className="font-heading text-lg font-bold">GB Eggs</p>
          </div>
          {error ? (
            <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Cannot reach the database: {error.message}. Check the Supabase URL/key and that migrations have been applied.
            </p>
          ) : null}
          <LoginForm firstRun={hasUsers === false} next={next} />
        </div>
      </section>
    </div>
  );
}
