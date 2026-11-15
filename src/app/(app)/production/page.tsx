import { Egg, Gauge, PackageX, Percent } from "@/components/icons";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DateRangeFilter, FilterSelect, LinkTabs, Toolbar } from "@/components/shared/table-controls";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { VoidButton } from "@/components/shared/void-button";
import { TableCell, TableRow } from "@/components/ui/table";
import { can, requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/forms/entities";
import { loadOptions, sourcesOf } from "@/lib/data/options";
import { dateRange, isUuid, type PageSearchProps, paging, param, todayIn } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import type { Row } from "@/lib/types";

export const metadata = { title: "Egg production" };

export default async function ProductionPage({ searchParams }: PageSearchProps) {
  const session = await requirePage("production");
  const sp = await searchParams;
  const today = todayIn(session.settings.timezone);
  const tab = param(sp, "tab") ?? "collections";
  const { from, to } = dateRange(sp, today, 30);
  const farm = isUuid(param(sp, "farm")) ? param(sp, "farm")! : null;
  const shed = isUuid(param(sp, "shed")) ? param(sp, "shed")! : null;
  const supabase = await createClient();
  const options = await loadOptions(sourcesOf(ENTITIES.egg_collection.fields));
  const period = tab === "weekly" ? "week" : tab === "monthly" ? "month" : "day";

  const { data: report } = await supabase.rpc("production_report", { p_from: from, p_to: to, p_period: period, p_farm: farm, p_shed: shed });
  const rep = (report ?? []) as Row[];
  const tot = rep.reduce(
    (a, r) => ({ total: a.total + Number(r.total), saleable: a.saleable + Number(r.saleable), broken: a.broken + Number(r.broken) + Number(r.rejected), henDays: a.henDays + Number(r.hen_days) }),
    { total: 0, saleable: 0, broken: 0, henDays: 0 },
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Egg production"
        description="Daily shed-wise collections graded by size. Production rate = saleable eggs ÷ live laying hens × 100."
        actions={can(session, "production", "create") ? <EntityDialog entity="egg_collection" options={options} today={today} label="Record collection" /> : null}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Eggs collected" value={formatNumber(tot.total)} sub={`${formatDate(from)} – ${formatDate(to)}`} icon={Egg} tone="primary" />
        <StatCard label="Saleable eggs" value={formatNumber(tot.saleable)} sub={`${formatNumber(Math.floor(tot.saleable / 30))} trays`} icon={Gauge} tone="info" />
        <StatCard label="Broken & rejected" value={formatNumber(tot.broken)} sub={tot.total ? formatPercent((tot.broken / tot.total) * 100, 2) : undefined} icon={PackageX} tone="warning" />
        <StatCard label="Production rate" value={tot.henDays ? formatPercent((tot.saleable / tot.henDays) * 100) : "—"} sub="Hen-day average" icon={Percent} tone="primary" />
      </div>
      <LinkTabs tabs={[{ value: "collections", label: "Daily records" }, { value: "daily", label: "Daily summary" }, { value: "weekly", label: "Weekly" }, { value: "monthly", label: "Monthly" }]} />
      <Toolbar>
        <DateRangeFilter defaultFrom={from} defaultTo={to} />
        <FilterSelect param="farm" placeholder="All farms" options={options.farms ?? []} />
        <FilterSelect param="shed" placeholder="All sheds" options={(options.sheds ?? []).filter((s) => !farm || s.parent === farm)} />
      </Toolbar>
      {tab === "collections" ? (
        <CollectionsTable sp={sp} from={from} to={to} farm={farm} shed={shed} canVoid={can(session, "production", "delete")} />
      ) : (
        <SummaryTable rows={rep} period={period} />
      )}
    </div>
  );
}

async function CollectionsTable({ sp, from, to, farm, shed, canVoid }: { sp: Record<string, string | string[] | undefined>; from: string; to: string; farm: string | null; shed: string | null; canVoid: boolean }) {
  const supabase = await createClient();
  const { page, pageSize, from: f, to: t } = paging(sp);
  let q = supabase
    .from("egg_collections")
    .select("*, farms(name), sheds(name), chicken_batches(batch_code)", { count: "exact" })
    .gte("collection_date", from)
    .lte("collection_date", to)
    .order("collection_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (farm) q = q.eq("farm_id", farm);
  if (shed) q = q.eq("shed_id", shed);
  const { data, count } = await q.range(f, t);
  const columns: Column[] = [
    { key: "collection_date", header: "Date", cell: (r) => formatDate(r.collection_date) },
    { key: "shed", header: "Farm / shed", cell: (r) => <span className="font-medium">{r.farms?.name} · {r.sheds?.name}</span> },
    { key: "am", header: "AM / PM", align: "right", hideOnMobile: true, cell: (r) => `${formatNumber(r.morning_eggs)} / ${formatNumber(r.evening_eggs)}` },
    { key: "total_eggs", header: "Total", align: "right", cell: (r) => <span className="font-semibold">{formatNumber(r.total_eggs)}</span> },
    { key: "sizes", header: "S / M / L / XL / Dirty", align: "right", hideOnMobile: true, cell: (r) => <span className="text-muted-foreground">{[r.small_eggs, r.medium_eggs, r.large_eggs, r.xl_eggs, r.dirty_eggs].map((x: number) => formatNumber(x)).join(" / ")}</span> },
    { key: "broken", header: "Broken / rej.", align: "right", cell: (r) => <span className="text-destructive/90">{formatNumber(r.broken_eggs)} / {formatNumber(r.rejected_eggs)}</span> },
    { key: "live_hens", header: "Hens", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.live_hens) },
    { key: "rate", header: "Rate", align: "right", cell: (r) => formatPercent((r.saleable_eggs / Math.max(r.live_hens, 1)) * 100) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canVoid && r.status === "posted" ? <VoidButton rpc="void_egg_collection" args={{ p_id: r.id }} what="collection" /> : null) },
  ];
  return <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />;
}

function SummaryTable({ rows, period }: { rows: Row[]; period: string }) {
  const label = (d: string) =>
    period === "month" ? formatDate(d, { day: undefined, month: "long" }) : period === "week" ? `Week of ${formatDate(d)}` : formatDate(d, { weekday: "short" });
  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k]), 0);
  const columns: Column[] = [
    { key: "period_start", header: period === "day" ? "Date" : "Period", cell: (r) => <span className="font-medium">{label(r.period_start)}</span> },
    { key: "total", header: "Collected", align: "right", cell: (r) => formatNumber(r.total) },
    { key: "small", header: "Small", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.small) },
    { key: "medium", header: "Medium", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.medium) },
    { key: "large", header: "Large", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.large) },
    { key: "xl", header: "XL", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.xl) },
    { key: "dirty", header: "Dirty", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.dirty) },
    { key: "broken", header: "Broken + rej.", align: "right", cell: (r) => formatNumber(Number(r.broken) + Number(r.rejected)) },
    { key: "saleable", header: "Saleable", align: "right", cell: (r) => <span className="font-semibold">{formatNumber(r.saleable)}</span> },
    { key: "avg_hens", header: "Avg hens", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.avg_hens) },
    { key: "production_rate", header: "Rate", align: "right", cell: (r) => formatPercent(r.production_rate) },
  ];
  const henDays = sum("hen_days");
  return (
    <DataTable
      columns={columns}
      rows={[...rows].reverse()}
      rowKey={(r) => r.period_start}
      footer={
        <TableRow className="font-semibold">
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular">{formatNumber(sum("total"))}</TableCell>
          {["small", "medium", "large", "xl", "dirty"].map((k) => (
            <TableCell key={k} className="hidden text-right tabular md:table-cell">{formatNumber(sum(k))}</TableCell>
          ))}
          <TableCell className="text-right tabular">{formatNumber(sum("broken") + sum("rejected"))}</TableCell>
          <TableCell className="text-right tabular">{formatNumber(sum("saleable"))}</TableCell>
          <TableCell className="hidden md:table-cell" />
          <TableCell className="text-right tabular">{henDays ? formatPercent((sum("saleable") / henDays) * 100) : "—"}</TableCell>
        </TableRow>
      }
    />
  );
}
