import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { loadDocument } from "@/lib/data/documents";
import { isUuid } from "@/lib/data/query";
import { formatCurrency, formatDate, formatNumber, titleCase } from "@/lib/format";
import { BrandMark } from "@/components/layout/brand";
import { PrintButton } from "./print-button";

export const metadata = { title: "Print invoice" };

export default async function PrintInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage("sales");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await loadDocument("sale", id);
  if (!data) notFound();
  const { doc, items, payments } = data;
  const s = session.settings;
  const c = doc.customers;
  const rows: [string, number][] = [["Subtotal", doc.subtotal]];
  if (Number(doc.discount)) rows.push(["Discount", -doc.discount]);
  if (Number(doc.tax_amount)) rows.push([`${s.tax_label} (${doc.tax_rate}%)`, doc.tax_amount]);
  if (Number(doc.additional_charges)) rows.push(["Delivery / other", doc.additional_charges]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>
      <article className="print-area rounded-xl border bg-white p-8 text-[13px] text-slate-800 shadow-sm sm:p-10">
        <header className="flex flex-col justify-between gap-6 border-b pb-6 sm:flex-row">
          <div className="flex gap-3">
            {s.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.logo_url} alt="" className="size-12 rounded-lg object-contain" />
            ) : (
              <BrandMark className="size-12" />
            )}
            <div>
              <p className="font-heading text-xl font-bold text-slate-900">{s.company_name}</p>
              {s.address ? <p>{s.address}</p> : null}
              <p>{[s.phone, s.email].filter(Boolean).join(" · ")}</p>
              {s.ntn_number ? <p>NTN: {s.ntn_number}</p> : null}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="font-heading text-2xl font-semibold tracking-wide text-emerald-700 uppercase">{doc.status === "cancelled" ? "Cancelled invoice" : "Invoice"}</p>
            <p className="mt-1 font-medium">{doc.invoice_no}</p>
            <p>Date: {formatDate(doc.sale_date)}</p>
            <p>Status: {titleCase(doc.status)}</p>
          </div>
        </header>
        <section className="grid gap-4 py-6 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-emerald-700 uppercase">Bill to</p>
            <p className="mt-1 text-base font-semibold text-slate-900">{c?.name ?? doc.walk_in_name ?? "Walk-in customer"}</p>
            {c?.business_name ? <p>{c.business_name}</p> : null}
            {c?.address ? <p>{c.address}{c.city ? `, ${c.city}` : ""}</p> : null}
            {c?.phone ?? doc.walk_in_phone ? <p>{c?.phone ?? doc.walk_in_phone}</p> : null}
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold tracking-wider text-emerald-700 uppercase">Dispatched from</p>
            <p className="mt-1">{doc.farms?.name}</p>
          </div>
        </section>
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-100 text-left text-[11px] tracking-wider text-slate-600 uppercase">
              <th className="p-2">#</th>
              <th className="p-2">Description</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Eggs</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i, n) => (
              <tr key={i.id} className="border-b">
                <td className="p-2">{n + 1}</td>
                <td className="p-2 font-medium">{i.egg_grades?.name}</td>
                <td className="p-2 text-right tabular">{formatNumber(i.unit_qty)} {i.unit_code}</td>
                <td className="p-2 text-right tabular">{formatNumber(i.quantity_eggs)}</td>
                <td className="p-2 text-right tabular">{formatCurrency(i.unit_price)}</td>
                <td className="p-2 text-right tabular">{formatCurrency(i.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <section className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-1.5">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between"><dt className="text-slate-500">{k}</dt><dd className="tabular">{formatCurrency(v)}</dd></div>
            ))}
            <div className="flex justify-between border-t pt-2 text-base font-semibold text-slate-900"><dt>Total</dt><dd className="tabular">{formatCurrency(doc.total_amount)}</dd></div>
            {Number(doc.returned_amount) ? <div className="flex justify-between"><dt className="text-slate-500">Returns</dt><dd className="tabular">{formatCurrency(-doc.returned_amount)}</dd></div> : null}
            <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="tabular">{formatCurrency(doc.paid_amount)}</dd></div>
            <div className="flex justify-between font-semibold text-slate-900"><dt>Balance due</dt><dd className="tabular">{formatCurrency(doc.balance_due)}</dd></div>
          </dl>
        </section>
        {payments.filter((p) => p.status === "posted").length ? (
          <p className="mt-6 text-xs text-slate-500">
            Payments: {payments.filter((p) => p.status === "posted").map((p) => `${p.payment_no} ${formatDate(p.payment_date)} ${formatCurrency(p.amount)}`).join(" · ")}
          </p>
        ) : null}
        <footer className="mt-10 flex items-end justify-between gap-6 border-t pt-6 text-xs text-slate-500">
          <p>{s.invoice_footer}</p>
          <p className="border-t border-slate-400 px-6 pt-1">Authorised signature</p>
        </footer>
      </article>
    </div>
  );
}
