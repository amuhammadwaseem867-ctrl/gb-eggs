"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, CalendarPlus, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/forms/search-select";
import { generatePayroll, saveAttendanceSheet } from "@/app/actions/employees";
import { runRpc } from "@/app/actions/entities";
import { PAYMENT_METHODS } from "@/lib/forms/schema";
import { formatCurrency } from "@/lib/format";
import type { Option } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "present", label: "P", title: "Present", cls: "data-[on=true]:bg-primary data-[on=true]:text-primary-foreground" },
  { value: "half_day", label: "½", title: "Half day", cls: "data-[on=true]:bg-warning data-[on=true]:text-foreground" },
  { value: "leave", label: "L", title: "Leave", cls: "data-[on=true]:bg-[oklch(0.6_0.12_250)] data-[on=true]:text-white" },
  { value: "absent", label: "A", title: "Absent", cls: "data-[on=true]:bg-destructive data-[on=true]:text-white" },
  { value: "holiday", label: "H", title: "Holiday", cls: "data-[on=true]:bg-muted-foreground data-[on=true]:text-white" },
] as const;

export function AttendanceSheet({ date, employees, canEdit }: { date: string; employees: { id: string; name: string; code: string; position: string; status: string | null }[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [state, setState] = React.useState<Record<string, string>>(() => Object.fromEntries(employees.map((e) => [e.id, e.status ?? ""])));
  const dirty = employees.some((e) => (e.status ?? "") !== state[e.id]);
  const save = () =>
    start(async () => {
      const rows = Object.entries(state).filter(([, s]) => s).map(([employee_id, status]) => ({ employee_id, status: status as "present" }));
      if (!rows.length) {
        toast.error("Mark at least one employee");
        return;
      }
      const res = await saveAttendanceSheet({ date, rows });
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        router.refresh();
      } else toast.error(res.error);
    });
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
        <p className="text-sm text-muted-foreground">{STATUSES.map((s) => `${s.label} = ${s.title}`).join(" · ")}</p>
        {canEdit ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setState(Object.fromEntries(employees.map((e) => [e.id, "present"])))}>All present</Button>
            <Button size="sm" onClick={save} disabled={pending || !dirty}>
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Save sheet
            </Button>
          </div>
        ) : null}
      </div>
      <ul className="divide-y">
        {employees.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{e.name}</p>
              <p className="text-xs text-muted-foreground">{e.code} · {e.position}</p>
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${e.name}`}>
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={state[e.id] === s.value}
                  title={s.title}
                  disabled={!canEdit}
                  data-on={state[e.id] === s.value}
                  onClick={() => setState({ ...state, [e.id]: s.value })}
                  className={cn("size-8 rounded-md border text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60", s.cls)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PaySalaryDialog({ id, name, amount, accounts, today }: { id: string; name: string; amount: number; accounts: Option[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [account, setAccount] = React.useState(accounts[0]?.value ?? "");
  const [method, setMethod] = React.useState("bank_transfer");
  const [date, setDate] = React.useState(today);
  const pay = () =>
    start(async () => {
      const res = await runRpc("pay_salary", { p_id: id, p_cash_account: account, p_method: method, p_date: date });
      if (res.ok) {
        toast.success(res.message ?? "Paid");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error);
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs"><Banknote /> Pay</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay salary — {name}</DialogTitle>
          <DialogDescription>Net pay of {formatCurrency(amount)} is posted to the cashbook. Advance recovery is applied to the oldest advances first.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5"><span className="text-sm font-medium">Paid from</span><SearchSelect value={account} onChange={setAccount} options={accounts} clearable={false} /></div>
          <div className="flex flex-col gap-1.5"><span className="text-sm font-medium">Method</span><SearchSelect value={method} onChange={setMethod} options={PAYMENT_METHODS} clearable={false} /></div>
          <div className="flex flex-col gap-1.5"><Label htmlFor="pay-date">Date</Label><Input id="pay-date" type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={pay} disabled={pending || !account}>{pending ? <Loader2 className="animate-spin" /> : null} Pay {formatCurrency(amount)}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GeneratePayrollButton({ month }: { month: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await generatePayroll({ month });
          if (res.ok) {
            toast.success(res.message ?? "Done");
            router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />} Generate payroll
    </Button>
  );
}
