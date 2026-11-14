import { PartyList } from "@/components/parties/party-pages";
import { requirePage } from "@/lib/auth";
import type { PageSearchProps } from "@/lib/data/query";

export const metadata = { title: "Customers" };

export default async function Page({ searchParams }: PageSearchProps) {
  const session = await requirePage("customers");
  return <PartyList type="customer" session={session} sp={await searchParams} />;
}
