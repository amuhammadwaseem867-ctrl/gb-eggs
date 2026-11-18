import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppSettings, ModuleCode, PermissionAction, Permissions, RoleCode, Session } from "@/lib/types";

export const MODULES: ModuleCode[] = [
  "dashboard", "poultry", "production", "inventory", "purchases", "sales", "customers", "suppliers",
  "feed", "medicine", "expenses", "employees", "accounting", "reports", "settings",
];

const DEFAULT_SETTINGS: AppSettings = {
  company_name: "GB Eggs", logo_url: null, address: null, phone: null, email: null, ntn_number: null,
  currency: "PKR", timezone: "Asia/Karachi", language: "en", tax_enabled: false, tax_label: "GST", tax_rate: 0,
  allow_negative_stock: false, mortality_alert_pct: 0.5, medicine_expiry_days: 30, invoice_footer: null,
};

/**
 * Data-access layer for the current user. Verifies the JWT with Supabase
 * (getClaims), loads the profile, role permissions and company settings.
 * Memoised per request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) return null;

  // One database round trip: the permission matrix is tiny (roles x modules), so it is
  // fetched alongside the profile instead of waiting for the role first.
  const [{ data: profile }, { data: settings }, { data: matrix }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role_code, is_active").eq("id", userId).maybeSingle(),
    supabase.from("app_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("role_permissions").select("role_code, module, can_view, can_create, can_edit, can_delete"),
  ]);
  if (!profile) return null;

  const role = profile.role_code as RoleCode;
  const perms = matrix?.filter((p) => p.role_code === role);

  const permissions = Object.fromEntries(
    MODULES.map((m) => {
      const p = perms?.find((x) => x.module === m);
      const all = role === "admin";
      return [
        m,
        {
          view: all || Boolean(p?.can_view),
          create: all || Boolean(p?.can_create),
          edit: all || Boolean(p?.can_edit),
          delete: all || Boolean(p?.can_delete),
        },
      ];
    }),
  ) as Permissions;

  return {
    userId,
    email: profile.email ?? (claimsData?.claims?.email as string) ?? "",
    fullName: profile.full_name || profile.email || "User",
    role,
    isActive: profile.is_active,
    permissions,
    settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}), tax_rate: Number(settings?.tax_rate ?? 0) },
  };
});

export function can(session: Session | null, module: ModuleCode, action: PermissionAction = "view") {
  return Boolean(session?.isActive && session.permissions[module]?.[action]);
}

/** Use at the top of every protected page. */
export async function requirePage(module: ModuleCode, action: PermissionAction = "view"): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isActive) redirect("/forbidden?reason=inactive");
  if (!can(session, module, action)) redirect(`/forbidden?module=${module}`);
  return session;
}

/** Use inside server actions; throws instead of redirecting. */
export async function requireAction(module: ModuleCode, action: PermissionAction): Promise<Session> {
  const session = await getSession();
  if (!session || !session.isActive) throw new Error("Your session has expired. Please sign in again.");
  if (!can(session, module, action)) throw new Error(`You do not have permission to ${action} ${module}.`);
  return session;
}
