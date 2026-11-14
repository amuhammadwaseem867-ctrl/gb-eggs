import { Coins, PackageSearch, Wheat } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DateRangeFilter, FilterSelect, LinkTabs, Toolbar } from "@/components/shared/table-controls";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeleteButton, VoidButton } from "@/components/shared/void-button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { can, requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/forms/entities";
import { loadOptions, sourcesOf } from "@/lib/data/options";
import { dateRange, isUuid, type PageSearchProps, paging, param, todayIn } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { Row } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Feed management" };

export default async function FeedPage({ searchParams }: PageSearchProps) {
  const session = await requirePage("feed");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "stock";
  const today = todayIn(session.settings.timezone);
  const supabase = await createClient();
  const options = await loadOptions(sourcesOf(ENTITIES.feed_item.fields, ENTITIES.feed_purchase.fields, ENTITIES.feed_consumption.fields));
  const common = { options, today };
  const canCreate = can(session, "feed", "create");
  const canEdit = can(session, "feed", "edit");
  const canVoid = can(session, "feed", "delete");
  const { from, to } = dateRange(sp, today, 30);

  const { data: items } = await supabase.from("feed_inventory").select("*, feed_categories(name)").order("name");
  const stockValue = (items ?? []).reduce((a, r) => a + Number(r.current_stock) * Number(r.avg_unit_cost), 0);
  const low = (items ?? []).filter((r) => r.is_active && Number(r.reorder_level) > 0 && Number(r.current_stock) <= Number(r.reorder_level));
  const { data: cons30 } = await supabase.from("feed_consumption").select("quantity, total_cost").eq("status", "posted").gte("consumption_date", from).lte("consumption_date", to);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Feed management"
        description="Feed stock at weighted-average cost, purchases from suppliers and daily shed-wise consumption."
        actions={
          canCreate ? (
            <>
              <EntityDialog entity="feed_purchase" {...common} variant="outline" label="Feed purchase" />
              <EntityDialog entity="feed_consumption" {...common} label="Record consumption" />
            </>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Feed stock value" value={formatCurrency(stockValue)} icon={Coins} tone="primary" />
        <StatCard label="Items below alert" value={low.length} icon={PackageSearch} tone={low.length ? "warning" : "default"} sub={low.map((l) => l.name).join(", ") || "All good"} />
        <StatCard label="Consumed (period)" value={`${formatNumber((cons30 ?? []).reduce((a, r) => a + Number(r.quantity), 0))} kg`} icon={Wheat} tone="info" sub={`${formatDate(from)} – ${formatDate(to)}`} />
        <StatCard label="Consumption cost (period)" value={formatCurrency((cons30 ?? []).reduce((a, r) => a + Number(r.total_cost), 0))} icon={Coins} />
      </div>
      <LinkTabs tabs={[{ value: "stock", label: "Feed stock" }, { value: "consumption", label: "Consumption" }, { value: "purchases", label: "Purchases" }, { value: "categories", label: "Categories" }]} />
      {tab === "stock" ? (
        <div className="flex flex-col gap-3">
          <Toolbar>
            <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="feed_item" {...common} size="sm" /> : null}</div>
          </Toolbar>
          <DataTable
            columns={[
              { key: "name", header: "Feed", cell: (r) => <span className="font-medium">{r.name}</span> },
              { key: "cat", header: "Category", cell: (r) => r.feed_categories?.name ?? "—" },
              { key: "opening_stock", header: "Opening", align: "right", hideOnMobile: true, cell: (r) => `${formatNumber(r.opening_stock)} ${r.unit}` },
              { key: "current_stock", header: "Remaining", align: "right", cell: (r) => <span className={cn("font-semibold", Number(r.reorder_level) > 0 && Number(r.current_stock) <= Number(r.reorder_level) && "text-destructive")}>{formatNumber(r.current_stock)} {r.unit}</span> },
              { key: "avg_unit_cost", header: "Avg unit cost", align: "right", cell: (r) => formatCurrency(r.avg_unit_cost) },
              { key: "value", header: "Value", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(Number(r.current_stock) * Number(r.avg_unit_cost)) },
              { key: "reorder_level", header: "Alert at", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.reorder_level) },
              { key: "flag", header: "", cell: (r) => (!r.is_active ? <StatusBadge status="inactive" /> : Number(r.reorder_level) > 0 && Number(r.current_stock) <= Number(r.reorder_level) ? <Badge className="bg-warning/20 text-foreground">Low</Badge> : null) },
              { key: "a", header: "", align: "right", cell: (r) => (canEdit ? <EntityDialog entity="feed_item" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null) },
            ]}
            rows={items ?? []}
          />
        </div>
      ) : null}
      {tab === "consumption" ? <ConsumptionTab sp={sp} from={from} to={to} options={options} canVoid={canVoid} /> : null}
      {tab === "purchases" ? <PurchasesTab sp={sp} from={from} to={to} canVoid={canVoid} /> : null}
      {tab === "categories" ? <CategoriesTab common={common} canCreate={canCreate} canEdit={canEdit} canDelete={canVoid} /> : null}
    </div>
  );
}

async function ConsumptionTab({ sp, from, to, options, canVoid }: { sp: Record<string, string | string[] | undefined>; from: string; to: string; options: Awaited<ReturnType<typeof loadOptions>>; canVoid: boolean }) {
  const supabase = await createClient();
  const { page, pageSize, from: f, to: t } = paging(sp);
  let q = supabase.from("feed_consumption").select("*, farms(name), sheds(name), feed_inventory(name, unit), chicken_batches(batch_code)", { count: "exact" }).gte("consumption_date", from).lte("consumption_date", to).order("consumption_date", { ascending: false }).order("created_at", { ascending: false });
  const shed = param(sp, "shed");
  if (isUuid(shed)) q = q.eq("shed_id", shed);
  const { data, count } = await q.range(f, t);
  let sq = supabase.from("feed_consumption").select("shed_id, quantity, total_cost, sheds(name), farms(name)").eq("status", "posted").gte("consumption_date", from).lte("consumption_date", to);
  if (isUuid(shed)) sq = sq.eq("shed_id", shed);
  const { data: all } = await sq;
  const byShed = new Map<string, { id: string; name: string; qty: number; cost: number }>();
  for (const r of (all ?? []) as Row[]) {
    const e = byShed.get(r.shed_id) ?? { id: r.shed_id, name: `${r.farms?.name} · ${r.sheds?.name}`, qty: 0, cost: 0 };
    e.qty += Number(r.quantity);
    e.cost += Number(r.total_cost);
    byShed.set(r.shed_id, e);
  }
  const shedRows = [...byShed.values()];
  const columns: Column[] = [
    { key: "consumption_date", header: "Date", cell: (r) => formatDate(r.consumption_date) },
    { key: "shed", header: "Farm / shed", cell: (r) => `${r.farms?.name} · ${r.sheds?.name}` },
    { key: "batch", header: "Batch", hideOnMobile: true, cell: (r) => r.chicken_batches?.batch_code ?? "—" },
    { key: "feed", header: "Feed", cell: (r) => r.feed_inventory?.name },
    { key: "quantity", header: "Qty", align: "right", cell: (r) => `${formatNumber(r.quantity)} ${r.feed_inventory?.unit}` },
    { key: "total_cost", header: "Cost", align: "right", cell: (r) => formatCurrency(r.total_cost) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canVoid && r.status === "posted" ? <VoidButton rpc="void_stock_record" args={{ p_kind: "feed_consumption", p_id: r.id }} what="consumption record" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <DateRangeFilter defaultFrom={from} defaultTo={to} />
        <FilterSelect param="shed" placeholder="All sheds" options={options.sheds ?? []} />
      </Toolbar>
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Shed-wise consumption</h2>
        <DataTable
          columns={[
            { key: "name", header: "Farm / shed", cell: (r) => <span className="font-medium">{r.name}</span> },
            { key: "qty", header: "Quantity (kg)", align: "right", cell: (r) => formatNumber(r.qty) },
            { key: "cost", header: "Cost", align: "right", cell: (r) => formatCurrency(r.cost) },
          ]}
          rows={shedRows}
          footer={
            <TableRow className="font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular">{formatNumber(shedRows.reduce((a, r) => a + r.qty, 0))}</TableCell>
              <TableCell className="text-right tabular">{formatCurrency(shedRows.reduce((a, r) => a + r.cost, 0))}</TableCell>
            </TableRow>
          }
        />
      </div>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

async function PurchasesTab({ sp, from, to, canVoid }: { sp: Record<string, string | string[] | undefined>; from: string; to: string; canVoid: boolean }) {
  const supabase = await createClient();
  const { page, pageSize, from: f, to: t } = paging(sp);
  const { data, count } = await supabase.from("feed_purchases").select("*, suppliers(name), feed_inventory(name, unit)", { count: "exact" }).gte("purchase_date", from).lte("purchase_date", to).order("purchase_date", { ascending: false }).range(f, t);
  const columns: Column[] = [
    { key: "purchase_date", header: "Date", cell: (r) => formatDate(r.purchase_date) },
    { key: "invoice_no", header: "Invoice", cell: (r) => r.invoice_no ?? "—" },
    { key: "supplier", header: "Supplier", cell: (r) => r.suppliers?.name },
    { key: "feed", header: "Feed", cell: (r) => r.feed_inventory?.name },
    { key: "quantity", header: "Qty", align: "right", cell: (r) => `${formatNumber(r.quantity)} ${r.feed_inventory?.unit}` },
    { key: "unit_cost", header: "Unit cost", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.unit_cost) },
    { key: "total_amount", header: "Total", align: "right", cell: (r) => formatCurrency(r.total_amount) },
    { key: "bal", header: "Balance", align: "right", cell: (r) => formatCurrency(Number(r.total_amount) - Number(r.paid_amount)) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canVoid && r.status === "posted" ? <VoidButton rpc="void_stock_record" args={{ p_kind: "feed_purchase", p_id: r.id }} what="feed purchase" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <DateRangeFilter defaultFrom={from} defaultTo={to} />
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

async function CategoriesTab({ common, canCreate, canEdit, canDelete }: { common: { options: Awaited<ReturnType<typeof loadOptions>>; today: string }; canCreate: boolean; canEdit: boolean; canDelete: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("feed_categories").select("*").order("name");
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="feed_category" {...common} size="sm" /> : null}</div>
      </Toolbar>
      <DataTable
        columns={[
          { key: "name", header: "Category", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "description", header: "Description", cell: (r) => r.description ?? "—" },
          { key: "is_active", header: "Status", cell: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} /> },
          { key: "a", header: "", align: "right", cell: (r) => <div className="flex justify-end">{canEdit ? <EntityDialog entity="feed_category" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null}{canDelete ? <DeleteButton entity="feed_category" id={r.id} what="category" /> : null}</div> },
        ]}
        rows={data ?? []}
      />
    </div>
  );
}
