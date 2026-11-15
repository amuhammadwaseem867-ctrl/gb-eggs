/** Only same-site paths are allowed after sign-in (blocks "//evil.com", "/\\evil.com", "https://…" and friends). */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || /[\\\s]/.test(next)) return "/dashboard";
  try {
    const url = new URL(next, "http://gb-eggs.local");
    return url.origin === "http://gb-eggs.local" ? url.pathname + url.search + url.hash : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
