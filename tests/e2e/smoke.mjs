// End-to-end smoke test: first-run admin sign-up, then every module page.
// Usage: node tests/e2e/smoke.mjs  (app on BASE_URL, stack from stack.sh)
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const OUT = process.env.SHOT_DIR ?? "tests/e2e/screens";
const EMAIL = process.env.E2E_EMAIL ?? "admin@gbeggs.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "Admin12345!";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror ${page.url()}: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console ${page.url()}: ${m.text()}`));

await page.goto(`${BASE}/login`);
if (await page.getByText("Create the administrator").isVisible()) {
  await page.getByLabel("Full name").fill("Ayesha Khan");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create administrator" }).click();
} else {
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
}
await page.waitForURL("**/dashboard", { timeout: 20000 });
console.log("signed in:", page.url());

if (process.env.SEED_CMD) {
  const { execSync } = await import("node:child_process");
  execSync(process.env.SEED_CMD, { stdio: "inherit" });
}

const pages = (process.env.PAGES ?? [
  "/dashboard", "/poultry", "/poultry?tab=mortality", "/poultry?tab=purchases", "/poultry?tab=sales", "/poultry?tab=transfers",
  "/poultry?tab=vaccinations", "/poultry?tab=farms", "/poultry?tab=breeds", "/production", "/production?tab=weekly", "/production?tab=monthly",
  "/inventory", "/inventory?tab=summary", "/inventory?tab=ledger", "/inventory?tab=damages", "/inventory?tab=adjustments",
  "/inventory?tab=packaging", "/inventory?tab=grades", "/purchases", "/purchases/new", "/sales", "/sales/new", "/customers",
  "/suppliers", "/feed", "/feed?tab=consumption", "/feed?tab=purchases", "/feed?tab=categories", "/medicine", "/medicine?tab=batches",
  "/medicine?tab=movements", "/expenses", "/expenses?tab=categories", "/employees", "/employees?tab=attendance", "/employees?tab=advances",
  "/employees?tab=payroll", "/accounting", "/accounting?tab=cashbook", "/accounting?tab=accounts", "/accounting?tab=receivables",
  "/accounting?tab=payments", "/accounting?tab=income", "/accounting?tab=transfers", "/reports", "/settings", "/settings?tab=numbering",
  "/settings?tab=packaging", "/settings?tab=users", "/settings?tab=permissions", "/settings?tab=audit",
].join(",")).split(",");

const reports = ["daily_collection", "monthly_production", "egg_inventory", "egg_purchases", "egg_sales", "customer_ledger", "supplier_ledger",
  "feed_consumption", "medicine_inventory", "mortality", "expenses", "salaries", "cashbook", "profit_loss"];
for (const r of reports) pages.push(`/reports?report=${r}`);

let failed = 0;
for (const p of pages) {
  const res = await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  const status = res?.status();
  const bad = await page.getByText(/Something went wrong|Could not load|Application error/).count();
  const ok = status === 200 && bad === 0 && !page.url().includes("/forbidden");
  if (!ok) failed++;
  console.log(`${ok ? "OK " : "ERR"} ${status} ${p}${bad ? "  <-- error UI" : ""}`);
  if (!ok || process.env.SHOTS) await page.screenshot({ path: `${OUT}/${p.replace(/[/?=&]+/g, "_") || "root"}.png`, fullPage: true });
}

// Detail pages discovered from lists
for (const [list, re] of [["/sales", /\/sales\/[0-9a-f-]{36}$/], ["/purchases", /\/purchases\/[0-9a-f-]{36}$/], ["/customers", /\/customers\/[0-9a-f-]{36}$/], ["/suppliers", /\/suppliers\/[0-9a-f-]{36}$/], ["/poultry", /\/poultry\/batches\/[0-9a-f-]{36}$/]]) {
  await page.goto(`${BASE}${list}`);
  const hrefs = await page.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const href = hrefs.find((h) => h && re.test(h));
  if (!href) { console.log(`--  no detail link on ${list}`); continue; }
  const res = await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
  const bad = await page.getByText(/Something went wrong|Application error/).count();
  const ok = res?.status() === 200 && !bad;
  if (!ok) failed++;
  console.log(`${ok ? "OK " : "ERR"} ${res?.status()} ${href}`);
  if (!ok || process.env.SHOTS) await page.screenshot({ path: `${OUT}/detail${list.replace(/\//g, "_")}.png`, fullPage: true });
}

console.log(`\n${pages.length} pages, ${failed} failures, ${errors.length} browser errors`);
for (const e of [...new Set(errors)].slice(0, 30)) console.log(e);
await browser.close();
process.exit(failed ? 1 : 0);
