import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addStock, asUser, closePool, createFixture, dbEnabled, type Fixture, num, rpc, sql, stock, today } from "./helpers";

describe.skipIf(!dbEnabled)("egg stock, purchases, sales & returns", () => {
  let f: Fixture;
  let d: string;

  beforeAll(async () => {
    f = await createFixture("stk");
    d = await today();
  });
  afterAll(closePool);

  const sale = (over: Record<string, unknown> = {}) => ({
    customer_id: f.customer,
    farm_id: f.farm,
    sale_date: d,
    confirm: true,
    items: [{ grade_id: f.grades.LARGE, unit_code: "tray", unit_qty: 2, unit_price: 900 }],
    ...over,
  });

  it("confirmed purchases increase stock (packaging converted to eggs)", async () => {
    const id = await rpc<string>(f.manager, "save_egg_purchase", {
      supplier_id: f.supplier,
      farm_id: f.farm,
      purchase_date: d,
      supplier_invoice_no: "SUP-1",
      confirm: true,
      discount: 100,
      additional_charges: 50,
      items: [
        { grade_id: f.grades.LARGE, unit_code: "tray", unit_qty: 10, rate: 800 },
        { grade_id: f.grades.MEDIUM, unit_code: "egg", unit_qty: 45, rate: 25 },
      ],
    });
    const [p] = await sql("select * from egg_purchases where id = $1", [id]);
    expect(p.status).toBe("confirmed");
    expect(num(p.subtotal)).toBe(8000 + 1125);
    expect(num(p.total_amount)).toBe(9125 - 100 + 50);
    expect(await stock(f.farm, f.grades.LARGE)).toBe(300);
    expect(await stock(f.farm, f.grades.MEDIUM)).toBe(45);
  });

  it("draft purchases do not touch stock until confirmed", async () => {
    const id = await rpc<string>(f.manager, "save_egg_purchase", {
      supplier_id: f.supplier,
      farm_id: f.farm,
      purchase_date: d,
      confirm: false,
      items: [{ grade_id: f.grades.XL, unit_code: "tray", unit_qty: 1, rate: 900 }],
    });
    expect(await stock(f.farm, f.grades.XL)).toBe(0);
    await rpc(f.manager, "confirm_egg_purchase", id);
    expect(await stock(f.farm, f.grades.XL)).toBe(30);
  });

  it("rejects fractional eggs and duplicate supplier invoices", async () => {
    await expect(
      rpc(f.manager, "save_egg_purchase", {
        supplier_id: f.supplier, farm_id: f.farm, purchase_date: d, confirm: true,
        items: [{ grade_id: f.grades.LARGE, unit_code: "tray", unit_qty: 0.5001, rate: 800 }],
      }),
    ).rejects.toThrow(/whole number/);
    await expect(
      rpc(f.manager, "save_egg_purchase", {
        supplier_id: f.supplier, farm_id: f.farm, purchase_date: d, supplier_invoice_no: "SUP-1", confirm: true,
        items: [{ grade_id: f.grades.LARGE, unit_code: "tray", unit_qty: 1, rate: 800 }],
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it("confirmed sales deduct stock and record partial payment", async () => {
    await addStock(f.farm, f.grades.LARGE, 3000);
    const before = await stock(f.farm, f.grades.LARGE);
    const id = await rpc<string>(f.manager, "save_egg_sale", {
      ...sale(),
      discount: 100,
      additional_charges: 200,
      paid_amount: 1000,
      payment_method: "cash",
      cash_account_id: f.cash,
    });
    expect(await stock(f.farm, f.grades.LARGE)).toBe(before - 60);
    const [s] = await sql("select * from egg_sales where id = $1", [id]);
    expect(num(s.total_amount)).toBe(1800 - 100 + 200);
    expect(num(s.paid_amount)).toBe(1000);
    expect(num(s.balance_due)).toBe(900);
    expect(s.invoice_no).toMatch(/^GB-INV-\d{6}$/);
  });

  it("never sells more than is in stock", async () => {
    const before = await stock(f.farm, f.grades.LARGE);
    await expect(
      rpc(f.manager, "save_egg_sale", sale({ items: [{ grade_id: f.grades.LARGE, unit_code: "egg", unit_qty: before + 1, unit_price: 30 }] })),
    ).rejects.toThrow(/Insufficient stock/);
    expect(await stock(f.farm, f.grades.LARGE)).toBe(before);
    expect(num((await sql("select count(*) from egg_sales where farm_id = $1 and status = 'draft'", [f.farm]))[0].count)).toBe(0);
  });

  it("only allows negative stock when an administrator enables it", async () => {
    await sql("update app_settings set allow_negative_stock = true");
    try {
      const before = await stock(f.farm, f.grades.SMALL);
      await rpc(f.manager, "save_egg_sale", sale({ items: [{ grade_id: f.grades.SMALL, unit_code: "egg", unit_qty: 10, unit_price: 20 }] }));
      expect(await stock(f.farm, f.grades.SMALL)).toBe(before - 10);
    } finally {
      await sql("update app_settings set allow_negative_stock = false");
    }
    await addStock(f.farm, f.grades.SMALL, 10);
  });

  it("prevents double-selling under concurrency (row lock)", async () => {
    await addStock(f.farm, f.grades.XL, 70); // 30 + 70 = 100 on hand
    const xl = await stock(f.farm, f.grades.XL);
    expect(xl).toBe(100);
    const attempt = () =>
      rpc(f.manager, "save_egg_sale", sale({ items: [{ grade_id: f.grades.XL, unit_code: "egg", unit_qty: 60, unit_price: 33 }] }))
        .then(() => "ok")
        .catch((e: Error) => e.message);
    const results = await Promise.all([attempt(), attempt(), attempt()]);
    expect(results.filter((r) => r === "ok")).toHaveLength(1);
    expect(results.filter((r) => /Insufficient stock/.test(r))).toHaveLength(2);
    expect(await stock(f.farm, f.grades.XL)).toBe(40);
  });

  it("walk-in sales must be paid in full", async () => {
    await expect(
      rpc(f.manager, "save_egg_sale", sale({ customer_id: null, walk_in_name: "Cash buyer" })),
    ).rejects.toThrow(/Walk-in sales must be paid in full/);
    const id = await rpc<string>(f.manager, "save_egg_sale", {
      ...sale({ customer_id: null, walk_in_name: "Cash buyer" }),
      paid_amount: 1800, payment_method: "cash", cash_account_id: f.cash,
    });
    const [s] = await sql("select balance_due from egg_sales where id = $1", [id]);
    expect(num(s.balance_due)).toBe(0);
  });

  it("supports multiple payments, blocks overpayment and voids reverse the cashbook", async () => {
    const id = await rpc<string>(f.manager, "save_egg_sale", sale());
    const pay = (amount: number) =>
      rpc<string>(f.accountant, "record_payment", {
        party_type: "customer", customer_id: f.customer, direction: "in", amount, method: "cash",
        cash_account_id: f.cash, payment_date: d, doc_type: "egg_sale", doc_id: id,
      });
    await pay(500);
    const p2 = await pay(700);
    await expect(pay(601)).rejects.toThrow(/exceeds the outstanding balance/);
    let [s] = await sql("select paid_amount, balance_due from egg_sales where id = $1", [id]);
    expect(num(s.paid_amount)).toBe(1200);
    expect(num(s.balance_due)).toBe(600);

    await rpc(f.accountant, "void_payment", p2, "Cheque bounced");
    [s] = await sql("select paid_amount, balance_due from egg_sales where id = $1", [id]);
    expect(num(s.balance_due)).toBe(1300);
    const txns = await sql("select direction, amount, reversal_of from financial_transactions where reference_id = $1 order by created_at", [p2]);
    expect(txns).toHaveLength(2);
    expect(txns[1].direction).toBe("out");
    expect(txns[1].reversal_of).not.toBeNull();
  });

  it("cancelling an invoice restores stock and reverses its payments", async () => {
    const before = await stock(f.farm, f.grades.LARGE);
    const cashBefore = num((await sql("select balance from v_cash_account_balances where id = $1", [f.cash]))[0].balance);
    const id = await rpc<string>(f.manager, "save_egg_sale", { ...sale(), paid_amount: 1800, payment_method: "cash", cash_account_id: f.cash });
    expect(await stock(f.farm, f.grades.LARGE)).toBe(before - 60);
    await expect(rpc(f.manager, "cancel_egg_sale", id, "x")).rejects.toThrow(/Permission denied/);
    await rpc(f.admin, "cancel_egg_sale", id, "Wrong customer");
    expect(await stock(f.farm, f.grades.LARGE)).toBe(before);
    const cashAfter = num((await sql("select balance from v_cash_account_balances where id = $1", [f.cash]))[0].balance);
    expect(cashAfter).toBe(cashBefore);
    const [s] = await sql("select status, paid_amount from egg_sales where id = $1", [id]);
    expect(s.status).toBe("cancelled");
    expect(num(s.paid_amount)).toBe(0);
    await expect(rpc(f.admin, "cancel_egg_sale", id, "again")).rejects.toThrow(/already cancelled/);
  });

  it("sales returns restock good eggs, write off damaged ones and credit the customer", async () => {
    const id = await rpc<string>(f.manager, "save_egg_sale", {
      ...sale({ items: [{ grade_id: f.grades.LARGE, unit_code: "tray", unit_qty: 4, unit_price: 900 }] }),
      discount: 360, // 10 % discount
      paid_amount: 3240, payment_method: "cash", cash_account_id: f.cash,
    });
    const [item] = await sql("select id from egg_sale_items where sale_id = $1", [id]);
    const before = await stock(f.farm, f.grades.LARGE);
    const balanceBefore = num((await sql("select customer_balance($1) b", [f.customer]))[0].b);

    const ret = await rpc<string>(f.manager, "create_sales_return", {
      sale_id: id, return_date: d, reason: "Cracked on delivery",
      refund_amount: 810, cash_account_id: f.cash, payment_method: "cash",
      items: [{ sale_item_id: item.id, quantity_eggs: 30, condition: "good" }],
    });
    const ret2 = await rpc<string>(f.manager, "create_sales_return", {
      sale_id: id, return_date: d,
      items: [{ sale_item_id: item.id, quantity_eggs: 30, condition: "damaged" }],
    });

    expect(await stock(f.farm, f.grades.LARGE)).toBe(before + 30); // only good eggs restocked
    const [r1] = await sql("select total_amount, refund_amount from sales_returns where id = $1", [ret]);
    expect(num(r1.total_amount)).toBe(810); // 30 eggs * 30/egg * 0.9
    expect(num(r1.refund_amount)).toBe(810);
    const [dmg] = await sql("select quantity, affects_stock from egg_damages where sales_return_id = $1", [ret2]);
    expect(dmg.quantity).toBe(30);
    expect(dmg.affects_stock).toBe(false);

    const [s] = await sql("select returned_amount, paid_amount, balance_due from egg_sales where id = $1", [id]);
    expect(num(s.returned_amount)).toBe(1620);
    expect(num(s.paid_amount)).toBe(3240 - 810);
    expect(num(s.balance_due)).toBe(-810); // customer holds a credit of 810
    const balanceAfter = num((await sql("select customer_balance($1) b", [f.customer]))[0].b);
    expect(balanceAfter).toBe(balanceBefore - 810);

    await expect(
      rpc(f.manager, "create_sales_return", { sale_id: id, return_date: d, items: [{ sale_item_id: item.id, quantity_eggs: 61, condition: "good" }] }),
    ).rejects.toThrow(/only 60 remain/);
    await expect(rpc(f.admin, "cancel_egg_sale", id, "x")).rejects.toThrow(/returns recorded/);
  });

  it("purchase returns reduce stock and supplier payable; cancelling a purchase reverses stock", async () => {
    const id = await rpc<string>(f.manager, "save_egg_purchase", {
      supplier_id: f.supplier, farm_id: f.store, purchase_date: d, confirm: true,
      items: [{ grade_id: f.grades.MEDIUM, unit_code: "tray", unit_qty: 5, rate: 750 }],
    });
    const balanceBefore = num((await sql("select supplier_balance($1) b", [f.supplier]))[0].b);
    const [item] = await sql("select id from egg_purchase_items where purchase_id = $1", [id]);
    await rpc(f.manager, "create_purchase_return", {
      purchase_id: id, return_date: d, items: [{ purchase_item_id: item.id, quantity_eggs: 30 }],
    });
    expect(await stock(f.store, f.grades.MEDIUM)).toBe(120);
    expect(num((await sql("select supplier_balance($1) b", [f.supplier]))[0].b)).toBe(balanceBefore - 750);

    const id2 = await rpc<string>(f.manager, "save_egg_purchase", {
      supplier_id: f.supplier, farm_id: f.store, purchase_date: d, confirm: true,
      items: [{ grade_id: f.grades.MEDIUM, unit_code: "tray", unit_qty: 1, rate: 750 }],
    });
    expect(await stock(f.store, f.grades.MEDIUM)).toBe(150);
    await rpc(f.admin, "cancel_egg_purchase", id2, "Entered twice");
    expect(await stock(f.store, f.grades.MEDIUM)).toBe(120);
  });

  it("cannot cancel a purchase whose eggs were already sold", async () => {
    const id = await rpc<string>(f.manager, "save_egg_purchase", {
      supplier_id: f.supplier, farm_id: f.store, purchase_date: d, confirm: true,
      items: [{ grade_id: f.grades.DIRTY, unit_code: "egg", unit_qty: 50, rate: 15 }],
    });
    await rpc(f.manager, "save_egg_sale", sale({ farm_id: f.store, items: [{ grade_id: f.grades.DIRTY, unit_code: "egg", unit_qty: 40, unit_price: 18 }] }));
    await expect(rpc(f.admin, "cancel_egg_purchase", id, "x")).rejects.toThrow(/Insufficient stock/);
  });

  it("transfers move stock between locations and the ledger reconciles", async () => {
    await sql(
      "insert into egg_stock_transfers (transfer_date, from_farm_id, to_farm_id, grade_id, quantity) values (app_today(), $1, $2, $3, 30)",
      [f.farm, f.store, f.grades.LARGE],
    );
    for (const farm of [f.farm, f.store]) {
      const rows = await sql<{ grade_id: string; quantity: number; ledger: string }>(
        `select i.grade_id, i.quantity, (select sum(quantity) from egg_stock_movements m where m.farm_id = i.farm_id and m.grade_id = i.grade_id) ledger
           from egg_inventory i where i.farm_id = $1`,
        [farm],
      );
      for (const r of rows) expect(r.quantity).toBe(num(r.ledger));
    }
    const summary = await sql<Record<string, string>>("select * from egg_stock_summary(app_today() - 1, app_today(), $1)", [f.farm]);
    for (const g of summary) {
      const closing =
        num(g.opening) + num(g.production) + num(g.purchases) + num(g.sale_returns) + num(g.adjustments_in) +
        num(g.transfers_in) - num(g.sales) - num(g.damages) - num(g.returns_out) - num(g.adjustments_out) - num(g.transfers_out);
      expect(closing).toBe(num(g.closing));
    }
  });

  it("stock ledger rows are immutable", async () => {
    await expect(sql("update egg_stock_movements set quantity = 1")).rejects.toThrow(/immutable/);
    await expect(sql("delete from financial_transactions")).rejects.toThrow(/immutable/);
    await expect(asUser(f.admin, (c) => c.query("update egg_inventory set quantity = 999999"))).resolves.toBeDefined();
    expect(num((await sql("select count(*) from egg_inventory where quantity = 999999"))[0].count)).toBe(0);
  });
});
