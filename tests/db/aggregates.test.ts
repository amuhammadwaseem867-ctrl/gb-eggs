import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStock, asUser, closePool, createFixture, dbEnabled, type Fixture, num, rpc, sql, stock, today } from "./helpers";

describe.skipIf(!dbEnabled)("aggregates & damage voids", () => {
  let f: Fixture;
  let d: string;
  beforeAll(async () => {
    f = await createFixture("agg");
    d = await today();
    await addStock(f.farm, f.grades.LARGE, 600);
  });
  afterAll(closePool);

  it("voiding a damage restores stock; damages from returns cannot be voided", async () => {
    const [{ id }] = await asUser(f.manager, async (c) =>
      (await c.query("insert into egg_damages (damage_date, farm_id, grade_id, quantity) values (app_today(), $1, $2, 40) returning id", [f.farm, f.grades.LARGE])).rows,
    );
    expect(await stock(f.farm, f.grades.LARGE)).toBe(560);
    await expect(rpc(f.accountant, "void_stock_record", "egg_damage", id, "x")).rejects.toThrow(/Permission denied/);
    await rpc(f.admin, "void_stock_record", "egg_damage", id, "Miscounted");
    expect(await stock(f.farm, f.grades.LARGE)).toBe(600);
  });

  it("document_totals matches the underlying invoices", async () => {
    for (const paid of [0, 900, 1800]) {
      await rpc(f.manager, "save_egg_sale", {
        customer_id: f.customer, farm_id: f.farm, sale_date: d, confirm: true, paid_amount: paid, cash_account_id: f.cash,
        items: [{ grade_id: f.grades.LARGE, unit_code: "tray", unit_qty: 2, unit_price: 900 }],
      });
    }
    const t = await rpc<Record<string, number>>(f.accountant, "document_totals", "egg_sale", d, d, f.customer, null, null);
    expect(num(t.confirmed)).toBe(3);
    expect(num(t.total)).toBe(5400);
    expect(num(t.paid)).toBe(2700);
    expect(num(t.balance)).toBe(2700);
  });

  it("cashbook_opening equals all movements before the date", async () => {
    const opening = await rpc<number>(f.accountant, "cashbook_opening", f.cash, "2999-01-01");
    const [{ b }] = await sql<{ b: string }>("select balance b from v_cash_account_balances where id = $1", [f.cash]);
    expect(num(opening)).toBe(num(b));
  });

  it("aggregates respect RLS (staff sees nothing)", async () => {
    const t = await rpc<Record<string, number>>(f.staff, "document_totals", "egg_sale", d, d, null, null, null);
    expect(num(t.confirmed)).toBe(0);
  });
});
