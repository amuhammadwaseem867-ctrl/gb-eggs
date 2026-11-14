"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAction } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const uuid = z.uuid("Invalid selection");
const money = z.coerce.number().min(0, "Amounts cannot be negative");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");

const lineSchema = z.object({
  grade_id: uuid,
  unit_code: z.string().min(1),
  unit_qty: z.coerce.number().positive("Quantity must be greater than zero"),
  price: z.coerce.number().min(0, "Price cannot be negative"),
});

const docSchema = z
  .object({
    id: z.uuid().nullish(),
    kind: z.enum(["sale", "purchase"]),
    party_id: z.string().nullish(),
    walk_in_name: z.string().trim().max(200).nullish(),
    walk_in_phone: z.string().trim().max(50).nullish(),
    supplier_invoice_no: z.string().trim().max(100).nullish(),
    farm_id: uuid,
    date,
    discount: money.default(0),
    additional_charges: money.default(0),
    notes: z.string().max(2000).nullish(),
    confirm: z.boolean(),
    paid_amount: money.default(0),
    payment_method: z.string().nullish(),
    cash_account_id: z.string().nullish(),
    items: z.array(lineSchema).min(1, "Add at least one item"),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "purchase" && !v.party_id) ctx.addIssue({ code: "custom", path: ["party_id"], message: "Select a supplier" });
    if (v.kind === "sale" && !v.party_id && !v.walk_in_name) ctx.addIssue({ code: "custom", path: ["walk_in_name"], message: "Select a customer or enter the walk-in name" });
    if (v.paid_amount > 0 && !v.cash_account_id) ctx.addIssue({ code: "custom", path: ["cash_account_id"], message: "Select the cash/bank account" });
  });

export type DocumentInput = z.input<typeof docSchema>;

export async function saveDocument(input: DocumentInput): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = docSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(" · ") };
    const v = parsed.data;
    await requireAction(v.kind === "sale" ? "sales" : "purchases", v.id ? "edit" : "create");
    const supabase = await createClient();
    const common = {
      id: v.id ?? null,
      farm_id: v.farm_id,
      discount: v.discount,
      additional_charges: v.additional_charges,
      notes: v.notes ?? null,
      confirm: v.confirm,
      paid_amount: v.confirm ? v.paid_amount : 0,
      payment_method: v.payment_method ?? "cash",
      cash_account_id: v.cash_account_id || null,
    };
    const { data, error } =
      v.kind === "sale"
        ? await supabase.rpc("save_egg_sale", {
            p: {
              ...common,
              customer_id: v.party_id || null,
              walk_in_name: v.walk_in_name ?? null,
              walk_in_phone: v.walk_in_phone ?? null,
              sale_date: v.date,
              items: v.items.map((i) => ({ grade_id: i.grade_id, unit_code: i.unit_code, unit_qty: i.unit_qty, unit_price: i.price })),
            },
          })
        : await supabase.rpc("save_egg_purchase", {
            p: {
              ...common,
              supplier_id: v.party_id,
              supplier_invoice_no: v.supplier_invoice_no ?? null,
              purchase_date: v.date,
              items: v.items.map((i) => ({ grade_id: i.grade_id, unit_code: i.unit_code, unit_qty: i.unit_qty, rate: i.price })),
            },
          });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath("/", "layout");
    return { ok: true, data: { id: data as string }, message: v.confirm ? "Confirmed and posted to stock" : "Draft saved" };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}

const returnSchema = z.object({
  kind: z.enum(["sale", "purchase"]),
  doc_id: uuid,
  return_date: date,
  reason: z.string().max(1000).nullish(),
  refund_amount: money.default(0),
  cash_account_id: z.string().nullish(),
  payment_method: z.string().nullish(),
  items: z
    .array(z.object({ item_id: uuid, quantity_eggs: z.coerce.number().int().min(0), condition: z.enum(["good", "damaged"]).default("good") }))
    .refine((a) => a.some((i) => i.quantity_eggs > 0), "Enter a quantity to return"),
});

export async function createReturn(input: z.input<typeof returnSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = returnSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(" · ") };
    const v = parsed.data;
    await requireAction(v.kind === "sale" ? "sales" : "purchases", "edit");
    if (v.refund_amount > 0 && !v.cash_account_id) return { ok: false, error: "Select the account for the refund" };
    const supabase = await createClient();
    const items = v.items.filter((i) => i.quantity_eggs > 0);
    const base = {
      return_date: v.return_date,
      reason: v.reason ?? null,
      refund_amount: v.refund_amount,
      cash_account_id: v.cash_account_id || null,
      payment_method: v.payment_method ?? "cash",
    };
    const { data, error } =
      v.kind === "sale"
        ? await supabase.rpc("create_sales_return", {
            p: { ...base, sale_id: v.doc_id, items: items.map((i) => ({ sale_item_id: i.item_id, quantity_eggs: i.quantity_eggs, condition: i.condition })) },
          })
        : await supabase.rpc("create_purchase_return", {
            p: { ...base, purchase_id: v.doc_id, items: items.map((i) => ({ purchase_item_id: i.item_id, quantity_eggs: i.quantity_eggs })) },
          });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath("/", "layout");
    return { ok: true, data: { id: data as string }, message: "Return recorded" };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}
