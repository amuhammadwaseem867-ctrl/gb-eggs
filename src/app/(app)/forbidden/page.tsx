import type { PageSearchProps } from "@/lib/data/query";
import Link from "next/link";
import { ShieldAlert } from "@/components/icons";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Access denied" };

export default async function ForbiddenPage({ searchParams }: PageSearchProps) {
  const sp = await searchParams;
  const mod = typeof sp.module === "string" ? sp.module : null;
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[oklch(0.72_0.18_15)] to-[oklch(0.58_0.21_355)] text-white shadow-[0_12px_28px_-10px_oklch(0.6_0.2_10/0.6)]">
        <ShieldAlert className="size-8" />
      </span>
      <h1 className="text-xl font-semibold">Access denied</h1>
      <p className="text-sm text-muted-foreground">
        Your role does not have access to {mod ? <strong className="capitalize">{mod}</strong> : "this page"}. Ask an administrator to update your permissions.
      </p>
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
