import { notFound } from "next/navigation";
import { DocumentDetail } from "@/components/documents/document-detail";
import { requirePage } from "@/lib/auth";
import { loadDocument } from "@/lib/data/documents";
import { isUuid } from "@/lib/data/query";

export const metadata = { title: "Egg purchases" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePage("purchases");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await loadDocument("purchase", id);
  if (!data) notFound();
  return <DocumentDetail kind="purchase" session={session} data={data} />;
}
