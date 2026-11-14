import { splitEggs } from "@/lib/calc";

const nf = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 });

export function formatNumber(v: number | string | null | undefined, digits?: number) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (digits !== undefined) {
    return new Intl.NumberFormat("en-PK", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  }
  return Number.isInteger(n) ? nf0.format(n) : nf.format(n);
}

export function formatCurrency(v: number | string | null | undefined, currency = "PKR") {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = new Intl.NumberFormat("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Math.abs(n));
  return `${n < 0 ? "-" : ""}${currency === "PKR" ? "Rs" : currency} ${abs}`;
}

export function formatCompactCurrency(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  const abs = Math.abs(n);
  if (abs >= 10_000_000) return `Rs ${(n / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `Rs ${(n / 100_000).toFixed(2)} Lac`;
  return formatCurrency(n);
}

export function formatDate(v: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v.length === 10 ? `${v}T00:00:00` : v) : v;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", ...opts }).format(d);
}

export function formatDateTime(v: string | Date | null | undefined) {
  return formatDate(v, { hour: "2-digit", minute: "2-digit" });
}

/** "1,234 eggs (41 trays + 4)" style display. */
export function formatEggs(qty: number | string | null | undefined, trayCapacity = 30, withTrays = true) {
  const n = Number(qty ?? 0);
  if (!withTrays || trayCapacity <= 1) return `${formatNumber(n)} eggs`;
  const { units, remainder } = splitEggs(n, trayCapacity);
  const trays = `${formatNumber(units)} tray${Math.abs(units) === 1 ? "" : "s"}`;
  return `${formatNumber(n)} eggs · ${trays}${remainder ? ` + ${remainder}` : ""}`;
}

export function titleCase(v: string | null | undefined) {
  if (!v) return "—";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatPercent(v: number | string | null | undefined, digits = 1) {
  if (v === null || v === undefined || v === "") return "—";
  return `${Number(v).toFixed(digits)}%`;
}
