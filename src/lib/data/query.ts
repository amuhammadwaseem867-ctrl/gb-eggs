export type SearchParams = Record<string, string | string[] | undefined>;

export const PAGE_SIZE = 25;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v || undefined;
}

export function paging(sp: SearchParams, pageSize = PAGE_SIZE) {
  const page = Math.max(1, Number.parseInt(param(sp, "page") ?? "1", 10) || 1);
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
}

/** Builds a PostgREST `or` filter for a free-text search, escaping reserved characters. */
export function searchFilter(columns: string[], q: string | undefined) {
  const term = (q ?? "").replace(/[,()*%\\"]/g, " ").trim();
  if (!term) return null;
  return columns.map((c) => `${c}.ilike.*${term}*`).join(",");
}

export function isDate(v: string | undefined): v is string {
  return Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

export function isUuid(v: string | undefined): v is string {
  return Boolean(v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
}

/** YYYY-MM-DD in Asia/Karachi (or the given zone). */
export function todayIn(timeZone = "Asia/Karachi") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfMonth(date: string) {
  return `${date.slice(0, 7)}-01`;
}

/** Resolves a from/to range from search params with sensible defaults. */
export function dateRange(sp: SearchParams, today: string, defaultDays = 30) {
  const to = isDate(param(sp, "to")) ? param(sp, "to")! : today;
  const from = isDate(param(sp, "from")) ? param(sp, "from")! : addDays(to, -(defaultDays - 1));
  return from <= to ? { from, to } : { from: to, to: from };
}

/** Props of a page that reads search params. */
export interface PageSearchProps {
  searchParams: Promise<SearchParams>;
}
