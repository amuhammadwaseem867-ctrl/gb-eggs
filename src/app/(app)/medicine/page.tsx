import { AlertTriangle, CalendarClock, Pill, Syringe } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterSelect, LinkTabs, Toolbar } from "@/components/shared/table-controls";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeleteButton, VoidButton } from "@/components/shared/void-button";
import { Badge } from "@/components/ui/badge";
import { can, requirePage } from "@/lib/auth";
import { ENTITIES, MEDICINE_CATEGORIES } from "@/lib/forms/entities";
import { loadOptions, sourcesOf } from "@/lib/data/options";
import { addDays, isUuid, type PageSearchProps, paging, param, todayIn } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatNumber, titleCase } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Medicine management" };

export default async function MedicinePage({ searchParams }: PageSearchProps) {
  const session = await requirePage("medicine");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "stock";
  const today = todayIn(session.settings.timezone);
  const soon = addDays(today, session.settings.medicine_expiry_days);
  const supabase = await createClient();
  const options = await loadOptions(sourcesOf(ENTITIES.medicine_purchase.fields, ENTITIES.medicine_usage.fields));
  const common = { options, today };
  const canCreate = can(session, "medicine", "create");
  const canEdit = can(session, "medicine", "edit");
  const canVoid = can(session, "medicine", "delete");

  const [{ data: meds }, { data: batches }] = await Promise.all([
    (() => {
      let q = supabase.from("medicines").select("*").order("name");
      const cat = param(sp, "cat");
      if (cat) q = q.eq("category", cat);
      return q;
    })(),
    supabase.from("medicine_batches").select("*, medicines(name, unit), suppliers(name)").order("expiry_date", { ascending: true, nullsFirst: false }),
  ]);
  const inStock = (batches ?? []).filter((b) => Number(b.quantity_on_hand) > 0);
  const expired = inStock.filter((b) => b.expiry_date && b.expiry_date < today);
  const expiring = inStock.filter((b) => b.expiry_date && b.expiry_date >= today && b.expiry_date <= soon);
  const low = (meds ?? []).filter((m) => m.is_active && Number(m.reorder_level) > 0 && Number(m.current_stock) <= Number(m.reorder_level));
  const value = inStock.reduce((a, b) => a + Number(b.quantity_on_hand) * Number(b.unit_cost), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Medicine management"
        description="Vaccines and medicines stocked by batch with expiry dates. Usage is issued first-expiry-first-out and recorded against flocks as medication history."
        actions={
          canCreate ? (
            <>
              <EntityDialog entity="medicine_usage" {...common} variant="outline" label="Record usage" />
              <EntityDialog entity="medicine_purchase" {...common} label="Medicine purchase" />
            </>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Stock value" value={formatCurrency(value)} icon={Pill} tone="primary" />
        <StatCard label="Low stock" value={low.length} icon={AlertTriangle} tone={low.length ? "warning" : "default"} sub={low.map((m) => m.name).join(", ") || "All good"} />
        <StatCard label={`Expiring in ${session.settings.medicine_expiry_days} days`} value={expiring.length} icon={CalendarClock} tone={expiring.length ? "warning" : "default"} />
        <StatCard label="Expired with stock" value={expired.length} icon={Syringe} tone={expired.length ? "danger" : "default"} sub={expired.length ? "Dispose and record as expired" : undefined} />
      </div>
      <LinkTabs tabs={[{ value: "stock", label: "Medicines" }, { value: "batches", label: "Batches & expiry" }, { value: "movements", label: "Purchases & usage" }]} />
      {tab === "stock" ? (
        <div className="flex flex-col gap-3">
          <Toolbar>
            <FilterSelect param="cat" placeholder="All categories" options={MEDICINE_CATEGORIES} />
            <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="medicine" {...common} size="sm" /> : null}</div>
          </Toolbar>
          <DataTable
            columns={[
              { key: "name", header: "Medicine", cell: (r) => <span className="font-medium">{r.name}</span> },
              { key: "category", header: "Category", cell: (r) => titleCase(r.category) },
              { key: "manufacturer", header: "Manufacturer", hideOnMobile: true, cell: (r) => r.manufacturer ?? "—" },
              { key: "current_stock", header: "In stock", align: "right", cell: (r) => <span className={cn("font-semibold", Number(r.reorder_level) > 0 && Number(r.current_stock) <= Number(r.reorder_level) && "text-destructive")}>{formatNumber(r.current_stock)} {r.unit}</span> },
              { key: "reorder_level", header: "Alert at", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.reorder_level) },
              { key: "flag", header: "", cell: (r) => (!r.is_active ? <StatusBadge status="inactive" /> : Number(r.reorder_level) > 0 && Number(r.current_stock) <= Number(r.reorder_level) ? <Badge className="bg-warning/20 text-foreground">Low</Badge> : null) },
              { key: "a", header: "", align: "right", cell: (r) => <div className="flex justify-end">{canEdit ? <EntityDialog entity="medicine" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null}{canVoid ? <DeleteButton entity="medicine" id={r.id} what="medicine" /> : null}</div> },
            ]}
            rows={meds ?? []}
          />
        </div>
      ) : null}
      {tab === "batches" ? (
        <DataTable
          columns={[
            { key: "med", header: "Medicine", cell: (r) => <span className="font-medium">{r.medicines?.name}</span> },
            { key: "batch_no", header: "Batch #" },
            { key: "expiry_date", header: "Expiry", cell: (r) => <span className={cn(r.expiry_date && r.expiry_date < today ? "font-medium text-destructive" : r.expiry_date && r.expiry_date <= soon ? "font-medium text-[oklch(0.55_0.13_70)]" : "")}>{formatDate(r.expiry_date)}</span> },
            { key: "quantity_on_hand", header: "On hand", align: "right", cell: (r) => `${formatNumber(r.quantity_on_hand)} ${r.medicines?.unit}` },
            { key: "unit_cost", header: "Unit price", align: "right", cell: (r) => formatCurrency(r.unit_cost) },
            { key: "supplier", header: "Supplier", hideOnMobile: true, cell: (r) => r.suppliers?.name ?? "—" },
            { key: "flag", header: "", cell: (r) => (Number(r.quantity_on_hand) <= 0 ? <Badge variant="outline">Used up</Badge> : r.expiry_date && r.expiry_date < today ? <StatusBadge status="cancelled" label="Expired" /> : r.expiry_date && r.expiry_date <= soon ? <Badge className="bg-warning/20 text-foreground">Expiring</Badge> : null) },
          ]}
          rows={batches ?? []}
        />
      ) : null}
      {tab === "movements" ? <MovementsTab sp={sp} options={options} canVoid={canVoid} /> : null}
    </div>
  );
}

async function MovementsTab({ sp, options, canVoid }: { sp: Record<string, string | string[] | undefined>; options: Awaited<ReturnType<typeof loadOptions>>; canVoid: boolean }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  let q = supabase.from("medicine_movements").select("*, medicines(name, unit), suppliers(name), chicken_batches(batch_code)", { count: "exact" }).order("movement_date", { ascending: false }).order("created_at", { ascending: false });
  const med = param(sp, "med");
  if (isUuid(med)) q = q.eq("medicine_id", med);
  const type = param(sp, "type");
  if (type) q = q.eq("movement_type", type);
  const { data, count } = await q.range(from, to);
  const columns: Column[] = [
    { key: "movement_date", header: "Date", cell: (r) => formatDate(r.movement_date) },
    { key: "type", header: "Type", cell: (r) => <StatusBadge status={["purchase", "opening", "adjustment_in"].includes(r.movement_type) ? "in" : "out"} label={titleCase(r.movement_type)} /> },
    { key: "med", header: "Medicine", cell: (r) => <span className="font-medium">{r.medicines?.name}</span> },
    { key: "batch_no", header: "Batch", hideOnMobile: true },
    { key: "quantity", header: "Qty", align: "right", cell: (r) => `${formatNumber(r.quantity)} ${r.medicines?.unit}` },
    { key: "to", header: "Supplier / flock", cell: (r) => r.suppliers?.name ?? r.chicken_batches?.batch_code ?? "—" },
    { key: "total_amount", header: "Amount", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.total_amount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canVoid && r.status === "posted" ? <VoidButton rpc="void_stock_record" args={{ p_kind: "medicine_movement", p_id: r.id }} what="medicine record" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <FilterSelect param="med" placeholder="All medicines" options={options.medicines ?? []} />
        <FilterSelect param="type" placeholder="All types" options={[{ value: "purchase", label: "Purchases" }, { value: "usage", label: "Usage (medication)" }, { value: "expired", label: "Expired" }, { value: "adjustment_in", label: "Adjustment in" }, { value: "adjustment_out", label: "Adjustment out" }]} />
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}
