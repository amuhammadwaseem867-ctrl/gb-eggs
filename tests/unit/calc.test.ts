import { describe, expect, it } from "vitest";
import {
  closingStock, collectionTotals, customerBalance, eggsForUnit, invoiceTotals, liveBirds, netSalary,
  periodProductionRate, productionRate, returnCredit, splitEggs, splitReceipts, supplierBalance, weightedAverageCost,
} from "@/lib/calc";
import { buildSchema } from "@/lib/forms/schema";
import { ENTITIES } from "@/lib/forms/entities";
import { formatEggs } from "@/lib/format";

describe("packaging conversions", () => {
  it("converts trays, dozens and cartons into whole eggs", () => {
    expect(eggsForUnit(3, 30)).toBe(90);
    expect(eggsForUnit(2.5, 12)).toBe(30);
    expect(eggsForUnit(1, 360)).toBe(360);
    expect(() => eggsForUnit(0.5001, 30)).toThrow(/whole number/);
    expect(() => eggsForUnit(0, 30)).toThrow();
  });
  it("splits eggs into trays + loose eggs (also negative)", () => {
    expect(splitEggs(1234, 30)).toEqual({ units: 41, remainder: 4 });
    expect(splitEggs(-31, 30)).toEqual({ units: -1, remainder: -1 });
    expect(formatEggs(1234, 30)).toBe("1,234 eggs · 41 trays + 4");
  });
});

describe("invoice totals", () => {
  it("applies discount, tax on the discounted subtotal, and charges", () => {
    const t = invoiceTotals({ lines: [{ unitQty: 10, price: 900 }, { unitQty: 2.5, price: 330 }], discount: 250, additionalCharges: 500, taxRate: 5, paid: 5000 });
    expect(t.subtotal).toBe(9825);
    expect(t.tax).toBe(478.75);
    expect(t.total).toBe(10553.75);
    expect(t.balance).toBe(5553.75);
  });
  it("rejects discounts larger than the subtotal", () => {
    expect(() => invoiceTotals({ lines: [{ unitQty: 1, price: 100 }], discount: 101 })).toThrow(/Discount/);
  });
  it("rounds each line to paisa precision", () => {
    expect(invoiceTotals({ lines: [{ unitQty: 3, price: 0.335 }] }).lineTotals[0]).toBe(1.01);
  });
});

describe("flock & production", () => {
  it("live birds = opening + purchases + transfers in − mortality − sales − transfers out", () => {
    expect(liveBirds({ opening: 1000, purchases: 100, transfersIn: 50, mortality: 7, sales: 20, transfersOut: 3 })).toBe(1120);
  });
  it("production rate uses saleable eggs over live hens", () => {
    expect(productionRate(960, 1273)).toBe(75.41);
    expect(productionRate(100, 0)).toBeNull();
    expect(periodProductionRate([{ saleable: 900, hens: 1000 }, { saleable: 950, hens: 1000 }])).toBe(92.5);
  });
  it("collection breakdown must balance", () => {
    const c = { morning: 600, evening: 400, small: 100, medium: 300, large: 400, xl: 100, dirty: 60, broken: 30, rejected: 10 };
    expect(collectionTotals(c)).toMatchObject({ total: 1000, saleable: 960, losses: 40, balanced: true });
    expect(collectionTotals({ ...c, broken: 31 }).balanced).toBe(false);
  });
});

describe("stock", () => {
  it("closing = opening + production + purchases − sales − damages − returns out", () => {
    expect(closingStock({ opening: 1000, production: 5000, purchases: 600, sales: 5200, damages: 40, returnsOut: 30 })).toBe(1330);
    expect(closingStock({ opening: 10, saleReturns: 30, adjustmentsIn: 5, transfersIn: 60, adjustmentsOut: 2, transfersOut: 60 })).toBe(43);
  });
});

describe("returns & accounting", () => {
  it("return credit is the egg's share after discount, plus tax (charges not refunded)", () => {
    expect(returnCredit({ lineTotal: 3600, lineEggs: 120, qty: 30, subtotal: 3600, discount: 360, taxRate: 0 })).toEqual({ net: 810, tax: 0, total: 810 });
    expect(returnCredit({ lineTotal: 1000, lineEggs: 100, qty: 10, subtotal: 2000, discount: 0, taxRate: 17 }).total).toBe(117);
  });
  it("customer balance: invoices increase, receipts decrease, refunds increase", () => {
    expect(customerBalance({ opening: 1000, documents: 10000, returns: 810, paymentsIn: 6000, paymentsOut: 810 })).toBe(5000);
  });
  it("supplier balance: purchases increase, payments decrease, supplier refunds increase", () => {
    expect(supplierBalance({ opening: 35000, documents: 90000, returns: 750, paymentsOut: 60000, paymentsIn: 0 })).toBe(64250);
  });
  it("collections of old invoices are not counted as current-period revenue", () => {
    const r = splitReceipts([{ amount: 6000, docDate: "2026-10-31" }, { amount: 1000, docDate: "2026-11-02" }, { amount: 500, docDate: null }], "2026-11-01");
    expect(r).toEqual({ current: 1000, previous: 6000, onAccount: 500 });
  });
  it("feed uses weighted-average cost", () => {
    expect(weightedAverageCost(1000, 100, 1000, 120)).toBe(110);
    expect(weightedAverageCost(0, 100, 500, 130)).toBe(130);
  });
  it("net salary deducts advances but gross (expense) does not", () => {
    expect(netSalary({ basic: 40000, allowances: 2000, deductions: 500, advance: 5000 })).toEqual({ gross: 41500, net: 36500 });
  });
});

describe("form validation (shared client/server schemas)", () => {
  const collection = buildSchema(ENTITIES.egg_collection.fields, ENTITIES.egg_collection.refine);
  const base = {
    collection_date: "2026-11-14", farm_id: "a", shed_id: "b", morning_eggs: "600", evening_eggs: "400",
    small_eggs: "100", medium_eggs: "300", large_eggs: "400", xl_eggs: "100", dirty_eggs: "60", broken_eggs: "30", rejected_eggs: "10",
  };
  it("accepts a balanced collection and coerces numbers", () => {
    const r = collection.safeParse(base);
    expect(r.success).toBe(true);
    expect((r.data as Record<string, unknown>).morning_eggs).toBe(600);
  });
  it("rejects unbalanced, negative or fractional counts", () => {
    expect(collection.safeParse({ ...base, rejected_eggs: "11" }).success).toBe(false);
    expect(collection.safeParse({ ...base, broken_eggs: "-1" }).success).toBe(false);
    expect(collection.safeParse({ ...base, large_eggs: "399.5", small_eggs: "100.5" }).success).toBe(false);
  });
  it("requires an account when a payment is entered", () => {
    const s = buildSchema(ENTITIES.chicken_purchase.fields, ENTITIES.chicken_purchase.refine);
    const v = { batch_id: "x", supplier_id: "y", purchase_date: "2026-11-01", quantity: "100", rate: "1000", paid_amount: "5000", payment_method: "cash" };
    expect(s.safeParse(v).success).toBe(false);
    expect(s.safeParse({ ...v, cash_account_id: "acc" }).success).toBe(true);
    expect(s.safeParse({ ...v, paid_amount: "0" }).success).toBe(true);
  });
  it("salary month must be the first day of a month", () => {
    const s = buildSchema(ENTITIES.salary.fields, ENTITIES.salary.refine);
    const v = { employee_id: "e", salary_month: "2026-11-15", basic_salary: "40000" };
    expect(s.safeParse(v).success).toBe(false);
    expect(s.safeParse({ ...v, salary_month: "2026-11-01" }).success).toBe(true);
  });
});
