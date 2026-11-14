import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadOptions } from "@/lib/data/options";
import type { InvoiceFormProps } from "@/components/documents/invoice-form";
import type { Row, Session } from "@/lib/types";
import { todayIn } from "@/lib/data/query";

export type DocKind = "sale" | "purchase";

export const DOC = {
  sale: { table: "egg_sales", items: "egg_sale_items", returns: "sales_returns", returnItems: "sales_return_items", no: "invoice_no", date: "sale_date", party: "customer_id", partyTable: "customers", module: "sales" as const, base: "/sales", docType: "egg_sale", itemFk: "sale_item_id", price: "unit_price" },
  purchase: { table: "egg_purchases", items: "egg_purchase_items", returns: "purchase_returns", returnItems: "purchase_return_items", no: "purchase_no", date: "purchase_date", party: "supplier_id", partyTable: "suppliers", module: "purchases" as const, base: "/purchases", docType: "egg_purchase", itemFk: "purchase_item_id", price: "rate" },
};

export async function loadInvoiceFormProps(kind: DocKind, session: Session): Promise<Omit<InvoiceFormProps, "initial">> {
  const supabase = await createClient();
  const opts = await loadOptions([kind === "sale" ? "customers" : "suppliers", "locations", "cashAccounts"]);
  const [{ data: grades }, { data: units }, { data: stock }] = await Promise.all([
    supabase.from("egg_grades").select("id, name, default_price, is_saleable").eq("is_active", true).order("sort_order"),
    supabase.from("packaging_types").select("code, name, eggs_per_unit").eq("is_active", true).order("sort_order"),
    supabase.from("egg_inventory").select("farm_id, grade_id, quantity"),
  ]);
  const stockMap: Record<string, Record<string, number>> = {};
  for (const s of stock ?? []) {
    (stockMap[s.farm_id] ??= {})[s.grade_id] = s.quantity;
  }
  return {
    kind,
    today: todayIn(session.settings.timezone),
    parties: (kind === "sale" ? opts.customers : opts.suppliers) ?? [],
    locations: opts.locations ?? [],
    accounts: opts.cashAccounts ?? [],
    grades: (grades ?? [])
      .filter((g) => kind === "purchase" || g.is_saleable)
      .map((g) => ({ value: g.id, label: g.name, price: Number(g.default_price), hint: `Rs ${g.default_price}/egg` })),
    units: (units ?? []).map((u) => ({ value: u.code, label: `${u.name}`, hint: `${u.eggs_per_unit} eggs`, eggs: u.eggs_per_unit })),
    stock: stockMap,
    taxRate: session.settings.tax_enabled ? Number(session.settings.tax_rate) : 0,
    taxLabel: session.settings.tax_label,
  };
}

export async function loadDocument(kind: DocKind, id: string) {
  const d = DOC[kind];
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from(d.table)
    .select(`*, ${d.partyTable}(*), farms(name)`)
    .eq("id", id)
    .maybeSingle();
  if (!doc) return null;
  const [{ data: items }, { data: payments }, { data: returns }] = await Promise.all([
    supabase.from(d.items).select("*, egg_grades(name, code)").eq(kind === "sale" ? "sale_id" : "purchase_id", id),
    supabase.from("payments").select("*, cash_accounts(name)").eq("doc_type", d.docType).eq("doc_id", id).order("created_at"),
    supabase.from(d.returns).select(`*, ${d.returnItems}(*, egg_grades(name))`).eq(kind === "sale" ? "sale_id" : "purchase_id", id).order("created_at"),
  ]);
  return { doc: doc as Row, items: (items ?? []) as Row[], payments: (payments ?? []) as Row[], returns: (returns ?? []) as Row[] };
}
