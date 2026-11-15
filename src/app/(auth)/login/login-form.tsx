"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerFirstAdmin, signIn } from "@/app/actions/auth";

export function LoginForm({ firstRun, next }: { firstRun: boolean; next: string }) {
  const [state, action, pending] = useActionState(firstRun ? registerFirstAdmin : signIn, null);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <h2 className="font-heading text-[1.7rem] font-bold tracking-tight">{firstRun ? "Create the administrator" : "Welcome back"}</h2>
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
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={firstRun ? "new-password" : "current-password"}
            minLength={8}
            required
            className="h-11 pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            title={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </button>
        </div>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p>
      ) : null}
      {state && state.ok && state.message ? (
        <p role="status" className="rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm text-accent-foreground">{state.message}</p>
      ) : null}
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {firstRun ? "Create administrator" : "Sign in"}
      </Button>
      {!firstRun ? (
        <p className="text-center text-xs text-muted-foreground">Accounts are created by your administrator in Settings → Users.</p>
      ) : null}
    </form>
  );
}
