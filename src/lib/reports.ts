import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExportColumn } from "@/components/reports/export-buttons";
import type { ModuleCode, Row } from "@/lib/types";
import { titleCase } from "@/lib/format";

export type ReportFilter = "range" | "farm" | "shed" | "customer" | "supplier" | "grade" | "category" | "account" | "batch";

export interface ReportResult {
  columns: ExportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, string | number | null>;
  note?: string;
}

export interface ReportParams {
  from: string;
  to: string;
  farm?: string | null;
  shed?: string | null;
  customer?: string | null;
  supplier?: string | null;
  grade?: string | null;
  category?: string | null;
  account?: string | null;
  batch?: string | null;
}

export interface ReportDef {
  key: string;
  title: string;
  description: string;
  module: ModuleCode;
  filters: ReportFilter[];
  requires?: ReportFilter;
  run: (db: SupabaseClient, p: ReportParams) => Promise<ReportResult>;
}

/** Fetches every row of a query by paging past the API row limit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(build: () => any, cap = 50000): Promise<Row[]> {
  const out: Row[] = [];
  for (let start = 0; start < cap; start += 1000) {
    const { data, error } = await build().range(start, start + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const sum = (rows: Row[], k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const REPORTS: ReportDef[] = [
  {
    key: "daily_collection", title: "Daily egg collection", module: "production", filters: ["range", "farm", "shed"],
    description: "Every shed collection with morning/evening counts, size grading, losses and production rate.",
    run: async (db, p) => {
      const rows = await fetchAll(() => {
        let q = db.from("egg_collections").select("*, farms(name), sheds(name)").eq("status", "posted").gte("collection_date", p.from).lte("collection_date", p.to).order("collection_date").order("created_at");
        if (p.farm) q = q.eq("farm_id", p.farm);
        if (p.shed) q = q.eq("shed_id", p.shed);
        return q;
      });
      const out = rows.map((r) => ({
        date: r.collection_date, farm: r.farms?.name, shed: r.sheds?.name, morning: r.morning_eggs, evening: r.evening_eggs, total: r.total_eggs,
        small: r.small_eggs, medium: r.medium_eggs, large: r.large_eggs, xl: r.xl_eggs, dirty: r.dirty_eggs, broken: r.broken_eggs, rejected: r.rejected_eggs,
        saleable: r.saleable_eggs, hens: r.live_hens, rate: r.live_hens ? Math.round((r.saleable_eggs / r.live_hens) * 10000) / 100 : null,
      }));
      const tot = (k: string) => out.reduce((a, r) => a + Number((r as Row)[k] ?? 0), 0);
      return {
        columns: [
          { key: "date", header: "Date" }, { key: "farm", header: "Farm" }, { key: "shed", header: "Shed" },
          { key: "morning", header: "Morning", type: "number" }, { key: "evening", header: "Evening", type: "number" }, { key: "total", header: "Total", type: "number" },
          { key: "small", header: "Small", type: "number" }, { key: "medium", header: "Medium", type: "number" }, { key: "large", header: "Large", type: "number" },
          { key: "xl", header: "XL", type: "number" }, { key: "dirty", header: "Dirty", type: "number" }, { key: "broken", header: "Broken", type: "number" },
          { key: "rejected", header: "Rejected", type: "number" }, { key: "saleable", header: "Saleable", type: "number" }, { key: "hens", header: "Hens", type: "number" },
          { key: "rate", header: "Rate %", type: "number" },
        ],
        rows: out,
        totals: { date: "Total", ...Object.fromEntries(["morning", "evening", "total", "small", "medium", "large", "xl", "dirty", "broken", "rejected", "saleable"].map((k) => [k, tot(k)])), rate: tot("hens") ? Math.round((tot("saleable") / tot("hens")) * 10000) / 100 : null },
      };
    },
  },
  {
    key: "monthly_production", title: "Monthly egg production", module: "production", filters: ["range", "farm", "shed"],
    description: "Production totals and hen-day production rate per month.",
    run: async (db, p) => {
      const { data, error } = await db.rpc("production_report", { p_from: p.from, p_to: p.to, p_period: "month", p_farm: p.farm ?? null, p_shed: p.shed ?? null });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Row[];
      return {
        columns: [
          { key: "month", header: "Month" }, { key: "total", header: "Collected", type: "number" }, { key: "small", header: "Small", type: "number" },
          { key: "medium", header: "Medium", type: "number" }, { key: "large", header: "Large", type: "number" }, { key: "xl", header: "XL", type: "number" },
          { key: "dirty", header: "Dirty", type: "number" }, { key: "losses", header: "Broken + rejected", type: "number" }, { key: "saleable", header: "Saleable", type: "number" },
          { key: "avg_hens", header: "Avg hens", type: "number" }, { key: "rate", header: "Rate %", type: "number" },
        ],
        rows: rows.map((r) => ({ month: r.period_start.slice(0, 7), total: n(r.total), small: n(r.small), medium: n(r.medium), large: n(r.large), xl: n(r.xl), dirty: n(r.dirty), losses: Number(r.broken) + Number(r.rejected), saleable: n(r.saleable), avg_hens: n(r.avg_hens), rate: n(r.production_rate) })),
        totals: { month: "Total", total: sum(rows, "total"), saleable: sum(rows, "saleable"), losses: sum(rows, "broken") + sum(rows, "rejected"), rate: sum(rows, "hen_days") ? Math.round((sum(rows, "saleable") / sum(rows, "hen_days")) * 10000) / 100 : null },
      };
    },
  },
  {
    key: "egg_inventory", title: "Egg inventory", module: "inventory", filters: ["range", "farm"],
    description: "Opening, movements and closing stock per grade for the period.",
    run: async (db, p) => {
      const { data, error } = await db.rpc("egg_stock_summary", { p_from: p.from, p_to: p.to, p_farm: p.farm ?? null });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Row[];
      const keys = ["opening", "production", "purchases", "sale_returns", "adjustments_in", "transfers_in", "sales", "damages", "returns_out", "adjustments_out", "transfers_out", "closing"];
      return {
        columns: [{ key: "grade", header: "Grade" }, ...keys.map((k) => ({ key: k, header: titleCase(k), type: "number" as const }))],
        rows: rows.map((r) => ({ grade: r.grade_name, ...Object.fromEntries(keys.map((k) => [k, Number(r[k])])) })),
        totals: { grade: "Total", ...Object.fromEntries(keys.map((k) => [k, sum(rows, k)])) },
      };
    },
  },
  {
    key: "egg_purchases", title: "Egg purchases", module: "purchases", filters: ["range", "supplier"],
    description: "Confirmed purchase invoices with payments and balances.",
    run: async (db, p) => {
      const rows = await fetchAll(() => {
        let q = db.from("egg_purchases").select("*, suppliers(name), farms(name)").eq("status", "confirmed").gte("purchase_date", p.from).lte("purchase_date", p.to).order("purchase_date");
        if (p.supplier) q = q.eq("supplier_id", p.supplier);
        return q;
      });
      return {
        columns: [{ key: "date", header: "Date" }, { key: "no", header: "Purchase #" }, { key: "sinv", header: "Supplier inv." }, { key: "supplier", header: "Supplier" }, { key: "location", header: "Received at" }, { key: "total", header: "Total", type: "money" }, { key: "returned", header: "Returned", type: "money" }, { key: "paid", header: "Paid", type: "money" }, { key: "balance", header: "Balance", type: "money" }],
        rows: rows.map((r) => ({ date: r.purchase_date, no: r.purchase_no, sinv: r.supplier_invoice_no, supplier: r.suppliers?.name, location: r.farms?.name, total: n(r.total_amount), returned: n(r.returned_amount), paid: n(r.paid_amount), balance: n(r.balance_due) })),
        totals: { date: "Total", total: sum(rows, "total_amount"), returned: sum(rows, "returned_amount"), paid: sum(rows, "paid_amount"), balance: sum(rows, "balance_due") },
      };
    },
  },
  {
    key: "egg_sales", title: "Egg sales", module: "sales", filters: ["range", "customer"],
    description: "Confirmed invoices with discounts, tax, returns, collections and balances.",
    run: async (db, p) => {
      const rows = await fetchAll(() => {
        let q = db.from("egg_sales").select("*, customers(name)").eq("status", "confirmed").gte("sale_date", p.from).lte("sale_date", p.to).order("sale_date");
        if (p.customer) q = q.eq("customer_id", p.customer);
        return q;
      });
      return {
        columns: [{ key: "date", header: "Date" }, { key: "no", header: "Invoice" }, { key: "customer", header: "Customer" }, { key: "subtotal", header: "Subtotal", type: "money" }, { key: "discount", header: "Discount", type: "money" }, { key: "tax", header: "Tax", type: "money" }, { key: "charges", header: "Charges", type: "money" }, { key: "total", header: "Total", type: "money" }, { key: "returned", header: "Returned", type: "money" }, { key: "paid", header: "Paid", type: "money" }, { key: "balance", header: "Balance", type: "money" }],
        rows: rows.map((r) => ({ date: r.sale_date, no: r.invoice_no, customer: r.customers?.name ?? r.walk_in_name ?? "Walk-in", subtotal: n(r.subtotal), discount: n(r.discount), tax: n(r.tax_amount), charges: n(r.additional_charges), total: n(r.total_amount), returned: n(r.returned_amount), paid: n(r.paid_amount), balance: n(r.balance_due) })),
        totals: { date: "Total", subtotal: sum(rows, "subtotal"), discount: sum(rows, "discount"), tax: sum(rows, "tax_amount"), charges: sum(rows, "additional_charges"), total: sum(rows, "total_amount"), returned: sum(rows, "returned_amount"), paid: sum(rows, "paid_amount"), balance: sum(rows, "balance_due") },
      };
    },
  },
  {
    key: "customer_ledger", title: "Customer ledger", module: "customers", filters: ["range", "customer"], requires: "customer",
    description: "Statement of account with opening balance, invoices, returns, receipts and running balance.",
    run: (db, p) => ledger(db, "customer", p.customer!, p),
  },
  {
    key: "supplier_ledger", title: "Supplier ledger", module: "suppliers", filters: ["range", "supplier"], requires: "supplier",
    description: "Statement of account with purchases, returns, payments and running balance.",
    run: (db, p) => ledger(db, "supplier", p.supplier!, p),
  },
  {
    key: "feed_consumption", title: "Feed consumption", module: "feed", filters: ["range", "farm", "shed"],
    description: "Shed-wise feed usage with quantity and cost.",
    run: async (db, p) => {
      const rows = await fetchAll(() => {
        let q = db.from("feed_consumption").select("*, farms(name), sheds(name), feed_inventory(name, unit), chicken_batches(batch_code)").eq("status", "posted").gte("consumption_date", p.from).lte("consumption_date", p.to).order("consumption_date");
        if (p.farm) q = q.eq("farm_id", p.farm);
        if (p.shed) q = q.eq("shed_id", p.shed);
        return q;
      });
      return {
        columns: [{ key: "date", header: "Date" }, { key: "farm", header: "Farm" }, { key: "shed", header: "Shed" }, { key: "batch", header: "Batch" }, { key: "feed", header: "Feed" }, { key: "qty", header: "Quantity", type: "number" }, { key: "unit", header: "Unit" }, { key: "cost", header: "Unit cost", type: "money" }, { key: "total", header: "Total cost", type: "money" }],
        rows: rows.map((r) => ({ date: r.consumption_date, farm: r.farms?.name, shed: r.sheds?.name, batch: r.chicken_batches?.batch_code ?? "", feed: r.feed_inventory?.name, qty: n(r.quantity), unit: r.feed_inventory?.unit, cost: n(r.unit_cost), total: n(r.total_cost) })),
        totals: { date: "Total", qty: sum(rows, "quantity"), total: sum(rows, "total_cost") },
      };
    },
  },
  {
    key: "medicine_inventory", title: "Medicine inventory", module: "medicine", filters: [],
    description: "Stock on hand by medicine batch with expiry status and value.",
    run: async (db) => {
      const rows = await fetchAll(() => db.from("medicine_batches").select("*, medicines(name, category, unit), suppliers(name)").gt("quantity_on_hand", 0).order("expiry_date", { ascending: true, nullsFirst: false }));
      const today = new Date().toISOString().slice(0, 10);
      return {
        columns: [{ key: "medicine", header: "Medicine" }, { key: "category", header: "Category" }, { key: "batch", header: "Batch" }, { key: "expiry", header: "Expiry" }, { key: "status", header: "Status" }, { key: "qty", header: "On hand", type: "number" }, { key: "unit", header: "Unit" }, { key: "price", header: "Unit price", type: "money" }, { key: "value", header: "Value", type: "money" }, { key: "supplier", header: "Supplier" }],
        rows: rows.map((r) => ({ medicine: r.medicines?.name, category: titleCase(r.medicines?.category), batch: r.batch_no, expiry: r.expiry_date ?? "", status: r.expiry_date && r.expiry_date < today ? "Expired" : "OK", qty: n(r.quantity_on_hand), unit: r.medicines?.unit, price: n(r.unit_cost), value: Number(r.quantity_on_hand) * Number(r.unit_cost), supplier: r.suppliers?.name ?? "" })),
        totals: { medicine: "Total", value: rows.reduce((a, r) => a + Number(r.quantity_on_hand) * Number(r.unit_cost), 0) },
      };
    },
  },
  {
    key: "mortality", title: "Mortality report", module: "poultry", filters: ["range", "batch"],
    description: "Daily mortality by batch and cause.",
    run: async (db, p) => {
      const rows = await fetchAll(() => {
        let q = db.from("mortality_records").select("*, chicken_batches(batch_code, farms(name), sheds(name))").eq("status", "posted").gte("record_date", p.from).lte("record_date", p.to).order("record_date");
        if (p.batch) q = q.eq("batch_id", p.batch);
        return q;
      });
      return {
        columns: [{ key: "date", header: "Date" }, { key: "batch", header: "Batch" }, { key: "farm", header: "Farm" }, { key: "shed", header: "Shed" }, { key: "qty", header: "Birds", type: "number" }, { key: "cause", header: "Cause" }, { key: "notes", header: "Notes" }],
        rows: rows.map((r) => ({ date: r.record_date, batch: r.chicken_batches?.batch_code, farm: r.chicken_batches?.farms?.name, shed: r.chicken_batches?.sheds?.name, qty: r.quantity, cause: r.cause ?? "", notes: r.notes ?? "" })),
        totals: { date: "Total", qty: sum(rows, "quantity") },
      };
    },
  },
  {
    key: "expenses", title: "Expenses report", module: "expenses", filters: ["range", "category"],
    description: "Posted expenses by date and category.",
    run: async (db, p) => {
      const rows = await fetchAll(() => {
        let q = db.from("expenses").select("*, expense_categories(name), cash_accounts(name), farms(name)").eq("status", "posted").gte("expense_date", p.from).lte("expense_date", p.to).order("expense_date");
        if (p.category) q = q.eq("category_id", p.category);
        return q;
      });
      return {
        columns: [{ key: "date", header: "Date" }, { key: "no", header: "Voucher" }, { key: "category", header: "Category" }, { key: "description", header: "Description" }, { key: "payee", header: "Payee" }, { key: "reference", header: "Reference" }, { key: "account", header: "Paid from" }, { key: "amount", header: "Amount", type: "money" }],
        rows: rows.map((r) => ({ date: r.expense_date, no: r.expense_no, category: r.expense_categories?.name, description: r.description ?? "", payee: r.payee ?? "", reference: r.reference ?? "", account: r.cash_accounts?.name, amount: n(r.amount) })),
        totals: { date: "Total", amount: sum(rows, "amount") },
      };
    },
  },
  {
    key: "salaries", title: "Employee salaries", module: "employees", filters: ["range"],
    description: "Salary records for months within the period.",
    run: async (db, p) => {
      const rows = await fetchAll(() => db.from("salary_records").select("*, employees(full_name, employee_code, position)").neq("status", "void").gte("salary_month", `${p.from.slice(0, 7)}-01`).lte("salary_month", p.to).order("salary_month").order("created_at"));
      return {
        columns: [{ key: "month", header: "Month" }, { key: "code", header: "ID" }, { key: "name", header: "Employee" }, { key: "position", header: "Position" }, { key: "basic", header: "Basic", type: "money" }, { key: "allow", header: "Allowances + OT", type: "money" }, { key: "ded", header: "Deductions", type: "money" }, { key: "adv", header: "Advance recovery", type: "money" }, { key: "net", header: "Net pay", type: "money" }, { key: "status", header: "Status" }, { key: "paid", header: "Paid on" }],
        rows: rows.map((r) => ({ month: r.salary_month.slice(0, 7), code: r.employees?.employee_code, name: r.employees?.full_name, position: r.employees?.position, basic: n(r.basic_salary), allow: Number(r.allowances) + Number(r.overtime), ded: n(r.deductions), adv: n(r.advance_deduction), net: n(r.net_salary), status: titleCase(r.status), paid: r.paid_date ?? "" })),
        totals: { month: "Total", basic: sum(rows, "basic_salary"), allow: sum(rows, "allowances") + sum(rows, "overtime"), ded: sum(rows, "deductions"), adv: sum(rows, "advance_deduction"), net: sum(rows, "net_salary") },
      };
    },
  },
  {
    key: "cashbook", title: "Cashbook", module: "accounting", filters: ["range", "account"],
    description: "All cash and bank movements with opening, running and closing balance.",
    run: async (db, p) => {
      const { data: opening } = await db.rpc("cashbook_opening", { p_account: p.account ?? null, p_before: p.from });
      const rows = await fetchAll(() => {
        let q = db.from("financial_transactions").select("*, cash_accounts(name)").gte("txn_date", p.from).lte("txn_date", p.to).order("txn_date").order("created_at");
        if (p.account) q = q.eq("cash_account_id", p.account);
        return q;
      });
      let run = Number(opening ?? 0);
      const out = [{ date: p.from, description: "Opening balance", category: "", account: "", in: null, out: null, balance: run } as Record<string, string | number | null>];
      for (const r of rows) {
        run += (r.direction === "in" ? 1 : -1) * Number(r.amount);
        out.push({ date: r.txn_date, description: r.description ?? "", category: titleCase(r.category), account: r.cash_accounts?.name, in: r.direction === "in" ? Number(r.amount) : null, out: r.direction === "out" ? Number(r.amount) : null, balance: run });
      }
      return {
        columns: [{ key: "date", header: "Date" }, { key: "description", header: "Description" }, { key: "category", header: "Category" }, { key: "account", header: "Account" }, { key: "in", header: "In", type: "money" }, { key: "out", header: "Out", type: "money" }, { key: "balance", header: "Balance", type: "money" }],
        rows: out,
        totals: { date: "Closing", in: rows.filter((r) => r.direction === "in").reduce((a, r) => a + Number(r.amount), 0), out: rows.filter((r) => r.direction === "out").reduce((a, r) => a + Number(r.amount), 0), balance: run },
      };
    },
  },
  {
    key: "profit_loss", title: "Profit & loss", module: "accounting", filters: ["range"],
    description: "Accrual profit and loss with cash collection analysis.",
    run: async (db, p) => {
      const { data, error } = await db.rpc("financial_summary", { p_from: p.from, p_to: p.to });
      if (error) throw new Error(error.message);
      const s = data as Row;
      const line = (section: string, item: string, amount: number) => ({ section, item, amount: Number(amount) });
      const rows = [
        line("Revenue", "Egg sales", s.revenue.egg_sales), line("Revenue", "Less: sales returns", -s.revenue.sales_returns),
        line("Revenue", "Chicken sales", s.revenue.chicken_sales), line("Revenue", "Other income", s.revenue.other_income),
        line("Revenue", "Total revenue", s.revenue.total),
        line("Costs", "Egg purchases (net)", s.costs.net_egg_purchases), line("Costs", "Chicken purchases", s.costs.chicken_purchases),
        line("Costs", "Feed purchases", s.costs.feed_purchases), line("Costs", "Medicine purchases", s.costs.medicine_purchases),
        line("Costs", "Packaging purchases", s.costs.packaging_purchases),
        ...(s.costs.expenses_by_category as Row[]).map((e) => line("Operating expenses", e.category, e.amount)),
        line("Costs", "Salaries & wages", s.costs.salaries), line("Costs", "Total costs", s.costs.total),
        line("Result", Number(s.net_profit) >= 0 ? "Net profit" : "Net loss", s.net_profit),
        line("Cash", "Receipts against this period's invoices", s.cash.receipts_current_sales),
        line("Cash", "Collections of previous receivables", s.cash.receipts_previous_receivables),
        line("Cash", "Receipts on account", s.cash.receipts_on_account),
        line("Cash", "Payments to suppliers", -s.cash.supplier_payments), line("Cash", "Net cash flow", s.cash.net_cash_flow),
      ];
      return { columns: [{ key: "section", header: "Section" }, { key: "item", header: "Item" }, { key: "amount", header: "Amount", type: "money" }], rows, note: "Revenue is recognised on the invoice date; collections of old invoices are shown under Cash only." };
    },
  },
];

async function ledger(db: SupabaseClient, type: "customer" | "supplier", id: string, p: ReportParams): Promise<ReportResult> {
  const { data, error } = await db.rpc("party_ledger", { p_party_type: type, p_party_id: id, p_from: p.from, p_to: p.to });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  return {
    columns: [{ key: "date", header: "Date" }, { key: "type", header: "Type" }, { key: "reference", header: "Reference" }, { key: "description", header: "Description" }, { key: "debit", header: "Debit", type: "money" }, { key: "credit", header: "Credit", type: "money" }, { key: "balance", header: "Balance", type: "money" }],
    rows: rows.map((r) => ({ date: r.entry_date, type: titleCase(r.entry_type), reference: r.reference ?? "", description: r.description ?? "", debit: n(r.debit), credit: n(r.credit), balance: n(r.balance) })),
    totals: { date: "Totals", debit: sum(rows, "debit"), credit: sum(rows, "credit"), balance: rows.length ? Number(rows[rows.length - 1].balance) : 0 },
  };
}
