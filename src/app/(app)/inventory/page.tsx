import { Boxes, Egg, PackageMinus, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DateRangeFilter, FilterSelect, LinkTabs, Toolbar } from "@/components/shared/table-controls";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { VoidButton } from "@/components/shared/void-button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { can, requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/forms/entities";
import { loadOptions, sourcesOf } from "@/lib/data/options";
import { dateRange, isUuid, type PageSearchProps, paging, param, todayIn } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatDateTime, formatNumber, titleCase } from "@/lib/format";
import { splitEggs } from "@/lib/calc";
import type { Row, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Egg inventory" };

const TABS = [
  { value: "stock", label: "Stock on hand" },
  { value: "summary", label: "Movement summary" },
  { value: "ledger", label: "Stock ledger" },
  { value: "damages", label: "Damages" },
  { value: "adjustments", label: "Adjustments & transfers" },
  { value: "packaging", label: "Packaging" },
  { value: "grades", label: "Grades & units" },
];

const MOVE_LABELS: Record<string, string> = {
  opening: "Opening", production: "Production", purchase: "Purchase", sale: "Sale", sale_return: "Sales return",
  purchase_return: "Return to supplier", damage: "Damage", adjustment_in: "Adjustment +", adjustment_out: "Adjustment −",
  transfer_in: "Transfer in", transfer_out: "Transfer out", sale_cancel: "Sale cancelled", purchase_cancel: "Purchase cancelled",
  production_void: "Collection voided", damage_void: "Damage voided",
};

export default async function InventoryPage({ searchParams }: PageSearchProps) {
  const session = await requirePage("inventory");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "stock";
  const today = todayIn(session.settings.timezone);
  const options = await loadOptions(
    [...sourcesOf(ENTITIES.egg_damage.fields, ENTITIES.egg_transfer.fields, ENTITIES.packaging_movement.fields, ENTITIES.packaging_item.fields), "locations"],
  );
  const common = { options, today };
  const supabase = await createClient();
  const loc = isUuid(param(sp, "loc")) ? param(sp, "loc")! : null;

  const [{ data: stock }, { data: units }] = await Promise.all([
    (() => {
      let q = supabase.from("v_egg_stock").select("*").order("sort_order");
      if (loc) q = q.eq("farm_id", loc);
      return q;
    })(),
    supabase.from("packaging_types").select("*").order("sort_order"),
  ]);
  const tray = Number((units ?? []).find((u) => u.code === "tray")?.eggs_per_unit ?? 30);
  const carton = Number((units ?? []).find((u) => u.code === "carton")?.eggs_per_unit ?? 360);
  const rows = (stock ?? []) as Row[];
  const saleable = rows.filter((r) => r.is_saleable).reduce((a, r) => a + Number(r.quantity), 0);
  const all = rows.reduce((a, r) => a + Number(r.quantity), 0);
  const canCreate = can(session, "inventory", "create");
  const canEdit = can(session, "inventory", "edit");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Egg inventory"
        description="Stock is held in individual eggs per grade and location; trays and cartons are shown using your packaging conversions."
        actions={
          <>
            {canCreate ? <EntityDialog entity="egg_damage" {...common} variant="outline" label="Record damage" /> : null}
            {canCreate ? <EntityDialog entity="egg_transfer" {...common} variant="outline" label="Transfer" /> : null}
            {canEdit ? <EntityDialog entity="egg_adjustment" {...common} label="Adjust stock" /> : null}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Saleable stock" value={formatNumber(saleable)} sub={`${formatNumber(splitEggs(saleable, tray).units)} trays`} icon={Egg} tone="primary" />
        <StatCard label="In cartons" value={formatNumber(splitEggs(saleable, carton).units)} sub={`${formatNumber(splitEggs(saleable, carton).remainder)} eggs loose`} icon={Boxes} />
        <StatCard label="All grades" value={formatNumber(all)} icon={Warehouse} />
        <StatCard label="Grades below alert" value={formatNumber(new Set(rows.filter((r) => r.is_low && r.reorder_level > 0).map((r) => r.grade_id)).size)} icon={PackageMinus} tone="warning" />
      </div>
      <LinkTabs tabs={TABS} />
      {tab === "stock" && <StockTab rows={rows} tray={tray} options={options} />}
      {tab === "summary" && <SummaryTab sp={sp} today={today} options={options} />}
      {tab === "ledger" && <LedgerTab sp={sp} options={options} />}
      {tab === "damages" && <DamagesTab sp={sp} session={session} />}
      {tab === "adjustments" && <AdjustmentsTab />}
      {tab === "packaging" && <PackagingTab common={common} canCreate={canCreate} canEdit={canEdit} />}
      {tab === "grades" && <GradesTab units={units ?? []} common={common} canEdit={canEdit} session={session} />}
    </div>
  );
}

function StockTab({ rows, tray, options }: { rows: Row[]; tray: number; options: Awaited<ReturnType<typeof loadOptions>> }) {
  const columns: Column[] = [
    { key: "farm_name", header: "Location", cell: (r) => r.farm_name },
    { key: "grade_name", header: "Grade", cell: (r) => <span className="font-medium">{r.grade_name}</span> },
    { key: "quantity", header: "Eggs", align: "right", cell: (r) => <span className={cn("font-semibold", r.quantity < 0 && "text-destructive")}>{formatNumber(r.quantity)}</span> },
    { key: "trays", header: `Trays (${tray})`, align: "right", cell: (r) => formatNumber(splitEggs(r.quantity, tray).units) },
    { key: "loose", header: "Loose eggs", align: "right", cell: (r) => formatNumber(splitEggs(r.quantity, tray).remainder) },
    { key: "value", header: "Value @ default price", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(Number(r.quantity) * Number(r.default_price)) },
    { key: "status", header: "", cell: (r) => (!r.is_saleable ? <Badge variant="outline">Not saleable</Badge> : r.is_low && r.reorder_level > 0 ? <Badge className="bg-warning/20 text-foreground">Low</Badge> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <FilterSelect param="loc" placeholder="All locations" options={options.locations ?? []} />
      </Toolbar>
      <DataTable columns={columns} rows={rows.filter((r) => Number(r.quantity) !== 0)} rowKey={(r) => `${r.farm_id}${r.grade_id}`} />
    </div>
  );
}

async function SummaryTab({ sp, today, options }: { sp: Record<string, string | string[] | undefined>; today: string; options: Awaited<ReturnType<typeof loadOptions>> }) {
  const supabase = await createClient();
  const { from, to } = dateRange(sp, today, 30);
  const loc = isUuid(param(sp, "loc")) ? param(sp, "loc")! : null;
  const { data } = await supabase.rpc("egg_stock_summary", { p_from: from, p_to: to, p_farm: loc });
  const rows = (data ?? []) as Row[];
  const keys = ["opening", "production", "purchases", "sale_returns", "adjustments_in", "transfers_in", "sales", "damages", "returns_out", "adjustments_out", "transfers_out", "closing"];
  const columns: Column[] = [
    { key: "grade_name", header: "Grade", cell: (r) => <span className="font-medium">{r.grade_name}</span> },
    ...keys.map((k) => ({
      key: k,
      header: titleCase(k).replace("Adjustments", "Adj.").replace("Transfers", "Trf."),
      align: "right" as const,
      hideOnMobile: !["opening", "production", "sales", "closing"].includes(k),
      cell: (r: Row) => <span className={k === "closing" ? "font-semibold" : ["sales", "damages", "returns_out", "adjustments_out", "transfers_out"].includes(k) && Number(r[k]) ? "text-destructive/90" : ""}>{formatNumber(r[k])}</span>,
    })),
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <DateRangeFilter defaultFrom={from} defaultTo={to} />
        <FilterSelect param="loc" placeholder="All locations" options={options.locations ?? []} />
      </Toolbar>
      <p className="text-xs text-muted-foreground">Closing = Opening + Production + Purchases + Sales returns + Adj.+ + Transfers in − Sales − Damages − Returns out − Adj.− − Transfers out.</p>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.grade_id}
        footer={
          <TableRow className="font-semibold">
            <TableCell>Total</TableCell>
            {keys.map((k) => (
              <TableCell key={k} className={cn("text-right tabular", !["opening", "production", "sales", "closing"].includes(k) && "hidden md:table-cell")}>
                {formatNumber(rows.reduce((a, r) => a + Number(r[k]), 0))}
              </TableCell>
            ))}
          </TableRow>
        }
      />
    </div>
  );
}

async function LedgerTab({ sp, options }: { sp: Record<string, string | string[] | undefined>; options: Awaited<ReturnType<typeof loadOptions>> }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp, 50);
  let q = supabase.from("egg_stock_movements").select("*, farms(name), egg_grades(name)", { count: "exact" }).order("id", { ascending: false });
  const loc = param(sp, "loc");
  const grade = param(sp, "grade");
  const type = param(sp, "type");
  if (isUuid(loc)) q = q.eq("farm_id", loc);
  if (isUuid(grade)) q = q.eq("grade_id", grade);
  if (type && MOVE_LABELS[type]) q = q.eq("movement_type", type);
  const { data, count } = await q.range(from, to);
  const columns: Column[] = [
    { key: "movement_date", header: "Date", cell: (r) => formatDate(r.movement_date) },
    { key: "type", header: "Movement", cell: (r) => <StatusBadge status={r.quantity > 0 ? "in" : "out"} label={MOVE_LABELS[r.movement_type] ?? r.movement_type} /> },
    { key: "loc", header: "Location", cell: (r) => r.farms?.name },
    { key: "grade", header: "Grade", cell: (r) => r.egg_grades?.name },
    { key: "quantity", header: "Qty", align: "right", cell: (r) => <span className={r.quantity < 0 ? "text-destructive" : "text-primary"}>{r.quantity > 0 ? "+" : ""}{formatNumber(r.quantity)}</span> },
    { key: "balance_after", header: "Balance", align: "right", cell: (r) => formatNumber(r.balance_after) },
    { key: "notes", header: "Reference", hideOnMobile: true, cell: (r) => r.notes ?? "—" },
    { key: "created_at", header: "Posted", hideOnMobile: true, cell: (r) => <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span> },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <FilterSelect param="loc" placeholder="All locations" options={options.locations ?? []} />
        <FilterSelect param="grade" placeholder="All grades" options={options.grades ?? []} />
        <FilterSelect param="type" placeholder="All movements" options={Object.entries(MOVE_LABELS).map(([value, label]) => ({ value, label }))} />
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} dense />
    </div>
  );
}

async function DamagesTab({ sp, session }: { sp: Record<string, string | string[] | undefined>; session: Session }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  const { data, count } = await supabase
    .from("egg_damages")
    .select("*, farms(name), egg_grades(name)", { count: "exact" })
    .order("damage_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  const columns: Column[] = [
    { key: "damage_date", header: "Date", cell: (r) => formatDate(r.damage_date) },
    { key: "loc", header: "Location", cell: (r) => r.farms?.name },
    { key: "grade", header: "Grade", cell: (r) => r.egg_grades?.name },
    { key: "quantity", header: "Eggs", align: "right", cell: (r) => formatNumber(r.quantity) },
    { key: "source", header: "Cause", cell: (r) => titleCase(r.source) },
    { key: "reason", header: "Details", hideOnMobile: true, cell: (r) => r.reason ?? "—" },
    { key: "affects", header: "Stock", cell: (r) => (r.affects_stock ? "Deducted" : "Not in stock") },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "a", header: "", align: "right",
      cell: (r) => (can(session, "inventory", "delete") && r.status === "posted" && r.source !== "return" ? <VoidButton rpc="void_stock_record" args={{ p_kind: "egg_damage", p_id: r.id }} what="damage record" /> : null),
    },
  ];
  return <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />;
}

async function AdjustmentsTab() {
  const supabase = await createClient();
  const [{ data: adj }, { data: trf }] = await Promise.all([
    supabase.from("egg_stock_adjustments").select("*, farms(name), egg_grades(name)").order("created_at", { ascending: false }).limit(100),
    supabase.from("egg_stock_transfers").select("*, from:farms!egg_stock_transfers_from_farm_id_fkey(name), to:farms!egg_stock_transfers_to_farm_id_fkey(name), egg_grades(name)").order("created_at", { ascending: false }).limit(100),
  ]);
  const adjCols: Column[] = [
    { key: "adjustment_date", header: "Date", cell: (r) => formatDate(r.adjustment_date) },
    { key: "type", header: "Type", cell: (r) => <StatusBadge status={r.adjustment_type === "decrease" ? "out" : "in"} label={titleCase(r.adjustment_type)} /> },
    { key: "loc", header: "Location", cell: (r) => r.farms?.name },
    { key: "grade", header: "Grade", cell: (r) => r.egg_grades?.name },
    { key: "quantity", header: "Eggs", align: "right", cell: (r) => formatNumber(r.quantity) },
    { key: "reason", header: "Reason", cell: (r) => r.reason },
  ];
  const trfCols: Column[] = [
    { key: "transfer_date", header: "Date", cell: (r) => formatDate(r.transfer_date) },
    { key: "from", header: "From", cell: (r) => r.from?.name },
    { key: "to", header: "To", cell: (r) => r.to?.name },
    { key: "grade", header: "Grade", cell: (r) => r.egg_grades?.name },
    { key: "quantity", header: "Eggs", align: "right", cell: (r) => formatNumber(r.quantity) },
    { key: "notes", header: "Notes", cell: (r) => r.notes ?? "—" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Stock adjustments</h2>
        <DataTable columns={adjCols} rows={adj ?? []} />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Transfers between locations</h2>
        <DataTable columns={trfCols} rows={trf ?? []} />
      </div>
    </div>
  );
}

async function PackagingTab({ common, canCreate, canEdit }: { common: { options: Awaited<ReturnType<typeof loadOptions>>; today: string }; canCreate: boolean; canEdit: boolean }) {
  const supabase = await createClient();
  const [{ data: items }, { data: moves }] = await Promise.all([
    supabase.from("packaging_items").select("*").order("name"),
    supabase.from("packaging_movements").select("*, packaging_items(name), suppliers(name)").order("created_at", { ascending: false }).limit(100),
  ]);
  const itemCols: Column[] = [
    { key: "name", header: "Item", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "unit", header: "Unit" },
    { key: "current_stock", header: "In stock", align: "right", cell: (r) => <span className={cn("font-semibold", r.current_stock <= r.reorder_level && r.reorder_level > 0 && "text-destructive")}>{formatNumber(r.current_stock)}</span> },
    { key: "reorder_level", header: "Alert at", align: "right", cell: (r) => formatNumber(r.reorder_level) },
    { key: "unit_cost", header: "Unit cost", align: "right", cell: (r) => formatCurrency(r.unit_cost) },
    { key: "a", header: "", align: "right", cell: (r) => (canEdit ? <EntityDialog entity="packaging_item" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null) },
  ];
  const moveCols: Column[] = [
    { key: "movement_date", header: "Date", cell: (r) => formatDate(r.movement_date) },
    { key: "item", header: "Item", cell: (r) => r.packaging_items?.name },
    { key: "type", header: "Type", cell: (r) => titleCase(r.movement_type) },
    { key: "quantity", header: "Qty", align: "right", cell: (r) => formatNumber(r.quantity) },
    { key: "total_amount", header: "Amount", align: "right", cell: (r) => (r.movement_type === "purchase" ? formatCurrency(r.total_amount) : "—") },
    { key: "supplier", header: "Supplier", hideOnMobile: true, cell: (r) => r.suppliers?.name ?? "—" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Toolbar>
          <h2 className="font-semibold">Packaging materials</h2>
          <div className="flex gap-2 sm:ml-auto">
            {canCreate ? <EntityDialog entity="packaging_movement" {...common} size="sm" variant="outline" label="Stock movement" /> : null}
            {canCreate ? <EntityDialog entity="packaging_item" {...common} size="sm" /> : null}
          </div>
        </Toolbar>
        <DataTable columns={itemCols} rows={items ?? []} />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Recent movements</h2>
        <DataTable columns={moveCols} rows={moves ?? []} />
      </div>
    </div>
  );
}

async function GradesTab({ units, common, canEdit, session }: { units: Row[]; common: { options: Awaited<ReturnType<typeof loadOptions>>; today: string }; canEdit: boolean; session: Session }) {
  const supabase = await createClient();
  const { data: grades } = await supabase.from("egg_grades").select("*").order("sort_order");
  const gradeCols: Column[] = [
    { key: "code", header: "Code", cell: (r) => <span className="font-medium">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "egg_size", header: "Size", cell: (r) => titleCase(r.egg_size) },
    { key: "grade_class", header: "Class" },
    { key: "system_code", header: "Collection field", hideOnMobile: true, cell: (r) => r.system_code ?? "—" },
    { key: "default_price", header: "Price / egg", align: "right", cell: (r) => formatCurrency(r.default_price) },
    { key: "reorder_level", header: "Alert at", align: "right", cell: (r) => formatNumber(r.reorder_level) },
    { key: "is_active", header: "Status", cell: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canEdit ? <EntityDialog entity="egg_grade" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null) },
  ];
  const canUnits = can(session, "settings", "edit");
  const unitCols: Column[] = [
    { key: "code", header: "Code", cell: (r) => <span className="font-medium">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "eggs_per_unit", header: "Eggs per unit", align: "right", cell: (r) => formatNumber(r.eggs_per_unit) },
    { key: "is_active", header: "Status", cell: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canUnits && r.code !== "egg" ? <EntityDialog entity="packaging_type" {...common} id={r.code} initial={r} variant="ghost" size="icon-sm" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Toolbar>
          <h2 className="font-semibold">Egg grades</h2>
          <div className="sm:ml-auto">{canEdit ? <EntityDialog entity="egg_grade" {...common} size="sm" /> : null}</div>
        </Toolbar>
        <DataTable columns={gradeCols} rows={grades ?? []} />
      </div>
      <div className="flex flex-col gap-3">
        <Toolbar>
          <h2 className="font-semibold">Packaging conversions</h2>
          <div className="sm:ml-auto">{canUnits ? <EntityDialog entity="packaging_type" {...common} size="sm" /> : null}</div>
        </Toolbar>
        <DataTable columns={unitCols} rows={units} rowKey={(r) => r.code} />
      </div>
    </div>
  );
}

