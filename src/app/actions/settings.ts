"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAction } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

const settingsSchema = z.object({
  company_name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(300).nullish(),
  phone: z.string().trim().max(60).nullish(),
  email: z.union([z.email(), z.literal("")]).nullish(),
  ntn_number: z.string().trim().max(40).nullish(),
  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(3).max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  language: z.enum(["en", "ur"]),
  tax_enabled: z.boolean(),
  tax_label: z.string().trim().min(1).max(20),
  tax_rate: z.coerce.number().min(0).max(100),
  allow_negative_stock: z.boolean(),
  mortality_alert_pct: z.coerce.number().min(0).max(100),
  medicine_expiry_days: z.coerce.number().int().min(0).max(365),
  invoice_footer: z.string().max(500).nullish(),
  logo_url: z.string().url().max(500).nullish().or(z.literal("")),
});

export async function updateSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  try {
    const v = settingsSchema.parse(input);
    await requireAction("settings", "edit");
    const supabase = await createClient();
    const { error } = await supabase.from("app_settings").update({ ...v, email: v.email || null, logo_url: v.logo_url || null }).eq("id", 1);
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved" };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" · ") : friendlyError(e instanceof Error ? e.message : e) };
  }
}

const seqSchema = z.object({
  doc_type: z.string().min(1),
  prefix: z.string().trim().max(20),
  next_number: z.coerce.number().int().min(1),
  padding: z.coerce.number().int().min(1).max(12),
});

export async function updateSequence(input: z.input<typeof seqSchema>): Promise<ActionResult> {
  try {
    const v = seqSchema.parse(input);
    await requireAction("settings", "edit");
    const supabase = await createClient();
    const { error } = await supabase.from("document_sequences").update({ prefix: v.prefix, next_number: v.next_number, padding: v.padding }).eq("doc_type", v.doc_type);
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath("/settings");
    return { ok: true, message: "Numbering updated" };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}

const permSchema = z.object({
  role_code: z.enum(["manager", "accountant", "staff"]),
  module: z.string().min(1),
  action: z.enum(["can_view", "can_create", "can_edit", "can_delete"]),
  value: z.boolean(),
});

export async function setPermission(input: z.input<typeof permSchema>): Promise<ActionResult> {
  try {
    const v = permSchema.parse(input);
    const session = await requireAction("settings", "edit");
    if (session.role !== "admin") return { ok: false, error: "Only administrators can change permissions" };
    const supabase = await createClient();
    const patch: Record<string, boolean> = { [v.action]: v.value };
    // Keep the matrix consistent: any write implies view; removing view removes everything.
    if (v.value && v.action !== "can_view") patch.can_view = true;
    if (!v.value && v.action === "can_view") Object.assign(patch, { can_create: false, can_edit: false, can_delete: false });
    const { error, count } = await supabase.from("role_permissions").update(patch, { count: "exact" }).eq("role_code", v.role_code).eq("module", v.module);
    if (error) return { ok: false, error: friendlyError(error) };
    if (!count) return { ok: false, error: "Permission row not found" };
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}

const userSchema = z.object({
  id: z.uuid(),
  full_name: z.string().trim().min(1).max(120),
  role_code: z.enum(["admin", "manager", "accountant", "staff"]),
  is_active: z.boolean(),
  phone: z.string().trim().max(40).nullish(),
});

export async function updateUser(input: z.input<typeof userSchema>): Promise<ActionResult> {
  try {
    const v = userSchema.parse(input);
    const session = await requireAction("settings", "edit");
    if (session.role !== "admin") return { ok: false, error: "Only administrators can manage users" };
    if (v.id === session.userId && (v.role_code !== "admin" || !v.is_active)) {
      return { ok: false, error: "You cannot remove your own administrator access" };
    }
    const supabase = await createClient();
    const { error, count } = await supabase.from("profiles").update({ full_name: v.full_name, role_code: v.role_code, is_active: v.is_active, phone: v.phone ?? null }, { count: "exact" }).eq("id", v.id);
    if (error) return { ok: false, error: friendlyError(error) };
    if (!count) return { ok: false, error: "User not found or permission denied" };
    revalidatePath("/settings");
    return { ok: true, message: "User updated" };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}

const newUserSchema = z.object({
  email: z.email(),
  full_name: z.string().trim().min(2).max(120),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role_code: z.enum(["admin", "manager", "accountant", "staff"]),
});

/** Creates a confirmed auth user with the service-role key (server only). */
export async function createUser(input: z.input<typeof newUserSchema>): Promise<ActionResult> {
  try {
    const v = newUserSchema.parse(input);
    const session = await requireAction("settings", "edit");
    if (session.role !== "admin") return { ok: false, error: "Only administrators can create users" };
    const admin = createAdminClient();
    if (!admin) {
      return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Add it to the environment, or invite the user from the Supabase dashboard (Authentication → Users)." };
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: v.email,
      password: v.password,
      email_confirm: true,
      user_metadata: { full_name: v.full_name },
    });
    if (error || !data.user) return { ok: false, error: error?.message ?? "Could not create user" };
    // The profile is created by the on_auth_user_created trigger; set the role as admin (RLS-checked).
    const supabase = await createClient();
    const { error: pErr } = await supabase.from("profiles").update({ role_code: v.role_code, full_name: v.full_name }).eq("id", data.user.id);
    if (pErr) return { ok: false, error: friendlyError(pErr) };
    revalidatePath("/settings");
    return { ok: true, message: `Account created for ${v.email}` };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues[0].message : friendlyError(e instanceof Error ? e.message : e) };
  }
}
