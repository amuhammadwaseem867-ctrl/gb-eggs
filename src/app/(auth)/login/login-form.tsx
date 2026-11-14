"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerFirstAdmin, signIn } from "@/app/actions/auth";

export function LoginForm({ firstRun, next }: { firstRun: boolean; next: string }) {
  const [state, action, pending] = useActionState(firstRun ? registerFirstAdmin : signIn, null);
  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <h2 className="font-heading text-2xl font-semibold">{firstRun ? "Create the administrator" : "Welcome back"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {firstRun
            ? "No accounts exist yet. The first account becomes the system administrator."
            : "Sign in to your GB Eggs account."}
        </p>
      </div>
      <input type="hidden" name="next" value={next} />
      {firstRun ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="full_name">Full name</Label>
          <Input id="full_name" name="full_name" autoComplete="name" required />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-10" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete={firstRun ? "new-password" : "current-password"} minLength={8} required className="h-10" />
      </div>
      {state && !state.ok ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      ) : null}
      {state && state.ok && state.message ? (
        <p role="status" className="rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm text-accent-foreground">{state.message}</p>
      ) : null}
      <Button type="submit" size="lg" className="h-10" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {firstRun ? "Create administrator" : "Sign in"}
      </Button>
      {!firstRun ? (
        <p className="text-center text-xs text-muted-foreground">Accounts are created by your administrator in Settings → Users.</p>
      ) : null}
    </form>
  );
}
