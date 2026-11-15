import Link from "next/link";
import { AlertTriangle, Bird, Boxes, CircleDollarSign, Egg, FileBarChart, HandCoins, Lightning, PackageMinus, ReceiptText, ShoppingCart, Skull, Syringe, TrendingUp, Users, Wallet } from "@/components/icons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ExpenseChart, ProductionChart, RateChart, SalesChart } from "@/components/dashboard/charts";
import { can, requirePage } from "@/lib/auth";
import { getDictionary, t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { formatCompactCurrency, formatCurrency, formatDate, formatEggs, formatNumber, formatPercent, titleCase } from "@/lib/format";
import type { Row } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requirePage("dashboard");
  const dict = getDictionary(session.settings.language);
  const supabase = await createClient();
  const showFin = can(session, "accounting") || can(session, "reports");

  const [summaryRes, chartsRes, txnsRes, collRes] = await Promise.all([
    supabase.rpc("dashboard_summary"),
    supabase.rpc("dashboard_charts", { p_days: 30 }),
    showFin
      ? supabase.from("financial_transactions").select("id, txn_date, direction, amount, category, description, created_at, cash_accounts(name)").order("txn_date", { ascending: false }).order("created_at", { ascending: false }).limit(8)
      : Promise.resolve({ data: [] as Row[], error: null }),
    can(session, "production")
      ? supabase.from("egg_collections").select("id, collection_date, total_eggs, saleable_eggs, broken_eggs, live_hens, sheds(name), farms(name)").eq("status", "posted").order("collection_date", { ascending: false }).order("created_at", { ascending: false }).limit(6)
      : Promise.resolve({ data: [] as Row[], error: null }),
  ]);

  if (summaryRes.error) {
    return (
      <div className="rounded-2xl glass p-6 text-sm text-destructive">
        Could not load the dashboard: {summaryRes.error.message}
      </div>
    );
  }
  const s = summaryRes.data as Row;
  const ch = (chartsRes.data ?? {}) as Row;
  const tray = Number(s.tray_capacity ?? 30);
  const alerts = s.alerts as Row;
  const alertCount =
    alerts.low_egg_stock.length + alerts.low_feed.length + alerts.low_medicine.length + alerts.low_packaging.length + alerts.expiring_medicine.length;
  const production = (ch.production ?? []) as Row[];
  const avgRate = production.filter((d) => d.rate !== null).reduce((a, d, _, arr) => a + Number(d.rate) / arr.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero
        name={session.fullName.split(" ")[0]}
        timezone={session.settings.timezone}
        date={formatDate(s.today, { weekday: "long" })}
        birds={formatNumber(s.live_birds)}
        eggs={formatNumber(s.eggs_collected_today)}
        rate={s.production_rate_today ? formatPercent(s.production_rate_today) : null}
        actions={[
          can(session, "sales", "create") && { href: "/sales/new", label: "New invoice", icon: ReceiptText },
          can(session, "purchases", "create") && { href: "/purchases/new", label: "Buy eggs", icon: ShoppingCart },
          can(session, "production") && { href: "/production", label: "Production", icon: Egg },
          can(session, "reports") && { href: "/reports", label: "Reports", icon: FileBarChart },
        ].filter((a): a is QuickAction => Boolean(a))}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label={t(dict, "dash.liveBirds")} value={formatNumber(s.live_birds)} sub={`${s.active_batches} active batches`} icon={Bird} tone="primary" />
        <StatCard label={t(dict, "dash.collected")} value={formatNumber(s.eggs_collected_today)} sub={s.production_rate_today ? `${formatPercent(s.production_rate_today)} production rate` : "No collection yet today"} icon={Egg} tone="primary" />
        <StatCard label={t(dict, "dash.purchased")} value={formatNumber(s.eggs_purchased_today)} sub={`${formatNumber(Math.floor(s.eggs_purchased_today / tray))} trays`} icon={ShoppingCart} tone="info" />
        <StatCard label={t(dict, "dash.sold")} value={formatNumber(s.eggs_sold_today)} sub={`${formatNumber(Math.floor(s.eggs_sold_today / tray))} trays`} icon={ReceiptText} tone="violet" />
        <StatCard label={t(dict, "dash.stock")} value={formatNumber(s.available_stock)} sub={formatEggs(s.available_stock, tray).split("· ")[1]} icon={Boxes} tone="warning" />
        <StatCard label={t(dict, "dash.broken")} value={formatNumber(s.broken_today)} sub={s.eggs_collected_today ? `${formatPercent((s.broken_today / s.eggs_collected_today) * 100)} of collection` : undefined} icon={PackageMinus} tone="warning" />
        <StatCard label={t(dict, "dash.customers")} value={formatNumber(s.total_customers)} sub="Active accounts" icon={Users} tone="info" />
        {s.outstanding_receivables !== null ? (
          <StatCard label={t(dict, "dash.receivables")} value={formatCompactCurrency(s.outstanding_receivables)} sub={s.outstanding_payables !== null ? `Payables ${formatCompactCurrency(s.outstanding_payables)}` : undefined} icon={HandCoins} tone="warning" />
        ) : null}
        {showFin ? (
          <>
            <StatCard label={t(dict, "dash.revenue")} value={formatCurrency(s.revenue_today)} sub={`Collected ${formatCurrency(s.collections_today)}`} icon={TrendingUp} tone="primary" />
            <StatCard label={t(dict, "dash.expenses")} value={formatCurrency(s.expenses_today)} sub="Purchases, expenses & salaries" icon={Wallet} tone="danger" />
            <StatCard
              label={t(dict, "dash.profit")}
              value={<span className={cn(Number(s.net_profit_today) < 0 && "text-destructive")}>{formatCurrency(s.net_profit_today)}</span>}
              sub="Accrual basis"
              icon={CircleDollarSign}
              tone={Number(s.net_profit_today) < 0 ? "danger" : "primary"}
            />
            <StatCard label="Cash & bank balance" value={formatCompactCurrency(s.cash_balance)} sub="All active accounts" icon={Wallet} tone="violet" />
          </>
        ) : null}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Egg production</CardTitle>
              <CardDescription>Saleable vs. broken eggs, last 30 days</CardDescription>
            </div>
            <Badge variant="outline" className="tabular">Avg {formatPercent(avgRate)}</Badge>
          </CardHeader>
          <CardContent>
            <ProductionChart data={production as never} />
            <div className="mt-2 border-t pt-2">
              <p className="mb-1 text-xs text-muted-foreground">Daily production rate (saleable ÷ live hens)</p>
              <RateChart data={production as never} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Alerts
              {alertCount + alerts.vaccinations_due.length > 0 ? <Badge className="bg-warning/20 text-foreground">{alertCount + alerts.vaccinations_due.length}</Badge> : null}
            </CardTitle>
            <CardDescription>Low stock, expiring medicine and due vaccinations</CardDescription>
          </CardHeader>
          <CardContent className="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
            {alertCount + alerts.vaccinations_due.length === 0 ? <EmptyState title="All clear" description="No stock or expiry alerts right now." /> : null}
            {alerts.low_egg_stock.map((a: Row) => (
              <AlertRow key={`e${a.name}`} icon={Egg} title={`${a.name} is low`} detail={`${formatNumber(a.quantity)} eggs · alert at ${formatNumber(a.reorder_level)}`} href="/inventory" />
            ))}
            {alerts.low_feed.map((a: Row) => (
              <AlertRow key={`f${a.name}`} icon={AlertTriangle} title={`${a.name} is low`} detail={`${formatNumber(a.quantity)} ${a.unit} left`} href="/feed" />
            ))}
            {alerts.low_medicine.map((a: Row) => (
              <AlertRow key={`m${a.name}`} icon={Syringe} title={`${a.name} is low`} detail={`${formatNumber(a.quantity)} ${a.unit} left`} href="/medicine" />
            ))}
            {alerts.low_packaging.map((a: Row) => (
              <AlertRow key={`p${a.name}`} icon={Boxes} title={`${a.name} is low`} detail={`${formatNumber(a.quantity)} ${a.unit} left`} href="/inventory?tab=packaging" />
            ))}
            {alerts.expiring_medicine.map((a: Row) => (
              <AlertRow key={`x${a.batch_no}${a.name}`} icon={Syringe} danger={a.expired} title={`${a.name} ${a.expired ? "expired" : "expires soon"}`} detail={`Batch ${a.batch_no} · ${formatDate(a.expiry_date)} · ${formatNumber(a.quantity)} left`} href="/medicine?tab=batches" />
            ))}
            {alerts.vaccinations_due.map((a: Row) => (
              <AlertRow key={`v${a.batch_code}${a.vaccine}`} icon={Syringe} title={`${a.vaccine} due`} detail={`${a.batch_code} · ${formatDate(a.due)}`} href="/poultry?tab=vaccinations" />
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Sales</CardTitle>
            <CardDescription>{showFin ? "Invoiced revenue per day" : "Eggs sold per day"}, last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <SalesChart data={(ch.sales ?? []) as never} showRevenue={showFin} />
          </CardContent>
        </Card>
        {showFin ? (
          <Card>
            <CardHeader>
              <CardTitle>Expenses</CardTitle>
              <CardDescription>By category, last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ExpenseChart data={((ch.expenses_by_category ?? []) as Row[]).map((r) => ({ category: r.category, amount: Number(r.amount) }))} />
            </CardContent>
          </Card>
        ) : (
          <MortalityCard items={alerts.mortality} />
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        {showFin ? (
          <Card className="xl:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Recent transactions</CardTitle>
                <CardDescription>Latest cashbook entries</CardDescription>
              </div>
              <Link href="/accounting?tab=cashbook" className="text-sm font-medium text-primary hover:underline">View cashbook</Link>
            </CardHeader>
            <CardContent className="px-0">
              {(txnsRes.data ?? []).length === 0 ? (
                <EmptyState title="No transactions yet" />
              ) : (
                <ul className="divide-y">
                  {(txnsRes.data as Row[]).map((tx) => (
                    <li key={tx.id} className="flex items-center gap-3 px-6 py-2.5">
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", tx.direction === "in" ? "bg-accent text-primary" : "bg-destructive/10 text-destructive")}>
                        {tx.direction === "in" ? "IN" : "OUT"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{tx.description ?? titleCase(tx.category)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(tx.txn_date)} · {titleCase(tx.category)} · {tx.cash_accounts?.name}
                        </p>
                      </div>
                      <span className={cn("tabular text-sm font-semibold", tx.direction === "in" ? "text-primary" : "text-destructive")}>
                        {tx.direction === "in" ? "+" : "−"}
                        {formatCurrency(tx.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
        <div className={cn("flex flex-col gap-4", !showFin && "xl:col-span-3")}>
        {showFin ? <MortalityCard items={alerts.mortality} /> : null}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Recent egg collections</CardTitle>
              <CardDescription>Latest shed records</CardDescription>
            </div>
            <Link href="/production" className="text-sm font-medium text-primary hover:underline">All</Link>
          </CardHeader>
          <CardContent className="px-0">
            {(collRes.data ?? []).length === 0 ? (
              <EmptyState title="No collections yet" />
            ) : (
              <ul className="divide-y">
                {(collRes.data as Row[]).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-6 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.farms?.name} · {c.sheds?.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(c.collection_date)} · {formatPercent((c.saleable_eggs / Math.max(c.live_hens, 1)) * 100)} rate</p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm font-semibold">{formatNumber(c.total_eggs)}</p>
                      <p className="text-xs text-destructive/80">{formatNumber(c.broken_eggs)} broken</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        </div>
      </section>
    </div>
  );
}

function AlertRow({ icon: Icon, title, detail, href, danger }: { icon: typeof Egg; title: string; detail: string; href: string; danger?: boolean }) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-xl border border-surface-line/70 bg-surface/45 p-2.5 transition-all hover:-translate-y-px hover:bg-surface/80">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white", danger ? "from-[oklch(0.72_0.18_15)] to-[oklch(0.58_0.21_355)]" : "from-[oklch(0.86_0.15_85)] to-[oklch(0.72_0.17_55)]")}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
    </Link>
  );
}

function MortalityCard({ items }: { items: Row[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Mortality</CardTitle>
          <CardDescription>Last 7 days, by batch</CardDescription>
        </div>
        <Link href="/poultry?tab=mortality" className="text-sm font-medium text-primary hover:underline">All</Link>
      </CardHeader>
      <CardContent className="px-0">
        {items.length === 0 ? (
          <EmptyState title="No mortality recorded" icon={Skull} />
        ) : (
          <ul className="divide-y">
            {items.map((m) => (
              <li key={`${m.date}${m.batch_code}`} className="flex items-center justify-between gap-3 px-6 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.batch_code}</p>
                  <p className="truncate text-xs text-muted-foreground">{formatDate(m.date)} · {m.cause ?? "Unspecified"}</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-sm font-semibold">{formatNumber(m.quantity)}</p>
                  <p className={cn("text-xs", m.is_high ? "font-medium text-destructive" : "text-muted-foreground")}>{formatPercent(m.pct, 2)}{m.is_high ? " · high" : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type QuickAction = { href: string; label: string; icon: typeof Egg };

function DashboardHero({ name, timezone, date, birds, eggs, rate, actions }: { name: string; timezone: string; date: string; birds: string; eggs: string; rate: string | null; actions: QuickAction[] }) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <section className="relative overflow-hidden rounded-3xl glass-dark p-6 text-white sm:p-8">
      <div className="gb-orb pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-primary/45 blur-3xl" aria-hidden />
      <div className="gb-orb pointer-events-none absolute -bottom-28 left-1/3 size-72 rounded-full bg-[oklch(0.82_0.15_78/0.28)] blur-3xl [animation-delay:-8s]" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(oklch(1_0_0/0.07)_1px,transparent_1px)] [background-size:20px_20px] [mask-image:linear-gradient(to_left,black,transparent_70%)]" aria-hidden />
      <svg viewBox="0 0 120 150" className="pointer-events-none absolute right-8 bottom-[-1.5rem] hidden h-48 opacity-90 drop-shadow-[0_20px_30px_oklch(0.1_0.05_268/0.6)] md:block" aria-hidden>
        <defs>
          <linearGradient id="heroEgg" x1="0.2" y1="0" x2="0.8" y2="1">
            <stop offset="0" stopColor="#fff" />
            <stop offset="1" stopColor="oklch(0.9 0.05 80)" />
          </linearGradient>
          <radialGradient id="heroYolk" cx="0.4" cy="0.4" r="0.6">
            <stop offset="0" stopColor="oklch(0.9 0.16 88)" />
            <stop offset="1" stopColor="oklch(0.72 0.18 55)" />
          </radialGradient>
        </defs>
        <path d="M60 4C34 4 14 46 14 76c0 34 20 62 46 62s46-28 46-62C106 46 86 4 60 4Z" fill="url(#heroEgg)" />
        <circle cx="60" cy="88" r="22" fill="url(#heroYolk)" />
        <ellipse cx="42" cy="38" rx="7" ry="13" fill="#fff" opacity="0.85" transform="rotate(22 42 38)" />
      </svg>

      <div className="relative max-w-2xl">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur">
          <Lightning className="size-3.5 text-[oklch(0.86_0.15_85)]" /> {date}
        </p>
        <h1 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          {greeting}, <span className="bg-gradient-to-r from-[oklch(0.88_0.13_160)] to-[oklch(0.9_0.14_85)] bg-clip-text text-transparent">{name}</span>
        </h1>
        <p className="mt-2 text-sm text-white/70 sm:text-base">
          {birds} live birds on the farm · {eggs} eggs collected today{rate ? ` · ${rate} lay rate` : ""}
        </p>
        {actions.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {actions.map(({ href, label, icon: Icon }, i) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-all hover:-translate-y-px",
                  i === 0 ? "bg-brand text-white shadow-glow hover:brightness-110" : "border border-white/15 bg-white/10 text-white/90 backdrop-blur hover:bg-white/20",
                )}
              >
                <Icon className="size-4" /> {label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
