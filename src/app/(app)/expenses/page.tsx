import { CalendarRange, Layers, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { DateRangeFilter, FilterSelect, LinkTabs, SearchInput, Toolbar } from "@/components/shared/table-controls";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeleteButton, VoidButton } from "@/components/shared/void-button";
import { TableCell, TableRow } from "@/components/ui/table";
import { can, requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/forms/entities";
import { loadOptions, sourcesOf } from "@/lib/data/options";
import { dateRange, isUuid, type PageSearchProps, paging, param, searchFilter, todayIn } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import type { Row } from "@/lib/types";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: PageSearchProps) {
  const session = await requirePage("expenses");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "expenses";
  const today = todayIn(session.settings.timezone);
  const { from, to } = dateRange(sp, today, 30);
  const supabase = await createClient();
  const options = await loadOptions(sourcesOf(ENTITIES.expense.fields));
  const common = { options, today };
  const { page, pageSize, from: f, to: t } = paging(sp);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filters = (q: any) => {
    q = q.gte("expense_date", from).lte("expense_date", to);
    const cat = param(sp, "cat");
    if (isUuid(cat)) q = q.eq("category_id", cat);
    const s = searchFilter(["expense_no", "description", "payee", "reference"], param(sp, "q"));
    if (s) q = q.or(s);
    return q;
  };
  const [{ data, count }, { data: all }, { data: cats }] = await Promise.all([
    filters(supabase.from("expenses").select("*, expense_categories(name), cash_accounts(name), farms(name)", { count: "exact" })).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).range(f, t),
    supabase.rpc("document_totals", { p_kind: "expense", p_from: from, p_to: to, p_party: isUuid(param(sp, "cat")) ? param(sp, "cat") : null, p_search: param(sp, "q") ?? null }),
    supabase.from("expense_categories").select("*").order("name"),
  ]);
  const agg = (all ?? {}) as Row;
  const total = Number(agg.total ?? 0);
  const byCat = new Map<string, number>(((agg.by_category ?? []) as Row[]).map((r) => [r.category, Number(r.amount)]));
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);

  const columns: Column[] = [
    { key: "expense_no", header: "Voucher", cell: (r) => <span className="font-medium">{r.expense_no}</span> },
    { key: "expense_date", header: "Date", cell: (r) => formatDate(r.expense_date) },
    { key: "cat", header: "Category", cell: (r) => r.expense_categories?.name },
    { key: "description", header: "Description", hideOnMobile: true, cell: (r) => [r.description, r.payee ? `to ${r.payee}` : null].filter(Boolean).join(" ") || "—" },
    { key: "reference", header: "Reference", hideOnMobile: true, cell: (r) => r.reference ?? "—" },
    { key: "method", header: "Paid via", hideOnMobile: true, cell: (r) => `${titleCase(r.payment_method)} · ${r.cash_accounts?.name}` },
    { key: "amount", header: "Amount", align: "right", cell: (r) => <span className="font-semibold">{formatCurrency(r.amount)}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (can(session, "expenses", "delete") && r.status === "posted" ? <VoidButton rpc="void_cash_record" args={{ p_kind: "expense", p_id: r.id }} what="expense" /> : null) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expenses"
        description="Operating expenses paid from cash or bank. Feed, medicine, chicken and egg purchases are recorded in their own modules and appear in the P&L automatically; use Payroll for salaries."
        actions={can(session, "expenses", "create") ? <EntityDialog entity="expense" {...common} label="Record expense" /> : null}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total expenses" value={formatCurrency(total)} sub={`${formatDate(from)} – ${formatDate(to)}`} icon={Wallet} tone="danger" />
        <StatCard label="Daily average" value={formatCurrency(total / days)} icon={CalendarRange} />
        <StatCard label="Largest category" value={top ? top[0] : "—"} sub={top ? formatCurrency(top[1]) : undefined} icon={Layers} tone="warning" />
      </div>
      <LinkTabs tabs={[{ value: "expenses", label: "Expenses" }, { value: "categories", label: "Categories" }]} />
      {tab === "expenses" ? (
        <>
          <Toolbar>
            <SearchInput placeholder="Voucher, description, payee…" />
            <DateRangeFilter defaultFrom={from} defaultTo={to} />
            <FilterSelect param="cat" placeholder="All categories" options={options.expenseCategories ?? []} />
          </Toolbar>
          <DataTable
            columns={columns}
            rows={data ?? []}
            total={count ?? 0}
            page={page}
            pageSize={pageSize}
            footer={
              <TableRow className="font-semibold">
                <TableCell colSpan={3} className="md:hidden">Total (all pages)</TableCell>
                <TableCell colSpan={6} className="hidden md:table-cell">Total posted (all pages)</TableCell>
                <TableCell className="text-right tabular">{formatCurrency(total)}</TableCell>
                <TableCell colSpan={2} />
              </TableRow>
            }
          />
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <Toolbar>
            <div className="sm:ml-auto">{can(session, "expenses", "create") ? <EntityDialog entity="expense_category" {...common} size="sm" /> : null}</div>
          </Toolbar>
          <DataTable
            columns={[
              { key: "name", header: "Category", cell: (r) => <span className="font-medium">{r.name}</span> },
              { key: "description", header: "Description", cell: (r) => r.description ?? "—" },
              { key: "spent", header: "Spent (period)", align: "right", cell: (r) => formatCurrency(byCat.get(r.name) ?? 0) },
              { key: "is_active", header: "Status", cell: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} /> },
              { key: "a", header: "", align: "right", cell: (r) => <div className="flex justify-end">{can(session, "expenses", "edit") ? <EntityDialog entity="expense_category" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null}{can(session, "expenses", "delete") ? <DeleteButton entity="expense_category" id={r.id} what="category" /> : null}</div> },
            ]}
            rows={cats ?? []}
          />
        </div>
      )}
    </div>
  );
}
