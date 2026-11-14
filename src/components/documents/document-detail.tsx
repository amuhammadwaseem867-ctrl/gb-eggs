import Link from "next/link";
import { ArrowLeft, CheckCircle2, Pencil, Printer, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { paymentStatus, StatusBadge } from "@/components/shared/status-badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { VoidButton } from "@/components/shared/void-button";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { ReturnDialog } from "@/components/documents/return-dialog";
import { InvoicePdfButton, type InvoicePdfData } from "@/components/documents/invoice-pdf-button";
import { can } from "@/lib/auth";
import { DOC, type DocKind } from "@/lib/data/documents";
import { loadOptions } from "@/lib/data/options";
import { todayIn } from "@/lib/data/query";
import { formatCurrency, formatDate, formatDateTime, formatNumber, titleCase } from "@/lib/format";
import type { Row, Session } from "@/lib/types";

export function buildPdfData(kind: DocKind, session: Session, doc: Row, items: Row[]): InvoicePdfData {
  const d = DOC[kind];
  const party = doc[d.partyTable];
  const s = session.settings;
  const totals: [string, number][] = [["Subtotal", Number(doc.subtotal)]];
  if (Number(doc.discount)) totals.push(["Discount", -Number(doc.discount)]);
  if (Number(doc.tax_amount)) totals.push([`${s.tax_label} (${doc.tax_rate}%)`, Number(doc.tax_amount)]);
  if (Number(doc.additional_charges)) totals.push(["Other charges", Number(doc.additional_charges)]);
  totals.push(["Total", Number(doc.total_amount)]);
  if (Number(doc.returned_amount)) totals.push(["Returns", -Number(doc.returned_amount)]);
  totals.push(["Paid", Number(doc.paid_amount)], ["Balance due", Number(doc.balance_due)]);
  return {
    title: kind === "sale" ? "Sales invoice" : "Purchase invoice",
    number: doc[d.no],
    date: formatDate(doc[d.date]),
    status: titleCase(doc.status),
    company: { name: s.company_name, address: s.address, phone: s.phone, email: s.email, ntn: s.ntn_number },
    party: {
      label: kind === "sale" ? "Bill to" : "Supplier",
      name: party?.name ?? doc.walk_in_name ?? "Walk-in customer",
      business: party?.business_name,
      phone: party?.phone ?? doc.walk_in_phone,
      address: party?.address,
    },
    lines: items.map((i) => ({
      description: i.egg_grades?.name ?? "Eggs",
      qty: `${formatNumber(i.unit_qty)} ${i.unit_code}`,
      eggs: i.quantity_eggs,
      price: Number(i[d.price]),
      amount: Number(i.line_total),
    })),
    totals,
    footer: kind === "sale" ? s.invoice_footer : null,
  };
}

export async function DocumentDetail({ kind, session, data }: { kind: DocKind; session: Session; data: { doc: Row; items: Row[]; payments: Row[]; returns: Row[] } }) {
  const d = DOC[kind];
  const isSale = kind === "sale";
  const { doc, items, payments, returns } = data;
  const party = doc[d.partyTable];
  const today = todayIn(session.settings.timezone);
  const options = await loadOptions(["cashAccounts", isSale ? "customers" : "suppliers"]);
  const status = doc.status as string;
  const net = Number(doc.total_amount) - Number(doc.returned_amount);
  const canEdit = can(session, d.module, "edit");
  const canCancel = can(session, d.module, "delete");
  const canPay = can(session, "accounting", "create") || can(session, d.module, "create");

  const itemCols: Column[] = [
    { key: "grade", header: "Grade", cell: (r) => <span className="font-medium">{r.egg_grades?.name}</span> },
    { key: "qty", header: "Quantity", align: "right", cell: (r) => `${formatNumber(r.unit_qty)} ${r.unit_code}` },
    { key: "eggs", header: "Eggs", align: "right", cell: (r) => formatNumber(r.quantity_eggs) },
    { key: "price", header: isSale ? "Price / unit" : "Rate / unit", align: "right", cell: (r) => formatCurrency(r[d.price]) },
    { key: "line_total", header: "Amount", align: "right", cell: (r) => formatCurrency(r.line_total) },
    { key: "returned", header: "Returned", align: "right", cell: (r) => (r.returned_eggs ? formatNumber(r.returned_eggs) : "—") },
  ];
  const payCols: Column[] = [
    { key: "payment_no", header: "Voucher", cell: (r) => <span className="font-medium">{r.payment_no}</span> },
    { key: "payment_date", header: "Date", cell: (r) => formatDate(r.payment_date) },
    { key: "dir", header: "Type", cell: (r) => (isSale ? (r.direction === "in" ? "Receipt" : "Refund") : r.direction === "out" ? "Payment" : "Refund") },
    { key: "method", header: "Method", cell: (r) => titleCase(r.method) },
    { key: "acc", header: "Account", hideOnMobile: true, cell: (r) => r.cash_accounts?.name },
    { key: "amount", header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (can(session, "accounting", "delete") && r.status === "posted" ? <VoidButton rpc="void_payment" args={{ p_id: r.id }} what="payment" /> : null) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="no-print w-fit">
        <Link href={d.base}><ArrowLeft /> {isSale ? "Sales" : "Purchases"}</Link>
      </Button>
      <PageHeader
        eyebrow={isSale ? "Sales invoice" : "Purchase invoice"}
        title={doc[d.no]}
        description={`${party?.name ?? doc.walk_in_name ?? "Walk-in"} · ${formatDate(doc[d.date])} · ${doc.farms?.name}`}
        actions={
          <>
            {status === "confirmed" ? <StatusBadge status={paymentStatus(net, Number(doc.balance_due))} /> : <StatusBadge status={status} />}
            {status === "draft" && canEdit ? (
              <>
                <Button asChild variant="outline"><Link href={`${d.base}/${doc.id}/edit`}><Pencil /> Edit</Link></Button>
                {(!isSale || doc.customer_id) ? (
                  <ConfirmAction rpc={isSale ? "confirm_egg_sale" : "confirm_egg_purchase"} args={{ p_id: doc.id }} destructive={false} title="Confirm this document?" description={isSale ? "Stock will be deducted from the location. Confirmed invoices cannot be edited." : "Stock will be added to the location."} confirmLabel="Confirm" trigger={<Button><CheckCircle2 /> Confirm</Button>} />
                ) : null}
                <ConfirmAction rpc="delete_draft" args={{ p_kind: kind, p_id: doc.id }} title="Delete this draft?" description="Drafts have no stock or cash effect. This permanently removes the draft." confirmLabel="Delete draft" trigger={<Button variant="destructive"><Trash2 /> Delete</Button>} />
              </>
            ) : null}
            {status === "confirmed" && canPay && (isSale ? doc.customer_id : true) && Number(doc.balance_due) > 0 ? (
              <EntityDialog
                entity={isSale ? "customer_payment" : "supplier_payment"}
                options={options}
                today={today}
                label={isSale ? "Receive payment" : "Pay supplier"}
                fixed={{ [d.party]: doc[d.party], doc_type: d.docType, doc_id: doc.id, direction: isSale ? "in" : "out" }}
                initial={{ amount: doc.balance_due }}
              />
            ) : null}
            {status === "confirmed" && canEdit && items.some((i) => i.returned_eggs < i.quantity_eggs) ? (
              <ReturnDialog
                kind={kind}
                docId={doc.id}
                today={today}
                items={items.map((i) => ({ id: i.id, grade: i.egg_grades?.name, quantity_eggs: i.quantity_eggs, returned_eggs: i.returned_eggs, line_total: Number(i.line_total) }))}
                subtotal={Number(doc.subtotal)}
                discount={Number(doc.discount)}
                taxRate={Number(doc.tax_rate ?? 0)}
                balanceDue={Number(doc.balance_due)}
                walkIn={isSale && !doc.customer_id}
                accounts={options.cashAccounts ?? []}
              />
            ) : null}
            {isSale && status !== "draft" ? (
              <Button asChild variant="outline"><Link href={`${d.base}/${doc.id}/print`} target="_blank"><Printer /> Print</Link></Button>
            ) : null}
            <InvoicePdfButton data={buildPdfData(kind, session, doc, items)} />
            {status !== "cancelled" && canCancel && returns.length === 0 ? (
              <ConfirmAction
                rpc={isSale ? "cancel_egg_sale" : "cancel_egg_purchase"}
                args={{ p_id: doc.id }}
                requireReason
                title={`Cancel ${doc[d.no]}?`}
                description="Stock effects are reversed and any payments on this document are voided with reversing cashbook entries. The document is kept as cancelled for the audit trail."
                confirmLabel="Cancel document"
                trigger={<Button variant="destructive"><XCircle /> Cancel</Button>}
              />
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Items</CardTitle></CardHeader>
          <CardContent className="px-0 pb-0">
            <DataTable columns={itemCols} rows={items} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Totals</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Line label="Subtotal" v={doc.subtotal} />
            {Number(doc.discount) ? <Line label="Discount" v={-doc.discount} /> : null}
            {Number(doc.tax_amount) ? <Line label={`${session.settings.tax_label} (${doc.tax_rate}%)`} v={doc.tax_amount} /> : null}
            {Number(doc.additional_charges) ? <Line label="Other charges" v={doc.additional_charges} /> : null}
            <Line label="Total" v={doc.total_amount} bold />
            {Number(doc.returned_amount) ? <Line label="Returns credited" v={-doc.returned_amount} /> : null}
            <Line label="Paid (net)" v={doc.paid_amount} />
            <Line label={Number(doc.balance_due) < 0 ? "Credit in customer's favour" : "Balance due"} v={doc.balance_due} bold danger={Number(doc.balance_due) > 0} />
            {status === "cancelled" ? <p className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">Cancelled {formatDateTime(doc.cancelled_at)}: {doc.cancel_reason}</p> : null}
            {doc.notes ? <p className="mt-2 rounded-md bg-muted p-2 text-xs">{doc.notes}</p> : null}
            {!isSale && doc.supplier_invoice_no ? <p className="text-xs text-muted-foreground">Supplier invoice: {doc.supplier_invoice_no}</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-semibold">Payments</h2>
        <DataTable columns={payCols} rows={payments} empty={<p className="p-6 text-center text-sm text-muted-foreground">No payments recorded.</p>} />
      </div>

      {returns.length ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">Returns</h2>
          <DataTable
            columns={[
              { key: "return_no", header: "Return", cell: (r) => <span className="font-medium">{r.return_no}</span> },
              { key: "return_date", header: "Date", cell: (r) => formatDate(r.return_date) },
              { key: "items", header: "Items", cell: (r) => (r[d.returnItems] as Row[]).map((i) => `${formatNumber(i.quantity_eggs)} × ${i.egg_grades?.name}${i.condition === "damaged" ? " (damaged)" : ""}`).join(", ") },
              { key: "reason", header: "Reason", hideOnMobile: true, cell: (r) => r.reason ?? "—" },
              { key: "total_amount", header: "Credit", align: "right", cell: (r) => formatCurrency(r.total_amount) },
              { key: "refund_amount", header: "Refunded", align: "right", cell: (r) => formatCurrency(r.refund_amount) },
            ]}
            rows={returns}
          />
        </div>
      ) : null}
    </div>
  );
}

function Line({ label, v, bold, danger }: { label: string; v: number | string; bold?: boolean; danger?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "border-t pt-2 font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className={`tabular ${danger ? "text-destructive" : ""}`}>{formatCurrency(v)}</span>
    </div>
  );
}
