import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { Row } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Profit & loss statement rendered from financial_summary(). */
export function ProfitAndLoss({ s }: { s: Row }) {
  const r = s.revenue;
  const c = s.costs;
  const cash = s.cash;
  const profit = Number(s.net_profit);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profit &amp; loss</CardTitle>
          <CardDescription>Accrual basis — revenue recognised on invoice date; tax excluded.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <Group title="Revenue" />
          <Item label="Egg sales (net of discount, incl. charges)" v={r.egg_sales} />
          <Item label="Less: sales returns" v={-r.sales_returns} />
          <Item label="Chicken sales" v={r.chicken_sales} />
          <Item label="Other income" v={r.other_income} />
          <Total label="Total revenue" v={r.total} />
          <Group title="Cost of purchases" />
          <Item label="Egg purchases (net of returns)" v={c.net_egg_purchases} />
          <Item label="Chicken purchases" v={c.chicken_purchases} />
          <Item label="Feed purchases" v={c.feed_purchases} />
          <Item label="Medicine purchases" v={c.medicine_purchases} />
          <Item label="Packaging purchases" v={c.packaging_purchases} />
          <Group title="Operating expenses" />
          {(c.expenses_by_category as Row[]).map((e) => (
            <Item key={e.category} label={e.category} v={e.amount} />
          ))}
          {(c.expenses_by_category as Row[]).length === 0 ? <Item label="No operating expenses" v={0} /> : null}
          <Item label="Salaries & wages (gross)" v={c.salaries} />
          <Total label="Total costs" v={c.total} />
          <div className={cn("mt-3 flex items-center justify-between rounded-lg px-3 py-3 text-base font-semibold", profit >= 0 ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive")}>
            <span>{profit >= 0 ? "Net profit" : "Net loss"}</span>
            <span className="tabular">{formatCurrency(profit)}</span>
          </div>
          {Number(r.tax_collected) > 0 ? <p className="mt-2 text-xs text-muted-foreground">Sales tax collected (liability, excluded above): {formatCurrency(r.tax_collected)}</p> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cash analysis</CardTitle>
          <CardDescription>Money collected against old invoices is a collection of receivables, not new revenue.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <Group title="Customer receipts" />
          <Item label="Against invoices of this period" v={cash.receipts_current_sales} />
          <Item label="Against earlier invoices (old receivables)" v={cash.receipts_previous_receivables} />
          <Item label="On account / advances" v={cash.receipts_on_account} />
          <Total label="Total received from customers" v={cash.customer_receipts} />
          <Item label="Refunds paid to customers" v={-cash.customer_refunds} />
          <Group title="Payments" />
          <Item label="Paid to suppliers (net of refunds)" v={-cash.supplier_payments} />
          <Group title="All accounts" />
          <Item label="Total cash in (excl. transfers)" v={cash.cash_in} />
          <Item label="Total cash out (excl. transfers)" v={-cash.cash_out} />
          <Total label="Net cash flow" v={cash.net_cash_flow} />
        </CardContent>
      </Card>
    </div>
  );
}

function Group({ title }: { title: string }) {
  return <p className="mt-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase first:mt-0">{title}</p>;
}
function Item({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-foreground/80">{label}</span>
      <span className={cn("tabular", Number(v) < 0 && "text-destructive")}>{formatCurrency(v)}</span>
    </div>
  );
}
function Total({ label, v }: { label: string; v: number | string }) {
  return (
    <div className="mt-1 flex items-center justify-between border-t pt-1.5 font-semibold">
      <span>{label}</span>
      <span className="tabular">{formatCurrency(v)}</span>
    </div>
  );
}
