import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { OptionSource } from "@/lib/forms/schema";
import type { FieldDef } from "@/lib/forms/schema";
import type { Option } from "@/lib/types";

export type OptionMap = Partial<Record<OptionSource, Option[]>>;

/** Collects the option sources used by a set of form fields. */
export function sourcesOf(...fieldLists: FieldDef[][]): OptionSource[] {
  const s = new Set<OptionSource>();
  fieldLists.flat().forEach((f) => f.source && s.add(f.source));
  return [...s];
}

/** Loads dropdown options for the requested sources (RLS applies). */
export async function loadOptions(sources: OptionSource[]): Promise<OptionMap> {
  const supabase = await createClient();
  const wanted = new Set(sources);
  const out: OptionMap = {};
  const tasks: Promise<void>[] = [];
  const add = (key: OptionSource, fn: () => PromiseLike<Option[]>) => {
    if (wanted.has(key)) tasks.push(Promise.resolve(fn()).then((v) => void (out[key] = v)));
  };

  add("farms", async () => {
    const { data } = await supabase.from("farms").select("id, name, code").eq("is_active", true).eq("farm_type", "farm").order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name, hint: r.code }));
  });
  add("stores", async () => {
    const { data } = await supabase.from("farms").select("id, name").eq("is_active", true).eq("farm_type", "store").order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name }));
  });
  add("locations", async () => {
    const { data } = await supabase.from("farms").select("id, name, farm_type").eq("is_active", true).order("farm_type").order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name, hint: r.farm_type === "store" ? "Store" : "Farm" }));
  });
  add("sheds", async () => {
    const { data } = await supabase.from("sheds").select("id, name, farm_id").eq("is_active", true).order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name, parent: r.farm_id }));
  });
  const batches = (activeOnly: boolean) => async () => {
    let q = supabase.from("v_chicken_batches").select("id, batch_code, shed_name, farm_name, live_birds, status").order("batch_code");
    if (activeOnly) q = q.eq("status", "active");
    const { data } = await q;
    return (data ?? []).map((r) => ({
      value: r.id,
      label: `${r.batch_code} — ${r.farm_name} / ${r.shed_name}`,
      hint: `${Number(r.live_birds).toLocaleString()} live`,
    }));
  };
  add("batches", batches(false));
  add("activeBatches", batches(true));
  add("breeds", async () => {
    const { data } = await supabase.from("chicken_breeds").select("id, name").eq("is_active", true).order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name }));
  });
  add("customers", async () => {
    const { data } = await supabase.from("customers").select("id, name, business_name, phone").eq("is_active", true).order("name").limit(2000);
    return (data ?? []).map((r) => ({ value: r.id, label: r.business_name ? `${r.name} (${r.business_name})` : r.name, hint: r.phone ?? undefined }));
  });
  add("suppliers", async () => {
    const { data } = await supabase.from("suppliers").select("id, name, business_name, supplier_type").eq("is_active", true).order("name").limit(2000);
    return (data ?? []).map((r) => ({ value: r.id, label: r.business_name ? `${r.name} (${r.business_name})` : r.name, hint: r.supplier_type, parent: r.supplier_type }));
  });
  add("grades", async () => {
    const { data } = await supabase.from("egg_grades").select("id, name, default_price").eq("is_active", true).order("sort_order");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name, hint: String(r.default_price) }));
  });
  add("units", async () => {
    const { data } = await supabase.from("packaging_types").select("code, name, eggs_per_unit").eq("is_active", true).order("sort_order");
    return (data ?? []).map((r) => ({ value: r.code, label: `${r.name} (${r.eggs_per_unit})`, hint: String(r.eggs_per_unit) }));
  });
  add("cashAccounts", async () => {
    const { data } = await supabase.from("cash_accounts").select("id, name, account_type").eq("is_active", true).order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name, hint: r.account_type }));
  });
  add("expenseCategories", async () => {
    const { data } = await supabase.from("expense_categories").select("id, name").eq("is_active", true).order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name }));
  });
  add("feedCategories", async () => {
    const { data } = await supabase.from("feed_categories").select("id, name").eq("is_active", true).order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name }));
  });
  add("feeds", async () => {
    const { data } = await supabase.from("feed_inventory").select("id, name, unit, current_stock").eq("is_active", true).order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name, hint: `${Number(r.current_stock).toLocaleString()} ${r.unit}` }));
  });
  add("medicines", async () => {
    const { data } = await supabase.from("medicines").select("id, name, unit, current_stock").eq("is_active", true).order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name, hint: `${Number(r.current_stock).toLocaleString()} ${r.unit}` }));
  });
  add("medicineBatches", async () => {
    const { data } = await supabase
      .from("medicine_batches")
      .select("id, medicine_id, batch_no, expiry_date, quantity_on_hand")
      .gt("quantity_on_hand", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false });
    return (data ?? []).map((r) => ({
      value: r.id,
      label: `${r.batch_no}${r.expiry_date ? ` · exp ${r.expiry_date}` : ""}`,
      hint: `${Number(r.quantity_on_hand).toLocaleString()} left`,
      parent: r.medicine_id,
    }));
  });
  add("employees", async () => {
    const { data } = await supabase.from("employees").select("id, full_name, employee_code").eq("status", "active").order("full_name");
    return (data ?? []).map((r) => ({ value: r.id, label: `${r.full_name} (${r.employee_code})` }));
  });
  add("packagingItems", async () => {
    const { data } = await supabase.from("packaging_items").select("id, name, current_stock").eq("is_active", true).order("name");
    return (data ?? []).map((r) => ({ value: r.id, label: r.name, hint: `${r.current_stock} in stock` }));
  });

  await Promise.all(tasks);
  return out;
}
