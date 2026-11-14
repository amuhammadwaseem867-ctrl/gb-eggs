import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bird, CalendarDays, Egg, Skull } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { requirePage } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/data/query";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import type { Row } from "@/lib/types";

export const metadata = { title: "Flock history" };

/** Complete, chronological history of one flock. */
export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("poultry");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: b } = await supabase.from("v_chicken_batches").select("*").eq("id", id).maybeSingle();
  if (!b) notFound();

  const [pur, mort, sales, tin, tout, vacc, meds, prod] = await Promise.all([
    supabase.from("chicken_purchases").select("purchase_date, quantity, status, suppliers(name)").eq("batch_id", id),
    supabase.from("mortality_records").select("record_date, quantity, cause, status").eq("batch_id", id),
    supabase.from("chicken_sales").select("sale_date, quantity, status, sale_no, customers(name), buyer_name").eq("batch_id", id),
    supabase.from("chicken_transfers").select("transfer_date, quantity, status, from:chicken_batches!chicken_transfers_from_batch_id_fkey(batch_code)").eq("to_batch_id", id),
    supabase.from("chicken_transfers").select("transfer_date, quantity, status, to:chicken_batches!chicken_transfers_to_batch_id_fkey(batch_code)").eq("from_batch_id", id),
    supabase.from("vaccination_records").select("vaccination_date, vaccine_name, dose, method, next_due_date").eq("batch_id", id),
    supabase.from("medicine_movements").select("movement_date, quantity, status, medicines(name, unit), notes").eq("chicken_batch_id", id).eq("movement_type", "usage"),
    supabase.from("egg_collections").select("collection_date, saleable_eggs, total_eggs, live_hens").eq("batch_id", id).eq("status", "posted").order("collection_date", { ascending: false }).limit(60),
  ]);

  type Ev = { date: string; type: string; detail: string; delta: number | null; status?: string };
  const events: Ev[] = [
    { date: b.placement_date, type: "Placement", detail: `Opening flock placed at ${b.age_at_placement_days} days old`, delta: b.opening_birds },
    ...(pur.data ?? []).map((r: Row) => ({ date: r.purchase_date, type: "Purchase", detail: `From ${r.suppliers?.name ?? "supplier"}`, delta: r.status === "posted" ? r.quantity : null, status: r.status })),
    ...(tin.data ?? []).map((r: Row) => ({ date: r.transfer_date, type: "Transfer in", detail: `From ${r.from?.batch_code}`, delta: r.status === "posted" ? r.quantity : null, status: r.status })),
    ...(mort.data ?? []).map((r: Row) => ({ date: r.record_date, type: "Mortality", detail: r.cause ?? "Unspecified", delta: r.status === "posted" ? -r.quantity : null, status: r.status })),
    ...(sales.data ?? []).map((r: Row) => ({ date: r.sale_date, type: "Sale", detail: `${r.sale_no} · ${r.customers?.name ?? r.buyer_name ?? "Walk-in"}`, delta: r.status === "posted" ? -r.quantity : null, status: r.status })),
    ...(tout.data ?? []).map((r: Row) => ({ date: r.transfer_date, type: "Transfer out", detail: `To ${r.to?.batch_code}`, delta: r.status === "posted" ? -r.quantity : null, status: r.status })),
    ...(vacc.data ?? []).map((r: Row) => ({ date: r.vaccination_date, type: "Vaccination", detail: `${r.vaccine_name}${r.dose ? ` · ${r.dose}` : ""}${r.next_due_date ? ` · next ${formatDate(r.next_due_date)}` : ""}`, delta: null })),
    ...(meds.data ?? []).map((r: Row) => ({ date: r.movement_date, type: "Medication", detail: `${r.medicines?.name} · ${formatNumber(r.quantity)} ${r.medicines?.unit}${r.notes ? ` · ${r.notes}` : ""}`, delta: null, status: r.status })),
  ].sort((a, c) => (a.date < c.date ? -1 : a.date > c.date ? 1 : 0));

  const totals = events.reduce<number[]>((acc, e) => [...acc, (acc.at(-1) ?? 0) + (e.delta ?? 0)], []);
  const rows = events.map((e, i) => ({ ...e, id: String(i), running: e.delta !== null ? totals[i] : null })).reverse();

  const p = prod.data ?? [];
  const rate = p.length ? (p.reduce((a, r) => a + r.saleable_eggs, 0) / Math.max(p.reduce((a, r) => a + r.live_hens, 0), 1)) * 100 : null;

  const columns: Column[] = [
    { key: "date", header: "Date", cell: (r) => formatDate(r.date) },
    { key: "type", header: "Event", cell: (r) => <span className="font-medium">{r.type}</span> },
    { key: "detail", header: "Details" },
    { key: "delta", header: "Birds", align: "right", cell: (r) => (r.delta === null ? (r.status === "void" ? <StatusBadge status="void" /> : "—") : <span className={r.delta < 0 ? "text-destructive" : "text-primary"}>{r.delta > 0 ? "+" : ""}{formatNumber(r.delta)}</span>) },
    { key: "running", header: "Flock size", align: "right", cell: (r) => (r.running === null ? "" : formatNumber(r.running)) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/poultry"><ArrowLeft /> Poultry</Link>
      </Button>
      <PageHeader
        title={`Batch ${b.batch_code}`}
        description={`${b.farm_name} · ${b.shed_name} · ${b.breed_name ?? "Breed not set"} · ${b.bird_type}`}
        actions={<StatusBadge status={b.status} />}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Live birds" value={formatNumber(b.live_birds)} icon={Bird} tone="primary" sub={`Opening ${formatNumber(b.opening_birds)}`} />
        <StatCard label="Age" value={`${Math.floor(b.age_days / 7)} weeks`} icon={CalendarDays} sub={`${b.age_days} days · placed ${formatDate(b.placement_date)}`} />
        <StatCard label="Mortality" value={formatNumber(b.mortality)} icon={Skull} tone="danger" sub={formatPercent((Number(b.mortality) / Math.max(Number(b.opening_birds) + Number(b.purchased_birds) + Number(b.transferred_in), 1)) * 100, 2)} />
        <StatCard label="Production rate (60 days)" value={rate === null ? "—" : formatPercent(rate)} icon={Egg} tone="info" sub={`${p.length} collection records`} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Live bird reconciliation</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4 lg:grid-cols-7">
          {[
            ["Opening", b.opening_birds, ""],
            ["+ Purchases", b.purchased_birds, "text-primary"],
            ["+ Transfers in", b.transferred_in, "text-primary"],
            ["− Mortality", b.mortality, "text-destructive"],
            ["− Sales", b.sold_birds, "text-destructive"],
            ["− Transfers out", b.transferred_out, "text-destructive"],
            ["= Live birds", b.live_birds, "font-semibold"],
          ].map(([k, v, c]) => (
            <div key={k as string}>
              <p className="text-xs text-muted-foreground">{k}</p>
              <p className={`tabular text-lg ${c}`}>{formatNumber(v as number)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Flock history</h2>
        <DataTable columns={columns} rows={rows} dense />
      </div>
    </div>
  );
}
