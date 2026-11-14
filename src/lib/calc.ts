/**
 * Pure business calculations. The database is the source of truth (the same
 * rules are enforced in PostgreSQL); these mirror them for live form previews
 * and are unit-tested to stay in step.
 */

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Converts a quantity of a packaging unit (tray, dozen …) to whole eggs. */
export function eggsForUnit(unitQty: number, eggsPerUnit: number): number {
  if (!(unitQty > 0)) throw new Error("Quantity must be greater than zero");
  if (!(eggsPerUnit > 0)) throw new Error("Invalid packaging unit");
  const eggs = unitQty * eggsPerUnit;
  const rounded = Math.round(eggs);
  if (Math.abs(eggs - rounded) > 1e-9) throw new Error(`${unitQty} units is not a whole number of eggs`);
  return rounded;
}

/** Splits individual eggs into full packaging units and loose eggs. */
export function splitEggs(eggs: number, perUnit: number) {
  if (perUnit <= 0) return { units: 0, remainder: eggs };
  const sign = eggs < 0 ? -1 : 1;
  const abs = Math.abs(eggs);
  return { units: sign * Math.floor(abs / perUnit), remainder: sign * (abs % perUnit) };
}

export interface LineInput {
  unitQty: number;
  price: number;
}

export interface InvoiceTotalsInput {
  lines: LineInput[];
  discount?: number;
  additionalCharges?: number;
  taxRate?: number;
  paid?: number;
}

/** Same arithmetic as save_egg_sale / save_egg_purchase. */
export function invoiceTotals({ lines, discount = 0, additionalCharges = 0, taxRate = 0, paid = 0 }: InvoiceTotalsInput) {
  const lineTotals = lines.map((l) => round2((l.unitQty || 0) * (l.price || 0)));
  const subtotal = round2(lineTotals.reduce((a, b) => a + b, 0));
  if (discount < 0 || additionalCharges < 0) throw new Error("Amounts cannot be negative");
  if (discount > subtotal) throw new Error("Discount cannot exceed the subtotal");
  const tax = round2(((subtotal - discount) * taxRate) / 100);
  const total = round2(subtotal - discount + tax + additionalCharges);
  return { lineTotals, subtotal, discount, tax, additionalCharges, total, paid, balance: round2(total - paid) };
}

export interface FlockCounts {
  opening: number;
  purchases?: number;
  transfersIn?: number;
  mortality?: number;
  sales?: number;
  transfersOut?: number;
}

/** Current live birds = Opening + Purchases + Transfers In − Mortality − Sales − Transfers Out. */
export function liveBirds(c: FlockCounts) {
  return (
    c.opening + (c.purchases ?? 0) + (c.transfersIn ?? 0) - (c.mortality ?? 0) - (c.sales ?? 0) - (c.transfersOut ?? 0)
  );
}

/** Egg production rate = saleable eggs / average live laying hens × 100. */
export function productionRate(saleableEggs: number, avgLiveHens: number) {
  if (!(avgLiveHens > 0)) return null;
  return round2((saleableEggs / avgLiveHens) * 100);
}

/** Multi-day rate = Σ saleable / Σ hen-days × 100 (equivalent to the average daily rate). */
export function periodProductionRate(days: { saleable: number; hens: number }[]) {
  const s = days.reduce((a, d) => a + d.saleable, 0);
  const h = days.reduce((a, d) => a + d.hens, 0);
  return h > 0 ? round2((s / h) * 100) : null;
}

export interface CollectionBreakdown {
  morning: number;
  evening: number;
  small: number;
  medium: number;
  large: number;
  xl: number;
  dirty: number;
  broken: number;
  rejected: number;
}

export function collectionTotals(c: CollectionBreakdown) {
  const total = c.morning + c.evening;
  const graded = c.small + c.medium + c.large + c.xl + c.dirty + c.broken + c.rejected;
  const saleable = c.small + c.medium + c.large + c.xl + c.dirty;
  return { total, graded, saleable, losses: c.broken + c.rejected, balanced: total === graded && total > 0 };
}

export interface StockFlow {
  opening: number;
  production?: number;
  purchases?: number;
  saleReturns?: number;
  adjustmentsIn?: number;
  transfersIn?: number;
  sales?: number;
  damages?: number;
  returnsOut?: number;
  adjustmentsOut?: number;
  transfersOut?: number;
}

/** Closing = Opening + Production + Purchases − Sales − Damages − Returns out (± returns, adjustments, transfers). */
export function closingStock(f: StockFlow) {
  return (
    f.opening + (f.production ?? 0) + (f.purchases ?? 0) + (f.saleReturns ?? 0) + (f.adjustmentsIn ?? 0) +
    (f.transfersIn ?? 0) - (f.sales ?? 0) - (f.damages ?? 0) - (f.returnsOut ?? 0) - (f.adjustmentsOut ?? 0) -
    (f.transfersOut ?? 0)
  );
}

/**
 * Credit for returning `qty` eggs from an invoice line: the egg's share of the
 * line after the invoice discount, plus tax. Additional charges are not
 * refunded. Mirrors create_sales_return.
 */
export function returnCredit(args: {
  lineTotal: number;
  lineEggs: number;
  qty: number;
  subtotal: number;
  discount: number;
  taxRate: number;
}) {
  const factor = args.subtotal > 0 ? (args.subtotal - args.discount) / args.subtotal : 0;
  const net = round2((args.lineTotal / args.lineEggs) * args.qty * factor);
  const tax = round2((net * args.taxRate) / 100);
  return { net, tax, total: round2(net + tax) };
}

/** Weighted average unit cost after a purchase (feed). */
export function weightedAverageCost(stock: number, avgCost: number, qty: number, unitCost: number) {
  if (stock <= 0) return unitCost;
  return Math.round(((stock * avgCost + qty * unitCost) / (stock + qty)) * 10000) / 10000;
}

/** Net salary = basic + allowances + overtime − deductions − advance recovery. */
export function netSalary(s: { basic: number; allowances?: number; overtime?: number; deductions?: number; advance?: number }) {
  const gross = s.basic + (s.allowances ?? 0) + (s.overtime ?? 0) - (s.deductions ?? 0);
  return { gross: round2(gross), net: round2(gross - (s.advance ?? 0)) };
}

export interface PartyBalanceInput {
  opening: number;
  documents: number;
  returns: number;
  paymentsIn: number;
  paymentsOut: number;
}

/** Customer balance (positive = customer owes us). Payments received reduce it; refunds increase it. */
export function customerBalance(b: PartyBalanceInput) {
  return round2(b.opening + b.documents - b.returns - b.paymentsIn + b.paymentsOut);
}

/** Supplier balance (positive = we owe the supplier). */
export function supplierBalance(b: PartyBalanceInput) {
  return round2(b.opening + b.documents - b.returns - b.paymentsOut + b.paymentsIn);
}

/** Splits customer receipts into revenue-period collections vs. collections of older receivables. */
export function splitReceipts(
  receipts: { amount: number; docDate: string | null }[],
  periodStart: string,
) {
  let current = 0;
  let previous = 0;
  let onAccount = 0;
  for (const r of receipts) {
    if (!r.docDate) onAccount += r.amount;
    else if (r.docDate < periodStart) previous += r.amount;
    else current += r.amount;
  }
  return { current: round2(current), previous: round2(previous), onAccount: round2(onAccount) };
}
