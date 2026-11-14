import { notFound } from "next/navigation";
import { PartyDetail } from "@/components/parties/party-pages";
import { requirePage } from "@/lib/auth";
import { isUuid, type SearchParams } from "@/lib/data/query";

export const metadata = { title: "Customers" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const session = await requirePage("customers");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const view = await PartyDetail({ type: "customer", id, session, sp: await searchParams });
  if (!view) notFound();
  return view;
}
