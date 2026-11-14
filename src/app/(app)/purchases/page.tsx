import { DocumentList } from "@/components/documents/document-list";
import { requirePage } from "@/lib/auth";
import type { PageSearchProps } from "@/lib/data/query";

export const metadata = { title: "Egg purchases" };

export default async function Page({ searchParams }: PageSearchProps) {
  const session = await requirePage("purchases");
  return <DocumentList kind="purchase" session={session} sp={await searchParams} />;
}
