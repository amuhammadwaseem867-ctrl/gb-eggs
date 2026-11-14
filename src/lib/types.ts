export type ModuleCode =
  | "dashboard"
  | "poultry"
  | "production"
  | "inventory"
  | "purchases"
  | "sales"
  | "customers"
  | "suppliers"
  | "feed"
  | "medicine"
  | "expenses"
  | "employees"
  | "accounting"
  | "reports"
  | "settings";

export type PermissionAction = "view" | "create" | "edit" | "delete";
export type RoleCode = "admin" | "manager" | "accountant" | "staff";

export type Permissions = Record<ModuleCode, Record<PermissionAction, boolean>>;

export interface AppSettings {
  company_name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  ntn_number: string | null;
  currency: string;
  timezone: string;
  language: "en" | "ur";
  tax_enabled: boolean;
  tax_label: string;
  tax_rate: number;
  allow_negative_stock: boolean;
  mortality_alert_pct: number;
  medicine_expiry_days: number;
  invoice_footer: string | null;
}

export interface Session {
  userId: string;
  email: string;
  fullName: string;
  role: RoleCode;
  isActive: boolean;
  permissions: Permissions;
  settings: AppSettings;
}

/** Loosely typed database row (the schema is enforced by PostgreSQL). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

export interface Option {
  value: string;
  label: string;
  /** Parent value for dependent selects (e.g. a shed's farm). */
  parent?: string;
  hint?: string;
}
