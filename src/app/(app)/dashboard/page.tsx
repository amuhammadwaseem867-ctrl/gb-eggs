import Link from "next/link";
import { AlertTriangle, Bird, Boxes, CircleDollarSign, Egg, HandCoins, PackageMinus, ReceiptText, ShoppingCart, Skull, Syringe, TrendingUp, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/shared/stat-card";
import { PageHeader } from "@/components/shared/page-header";
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
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
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
      <PageHeader
        eyebrow={formatDate(s.today, { weekday: "long" })}
        title={`Good day, ${session.fullName.split(" ")[0]}`}
        description="A live overview of flocks, eggs, sales and money for today."
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <StatCard label={t(dict, "dash.liveBirds")} value={formatNumber(s.live_birds)} sub={`${s.active_batches} active batches`} icon={Bird} tone="primary" />
        <StatCard label={t(dict, "dash.collected")} value={formatNumber(s.eggs_collected_today)} sub={s.production_rate_today ? `${formatPercent(s.production_rate_today)} production rate` : "No collection yet today"} icon={Egg} tone="primary" />
        <StatCard label={t(dict, "dash.purchased")} value={formatNumber(s.eggs_purchased_today)} sub={`${formatNumber(Math.floor(s.eggs_purchased_today / tray))} trays`} icon={ShoppingCart} tone="info" />
        <StatCard label={t(dict, "dash.sold")} value={formatNumber(s.eggs_sold_today)} sub={`${formatNumber(Math.floor(s.eggs_sold_today / tray))} trays`} icon={ReceiptText} tone="info" />
        <StatCard label={t(dict, "dash.stock")} value={formatNumber(s.available_stock)} sub={formatEggs(s.available_stock, tray).split("· ")[1]} icon={Boxes} />
        <StatCard label={t(dict, "dash.broken")} value={formatNumber(s.broken_today)} sub={s.eggs_collected_today ? `${formatPercent((s.broken_today / s.eggs_collected_today) * 100)} of collection` : undefined} icon={PackageMinus} tone="warning" />
        <StatCard label={t(dict, "dash.customers")} value={formatNumber(s.total_customers)} sub="Active accounts" icon={Users} />
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
            <StatCard label="Cash & bank balance" value={formatCompactCurrency(s.cash_balance)} sub="All active accounts" icon={Wallet} />
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
    <Link href={href} className="flex items-start gap-3 rounded-lg border p-2.5 transition-colors hover:bg-muted/60">
      <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", danger ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-[oklch(0.55_0.13_70)]")}>
        <Icon className="size-3.5" />
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
