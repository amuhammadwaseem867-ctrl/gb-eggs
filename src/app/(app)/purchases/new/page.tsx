import { InvoiceForm } from "@/components/documents/invoice-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePage } from "@/lib/auth";
import { loadInvoiceFormProps } from "@/lib/data/documents";

export const metadata = { title: "New egg purchase" };

export default async function Page() {
  const session = await requirePage("purchases", "create");
  const props = await loadInvoiceFormProps("purchase", session);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New egg purchase" description="Quantities can be entered in eggs, dozens, trays or cartons; stock is tracked in individual eggs." />
      <InvoiceForm {...props} />
    </div>
  );
}
