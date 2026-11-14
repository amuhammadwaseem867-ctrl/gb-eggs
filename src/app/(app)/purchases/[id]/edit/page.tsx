import { notFound, redirect } from "next/navigation";
import { InvoiceForm } from "@/components/documents/invoice-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/auth";
import { DOC, loadDocument, loadInvoiceFormProps } from "@/lib/data/documents";
import { isUuid } from "@/lib/data/query";

export const metadata = { title: "Edit draft" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage("purchases", "edit");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await loadDocument("purchase", id);
  if (!data) notFound();
  const d = DOC.purchase;
  if (data.doc.status !== "draft") redirect(`${d.base}/${id}`);
  const props = await loadInvoiceFormProps("purchase", session);
  const doc = data.doc;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Edit draft ${doc[d.no]}`} />
      <InvoiceForm
        {...props}
        initial={{
          id,
          party_id: doc[d.party] ?? "",
          walk_in: !doc[d.party],
          walk_in_name: doc.walk_in_name ?? "",
          walk_in_phone: doc.walk_in_phone ?? "",
          supplier_invoice_no: doc.supplier_invoice_no ?? "",
          farm_id: doc.farm_id,
          date: doc[d.date],
          discount: String(doc.discount),
          additional_charges: String(doc.additional_charges),
          notes: doc.notes ?? "",
          items: data.items.map((i) => ({ grade_id: i.grade_id, unit_code: i.unit_code, unit_qty: String(i.unit_qty), price: String(i[d.price]) })),
        }}
      />
    </div>
  );
}
