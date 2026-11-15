import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/env";
import { BrandMark } from "@/components/layout/brand";

export const metadata = { title: "Setup required" };

export default function SetupPage() {
  if (isSupabaseConfigured) redirect("/login");
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-xl rounded-3xl glass-strong p-8">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark />
          <h1 className="font-heading text-xl font-semibold">GB Eggs needs a Supabase project</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          The application is installed, but it has no database credentials. Create <code className="rounded bg-muted px-1">.env.local</code> from{" "}
          <code className="rounded bg-muted px-1">.env.example</code> and set:
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li><code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_URL</code> — Project Settings → API → Project URL</li>
          <li><code className="rounded bg-muted px-1">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> — the publishable (anon) key</li>
          <li><code className="rounded bg-muted px-1">SUPABASE_SERVICE_ROLE_KEY</code> — optional, server-only; enables creating users from Settings</li>
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">
          Then apply the migrations in <code className="rounded bg-muted px-1">supabase/migrations</code> and restart the server. See README.md for step-by-step instructions.
        </p>
      </div>
    </div>
  );
}
