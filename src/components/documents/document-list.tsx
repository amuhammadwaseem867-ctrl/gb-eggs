import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DateRangeFilter, FilterSelect, SearchInput, Toolbar } from "@/components/shared/table-controls";
import { StatCard } from "@/components/shared/stat-card";
import { paymentStatus, StatusBadge } from "@/components/shared/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { can } from "@/lib/auth";
import { DOC, type DocKind } from "@/lib/data/documents";
import { loadOptions } from "@/lib/data/options";
import { dateRange, isUuid, paging, param, searchFilter, todayIn, type SearchParams } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import type { Row, Session } from "@/lib/types";
import { Banknote, FileText, HandCoins, Wallet } from "lucide-react";

/** Shared invoice list for sales and purchases. */
export async function DocumentList({ kind, session, sp }: { kind: DocKind; session: Session; sp: SearchParams }) {
  const d = DOC[kind];
  const isSale = kind === "sale";
  const supabase = await createClient();
  const today = todayIn(session.settings.timezone);
  const { from, to } = dateRange(sp, today, 30);
  const { page, pageSize, from: f, to: t } = paging(sp);
  const opts = await loadOptions([isSale ? "customers" : "suppliers"]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apply = (q: any) => {
    q = q.gte(d.date, from).lte(d.date, to);
    const party = param(sp, "party");
    if (isUuid(party)) q = q.eq(d.party, party);
    const status = param(sp, "status");
    if (status && ["draft", "confirmed", "cancelled"].includes(status)) q = q.eq("status", status);
    const s = searchFilter(isSale ? ["invoice_no", "walk_in_name"] : ["purchase_no", "supplier_invoice_no"], param(sp, "q"));
    if (s) q = q.or(s);
    return q;
  };

  const [{ data, count }, { data: totalsRows }] = await Promise.all([
    apply(supabase.from(d.table).select(`*, ${d.partyTable}(name, business_name), farms(name)`, { count: "exact" }))
      .order(d.date, { ascending: false })
      .order("created_at", { ascending: false })
      .range(f, t),
    supabase.rpc("document_totals", {
      p_kind: d.docType, p_from: from, p_to: to,
      p_party: isUuid(param(sp, "party")) ? param(sp, "party") : null,
      p_status: ["draft", "confirmed", "cancelled"].includes(param(sp, "status") ?? "") ? param(sp, "status") : null,
      p_search: param(sp, "q") ?? null,
    }),
  ]);
  const tot = (totalsRows ?? {}) as Row;
  const keyMap: Record<string, string> = { total_amount: "total", paid_amount: "paid", returned_amount: "returned", balance_due: "balance" };
  const sum = (k: string) => Number(tot[keyMap[k]] ?? 0);
  const party = (r: Row) => r[d.partyTable]?.name ?? r.walk_in_name ?? "Walk-in";

  const columns: Column[] = [
    { key: "no", header: isSale ? "Invoice" : "Purchase", cell: (r) => <Link href={`${d.base}/${r.id}`} className="font-medium text-primary hover:underline">{r[d.no]}</Link> },
    { key: "date", header: "Date", cell: (r) => formatDate(r[d.date]) },
    { key: "party", header: isSale ? "Customer" : "Supplier", cell: (r) => <span className="font-medium">{party(r)}</span> },
    { key: "loc", header: "Location", hideOnMobile: true, cell: (r) => r.farms?.name },
    ...(!isSale ? [{ key: "sinv", header: "Supplier inv.", hideOnMobile: true, cell: (r: Row) => r.supplier_invoice_no ?? "—" }] : []),
    { key: "total_amount", header: "Total", align: "right", cell: (r) => formatCurrency(r.total_amount) },
    { key: "paid_amount", header: "Paid", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.paid_amount) },
    { key: "balance_due", header: "Balance", align: "right", cell: (r) => <span className={Number(r.balance_due) > 0 && r.status === "confirmed" ? "font-semibold text-destructive" : ""}>{r.status === "confirmed" ? formatCurrency(r.balance_due) : "—"}</span> },
    {
      key: "status", header: "Status",
      cell: (r) => (r.status === "confirmed" ? <StatusBadge status={paymentStatus(Number(r.total_amount) - Number(r.returned_amount), Number(r.balance_due))} /> : <StatusBadge status={r.status} />),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isSale ? "Egg sales" : "Egg purchases"}
        description={isSale ? "Invoices for registered and walk-in customers. Confirmed invoices deduct stock; cancellations restore it." : "Eggs bought from external suppliers. Confirmed purchases add stock to the receiving location."}
        actions={
          can(session, d.module, "create") ? (
            <Button asChild>
              <Link href={`${d.base}/new`}>
                <Plus /> {isSale ? "New invoice" : "New purchase"}
              </Link>
            </Button>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={isSale ? "Invoiced" : "Purchased"} value={formatCurrency(sum("total_amount") - sum("returned_amount"))} sub={`${formatNumber(tot.confirmed ?? 0)} confirmed · net of returns`} icon={FileText} tone="primary" />
        <StatCard label={isSale ? "Collected on these" : "Paid on these"} value={formatCurrency(sum("paid_amount"))} icon={Banknote} tone="info" />
        <StatCard label="Outstanding" value={formatCurrency(sum("balance_due"))} icon={HandCoins} tone="warning" />
        <StatCard label="Returns" value={formatCurrency(sum("returned_amount"))} sub={`${formatNumber(tot.drafts ?? 0)} drafts`} icon={Wallet} />
      </div>
      <Toolbar>
        <SearchInput placeholder={isSale ? "Invoice # or walk-in name…" : "Purchase # or supplier invoice…"} />
        <DateRangeFilter defaultFrom={from} defaultTo={to} />
        <FilterSelect param="party" placeholder={isSale ? "All customers" : "All suppliers"} options={(isSale ? opts.customers : opts.suppliers) ?? []} />
        <FilterSelect param="status" placeholder="All statuses" options={[{ value: "draft", label: "Draft" }, { value: "confirmed", label: "Confirmed" }, { value: "cancelled", label: "Cancelled" }]} />
      </Toolbar>
      <DataTable
        columns={columns}
        rows={(data ?? []) as Row[]}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        footer={
          <TableRow className="font-semibold">
            <TableCell colSpan={isSale ? 4 : 5} className="hidden md:table-cell">Confirmed totals (all pages)</TableCell>
            <TableCell colSpan={3} className="md:hidden">Totals</TableCell>
            <TableCell className="text-right tabular">{formatCurrency(sum("total_amount"))}</TableCell>
            <TableCell className="hidden text-right tabular md:table-cell">{formatCurrency(sum("paid_amount"))}</TableCell>
            <TableCell className="text-right tabular">{formatCurrency(sum("balance_due"))}</TableCell>
            <TableCell />
          </TableRow>
        }
      />
    </div>
  );
}
