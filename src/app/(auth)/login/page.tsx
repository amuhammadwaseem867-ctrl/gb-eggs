import type { PageSearchProps } from "@/lib/data/query";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";
import { BrandMark } from "@/components/layout/brand";
import { AppBackground } from "@/components/layout/app-background";
import { Bird, Egg, Landmark, Sparkle } from "@/components/icons";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageSearchProps) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: hasUsers, error } = await supabase.rpc("app_has_users");
  const next = typeof sp.next === "string" ? sp.next : "/dashboard";

  return (
    <div className="relative grid min-h-svh overflow-hidden lg:grid-cols-[1.15fr_1fr]">
      <AppBackground />
      <section className="relative m-3 hidden overflow-hidden rounded-[2rem] glass-dark p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="gb-orb pointer-events-none absolute -top-28 -right-20 size-[26rem] rounded-full bg-[oklch(0.72_0.16_160/0.45)] blur-3xl" />
        <div className="gb-orb pointer-events-none absolute -bottom-24 -left-16 size-[22rem] rounded-full bg-[oklch(0.82_0.15_78/0.3)] blur-3xl [animation-delay:-7s]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(oklch(1_0_0/0.06)_1px,transparent_1px)] [background-size:20px_20px]" />
        <div className="relative flex items-center gap-3">
          <BrandMark className="size-12" />
          <div>
            <p className="font-heading text-xl font-bold text-white">GB Eggs</p>
            <p className="text-sm opacity-70">Poultry &amp; Egg Management ERP</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur">
            <Sparkle className="size-3.5 text-[oklch(0.86_0.15_85)]" /> Farm-to-invoice in one place
          </p>
          <h1 className="font-heading text-5xl leading-[1.08] font-bold tracking-tight text-white">
            Every flock, egg and rupee —{" "}
            <span className="bg-gradient-to-r from-[oklch(0.85_0.15_160)] via-[oklch(0.85_0.12_190)] to-[oklch(0.88_0.15_85)] bg-clip-text text-transparent">accounted for.</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed opacity-80">
            Track production by shed, grade and pack inventory, invoice customers, settle suppliers and close your books from one place.
          </p>
          <dl className="mt-10 grid grid-cols-3 gap-3 text-sm">
            {FEATURES.map(({ k, v, icon: Icon, tile }) => (
              <div key={k} className="rounded-2xl border border-white/10 bg-white/6 p-4 backdrop-blur-md">
                <span className={`mb-3 flex size-9 items-center justify-center rounded-xl bg-gradient-to-br text-white ${tile}`}>
                  <Icon className="size-5" />
                </span>
                <dt className="font-semibold text-white">{k}</dt>
                <dd className="mt-1 text-xs opacity-70">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-xs opacity-50">© {new Date().getFullYear()} GB Eggs</p>
      </section>
      <section className="relative flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="gb-rise w-full max-w-md rounded-[1.75rem] glass-strong p-7 sm:p-9">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <p className="font-heading text-lg font-bold">GB Eggs</p>
          </div>
          {error ? (
            <p className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              Cannot reach the database: {error.message}. Check the Supabase URL/key and that migrations have been applied.
            </p>
          ) : null}
          <LoginForm firstRun={hasUsers === false} next={next} />
        </div>
      </section>
    </div>
  );
}

const FEATURES = [
  { k: "Flocks", v: "Live bird ledger", icon: Bird, tile: "from-[oklch(0.74_0.16_155)] to-[oklch(0.56_0.12_192)]" },
  { k: "Inventory", v: "Locked, no double-selling", icon: Egg, tile: "from-[oklch(0.86_0.15_85)] to-[oklch(0.72_0.17_55)]" },
  { k: "Accounts", v: "Accrual P&L + cashbook", icon: Landmark, tile: "from-[oklch(0.76_0.12_225)] to-[oklch(0.56_0.16_258)]" },
];
