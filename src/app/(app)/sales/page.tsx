import { DocumentList } from "@/components/documents/document-list";
import { requirePage } from "@/lib/auth";
import type { PageSearchProps } from "@/lib/data/query";

export const metadata = { title: "Egg sales" };

export default async function Page({ searchParams }: PageSearchProps) {
  const session = await requirePage("sales");
  return <DocumentList kind="sale" session={session} sp={await searchParams} />;
}
