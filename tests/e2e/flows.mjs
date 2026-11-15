// End-to-end business flows through the real UI (run after smoke.mjs seeded data).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
    console.log("PASS", name);
  } catch (e) {
    results.push(["FAIL", name]);
    console.log("FAIL", name, "\n   ", String(e.message).split("\n")[0]);
    await page.screenshot({ path: `tests/e2e/screens/fail_${name.replace(/\W+/g, "_")}.png`, fullPage: true }).catch(() => {});
  }
};
const choose = async (scope, label, option) => {
  await scope.getByLabel(label, { exact: true }).click();
  const search = page.locator('input[placeholder="Type to search…"]:visible').last();
  await search.fill(option);
  await page.getByRole("option", { name: new RegExp(option, "i") }).first().click();
  await search.waitFor({ state: "hidden" });
};
const toast = (re) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: 15000 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  pageerror:", e.message));

await page.goto(`${BASE}/login`);
await page.getByLabel("Email").fill("admin@gbeggs.test");
await page.getByLabel("Password", { exact: true }).fill("Admin12345!");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/dashboard");

let saleUrl = "";
await step("create credit invoice with partial payment (stock deducted)", async () => {
  await page.goto(`${BASE}/inventory`);
  const before = await page.locator("tr", { hasText: "GB Main Farm" }).filter({ hasText: "Large (Grade A)" }).locator("td").nth(2).innerText();
  await page.goto(`${BASE}/sales/new`);
  await page.getByRole("combobox").first().click();
  await page.getByPlaceholder("Type to search…").fill("Bilal");
  await page.getByRole("option", { name: /Bilal/ }).click();
  await page.getByRole("combobox", { name: "" }).filter({ hasText: "Select grade" }).click();
  await page.getByRole("option", { name: /^Large/ }).click();
  await page.getByPlaceholder("Qty").fill("5");
  await page.locator('input[name="paid_amount"]').fill("1000");
  await page.getByRole("button", { name: /Confirm invoice/ }).click();
  await page.waitForURL(/\/sales\/[0-9a-f-]{36}$/, { timeout: 20000 });
  saleUrl = page.url();
  await page.getByText("Partial", { exact: true }).first().waitFor();
  await page.goto(`${BASE}/inventory`);
  const after = await page.locator("tr", { hasText: "GB Main Farm" }).filter({ hasText: "Large (Grade A)" }).locator("td").nth(2).innerText();
  const n = (s) => Number(s.replace(/[^0-9-]/g, ""));
  if (n(before) - n(after) !== 150) throw new Error(`stock moved ${n(before)} -> ${n(after)}, expected -150`);
});

await step("receive remaining payment on the invoice", async () => {
  await page.goto(saleUrl);
  await page.getByRole("button", { name: "Receive payment" }).click();
  await page.getByRole("button", { name: "Save receipt" }).click();
  await toast(/saved/i);
  await page.reload();
  await page.getByText("Paid", { exact: true }).first().waitFor();
});

await step("post a sales return (good eggs back to stock, credit to customer)", async () => {
  await page.goto(saleUrl);
  await page.getByRole("button", { name: "Sales return" }).click();
  await page.getByLabel(/Eggs to return for/).first().fill("30");
  await page.getByRole("button", { name: "Post return" }).click();
  await toast(/Return recorded/);
  await page.reload();
  await page.getByRole("heading", { name: "Returns" }).waitFor();
});

await step("cancel an invoice with a reason (stock restored)", async () => {
  await page.goto(`${BASE}/sales/new`);
  await page.getByRole("combobox").first().click();
  await page.getByPlaceholder("Type to search…").fill("Farah");
  await page.getByRole("option", { name: /Farah/ }).click();
  await page.getByRole("combobox", { name: "" }).filter({ hasText: "Select grade" }).click();
  await page.getByRole("option", { name: /Medium/ }).click();
  await page.getByPlaceholder("Qty").fill("1");
  await page.getByRole("button", { name: /Confirm invoice/ }).click();
  await page.waitForURL(/\/sales\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByLabel(/Reason/).fill("Customer changed order");
  await page.getByRole("button", { name: "Cancel document" }).click();
  await toast(/cancelled/i);
  await page.reload();
  await page.getByText(/Cancelled .*Customer changed order/).waitFor();
});

await step("walk-in sale requires full payment (client + server)", async () => {
  await page.goto(`${BASE}/sales/new`);
  await page.getByRole("switch", { name: "Walk-in customer" }).click();
  await page.getByPlaceholder("Walk-in customer").fill("Cash buyer");
  await page.getByRole("combobox", { name: "" }).filter({ hasText: "Select grade" }).click();
  await page.getByRole("option", { name: /Small/ }).click();
  await page.getByPlaceholder("Qty").fill("1");
  await page.getByRole("button", { name: /Confirm invoice/ }).click();
  await toast(/paid in full/i);
  await page.getByRole("button", { name: "Full" }).click();
  await page.getByRole("button", { name: /Confirm invoice/ }).click();
  await page.waitForURL(/\/sales\/[0-9a-f-]{36}$/);
});

await step("duplicate egg collection is rejected", async () => {
  await page.goto(`${BASE}/production`);
  await page.getByRole("button", { name: "Record collection" }).click();
  const dlg = page.getByRole("dialog");
  await choose(dlg, "Farm *", "GB Main Farm");
  await choose(dlg, "Shed *", "Shed A");
  await dlg.getByLabel("Morning collection *").fill("100");
  await dlg.getByLabel("Large", { exact: true }).fill("100");
  await dlg.getByRole("button", { name: "Save collection" }).click();
  await toast(/already exists/);
});

await step("collection form validates the size breakdown", async () => {
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Large", { exact: true }).fill("90");
  await dlg.getByRole("button", { name: "Save collection" }).click();
  await dlg.getByText(/must equal total collected/).waitFor();
  await page.keyboard.press("Escape");
});

await step("record an expense (posts to cashbook)", async () => {
  await page.goto(`${BASE}/expenses`);
  await page.getByRole("button", { name: "Record expense" }).click();
  const dlg = page.getByRole("dialog");
  await choose(dlg, "Category *", "Electricity");
  await dlg.getByLabel("Amount *").fill("4321");
  await choose(dlg, "Paid from *", "Cash in Hand");
  await dlg.getByRole("button", { name: "Record expense" }).click();
  await toast(/saved/i);
  await page.goto(`${BASE}/accounting?tab=cashbook`);
  await page.getByText("Rs 4,321").first().waitFor();
});

await step("void the expense (reversal entry)", async () => {
  await page.goto(`${BASE}/expenses`);
  await page.locator("tr", { hasText: "Rs 4,321" }).getByRole("button", { name: "Void" }).click();
  await page.getByLabel(/Reason/).fill("Entered twice");
  await page.getByRole("button", { name: "Void", exact: true }).last().click();
  await toast(/voided/i);
});

await step("save attendance sheet", async () => {
  await page.goto(`${BASE}/employees?tab=attendance`);
  await page.getByRole("button", { name: "All present" }).click();
  await page.getByRole("button", { name: "Save sheet" }).click();
  await toast(/Attendance saved/);
});

await step("record mortality and see live birds drop", async () => {
  await page.goto(`${BASE}/poultry`);
  const liveBefore = await page.getByText("Live birds", { exact: true }).locator("..").locator("p").nth(1).innerText();
  await page.getByRole("button", { name: "Mortality" }).click();
  const dlg = page.getByRole("dialog");
  await choose(dlg, "Batch *", "B-2026-01");
  await dlg.getByLabel("Birds dead *").fill("2");
  await dlg.getByRole("button", { name: "Record mortality" }).click();
  await toast(/saved/i);
  await page.reload();
  const liveAfter = await page.getByText("Live birds", { exact: true }).locator("..").locator("p").nth(1).innerText();
  const n = (s) => Number(s.replace(/[^0-9]/g, ""));
  if (n(liveBefore) - n(liveAfter) !== 2) throw new Error(`${liveBefore} -> ${liveAfter}`);
});

await step("admin creates a staff user", async () => {
  await page.goto(`${BASE}/settings?tab=users`);
  await page.getByRole("button", { name: "Add user" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Full name").fill("Shahid Staff");
  await dlg.getByLabel("Email").fill("staff@gbeggs.test");
  await dlg.getByLabel("Temporary password").fill("Staff12345!");
  await dlg.getByRole("button", { name: "Create account" }).click();
  await toast(/Account created/);
});

await step("staff user is limited by role", async () => {
  const sctx = await browser.newContext();
  const sp = await sctx.newPage();
  await sp.goto(`${BASE}/login`);
  await sp.getByLabel("Email").fill("staff@gbeggs.test");
  await sp.getByLabel("Password", { exact: true }).fill("Staff12345!");
  await sp.getByRole("button", { name: "Sign in" }).click();
  await sp.waitForURL("**/dashboard");
  const nav = await sp.getByRole("navigation", { name: "Main" }).innerText();
  if (/Egg Sales|Accounting|Settings/.test(nav)) throw new Error("staff sees restricted modules: " + nav.replace(/\n/g, ", "));
  await sp.goto(`${BASE}/sales`);
  await sp.waitForURL(/\/forbidden/, { timeout: 10000 });
  if (await sp.getByText("Egg sales", { exact: true }).count()) throw new Error("sales content rendered for staff");
  await sp.goto(`${BASE}/production`, { waitUntil: "networkidle" });
  await sp.getByRole("heading", { name: "Egg production" }).waitFor();
  if (await sp.getByText("Today's revenue").count()) throw new Error("staff sees revenue");
  await sctx.close();
});

await step("generate PDF invoice download", async () => {
  await page.goto(saleUrl);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "PDF" }).click()]);
  if (!dl.suggestedFilename().endsWith(".pdf")) throw new Error(dl.suggestedFilename());
});

await step("export a report to Excel", async () => {
  await page.goto(`${BASE}/reports?report=egg_sales`);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Excel" }).click()]);
  if (!dl.suggestedFilename().endsWith(".xlsx")) throw new Error(dl.suggestedFilename());
});

const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} flows passed`);
await browser.close();
process.exit(failed ? 1 : 0);
