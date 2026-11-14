import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, HandCoins, Landmark, Scale } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DateRangeFilter, FilterSelect, LinkTabs, Toolbar } from "@/components/shared/table-controls";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { VoidButton } from "@/components/shared/void-button";
import { ProfitAndLoss } from "@/components/accounting/pnl";
import { ExportButtons } from "@/components/reports/export-buttons";
import { TableCell, TableRow } from "@/components/ui/table";
import { can, requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/forms/entities";
import { loadOptions, sourcesOf } from "@/lib/data/options";
import { dateRange, isUuid, type PageSearchProps, paging, param, startOfMonth, todayIn } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import type { Row, Session } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Accounting" };

const TABS = [
  { value: "overview", label: "Profit & loss" },
  { value: "cashbook", label: "Cashbook" },
  { value: "accounts", label: "Cash & bank" },
  { value: "receivables", label: "Receivables & payables" },
  { value: "payments", label: "Payments" },
  { value: "income", label: "Other income" },
  { value: "transfers", label: "Transfers" },
];

export default async function AccountingPage({ searchParams }: PageSearchProps) {
  const session = await requirePage("accounting");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "overview";
  const today = todayIn(session.settings.timezone);
  const range = sp.from || sp.to ? dateRange(sp, today) : { from: startOfMonth(today), to: today };
  const supabase = await createClient();
  const options = await loadOptions(sourcesOf(ENTITIES.other_income.fields, ENTITIES.fund_transfer.fields, ENTITIES.cash_account.fields));
  const common = { options, today };
  const canCreate = can(session, "accounting", "create");

  const [{ data: accounts }, { data: summary, error }] = await Promise.all([
    supabase.from("v_cash_account_balances").select("*").order("name"),
    supabase.rpc("financial_summary", { p_from: range.from, p_to: range.to }),
  ]);
  const s = summary as Row | null;
  const cashTotal = (accounts ?? []).filter((a) => a.is_active).reduce((a, r) => a + Number(r.balance), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounting"
        description="Cashbook, bank accounts, receivables, payables and profit & loss. Every cash movement is an immutable ledger entry; voids post reversals."
        actions={
          canCreate ? (
            <>
              <EntityDialog entity="fund_transfer" {...common} variant="outline" label="Transfer" />
              <EntityDialog entity="other_income" {...common} label="Record income" />
            </>
          ) : null
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Cash & bank balance" value={formatCurrency(cashTotal)} icon={Landmark} tone="primary" sub={`${(accounts ?? []).filter((a) => a.is_active).length} active accounts`} />
        <StatCard label="Revenue (period)" value={formatCurrency(s?.revenue?.total)} icon={ArrowDownLeft} tone="info" sub={`${formatDate(range.from)} – ${formatDate(range.to)}`} />
        <StatCard label="Costs (period)" value={formatCurrency(s?.costs?.total)} icon={ArrowUpRight} tone="danger" />
        <StatCard label="Net profit (period)" value={<span className={cn(Number(s?.net_profit) < 0 && "text-destructive")}>{formatCurrency(s?.net_profit)}</span>} icon={Scale} tone={Number(s?.net_profit) < 0 ? "danger" : "primary"} />
      </div>
      <LinkTabs tabs={TABS} />
      {["overview", "cashbook", "payments", "income", "transfers"].includes(tab) ? (
        <Toolbar>
          <DateRangeFilter defaultFrom={range.from} defaultTo={range.to} />
          {tab === "cashbook" ? <FilterSelect param="account" placeholder="All accounts" options={options.cashAccounts ?? []} /> : null}
        </Toolbar>
      ) : null}
      {tab === "overview" ? (error ? <p className="text-sm text-destructive">{error.message}</p> : s ? <ProfitAndLoss s={s} /> : null) : null}
      {tab === "cashbook" ? <CashbookTab sp={sp} range={range} accounts={accounts ?? []} /> : null}
      {tab === "accounts" ? <AccountsTab accounts={accounts ?? []} common={common} session={session} /> : null}
      {tab === "receivables" ? <ReceivablesTab /> : null}
      {tab === "payments" ? <PaymentsTab sp={sp} range={range} session={session} /> : null}
      {tab === "income" ? <IncomeTab range={range} session={session} /> : null}
      {tab === "transfers" ? <TransfersTab range={range} /> : null}
    </div>
  );
}

async function CashbookTab({ sp, range, accounts }: { sp: Record<string, string | string[] | undefined>; range: { from: string; to: string }; accounts: Row[] }) {
  const supabase = await createClient();
  const account = isUuid(param(sp, "account")) ? param(sp, "account")! : null;
  // Opening balance = everything before the period.
  let q = supabase.from("financial_transactions").select("*, cash_accounts(name)").gte("txn_date", range.from).lte("txn_date", range.to).order("txn_date").order("created_at").limit(1000);
  if (account) q = q.eq("cash_account_id", account);
  const [{ data: openingRaw }, { data }] = await Promise.all([supabase.rpc("cashbook_opening", { p_account: account, p_before: range.from }), q]);
  const opening = Number(openingRaw ?? 0);
  const rows = (data ?? []).reduce<Row[]>((acc, r) => {
    const prev = acc.length ? Number(acc[acc.length - 1].running) : opening;
    acc.push({ ...r, running: prev + (r.direction === "in" ? 1 : -1) * Number(r.amount) });
    return acc;
  }, []);
  const run = rows.length ? Number(rows[rows.length - 1].running) : opening;
  const inflow = rows.filter((r) => r.direction === "in").reduce((a, r) => a + Number(r.amount), 0);
  const outflow = rows.filter((r) => r.direction === "out").reduce((a, r) => a + Number(r.amount), 0);
  const accName = account ? accounts.find((a) => a.id === account)?.name : "All accounts";
  const columns: Column[] = [
    { key: "txn_date", header: "Date", cell: (r) => formatDate(r.txn_date) },
    { key: "desc", header: "Description", cell: (r) => <span>{r.description ?? titleCase(r.category)}{r.reversal_of ? <span className="ml-1 text-xs text-destructive">(reversal)</span> : null}</span> },
    { key: "category", header: "Category", hideOnMobile: true, cell: (r) => titleCase(r.category) },
    { key: "acc", header: "Account", hideOnMobile: true, cell: (r) => r.cash_accounts?.name },
    { key: "in", header: "In", align: "right", cell: (r) => (r.direction === "in" ? <span className="text-primary">{formatCurrency(r.amount)}</span> : "") },
    { key: "out", header: "Out", align: "right", cell: (r) => (r.direction === "out" ? <span className="text-destructive">{formatCurrency(r.amount)}</span> : "") },
    { key: "running", header: "Balance", align: "right", cell: (r) => <span className="font-medium">{formatCurrency(r.running)}</span> },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {rows.length >= 1000 ? <span className="mr-2 font-medium text-destructive">Showing the first 1,000 entries — narrow the date range for a complete cashbook.</span> : null}
          {accName} · Opening <span className="tabular font-medium text-foreground">{formatCurrency(opening)}</span> · Closing <span className="tabular font-medium text-foreground">{formatCurrency(run)}</span>
        </p>
        <ExportButtons
          title={`Cashbook — ${accName}`}
          subtitle={`${range.from} to ${range.to}`}
          columns={[{ key: "date", header: "Date" }, { key: "description", header: "Description" }, { key: "category", header: "Category" }, { key: "account", header: "Account" }, { key: "in", header: "In", type: "money" }, { key: "out", header: "Out", type: "money" }, { key: "balance", header: "Balance", type: "money" }]}
          rows={[
            { date: range.from, description: "Opening balance", category: "", account: "", in: null, out: null, balance: opening },
            ...rows.map((r) => ({ date: r.txn_date, description: r.description ?? "", category: titleCase(r.category), account: r.cash_accounts?.name ?? "", in: r.direction === "in" ? Number(r.amount) : null, out: r.direction === "out" ? Number(r.amount) : null, balance: r.running })),
          ]}
          totals={{ date: "Totals", in: inflow, out: outflow, balance: run }}
        />
      </div>
      <DataTable
        columns={columns}
        rows={[...rows].reverse()}
        dense
        footer={
          <TableRow className="font-semibold">
            <TableCell colSpan={2} className="md:hidden">Totals</TableCell>
            <TableCell colSpan={4} className="hidden md:table-cell">Totals for period</TableCell>
            <TableCell className="text-right tabular">{formatCurrency(inflow)}</TableCell>
            <TableCell className="text-right tabular">{formatCurrency(outflow)}</TableCell>
            <TableCell className="text-right tabular">{formatCurrency(run)}</TableCell>
          </TableRow>
        }
      />
    </div>
  );
}

function AccountsTab({ accounts, common, session }: { accounts: Row[]; common: { options: Awaited<ReturnType<typeof loadOptions>>; today: string }; session: Session }) {
  const columns: Column[] = [
    { key: "name", header: "Account", cell: (r) => <Link className="font-medium text-primary hover:underline" href={`/accounting?tab=cashbook&account=${r.id}`}>{r.name}</Link> },
    { key: "account_type", header: "Type", cell: (r) => titleCase(r.account_type) },
    { key: "bank", header: "Bank / number", hideOnMobile: true, cell: (r) => [r.bank_name, r.account_number].filter(Boolean).join(" · ") || "—" },
    { key: "total_in", header: "Total in", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.total_in) },
    { key: "total_out", header: "Total out", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.total_out) },
    { key: "balance", header: "Balance", align: "right", cell: (r) => <span className={cn("font-semibold", Number(r.balance) < 0 && "text-destructive")}>{formatCurrency(r.balance)}</span> },
    { key: "is_active", header: "Status", cell: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} /> },
    { key: "a", header: "", align: "right", cell: (r) => (can(session, "accounting", "edit") ? <EntityDialog entity="cash_account" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <div className="sm:ml-auto">{can(session, "accounting", "create") ? <EntityDialog entity="cash_account" {...common} size="sm" /> : null}</div>
      </Toolbar>
      <DataTable columns={columns} rows={accounts} />
    </div>
  );
}

async function ReceivablesTab() {
  const supabase = await createClient();
  const [{ data: cust }, { data: sup }] = await Promise.all([
    supabase.from("v_customer_balances").select("id, name, business_name, balance, last_sale_date").neq("balance", 0).order("balance", { ascending: false }).limit(100),
    supabase.from("v_supplier_balances").select("id, name, supplier_type, balance, last_purchase_date").neq("balance", 0).order("balance", { ascending: false }).limit(100),
  ]);
  const totalR = (cust ?? []).reduce((a, r) => a + Number(r.balance), 0);
  const totalP = (sup ?? []).reduce((a, r) => a + Number(r.balance), 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><HandCoins className="size-4 text-primary" /> Customer receivables · {formatCurrency(totalR)}</h2>
        <DataTable
          columns={[
            { key: "name", header: "Customer", cell: (r) => <Link href={`/customers/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link> },
            { key: "last", header: "Last sale", hideOnMobile: true, cell: (r) => formatDate(r.last_sale_date) },
            { key: "balance", header: "Balance", align: "right", cell: (r) => <span className="font-semibold">{formatCurrency(r.balance)}</span> },
          ]}
          rows={cust ?? []}
          dense
        />
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-semibold"><HandCoins className="size-4 text-destructive" /> Supplier payables · {formatCurrency(totalP)}</h2>
        <DataTable
          columns={[
            { key: "name", header: "Supplier", cell: (r) => <Link href={`/suppliers/${r.id}`} className="font-medium text-primary hover:underline">{r.name}</Link> },
            { key: "type", header: "Type", hideOnMobile: true, cell: (r) => titleCase(r.supplier_type) },
            { key: "balance", header: "Balance", align: "right", cell: (r) => <span className="font-semibold">{formatCurrency(r.balance)}</span> },
          ]}
          rows={sup ?? []}
          dense
        />
      </div>
    </div>
  );
}

async function PaymentsTab({ sp, range, session }: { sp: Record<string, string | string[] | undefined>; range: { from: string; to: string }; session: Session }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  const { data, count } = await supabase
    .from("payments")
    .select("*, customers(name), suppliers(name), cash_accounts(name)", { count: "exact" })
    .gte("payment_date", range.from)
    .lte("payment_date", range.to)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);
  const columns: Column[] = [
    { key: "payment_no", header: "Voucher", cell: (r) => <span className="font-medium">{r.payment_no}</span> },
    { key: "payment_date", header: "Date", cell: (r) => formatDate(r.payment_date) },
    { key: "party", header: "Party", cell: (r) => r.customers?.name ?? r.suppliers?.name ?? "Walk-in" },
    { key: "dir", header: "Type", cell: (r) => <StatusBadge status={r.direction} label={r.party_type === "customer" ? (r.direction === "in" ? "Receipt" : "Refund") : r.direction === "out" ? "Payment" : "Refund"} /> },
    { key: "doc", header: "Against", hideOnMobile: true, cell: (r) => (r.doc_type ? titleCase(r.doc_type) : "On account") },
    { key: "acc", header: "Account", hideOnMobile: true, cell: (r) => `${r.cash_accounts?.name} · ${titleCase(r.method)}` },
    { key: "amount", header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (can(session, "accounting", "delete") && r.status === "posted" ? <VoidButton rpc="void_payment" args={{ p_id: r.id }} what="payment" /> : null) },
  ];
  return <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />;
}

async function IncomeTab({ range, session }: { range: { from: string; to: string }; session: Session }) {
  const supabase = await createClient();
  const { data } = await supabase.from("other_incomes").select("*, cash_accounts(name)").gte("income_date", range.from).lte("income_date", range.to).order("income_date", { ascending: false });
  const columns: Column[] = [
    { key: "income_no", header: "Voucher", cell: (r) => <span className="font-medium">{r.income_no}</span> },
    { key: "income_date", header: "Date", cell: (r) => formatDate(r.income_date) },
    { key: "category", header: "Category", cell: (r) => titleCase(r.category) },
    { key: "received_from", header: "From", hideOnMobile: true, cell: (r) => r.received_from ?? "—" },
    { key: "description", header: "Description", hideOnMobile: true, cell: (r) => r.description ?? "—" },
    { key: "acc", header: "Account", hideOnMobile: true, cell: (r) => r.cash_accounts?.name },
    { key: "amount", header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (can(session, "accounting", "delete") && r.status === "posted" ? <VoidButton rpc="void_cash_record" args={{ p_kind: "income", p_id: r.id }} what="income" /> : null) },
  ];
  return <DataTable columns={columns} rows={data ?? []} />;
}

async function TransfersTab({ range }: { range: { from: string; to: string } }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fund_transfers")
    .select("*, from:cash_accounts!fund_transfers_from_account_id_fkey(name), to:cash_accounts!fund_transfers_to_account_id_fkey(name)")
    .gte("transfer_date", range.from)
    .lte("transfer_date", range.to)
    .order("transfer_date", { ascending: false });
  return (
    <DataTable
      columns={[
        { key: "transfer_date", header: "Date", cell: (r) => formatDate(r.transfer_date) },
        { key: "from", header: "From", cell: (r) => r.from?.name },
        { key: "to", header: "To", cell: (r) => r.to?.name },
        { key: "amount", header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount) },
        { key: "notes", header: "Notes", cell: (r) => r.notes ?? "—" },
      ]}
      rows={data ?? []}
    />
  );
}
