import { z } from "zod";
import type { Option } from "@/lib/types";

export type FieldType =
  | "text" | "email" | "tel" | "number" | "money" | "date" | "time" | "textarea" | "select" | "checkbox" | "hidden";

export type OptionSource =
  | "farms" | "stores" | "locations" | "sheds" | "batches" | "activeBatches" | "breeds" | "customers" | "suppliers"
  | "grades" | "units" | "cashAccounts" | "expenseCategories" | "feedCategories" | "feeds" | "medicines"
  | "medicineBatches" | "employees" | "packagingItems";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Option[];
  source?: OptionSource;
  /** Filters options by `parent` = value of this field (e.g. sheds by farm). */
  dependsOn?: string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  placeholder?: string;
  help?: string;
  defaultValue?: string | number | boolean | "today";
  /** Spans both columns of the form grid. */
  wide?: boolean;
  /** Only sent / shown when creating. */
  createOnly?: boolean;
  /** Show only when another field has one of these values. */
  showIf?: { field: string; in: (string | number | boolean)[] };
}

const emptyToUndef = (v: unknown) => (v === "" || v === null || v === undefined ? undefined : v);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

function fieldSchema(f: FieldDef): z.ZodType {
  switch (f.type) {
    case "number":
    case "money": {
      let n = z.number({ error: `${f.label} must be a number` });
      if (f.integer) n = n.int(`${f.label} must be a whole number`);
      if (f.min !== undefined) n = n.min(f.min, `${f.label} must be at least ${f.min}`);
      if (f.max !== undefined) n = n.max(f.max, `${f.label} must be at most ${f.max}`);
      const base = z.preprocess((v) => {
        const u = emptyToUndef(v);
        return u === undefined ? undefined : Number(u);
      }, f.required ? n : n.optional());
      return f.required ? base : base.transform((v) => (v === undefined ? null : v));
    }
    case "checkbox":
      return z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());
    case "date": {
      const d = z.string().regex(dateRe, `${f.label} must be a valid date`);
      return f.required
        ? z.preprocess((v) => (v ?? "") as string, z.string().min(1, `${f.label} is required`).pipe(d))
        : z.preprocess(emptyToUndef, d.optional()).transform((v) => v ?? null);
    }
    case "email": {
      const e = z.email(`${f.label} must be a valid email`);
      return f.required
        ? z.string().trim().pipe(e)
        : z.preprocess((v) => (typeof v === "string" ? v.trim() : v), z.preprocess(emptyToUndef, e.optional())).transform((v) => v ?? null);
    }
    default: {
      const s = z.string().trim().max(2000);
      if (f.required) {
        return z.preprocess((v) => (v === null || v === undefined ? "" : v), s.min(1, `${f.label} is required`));
      }
      return z
        .preprocess((v) => (v === null || v === undefined ? "" : String(v)), s)
        .transform((v) => (v === "" ? null : v));
    }
  }
}

export type Refinement = (values: Record<string, unknown>) => { path: string; message: string } | null;

/** Builds the Zod schema shared by the client form and the server action. */
export function buildSchema(fields: FieldDef[], refinements: Refinement[] = [], mode: "create" | "edit" = "create") {
  const shape: Record<string, z.ZodType> = {};
  for (const f of fields) {
    if (mode === "edit" && f.createOnly) continue;
    shape[f.name] = fieldSchema(f);
  }
  return z.object(shape).superRefine((values, ctx) => {
    for (const r of refinements) {
      const issue = r(values as Record<string, unknown>);
      if (issue) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
    }
  });
}

export function defaultValues(fields: FieldDef[], today: string, initial?: Record<string, unknown> | null) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = initial?.[f.name];
    if (v !== undefined && v !== null) {
      out[f.name] = f.type === "checkbox" ? Boolean(v) : f.type === "number" || f.type === "money" ? String(v) : String(v);
      continue;
    }
    if (f.defaultValue === "today") out[f.name] = today;
    else if (f.defaultValue !== undefined) out[f.name] = f.type === "checkbox" ? Boolean(f.defaultValue) : String(f.defaultValue);
    else out[f.name] = f.type === "checkbox" ? false : "";
  }
  return out;
}

// Common option lists ---------------------------------------------------------
export const PAYMENT_METHODS: Option[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "mobile_wallet", label: "Mobile wallet (JazzCash / Easypaisa)" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
];

export const opts = (...pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));
