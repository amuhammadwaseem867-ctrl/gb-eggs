"use server";

import { revalidatePath } from "next/cache";
import { requireAction } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { getEntity } from "@/lib/forms/entities";
import { buildSchema } from "@/lib/forms/schema";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult, ModuleCode, PermissionAction } from "@/lib/types";

/** Create / update a record defined in the entity registry. */
export async function saveEntity(key: string, values: Record<string, unknown>, id?: string | null): Promise<ActionResult<{ id?: string }>> {
  try {
    const def = getEntity(key);
    const editing = Boolean(id);
    if (editing && !def.editable) return { ok: false, error: "These records cannot be edited. Void and re-enter instead." };
    await requireAction(def.module, editing ? "edit" : "create");

    const schema = buildSchema(def.fields, def.refine ?? [], editing ? "edit" : "create");
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((i) => i.message).join(" · ") };
    }
    // Hidden / conditional fields: drop those whose condition is not met.
    const payload: Record<string, unknown> = { ...(def.constants ?? {}) };
    for (const f of def.fields) {
      if (editing && f.createOnly) continue;
      if (f.showIf && !f.showIf.in.includes(parsed.data[f.showIf.field] as never)) continue;
      payload[f.name] = (parsed.data as Record<string, unknown>)[f.name];
    }

    const supabase = await createClient();
    let newId: string | undefined;
    if (def.mode === "rpc" && def.rpc) {
      const { data, error } = await supabase.rpc(def.rpc, { p: payload });
      if (error) return { ok: false, error: friendlyError(error) };
      newId = data as string;
    } else if (editing) {
      const { error } = await supabase.from(def.table).update(payload).eq(def.table === "packaging_types" ? "code" : "id", id!);
      if (error) return { ok: false, error: friendlyError(error) };
    } else if (def.mode === "upsert" && def.conflict) {
      const { data, error } = await supabase.from(def.table).upsert(payload, { onConflict: def.conflict }).select("id").maybeSingle();
      if (error) return { ok: false, error: friendlyError(error) };
      newId = data?.id;
    } else {
      const { data, error } = await supabase.from(def.table).insert(payload).select(def.table === "packaging_types" ? "code" : "id").maybeSingle();
      if (error) return { ok: false, error: friendlyError(error) };
      newId = (data as { id?: string; code?: string } | null)?.id ?? (data as { code?: string } | null)?.code;
    }
    revalidatePath("/", "layout");
    return { ok: true, data: { id: newId }, message: `${def.title} saved` };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}

/** Hard-deletes master data (never transactions). FK constraints still apply. */
export async function deleteEntity(key: string, id: string): Promise<ActionResult> {
  try {
    const def = getEntity(key);
    if (!def.deletable) return { ok: false, error: "These records cannot be deleted." };
    await requireAction(def.module, "delete");
    const supabase = await createClient();
    const { error, count } = await supabase.from(def.table).delete({ count: "exact" }).eq("id", id);
    if (error) return { ok: false, error: friendlyError(error) };
    if (!count) return { ok: false, error: "Nothing was deleted — you may not have permission." };
    revalidatePath("/", "layout");
    return { ok: true, message: `${def.title} deleted` };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}

/** Allow-listed database functions that can be called from the UI. */
const RPCS: Record<string, { module: ModuleCode; action: PermissionAction; label: string }> = {
  void_flock_event: { module: "poultry", action: "delete", label: "Record voided" },
  void_egg_collection: { module: "production", action: "delete", label: "Collection voided" },
  void_stock_record: { module: "dashboard", action: "view", label: "Record voided" },
  void_cash_record: { module: "dashboard", action: "view", label: "Record voided" },
  void_payment: { module: "accounting", action: "delete", label: "Payment voided" },
  cancel_egg_sale: { module: "sales", action: "delete", label: "Invoice cancelled" },
  cancel_egg_purchase: { module: "purchases", action: "delete", label: "Purchase cancelled" },
  confirm_egg_sale: { module: "sales", action: "edit", label: "Invoice confirmed" },
  confirm_egg_purchase: { module: "purchases", action: "edit", label: "Purchase confirmed" },
  delete_draft: { module: "dashboard", action: "view", label: "Draft deleted" },
  pay_salary: { module: "employees", action: "view", label: "Salary paid" },
  void_salary: { module: "employees", action: "delete", label: "Salary voided" },
};

/**
 * Runs an allow-listed RPC. The database function performs the authoritative
 * permission check (several allow more than one module); this is a first gate.
 */
export async function runRpc(name: string, args: Record<string, unknown>): Promise<ActionResult> {
  try {
    const meta = RPCS[name];
    if (!meta) return { ok: false, error: "Unknown action" };
    await requireAction(meta.module, meta.action);
    for (const [k, v] of Object.entries(args)) {
      if (k === "p_reason" && (typeof v !== "string" || !v.trim())) return { ok: false, error: "Please enter a reason." };
    }
    const supabase = await createClient();
    const { error } = await supabase.rpc(name, args);
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: meta.label };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}
