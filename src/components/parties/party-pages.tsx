import Link from "next/link";
import { ArrowLeft, HandCoins, Receipt, Users, Wallet } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DateRangeFilter, FilterSelect, LinkTabs, SearchInput, Toolbar } from "@/components/shared/table-controls";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { DeleteButton, VoidButton } from "@/components/shared/void-button";
import { LedgerExport } from "@/components/reports/export-buttons";
import { can } from "@/lib/auth";
import { ENTITIES, SUPPLIER_TYPES } from "@/lib/forms/entities";
import { loadOptions, sourcesOf } from "@/lib/data/options";
import { isDate, paging, param, searchFilter, todayIn, type SearchParams } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import type { Row, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

type PartyType = "customer" | "supplier";
const P = {
  customer: { view: "v_customer_balances", module: "customers" as const, base: "/customers", entity: "customer", payEntity: "customer_payment", fk: "customer_id", title: "Customers", one: "Customer", docs: "total_sales", docsLabel: "Total purchases", balLabel: "Receivable" },
  supplier: { view: "v_supplier_balances", module: "suppliers" as const, base: "/suppliers", entity: "supplier", payEntity: "supplier_payment", fk: "supplier_id", title: "Suppliers", one: "Supplier", docs: "total_purchases", docsLabel: "Total purchased", balLabel: "Payable" },
};

export async function PartyList({ type, session, sp }: { type: PartyType; session: Session; sp: SearchParams }) {
  const p = P[type];
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  const today = todayIn(session.settings.timezone);
  const options = await loadOptions(sourcesOf(ENTITIES[p.payEntity as "customer_payment"].fields));
  let q = supabase.from(p.view).select("*", { count: "exact" });
  const f = searchFilter(["name", "business_name", "phone", "code", "city"], param(sp, "q"));
  if (f) q = q.or(f);
  const st = param(sp, "type");
  if (type === "supplier" && st) q = q.eq("supplier_type", st);
  const show = param(sp, "show");
  if (show === "due") q = q.gt("balance", 0);
  if (show === "inactive") q = q.eq("is_active", false);
  else q = q.eq("is_active", true);
  const sort = param(sp, "sort") === "balance" ? "balance" : "name";
  const { data, count } = await q.order(sort, { ascending: sort === "name" }).range(from, to);
  const { data: agg } = await supabase.rpc("party_totals", { p_type: type });
  const totals = (agg ?? {}) as Row;
  const totalBal = Number(totals.due ?? 0);
  const advances = -Number(totals.advances ?? 0);

  const columns: Column[] = [
    { key: "name", header: p.one, cell: (r) => <Link href={`${p.base}/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link> },
    { key: "business_name", header: "Business", cell: (r) => r.business_name ?? "—" },
    ...(type === "supplier" ? [{ key: "supplier_type", header: "Type", cell: (r: Row) => titleCase(r.supplier_type) }] : []),
    { key: "phone", header: "Phone", hideOnMobile: true, cell: (r) => r.phone ?? "—" },
    { key: "city", header: "City", hideOnMobile: true, cell: (r) => r.city ?? "—" },
    { key: "docs", header: p.docsLabel, align: "right", hideOnMobile: true, cell: (r) => formatCurrency(Number(r[p.docs]) - Number(r.total_returns)) },
    { key: "total_paid", header: type === "customer" ? "Received" : "Paid", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.total_paid) },
    { key: "balance", header: p.balLabel, align: "right", cell: (r) => <span className={cn("font-semibold", Number(r.balance) > 0 ? "text-destructive" : Number(r.balance) < 0 ? "text-primary" : "")}>{formatCurrency(r.balance)}</span> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={p.title}
        description={type === "customer" ? "Customer accounts with opening balances, sales, receipts and outstanding receivables." : "Egg, chicken, feed, medicine and packaging suppliers with purchases, payments and payables."}
        actions={
          <>
            {can(session, p.module, "create") || can(session, "accounting", "create") ? <EntityDialog entity={p.payEntity} options={options} today={today} variant="outline" label={type === "customer" ? "Receive payment" : "Pay supplier"} /> : null}
            {can(session, p.module, "create") ? <EntityDialog entity={p.entity} options={options} today={today} /> : null}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={`Total ${p.balLabel.toLowerCase()}`} value={formatCurrency(totalBal)} icon={HandCoins} tone="warning" />
        <StatCard label={type === "customer" ? "Advances held (credit)" : "Advances paid (debit)"} value={formatCurrency(-advances)} icon={Wallet} />
        <StatCard label={`Active ${p.title.toLowerCase()}`} value={Number(totals.active ?? 0)} icon={Users} />
      </div>
      <Toolbar>
        <SearchInput placeholder="Name, business, phone, city…" />
        {type === "supplier" ? <FilterSelect param="type" placeholder="All types" options={SUPPLIER_TYPES} /> : null}
        <FilterSelect param="show" placeholder="Active" options={[{ value: "due", label: "With balance due" }, { value: "inactive", label: "Inactive" }]} />
        <FilterSelect param="sort" placeholder="Sort by name" options={[{ value: "balance", label: "Sort by balance" }]} />
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

export async function PartyDetail({ type, id, session, sp }: { type: PartyType; id: string; session: Session; sp: SearchParams }) {
  const p = P[type];
  const supabase = await createClient();
  const today = todayIn(session.settings.timezone);
  const { data: party } = await supabase.from(p.view).select("*").eq("id", id).maybeSingle();
  if (!party) return null;
  const tab = param(sp, "tab") ?? "ledger";
  const from = isDate(param(sp, "from")) ? param(sp, "from")! : null;
  const to = isDate(param(sp, "to")) ? param(sp, "to")! : null;
  const options = await loadOptions(sourcesOf(ENTITIES[p.payEntity as "customer_payment"].fields, ENTITIES[p.entity as "customer"].fields));

  const [{ data: ledger, error: ledgerErr }, { data: docs }, { data: payments }] = await Promise.all([
    supabase.rpc("party_ledger", { p_party_type: type, p_party_id: id, p_from: from, p_to: to }),
    supabase.from("v_party_documents").select("*").eq(p.fk, id).order("doc_date", { ascending: false }).limit(200),
    supabase.from("payments").select("*, cash_accounts(name)").eq(p.fk, id).order("payment_date", { ascending: false }).order("created_at", { ascending: false }).limit(200),
  ]);
  const ledgerRows: Row[] = ((ledger ?? []) as Row[]).map((r, i) => ({ ...r, id: String(i) }));
  const debit = ledgerRows.reduce((a, r) => a + Number(r.debit ?? 0), 0);
  const credit = ledgerRows.reduce((a, r) => a + Number(r.credit ?? 0), 0);

  const docHref = (r: Row) =>
    r.doc_type === "egg_sale" ? `/sales/${r.doc_id}` : r.doc_type === "egg_purchase" ? `/purchases/${r.doc_id}` : null;

  const ledgerCols: Column[] = [
    { key: "entry_date", header: "Date", cell: (r) => formatDate(r.entry_date) },
    { key: "entry_type", header: "Type", cell: (r) => titleCase(r.entry_type) },
    { key: "reference", header: "Reference", cell: (r) => r.reference ?? "—" },
    { key: "description", header: "Description", hideOnMobile: true },
    { key: "debit", header: type === "customer" ? "Debit (owed)" : "Credit (owed)", align: "right", cell: (r) => (r.debit ? formatCurrency(r.debit) : "") },
    { key: "credit", header: type === "customer" ? "Credit (paid)" : "Debit (paid)", align: "right", cell: (r) => (r.credit ? formatCurrency(r.credit) : "") },
    { key: "balance", header: "Balance", align: "right", cell: (r) => <span className="font-medium">{formatCurrency(r.balance)}</span> },
  ];
  const docCols: Column[] = [
    { key: "doc_no", header: "Document", cell: (r) => { const h = docHref(r); return h ? <Link href={h} className="font-medium text-primary hover:underline">{r.doc_no}</Link> : <span className="font-medium">{r.doc_no}</span>; } },
    { key: "doc_type", header: "Type", cell: (r) => titleCase(r.doc_type) },
    { key: "doc_date", header: "Date", cell: (r) => formatDate(r.doc_date) },
    { key: "amount", header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount) },
    { key: "returned_amount", header: "Returns", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.returned_amount) },
    { key: "paid_amount", header: "Paid", align: "right", cell: (r) => formatCurrency(r.paid_amount) },
    { key: "balance_due", header: "Balance", align: "right", cell: (r) => <span className={Number(r.balance_due) > 0 ? "font-semibold text-destructive" : ""}>{formatCurrency(r.balance_due)}</span> },
    {
      key: "pay", header: "", align: "right",
      cell: (r) =>
        Number(r.balance_due) > 0 && (can(session, "accounting", "create") || can(session, p.module, "create")) ? (
          <EntityDialog entity={p.payEntity} options={options} today={today} size="xs" variant="outline" label="Pay" icon="none"
            fixed={{ [p.fk]: id, doc_type: r.doc_type, doc_id: r.doc_id, direction: type === "customer" ? "in" : "out" }} initial={{ amount: r.balance_due }} />
        ) : null,
    },
  ];
  const payCols: Column[] = [
    { key: "payment_no", header: "Voucher", cell: (r) => <span className="font-medium">{r.payment_no}</span> },
    { key: "payment_date", header: "Date", cell: (r) => formatDate(r.payment_date) },
    { key: "direction", header: "Type", cell: (r) => (type === "customer" ? (r.direction === "in" ? "Receipt" : "Refund") : r.direction === "out" ? "Payment" : "Refund") },
    { key: "doc", header: "Against", cell: (r) => (r.doc_type ? titleCase(r.doc_type) : "On account") },
    { key: "method", header: "Method", hideOnMobile: true, cell: (r) => titleCase(r.method) },
    { key: "acc", header: "Account", hideOnMobile: true, cell: (r) => r.cash_accounts?.name },
    { key: "amount", header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (can(session, "accounting", "delete") && r.status === "posted" ? <VoidButton rpc="void_payment" args={{ p_id: r.id }} what="payment" /> : null) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={p.base}><ArrowLeft /> {p.title}</Link>
      </Button>
      <PageHeader
        eyebrow={p.one}
        title={party.name}
        description={[party.business_name, party.phone, party.city, type === "supplier" ? titleCase(party.supplier_type) : null].filter(Boolean).join(" · ")}
        actions={
          <>
            {can(session, p.module, "edit") ? <EntityDialog entity={p.entity} options={options} today={today} id={id} initial={party} variant="outline" label="Edit" /> : null}
            {can(session, p.module, "delete") ? <DeleteButton entity={p.entity} id={id} what={p.one.toLowerCase()} /> : null}
            {can(session, "accounting", "create") || can(session, p.module, "create") ? (
              <EntityDialog entity={p.payEntity} options={options} today={today} fixed={{ [p.fk]: id }} label={type === "customer" ? "Receive payment" : "Make payment"} />
            ) : null}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Opening balance" value={formatCurrency(party.opening_balance)} icon={Receipt} />
        <StatCard label={p.docsLabel} value={formatCurrency(Number(party[p.docs]) - Number(party.total_returns))} sub={`Returns ${formatCurrency(party.total_returns)}`} icon={Receipt} tone="info" />
        <StatCard label={type === "customer" ? "Total received" : "Total paid"} value={formatCurrency(party.total_paid)} icon={Wallet} tone="primary" />
        <StatCard label={`Outstanding ${p.balLabel.toLowerCase()}`} value={formatCurrency(party.balance)} icon={HandCoins} tone={Number(party.balance) > 0 ? "danger" : "primary"} sub={party.credit_limit ? `Credit limit ${formatCurrency(party.credit_limit)}` : undefined} />
      </div>
      <LinkTabs tabs={[{ value: "ledger", label: "Ledger" }, { value: "documents", label: "Invoices & bills", count: (docs ?? []).length }, { value: "payments", label: "Payments", count: (payments ?? []).length }, { value: "profile", label: "Profile" }]} />
      {tab === "ledger" ? (
        <div className="flex flex-col gap-3">
          <Toolbar>
            <DateRangeFilter />
            <div className="sm:ml-auto">
              <LedgerExport title={`${p.one} ledger — ${party.name}`} rows={ledgerRows.map((r) => ({ date: r.entry_date, type: titleCase(r.entry_type), reference: r.reference ?? "", description: r.description ?? "", debit: Number(r.debit ?? 0), credit: Number(r.credit ?? 0), balance: Number(r.balance) }))} />
            </div>
          </Toolbar>
          {ledgerErr ? <p className="text-sm text-destructive">{ledgerErr.message}</p> : null}
          <DataTable
            columns={ledgerCols}
            rows={ledgerRows}
            dense
            footer={
              <TableRow className="font-semibold">
                <TableCell colSpan={3} className="md:hidden">Totals</TableCell>
                <TableCell colSpan={4} className="hidden md:table-cell">Totals for period</TableCell>
                <TableCell className="text-right tabular">{formatCurrency(debit)}</TableCell>
                <TableCell className="text-right tabular">{formatCurrency(credit)}</TableCell>
                <TableCell className="text-right tabular">{formatCurrency(ledgerRows.at(-1)?.balance ?? party.balance)}</TableCell>
              </TableRow>
            }
          />
        </div>
      ) : null}
      {tab === "documents" ? <DataTable columns={docCols} rows={(docs ?? []).map((r) => ({ ...r, id: r.doc_id }))} /> : null}
      {tab === "payments" ? <DataTable columns={payCols} rows={payments ?? []} /> : null}
      {tab === "profile" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {[["Code", party.code], ["Business name", party.business_name], ["Phone", party.phone], ["Email", party.email], ["City", party.city], ["Address", party.address], ["Credit limit", type === "customer" ? formatCurrency(party.credit_limit) : null], ["Status", party.is_active ? "Active" : "Inactive"], ["Notes", party.notes]]
              .filter(([, v]) => v !== null && v !== undefined)
              .map(([k, v]) => (
                <div key={k as string}>
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="font-medium">{(v as string) || "—"}</p>
                </div>
              ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
