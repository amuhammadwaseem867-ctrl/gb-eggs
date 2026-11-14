import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, closePool, createFixture, dbEnabled, type Fixture, num, rpc, sql, stock, today } from "./helpers";

describe.skipIf(!dbEnabled)("poultry, production, feed, medicine, payroll & accounting", () => {
  let f: Fixture;
  let d: string;

  beforeAll(async () => {
    f = await createFixture("ops", 1000);
    d = await today();
  });
  afterAll(closePool);

  const live = async (batch = f.batch) => num((await sql("select batch_live_birds($1) n", [batch]))[0].n);

  describe("flock management", () => {
    it("live birds = opening + purchases + transfers in - mortality - sales - transfers out", async () => {
      const [{ id: other }] = await sql<{ id: string }>(
        `insert into chicken_batches (batch_code, farm_id, shed_id, placement_date, opening_birds)
         values ('B-ops-2', $1, $2, app_today() - 30, 200) returning id`,
        [f.farm, f.shed],
      );
      await asUser(f.manager, async (c) => {
        await c.query(
          "insert into chicken_purchases (batch_id, supplier_id, purchase_date, quantity, rate) values ($1, $2, app_today(), 100, 1000)",
          [f.batch, f.supplier],
        );
        await c.query("insert into chicken_transfers (from_batch_id, to_batch_id, transfer_date, quantity) values ($1, $2, app_today(), 50)", [other, f.batch]);
        await c.query("insert into mortality_records (batch_id, record_date, quantity, cause) values ($1, app_today(), 7, 'Heat')", [f.batch]);
        await c.query(
          "insert into chicken_sales (batch_id, customer_id, sale_date, quantity, rate, total_amount) values ($1, $2, app_today(), 20, 600, 12000)",
          [f.batch, f.customer],
        );
        await c.query("insert into chicken_transfers (from_batch_id, to_batch_id, transfer_date, quantity) values ($1, $2, app_today(), 3)", [f.batch, other]);
      });
      expect(await live()).toBe(1000 + 100 + 50 - 7 - 20 - 3);
      expect(await live(other)).toBe(200 - 50 + 3);
      const [v] = await sql("select live_birds, mortality, sold_birds from v_chicken_batches where id = $1", [f.batch]);
      expect(v.live_birds).toBe(1120);
      expect(num(v.mortality)).toBe(7);
    });

    it("rejects removing more birds than are alive", async () => {
      await expect(
        asUser(f.staff, (c) => c.query("insert into mortality_records (batch_id, record_date, quantity) values ($1, app_today(), 5000)", [f.batch])),
      ).rejects.toThrow(/Only 1120 live birds/);
    });

    it("voiding mortality restores the flock (manager may void, staff may not)", async () => {
      const [{ id }] = await asUser(f.staff, async (c) =>
        (await c.query("insert into mortality_records (batch_id, record_date, quantity) values ($1, app_today(), 10) returning id", [f.batch])).rows,
      );
      expect(await live()).toBe(1110);
      await expect(rpc(f.staff, "void_flock_event", "mortality", id, "typo")).rejects.toThrow(/Permission denied/);
      await rpc(f.manager, "void_flock_event", "mortality", id, "Typo");
      expect(await live()).toBe(1120);
    });
  });

  describe("egg production", () => {
    const collection = (over: Record<string, number | string> = {}) => ({
      collection_date: d, farm_id: f.farm, shed_id: f.shed, morning_eggs: 600, evening_eggs: 400,
      small_eggs: 100, medium_eggs: 300, large_eggs: 400, xl_eggs: 100, dirty_eggs: 60, broken_eggs: 30, rejected_eggs: 10,
      ...over,
    });
    const insert = (row: Record<string, unknown>, user = f.staff) =>
      asUser(user, async (c) => {
        const cols = Object.keys(row);
        const r = await c.query(
          `insert into egg_collections (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
          Object.values(row),
        );
        return r.rows[0];
      });

    it("records a collection, snapshots live hens and stocks saleable eggs by size", async () => {
      const row = await insert(collection());
      expect(row.total_eggs).toBe(1000);
      expect(row.saleable_eggs).toBe(960);
      // All laying batches housed in the shed count: 1120 + 153 in the second batch.
      expect(row.live_hens).toBe(1273);
      expect(await stock(f.farm, f.grades.LARGE)).toBe(400);
      expect(await stock(f.farm, f.grades.DIRTY)).toBe(60);
      const [rep] = await sql("select * from production_report(app_today(), app_today(), 'day', $1)", [f.farm]);
      expect(num(rep.production_rate)).toBeCloseTo((960 / 1273) * 100, 2);
    });

    it("prevents duplicate and inconsistent records", async () => {
      await expect(insert(collection())).rejects.toThrow(/egg_collections_unique_shed_day/);
      const yesterday = { collection_date: new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10) };
      await expect(insert(collection({ ...yesterday, broken_eggs: 31 }))).rejects.toThrow(/breakdown_matches/);
      await expect(
        insert(collection({ ...yesterday, morning_eggs: 1000, evening_eggs: 400, medium_eggs: 700 })),
      ).rejects.toThrow(/exceed the number of live hens/);
      await expect(insert(collection({ collection_date: "2999-01-01" }))).rejects.toThrow(/future/);
    });

    it("posted collections cannot be edited; voiding reverses stock", async () => {
      const [row] = await sql("select id from egg_collections where shed_id = $1 and status = 'posted'", [f.shed]);
      await expect(sql("update egg_collections set large_eggs = 1 where id = $1", [row.id])).rejects.toThrow(/cannot be edited/);
      await expect(rpc(f.staff, "void_egg_collection", row.id, "x")).rejects.toThrow(/Permission denied/);
      await rpc(f.manager, "void_egg_collection", row.id, "Counted twice");
      expect(await stock(f.farm, f.grades.LARGE)).toBe(0);
      await insert(collection()); // can be re-entered once the old one is void
      expect(await stock(f.farm, f.grades.LARGE)).toBe(400);
    });

    it("damages reduce stock as an inventory loss", async () => {
      await asUser(f.manager, (c) =>
        c.query("insert into egg_damages (damage_date, farm_id, grade_id, quantity, reason) values (app_today(), $1, $2, 25, 'Dropped tray')", [f.farm, f.grades.LARGE]),
      );
      expect(await stock(f.farm, f.grades.LARGE)).toBe(375);
      const dash = await rpc<Record<string, number>>(f.admin, "dashboard_summary");
      expect(num(dash.broken_today)).toBeGreaterThanOrEqual(65);
    });
  });

  describe("feed & medicine", () => {
    let feed: string;
    it("uses a weighted-average cost and blocks over-consumption", async () => {
      [{ id: feed }] = await sql<{ id: string }>(
        "insert into feed_inventory (name, opening_stock, opening_cost) values ('Test mash', 1000, 100) returning id",
      );
      await asUser(f.manager, (c) =>
        c.query("insert into feed_purchases (purchase_date, supplier_id, feed_id, quantity, unit_cost) values (app_today(), $1, $2, 1000, 120)", [f.supplier, feed]),
      );
      let [fi] = await sql("select current_stock, avg_unit_cost from feed_inventory where id = $1", [feed]);
      expect(num(fi.current_stock)).toBe(2000);
      expect(num(fi.avg_unit_cost)).toBe(110);
      await asUser(f.staff, (c) =>
        c.query("insert into feed_consumption (consumption_date, farm_id, shed_id, feed_id, quantity) values (app_today(), $1, $2, $3, 150)", [f.farm, f.shed, feed]),
      );
      [fi] = await sql("select current_stock from feed_inventory where id = $1", [feed]);
      expect(num(fi.current_stock)).toBe(1850);
      const [fc] = await sql("select total_cost from feed_consumption where feed_id = $1", [feed]);
      expect(num(fc.total_cost)).toBe(16500);
      await expect(
        asUser(f.staff, (c) =>
          c.query("insert into feed_consumption (consumption_date, farm_id, shed_id, feed_id, quantity) values (app_today(), $1, $2, $3, 5000)", [f.farm, f.shed, feed]),
        ),
      ).rejects.toThrow(/Insufficient feed stock/);
      await expect(sql("update feed_inventory set current_stock = 1 where id = $1", [feed])).rejects.toThrow(/maintained automatically/);
    });

    it("tracks medicine batches, issues first-expiry-first-out and refuses expired stock", async () => {
      const [{ id: med }] = await sql<{ id: string }>("insert into medicines (name, unit) values ('Test vitamin', 'l') returning id");
      await asUser(f.manager, async (c) => {
        await c.query(
          `insert into medicine_movements (movement_date, medicine_id, movement_type, batch_no, expiry_date, quantity, unit_cost, supplier_id)
           values (app_today(), $1, 'purchase', 'LATE', app_today() + 300, 5, 100, $2),
                  (app_today(), $1, 'purchase', 'SOON', app_today() + 10, 5, 90, $2)`,
          [med, f.supplier],
        );
        await c.query(
          "insert into medicine_movements (movement_date, medicine_id, movement_type, quantity, chicken_batch_id) values (app_today(), $1, 'usage', 2, $2)",
          [med, f.batch],
        );
      });
      const batches = await sql("select batch_no, quantity_on_hand from medicine_batches where medicine_id = $1 order by batch_no", [med]);
      expect(batches.map((b) => [b.batch_no, num(b.quantity_on_hand)])).toEqual([["LATE", 5], ["SOON", 3]]);
      expect(num((await sql("select current_stock from medicines where id = $1", [med]))[0].current_stock)).toBe(8);
      await expect(
        sql(
          "insert into medicine_movements (movement_date, medicine_id, movement_type, batch_no, expiry_date, quantity, unit_cost, supplier_id) values (app_today(), $1, 'purchase', 'OLD', app_today() - 1, 1, 1, $2)",
          [med, f.supplier],
        ),
      ).rejects.toThrow(/already expired/);
    });
  });

  describe("payroll", () => {
    it("recovers advances from salary and posts net pay to the cashbook", async () => {
      const [{ id: emp }] = await sql<{ id: string }>(
        "insert into employees (employee_code, full_name, position, joining_date, basic_salary) values ('E-ops', 'Worker', 'Shed worker', app_today() - 100, 40000) returning id",
      );
      await asUser(f.accountant, (c) =>
        c.query("insert into employee_advances (employee_id, advance_date, amount, cash_account_id) values ($1, app_today(), 8000, $2)", [emp, f.cash]),
      );
      await expect(
        asUser(f.accountant, (c) =>
          c.query("insert into salary_records (employee_id, salary_month, basic_salary, advance_deduction) values ($1, date_trunc('month', app_today()), 40000, 9000)", [emp]),
        ),
      ).rejects.toThrow(/exceeds outstanding advances/);
      const [{ id: sal }] = await asUser(f.accountant, async (c) =>
        (await c.query(
          "insert into salary_records (employee_id, salary_month, basic_salary, allowances, deductions, advance_deduction) values ($1, date_trunc('month', app_today()), 40000, 2000, 500, 5000) returning id",
          [emp],
        )).rows,
      );
      await rpc(f.accountant, "pay_salary", sal, f.cash, "cash", d);
      const [s] = await sql("select status, gross_salary, net_salary from salary_records where id = $1", [sal]);
      expect(s.status).toBe("paid");
      expect(num(s.gross_salary)).toBe(41500);
      expect(num(s.net_salary)).toBe(36500);
      const [adv] = await sql("select recovered_amount from employee_advances where employee_id = $1", [emp]);
      expect(num(adv.recovered_amount)).toBe(5000);
      const [t] = await sql("select amount from financial_transactions where reference_id = $1", [sal]);
      expect(num(t.amount)).toBe(36500);
      await expect(rpc(f.accountant, "pay_salary", sal, f.cash, "cash", d)).rejects.toThrow(/already paid/);
      await expect(asUser(f.accountant, (c) => c.query("update salary_records set basic_salary = 1 where id = $1", [sal]))).resolves.toBeDefined();
      expect(num((await sql("select basic_salary from salary_records where id = $1", [sal]))[0].basic_salary)).toBe(40000);
    });
  });

  describe("accounting", () => {
    it("collections on old invoices are cash, not revenue", async () => {
      const [{ id: cust }] = await sql<{ id: string }>("insert into customers (name) values ('Old debtor') returning id");
      const yesterday = new Date(Date.parse(d) - 86400000).toISOString().slice(0, 10);
      await sql("insert into egg_stock_adjustments (adjustment_date, farm_id, grade_id, adjustment_type, quantity, reason) values ($1, $2, $3, 'increase', 600, 't')", [
        yesterday, f.store, f.grades.XL,
      ]);
      const inv = await rpc<string>(f.manager, "save_egg_sale", {
        customer_id: cust, farm_id: f.store, sale_date: yesterday, confirm: true,
        items: [{ grade_id: f.grades.XL, unit_code: "tray", unit_qty: 10, unit_price: 1000 }],
      });
      const before = await rpc<{ revenue: { egg_sales: number }; cash: Record<string, number> }>(f.accountant, "financial_summary", d, d);
      await rpc(f.accountant, "record_payment", {
        party_type: "customer", customer_id: cust, direction: "in", amount: 6000, method: "bank_transfer",
        cash_account_id: f.cash, payment_date: d, doc_type: "egg_sale", doc_id: inv,
      });
      const after = await rpc<{ revenue: { egg_sales: number }; cash: Record<string, number> }>(f.accountant, "financial_summary", d, d);
      expect(num(after.revenue.egg_sales)).toBe(num(before.revenue.egg_sales));
      expect(num(after.cash.receipts_previous_receivables) - num(before.cash.receipts_previous_receivables)).toBe(6000);
      const ySummary = await rpc<{ revenue: { egg_sales: number } }>(f.accountant, "financial_summary", yesterday, yesterday);
      expect(num(ySummary.revenue.egg_sales)).toBeGreaterThanOrEqual(10000);
      expect(num((await sql("select customer_balance($1) b", [cust]))[0].b)).toBe(4000);
    });

    it("expenses post to the cashbook and voiding posts a reversal", async () => {
      const [{ id: cat }] = await sql<{ id: string }>("select id from expense_categories where name = 'Electricity'");
      const bal = async () => num((await sql("select balance from v_cash_account_balances where id = $1", [f.cash]))[0].balance);
      const start = await bal();
      const [{ id }] = await asUser(f.accountant, async (c) =>
        (await c.query("insert into expenses (expense_no, expense_date, category_id, amount, cash_account_id) values (null, app_today(), $1, 5000, $2) returning id", [cat, f.cash])).rows,
      );
      expect(await bal()).toBe(start - 5000);
      await rpc(f.accountant, "void_cash_record", "expense", id, "Duplicate");
      expect(await bal()).toBe(start);
      await expect(rpc(f.accountant, "void_cash_record", "expense", id, "again")).rejects.toThrow(/already void/);
    });

    it("party ledger running balance matches the computed balance", async () => {
      const rows = await rpc<unknown>(f.accountant, "customer_balance", f.customer);
      const ledger = await asUser(f.accountant, async (c) => (await c.query("select * from party_ledger('customer', $1, null, null)", [f.customer])).rows);
      expect(num(ledger[ledger.length - 1].balance)).toBe(num(rows));
    });
  });

  describe("security", () => {
    it("the first account becomes admin, later sign-ups start as staff", async () => {
      const [{ role_code }] = await sql<{ role_code: string }>("select role_code from profiles order by created_at limit 1");
      expect(role_code).toBe("admin");
      await sql("insert into auth.users (email) values ('late@gb.test')");
      const [p] = await sql("select role_code from profiles where email = 'late@gb.test'");
      expect(p.role_code).toBe("staff");
    });

    it("anonymous users can read nothing", async () => {
      await expect(asUser(null, (c) => c.query("select * from customers"))).rejects.toThrow(/permission denied/);
      await expect(asUser(null, (c) => c.query("select public.dashboard_summary()"))).rejects.toThrow(/permission denied/);
      const r = await asUser(null, async (c) => (await c.query("select public.app_has_users() v")).rows[0].v);
      expect(r).toBe(true);
    });

    it("staff cannot see sales, money or other modules", async () => {
      const sales = await asUser(f.staff, async (c) => (await c.query("select count(*) from egg_sales")).rows[0].count);
      expect(num(sales)).toBe(0);
      const txns = await asUser(f.staff, async (c) => (await c.query("select count(*) from financial_transactions")).rows[0].count);
      expect(num(txns)).toBe(0);
      await expect(
        rpc(f.staff, "save_egg_sale", { customer_id: f.customer, farm_id: f.farm, sale_date: d, items: [{ grade_id: f.grades.LARGE, unit_code: "egg", unit_qty: 1, unit_price: 1 }] }),
      ).rejects.toThrow(/Permission denied/);
      await expect(
        asUser(f.staff, (c) => c.query("insert into customers (name) values ('x')")),
      ).rejects.toThrow(/row-level security/);
      const dash = await rpc<Record<string, unknown>>(f.staff, "dashboard_summary");
      expect(dash.revenue_today).toBeNull();
      expect(dash.cash_balance).toBeNull();
    });

    it("clients cannot write stock or cash ledgers directly, nor call internal functions", async () => {
      await expect(
        asUser(f.admin, (c) => c.query("insert into egg_inventory (farm_id, grade_id, quantity) values ($1, $2, 10)", [f.store, f.grades.SMALL])),
      ).rejects.toThrow(/row-level security/);
      await expect(
        asUser(f.admin, (c) => c.query("select public._egg_stock_move($1, $2, 1000, 'adjustment_in', app_today(), null, null)", [f.store, f.grades.SMALL])),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(f.admin, (c) => c.query("update payments set amount = 1")),
      ).resolves.toBeDefined();
      const changed = await sql("select count(*) from payments where amount = 1");
      expect(num(changed[0].count)).toBe(0);
    });

    it("only admins can change roles or permissions and every change is audited", async () => {
      await asUser(f.manager, (c) => c.query("update profiles set role_code = 'admin' where id = $1", [f.manager]));
      expect((await sql("select role_code from profiles where id = $1", [f.manager]))[0].role_code).toBe("manager");
      await asUser(f.admin, (c) => c.query("update profiles set role_code = 'accountant' where id = $1", [f.staff]));
      expect((await sql("select role_code from profiles where id = $1", [f.staff]))[0].role_code).toBe("accountant");
      const [log] = await sql("select changed_by, old_data->>'role_code' old_role from audit_logs where table_name = 'profiles' and record_id = $1 order by id desc limit 1", [f.staff]);
      expect(log.changed_by).toBe(f.admin);
      expect(log.old_role).toBe("staff");
      const visible = await asUser(f.manager, async (c) => (await c.query("select count(*) from audit_logs")).rows[0].count);
      expect(num(visible)).toBe(0);
    });
  });
});
