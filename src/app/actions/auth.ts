"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { safeNext } from "@/lib/safe-next";

const credentials = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export async function signIn(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message };
  redirect(safeNext(formData.get("next")));
}

/** One-time administrator registration: only allowed while no account exists. */
export async function registerFirstAdmin(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = credentials
    .extend({ full_name: z.string().trim().min(2, "Enter your name") })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), full_name: formData.get("full_name") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: hasUsers } = await supabase.rpc("app_has_users");
  if (hasUsers) return { ok: false, error: "Setup is already complete. Ask an administrator for an account." };
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name } },
  });
  if (error) return { ok: false, error: error.message };
  if (!data.session) {
    return { ok: true, message: "Account created. Check your email to confirm it, then sign in." };
  }
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
