import Link from "next/link";
import { Bird, HeartPulse, Skull, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterSelect, LinkTabs, SearchInput, Toolbar } from "@/components/shared/table-controls";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatCard } from "@/components/shared/stat-card";
import { DeleteButton, VoidButton } from "@/components/shared/void-button";
import { can, requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/forms/entities";
import { loadOptions, sourcesOf } from "@/lib/data/options";
import { type PageSearchProps, paging, param, searchFilter, todayIn, isUuid } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatNumber, titleCase } from "@/lib/format";
import type { Row, Session } from "@/lib/types";

export const metadata = { title: "Poultry management" };

const TABS = [
  { value: "batches", label: "Flocks / batches" },
  { value: "mortality", label: "Mortality" },
  { value: "purchases", label: "Chicken purchases" },
  { value: "sales", label: "Chicken sales" },
  { value: "transfers", label: "Transfers" },
  { value: "vaccinations", label: "Vaccinations" },
  { value: "farms", label: "Farms & sheds" },
  { value: "breeds", label: "Breeds" },
];

export default async function PoultryPage({ searchParams }: PageSearchProps) {
  const session = await requirePage("poultry");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "batches";
  const today = todayIn(session.settings.timezone);
  const supabase = await createClient();
  const options = await loadOptions(
    sourcesOf(ENTITIES.batch.fields, ENTITIES.mortality.fields, ENTITIES.chicken_purchase.fields, ENTITIES.chicken_sale.fields, ENTITIES.shed.fields, ENTITIES.vaccination.fields),
  );
  const canCreate = can(session, "poultry", "create");
  const canEdit = can(session, "poultry", "edit");
  const canVoid = can(session, "poultry", "delete");
  const common = { options, today };

  const { data: totals } = await supabase.from("v_chicken_batches").select("live_birds, mortality, status");
  const active = (totals ?? []).filter((b) => b.status === "active");
  const live = active.reduce((a, b) => a + Number(b.live_birds), 0);
  const deaths = (totals ?? []).reduce((a, b) => a + Number(b.mortality), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Poultry management"
        description="Farms, sheds, flocks and every bird movement. Live birds = opening + purchases + transfers in − mortality − sales − transfers out."
        actions={
          canCreate ? (
            <>
              <EntityDialog entity="mortality" {...common} variant="outline" label="Mortality" />
              <EntityDialog entity="batch" {...common} label="New batch" />
            </>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Live birds" value={formatNumber(live)} icon={Bird} tone="primary" />
        <StatCard label="Active batches" value={formatNumber(active.length)} icon={Warehouse} />
        <StatCard label="Total mortality (all batches)" value={formatNumber(deaths)} icon={Skull} tone="danger" />
        <StatCard label="Lifetime mortality rate" value={`${live + deaths > 0 ? ((deaths / (live + deaths)) * 100).toFixed(2) : "0.00"}%`} icon={HeartPulse} tone="warning" />
      </div>
      <LinkTabs tabs={TABS} />
      {tab === "batches" && <BatchesTab sp={sp} canEdit={canEdit} common={common} />}
      {tab === "mortality" && <MortalityTab sp={sp} canCreate={canCreate} canVoid={canVoid} common={common} />}
      {tab === "purchases" && <PurchasesTab sp={sp} canCreate={canCreate} canVoid={canVoid} common={common} session={session} />}
      {tab === "sales" && <SalesTab sp={sp} canCreate={canCreate} canVoid={canVoid} common={common} />}
      {tab === "transfers" && <TransfersTab sp={sp} canCreate={canCreate} canVoid={canVoid} common={common} />}
      {tab === "vaccinations" && <VaccinationsTab sp={sp} canCreate={canCreate} canEdit={canEdit} common={common} />}
      {tab === "farms" && <FarmsTab canCreate={canCreate} canEdit={canEdit} canDelete={canVoid} common={common} />}
      {tab === "breeds" && <BreedsTab canCreate={canCreate} canEdit={canEdit} canDelete={canVoid} common={common} />}
    </div>
  );
}

type Common = { options: Awaited<ReturnType<typeof loadOptions>>; today: string };

async function BatchesTab({ sp, canEdit, common }: { sp: Record<string, string | string[] | undefined>; canEdit: boolean; common: Common }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  let q = supabase.from("v_chicken_batches").select("*", { count: "exact" }).order("status").order("placement_date", { ascending: false });
  const f = searchFilter(["batch_code", "farm_name", "shed_name", "breed_name"], param(sp, "q"));
  if (f) q = q.or(f);
  const status = param(sp, "status");
  if (status) q = q.eq("status", status);
  const { data, count } = await q.range(from, to);
  const columns: Column[] = [
    { key: "batch_code", header: "Batch", cell: (r) => <Link className="font-medium text-primary hover:underline" href={`/poultry/batches/${r.id}`}>{r.batch_code}</Link> },
    { key: "loc", header: "Farm / shed", cell: (r) => `${r.farm_name} · ${r.shed_name}` },
    { key: "breed_name", header: "Breed", hideOnMobile: true, cell: (r) => r.breed_name ?? "—" },
    { key: "placement_date", header: "Placed", hideOnMobile: true, cell: (r) => formatDate(r.placement_date) },
    { key: "age", header: "Age", align: "right", cell: (r) => `${Math.floor(r.age_days / 7)}w ${r.age_days % 7}d` },
    { key: "opening_birds", header: "Opening", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.opening_birds) },
    { key: "in", header: "+ In", align: "right", hideOnMobile: true, cell: (r) => formatNumber(Number(r.purchased_birds) + Number(r.transferred_in)) },
    { key: "out", header: "− Out", align: "right", hideOnMobile: true, cell: (r) => formatNumber(Number(r.mortality) + Number(r.sold_birds) + Number(r.transferred_out)) },
    { key: "live_birds", header: "Live", align: "right", cell: (r) => <span className="font-semibold">{formatNumber(r.live_birds)}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canEdit ? <EntityDialog entity="batch" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <SearchInput placeholder="Search batch, farm, shed…" />
        <FilterSelect param="status" placeholder="All statuses" options={[{ value: "active", label: "Active" }, { value: "closed", label: "Closed" }]} />
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

function batchFilter(sp: Record<string, string | string[] | undefined>, col = "batch_id") {
  const b = param(sp, "batch");
  return isUuid(b) ? { col, value: b } : null;
}

async function MortalityTab({ sp, canCreate, canVoid, common }: { sp: Record<string, string | string[] | undefined>; canCreate: boolean; canVoid: boolean; common: Common }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  let q = supabase.from("mortality_records").select("*, chicken_batches(batch_code)", { count: "exact" }).order("record_date", { ascending: false }).order("created_at", { ascending: false });
  const bf = batchFilter(sp);
  if (bf) q = q.eq(bf.col, bf.value);
  const { data, count } = await q.range(from, to);
  const columns: Column[] = [
    { key: "record_date", header: "Date", cell: (r) => formatDate(r.record_date) },
    { key: "batch", header: "Batch", cell: (r) => r.chicken_batches?.batch_code },
    { key: "quantity", header: "Birds", align: "right", cell: (r) => formatNumber(r.quantity) },
    { key: "cause", header: "Cause", cell: (r) => r.cause ?? "—" },
    { key: "notes", header: "Notes", hideOnMobile: true, cell: (r) => r.notes ?? (r.void_reason ? `Void: ${r.void_reason}` : "—") },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canVoid && r.status === "posted" ? <VoidButton rpc="void_flock_event" args={{ p_kind: "mortality", p_id: r.id }} what="mortality record" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <FilterSelect param="batch" placeholder="All batches" options={common.options.batches ?? common.options.activeBatches ?? []} />
        <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="mortality" {...common} /> : null}</div>
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

async function PurchasesTab({ sp, canCreate, canVoid, common, session }: { sp: Record<string, string | string[] | undefined>; canCreate: boolean; canVoid: boolean; common: Common; session: Session }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  const { data, count } = await supabase
    .from("chicken_purchases")
    .select("*, chicken_batches(batch_code), suppliers(name)", { count: "exact" })
    .order("purchase_date", { ascending: false })
    .range(from, to);
  const columns: Column[] = [
    { key: "purchase_date", header: "Date", cell: (r) => formatDate(r.purchase_date) },
    { key: "batch", header: "Batch", cell: (r) => r.chicken_batches?.batch_code },
    { key: "supplier", header: "Supplier", cell: (r) => r.suppliers?.name },
    { key: "invoice_no", header: "Invoice", hideOnMobile: true, cell: (r) => r.invoice_no ?? "—" },
    { key: "quantity", header: "Birds", align: "right", cell: (r) => formatNumber(r.quantity) },
    { key: "rate", header: "Rate", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.rate) },
    { key: "total_amount", header: "Total", align: "right", cell: (r) => formatCurrency(r.total_amount) },
    { key: "due", header: "Balance", align: "right", cell: (r) => formatCurrency(Number(r.total_amount) - Number(r.paid_amount)) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canVoid && r.status === "posted" ? <VoidButton rpc="void_flock_event" args={{ p_kind: "purchase", p_id: r.id }} what="purchase" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <p className="text-sm text-muted-foreground">Supplier balances are settled from {can(session, "suppliers") ? <Link className="text-primary hover:underline" href="/suppliers">Suppliers</Link> : "Suppliers"}.</p>
        <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="chicken_purchase" {...common} /> : null}</div>
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

async function SalesTab({ sp, canCreate, canVoid, common }: { sp: Record<string, string | string[] | undefined>; canCreate: boolean; canVoid: boolean; common: Common }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  const { data, count } = await supabase
    .from("chicken_sales")
    .select("*, chicken_batches(batch_code), customers(name)", { count: "exact" })
    .order("sale_date", { ascending: false })
    .range(from, to);
  const columns: Column[] = [
    { key: "sale_no", header: "Sale #", cell: (r) => <span className="font-medium">{r.sale_no}</span> },
    { key: "sale_date", header: "Date", cell: (r) => formatDate(r.sale_date) },
    { key: "batch", header: "Batch", cell: (r) => r.chicken_batches?.batch_code },
    { key: "buyer", header: "Buyer", cell: (r) => r.customers?.name ?? r.buyer_name ?? "Walk-in" },
    { key: "quantity", header: "Birds", align: "right", cell: (r) => formatNumber(r.quantity) },
    { key: "total_amount", header: "Total", align: "right", cell: (r) => formatCurrency(r.total_amount) },
    { key: "due", header: "Balance", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(Number(r.total_amount) - Number(r.paid_amount)) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canVoid && r.status === "posted" ? <VoidButton rpc="void_flock_event" args={{ p_kind: "sale", p_id: r.id }} what="sale" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="chicken_sale" {...common} /> : null}</div>
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

async function TransfersTab({ sp, canCreate, canVoid, common }: { sp: Record<string, string | string[] | undefined>; canCreate: boolean; canVoid: boolean; common: Common }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  const { data, count } = await supabase
    .from("chicken_transfers")
    .select("*, from_batch:chicken_batches!chicken_transfers_from_batch_id_fkey(batch_code), to_batch:chicken_batches!chicken_transfers_to_batch_id_fkey(batch_code)", { count: "exact" })
    .order("transfer_date", { ascending: false })
    .range(from, to);
  const columns: Column[] = [
    { key: "transfer_date", header: "Date", cell: (r) => formatDate(r.transfer_date) },
    { key: "from", header: "From", cell: (r) => r.from_batch?.batch_code },
    { key: "to", header: "To", cell: (r) => r.to_batch?.batch_code },
    { key: "quantity", header: "Birds", align: "right", cell: (r) => formatNumber(r.quantity) },
    { key: "notes", header: "Notes", hideOnMobile: true, cell: (r) => r.notes ?? "—" },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canVoid && r.status === "posted" ? <VoidButton rpc="void_flock_event" args={{ p_kind: "transfer", p_id: r.id }} what="transfer" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="chicken_transfer" {...common} /> : null}</div>
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

async function VaccinationsTab({ sp, canCreate, canEdit, common }: { sp: Record<string, string | string[] | undefined>; canCreate: boolean; canEdit: boolean; common: Common }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  let q = supabase.from("vaccination_records").select("*, chicken_batches(batch_code)", { count: "exact" }).order("vaccination_date", { ascending: false });
  const bf = batchFilter(sp);
  if (bf) q = q.eq(bf.col, bf.value);
  const { data, count } = await q.range(from, to);
  const columns: Column[] = [
    { key: "vaccination_date", header: "Date", cell: (r) => formatDate(r.vaccination_date) },
    { key: "batch", header: "Batch", cell: (r) => r.chicken_batches?.batch_code },
    { key: "vaccine_name", header: "Vaccine", cell: (r) => <span className="font-medium">{r.vaccine_name}</span> },
    { key: "disease_target", header: "Disease", hideOnMobile: true, cell: (r) => r.disease_target ?? "—" },
    { key: "method", header: "Method", hideOnMobile: true, cell: (r) => titleCase(r.method) },
    { key: "birds_vaccinated", header: "Birds", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.birds_vaccinated) },
    { key: "next_due_date", header: "Next due", cell: (r) => formatDate(r.next_due_date) },
    { key: "a", header: "", align: "right", cell: (r) => (canEdit ? <EntityDialog entity="vaccination" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <FilterSelect param="batch" placeholder="All batches" options={common.options.batches ?? []} />
        <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="vaccination" {...common} /> : null}</div>
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

async function FarmsTab({ canCreate, canEdit, canDelete, common }: { canCreate: boolean; canEdit: boolean; canDelete: boolean; common: Common }) {
  const supabase = await createClient();
  const [{ data: farms }, { data: sheds }] = await Promise.all([
    supabase.from("farms").select("*").order("farm_type").order("name"),
    supabase.from("sheds").select("*, farms(name)").order("name"),
  ]);
  const farmCols: Column[] = [
    { key: "code", header: "Code", cell: (r) => <span className="font-medium">{r.code}</span> },
    { key: "name", header: "Name" },
    { key: "farm_type", header: "Type", cell: (r) => titleCase(r.farm_type) },
    { key: "location", header: "Location", hideOnMobile: true, cell: (r) => r.location ?? "—" },
    { key: "manager_name", header: "Manager", hideOnMobile: true, cell: (r) => r.manager_name ?? "—" },
    { key: "capacity", header: "Capacity", align: "right", hideOnMobile: true, cell: (r) => formatNumber(r.capacity) },
    { key: "is_active", header: "Status", cell: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} /> },
    { key: "a", header: "", align: "right", cell: (r) => <div className="flex justify-end">{canEdit ? <EntityDialog entity="farm" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null}{canDelete ? <DeleteButton entity="farm" id={r.id} what="farm" /> : null}</div> },
  ];
  const shedCols: Column[] = [
    { key: "farm", header: "Farm", cell: (r) => r.farms?.name },
    { key: "code", header: "Code" },
    { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: "shed_type", header: "Type", cell: (r) => titleCase(r.shed_type) },
    { key: "capacity", header: "Capacity", align: "right", cell: (r) => formatNumber(r.capacity) },
    { key: "is_active", header: "Status", cell: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} /> },
    { key: "a", header: "", align: "right", cell: (r) => <div className="flex justify-end">{canEdit ? <EntityDialog entity="shed" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null}{canDelete ? <DeleteButton entity="shed" id={r.id} what="shed" /> : null}</div> },
  ];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Toolbar>
          <h2 className="font-semibold">Farms &amp; stores</h2>
          <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="farm" {...common} size="sm" /> : null}</div>
        </Toolbar>
        <DataTable columns={farmCols} rows={farms ?? []} />
      </div>
      <div className="flex flex-col gap-3">
        <Toolbar>
          <h2 className="font-semibold">Sheds</h2>
          <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="shed" {...common} size="sm" /> : null}</div>
        </Toolbar>
        <DataTable columns={shedCols} rows={sheds ?? []} />
      </div>
    </div>
  );
}

async function BreedsTab({ canCreate, canEdit, canDelete, common }: { canCreate: boolean; canEdit: boolean; canDelete: boolean; common: Common }) {
  const supabase = await createClient();
  const { data } = await supabase.from("chicken_breeds").select("*").order("name");
  const columns: Column[] = [
    { key: "name", header: "Breed", cell: (r: Row) => <span className="font-medium">{r.name}</span> },
    { key: "bird_type", header: "Type", cell: (r) => titleCase(r.bird_type) },
    { key: "description", header: "Description", cell: (r) => r.description ?? "—" },
    { key: "is_active", header: "Status", cell: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} /> },
    { key: "a", header: "", align: "right", cell: (r) => <div className="flex justify-end">{canEdit ? <EntityDialog entity="breed" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null}{canDelete ? <DeleteButton entity="breed" id={r.id} what="breed" /> : null}</div> },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="breed" {...common} /> : null}</div>
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} />
    </div>
  );
}
