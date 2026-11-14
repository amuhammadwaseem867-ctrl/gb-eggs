import { PartyList } from "@/components/parties/party-pages";
import { requirePage } from "@/lib/auth";
import type { PageSearchProps } from "@/lib/data/query";

export const metadata = { title: "Suppliers" };

export default async function Page({ searchParams }: PageSearchProps) {
  const session = await requirePage("suppliers");
  return <PartyList type="supplier" session={session} sp={await searchParams} />;
}
