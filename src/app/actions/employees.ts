"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAction } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const bulkSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rows: z.array(z.object({ employee_id: z.uuid(), status: z.enum(["present", "absent", "leave", "half_day", "holiday"]) })).min(1),
});

/** Saves a whole day's attendance sheet in one upsert. */
export async function saveAttendanceSheet(input: z.input<typeof bulkSchema>): Promise<ActionResult> {
  try {
    const v = bulkSchema.parse(input);
    await requireAction("employees", "edit");
    const supabase = await createClient();
    const { error } = await supabase
      .from("attendance")
      .upsert(v.rows.map((r) => ({ ...r, attendance_date: v.date })), { onConflict: "employee_id,attendance_date" });
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath("/employees");
    return { ok: true, message: `Attendance saved for ${v.rows.length} employees` };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}

const genSchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}-01$/) });

/**
 * Creates pending salary records for every active employee that has none for
 * the month, using basic salary and the month's attendance (absences deducted
 * pro-rata over 26 working days).
 */
export async function generatePayroll(input: z.input<typeof genSchema>): Promise<ActionResult> {
  try {
    const { month } = genSchema.parse(input);
    await requireAction("employees", "create");
    const supabase = await createClient();
    const end = new Date(`${month}T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    const monthEnd = end.toISOString().slice(0, 10);
    const [{ data: emps }, { data: existing }, { data: att }, { data: adv }] = await Promise.all([
      supabase.from("employees").select("id, basic_salary").eq("status", "active"),
      supabase.from("salary_records").select("employee_id").eq("salary_month", month).neq("status", "void"),
      supabase.from("attendance").select("employee_id, status").gte("attendance_date", month).lte("attendance_date", monthEnd),
      supabase.from("employee_advances").select("employee_id, amount, recovered_amount").eq("status", "posted"),
    ]);
    const have = new Set((existing ?? []).map((r) => r.employee_id));
    const rows = (emps ?? [])
      .filter((e) => !have.has(e.id))
      .map((e) => {
        const mine = (att ?? []).filter((a) => a.employee_id === e.id);
        const present = mine.filter((a) => a.status === "present" || a.status === "holiday" || a.status === "leave").length + mine.filter((a) => a.status === "half_day").length * 0.5;
        const absent = mine.filter((a) => a.status === "absent").length + mine.filter((a) => a.status === "half_day").length * 0.5;
        const basic = Number(e.basic_salary);
        const deduction = Math.round((basic / 26) * absent);
        const outstanding = (adv ?? []).filter((a) => a.employee_id === e.id).reduce((s, a) => s + Number(a.amount) - Number(a.recovered_amount), 0);
        return {
          employee_id: e.id,
          salary_month: month,
          working_days: 26,
          present_days: present,
          basic_salary: basic,
          deductions: Math.min(deduction, basic),
          advance_deduction: Math.max(0, Math.min(outstanding, basic - Math.min(deduction, basic))),
        };
      });
    if (!rows.length) return { ok: true, message: "All active employees already have a salary record for this month" };
    const { error } = await supabase.from("salary_records").insert(rows);
    if (error) return { ok: false, error: friendlyError(error) };
    revalidatePath("/employees");
    return { ok: true, message: `Created ${rows.length} pending salary records` };
  } catch (e) {
    return { ok: false, error: friendlyError(e instanceof Error ? e.message : e) };
  }
}
