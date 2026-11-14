import { Banknote, HandCoins, IdCard, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterSelect, LinkTabs, SearchInput, Toolbar } from "@/components/shared/table-controls";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { VoidButton } from "@/components/shared/void-button";
import { AttendanceSheet, GeneratePayrollButton, PaySalaryDialog } from "@/components/employees/employee-widgets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { can, requirePage } from "@/lib/auth";
import { ENTITIES } from "@/lib/forms/entities";
import { loadOptions, sourcesOf } from "@/lib/data/options";
import { isDate, type PageSearchProps, paging, param, searchFilter, startOfMonth, todayIn } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, titleCase } from "@/lib/format";
import type { Row } from "@/lib/types";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: PageSearchProps) {
  const session = await requirePage("employees");
  const sp = await searchParams;
  const tab = param(sp, "tab") ?? "staff";
  const today = todayIn(session.settings.timezone);
  const supabase = await createClient();
  const options = await loadOptions(sourcesOf(ENTITIES.employee.fields, ENTITIES.employee_advance.fields, ENTITIES.salary.fields));
  const common = { options, today };
  const canCreate = can(session, "employees", "create");
  const canEdit = can(session, "employees", "edit");
  const canVoid = can(session, "employees", "delete");

  const [{ data: emps }, { data: todayAtt }, { data: adv }] = await Promise.all([
    supabase.from("employees").select("id, status, basic_salary"),
    supabase.from("attendance").select("status").eq("attendance_date", today),
    supabase.from("employee_advances").select("amount, recovered_amount").eq("status", "posted"),
  ]);
  const active = (emps ?? []).filter((e) => e.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Employees"
        description="Staff profiles, daily attendance, salary advances and monthly payroll."
        actions={canCreate ? <EntityDialog entity="employee" {...common} label="New employee" /> : null}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Active employees" value={active.length} icon={IdCard} tone="primary" />
        <StatCard label="Present today" value={(todayAtt ?? []).filter((a) => a.status === "present" || a.status === "half_day").length} sub={`${(todayAtt ?? []).length} marked`} icon={UserCheck} />
        <StatCard label="Monthly basic payroll" value={formatCurrency(active.reduce((a, e) => a + Number(e.basic_salary), 0))} icon={Banknote} tone="info" />
        <StatCard label="Outstanding advances" value={formatCurrency((adv ?? []).reduce((a, r) => a + Number(r.amount) - Number(r.recovered_amount), 0))} icon={HandCoins} tone="warning" />
      </div>
      <LinkTabs tabs={[{ value: "staff", label: "Staff" }, { value: "attendance", label: "Attendance" }, { value: "advances", label: "Advances" }, { value: "payroll", label: "Payroll" }]} />
      {tab === "staff" ? <StaffTab sp={sp} common={common} canEdit={canEdit} /> : null}
      {tab === "attendance" ? <AttendanceTab sp={sp} today={today} canEdit={canEdit} /> : null}
      {tab === "advances" ? <AdvancesTab common={common} canCreate={canCreate} canVoid={canVoid} /> : null}
      {tab === "payroll" ? <PayrollTab sp={sp} common={common} canCreate={canCreate} canEdit={canEdit} canVoid={canVoid} canPay={canEdit || can(session, "accounting", "create")} /> : null}
    </div>
  );
}

type Common = { options: Awaited<ReturnType<typeof loadOptions>>; today: string };

async function StaffTab({ sp, common, canEdit }: { sp: Record<string, string | string[] | undefined>; common: Common; canEdit: boolean }) {
  const supabase = await createClient();
  const { page, pageSize, from, to } = paging(sp);
  let q = supabase.from("employees").select("*, farms(name)", { count: "exact" }).order("status").order("full_name");
  const f = searchFilter(["full_name", "employee_code", "phone", "position", "cnic"], param(sp, "q"));
  if (f) q = q.or(f);
  const st = param(sp, "status");
  if (st) q = q.eq("status", st);
  const { data, count } = await q.range(from, to);
  const columns: Column[] = [
    { key: "employee_code", header: "ID", cell: (r) => <span className="font-medium">{r.employee_code}</span> },
    { key: "full_name", header: "Name", cell: (r) => <span className="font-medium">{r.full_name}</span> },
    { key: "position", header: "Position" },
    { key: "phone", header: "Phone", hideOnMobile: true, cell: (r) => r.phone ?? "—" },
    { key: "farm", header: "Location", hideOnMobile: true, cell: (r) => r.farms?.name ?? "—" },
    { key: "joining_date", header: "Joined", hideOnMobile: true, cell: (r) => formatDate(r.joining_date) },
    { key: "basic_salary", header: "Basic salary", align: "right", cell: (r) => formatCurrency(r.basic_salary) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canEdit ? <EntityDialog entity="employee" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <SearchInput placeholder="Name, ID, phone, CNIC…" />
        <FilterSelect param="status" placeholder="All statuses" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "terminated", label: "Terminated" }]} />
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} total={count ?? 0} page={page} pageSize={pageSize} />
    </div>
  );
}

async function AttendanceTab({ sp, today, canEdit }: { sp: Record<string, string | string[] | undefined>; today: string; canEdit: boolean }) {
  const date = isDate(param(sp, "date")) && param(sp, "date")! <= today ? param(sp, "date")! : today;
  const supabase = await createClient();
  const month = startOfMonth(date);
  const [{ data: emps }, { data: att }, { data: monthAtt }] = await Promise.all([
    supabase.from("employees").select("id, full_name, employee_code, position").eq("status", "active").order("full_name"),
    supabase.from("attendance").select("employee_id, status").eq("attendance_date", date),
    supabase.from("attendance").select("employee_id, status").gte("attendance_date", month).lte("attendance_date", date),
  ]);
  const list = (emps ?? []).map((e) => ({ id: e.id, name: e.full_name, code: e.employee_code, position: e.position, status: (att ?? []).find((a) => a.employee_id === e.id)?.status ?? null }));
  const summary = (emps ?? []).map((e) => {
    const m = (monthAtt ?? []).filter((a) => a.employee_id === e.id);
    const c = (s: string) => m.filter((a) => a.status === s).length;
    return { id: e.id, name: e.full_name, present: c("present"), half: c("half_day"), leave: c("leave"), absent: c("absent"), holiday: c("holiday") };
  });
  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="attendance" />
        <div className="flex flex-col gap-1">
          <label htmlFor="att-date" className="text-xs text-muted-foreground">Date</label>
          <Input id="att-date" type="date" name="date" defaultValue={date} max={today} className="h-9 w-44" />
        </div>
        <Button type="submit" variant="outline" size="sm" className="h-9">Open sheet</Button>
        <p className="text-sm text-muted-foreground">{formatDate(date, { weekday: "long" })}</p>
      </form>
      <AttendanceSheet key={`${date}-${list.map((e) => e.status ?? "").join("")}`} date={date} employees={list} canEdit={canEdit} />
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Month to date ({formatDate(month, { day: undefined })})</h2>
        <DataTable
          columns={[
            { key: "name", header: "Employee", cell: (r) => <span className="font-medium">{r.name}</span> },
            { key: "present", header: "Present", align: "right" },
            { key: "half", header: "Half days", align: "right" },
            { key: "leave", header: "Leave", align: "right" },
            { key: "absent", header: "Absent", align: "right", cell: (r) => <span className={r.absent ? "text-destructive" : ""}>{r.absent}</span> },
            { key: "holiday", header: "Holidays", align: "right" },
          ]}
          rows={summary}
          dense
        />
      </div>
    </div>
  );
}

async function AdvancesTab({ common, canCreate, canVoid }: { common: Common; canCreate: boolean; canVoid: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("employee_advances").select("*, employees(full_name, employee_code), cash_accounts(name)").order("advance_date", { ascending: false }).limit(200);
  const columns: Column[] = [
    { key: "advance_date", header: "Date", cell: (r) => formatDate(r.advance_date) },
    { key: "emp", header: "Employee", cell: (r) => <span className="font-medium">{r.employees?.full_name}</span> },
    { key: "amount", header: "Amount", align: "right", cell: (r) => formatCurrency(r.amount) },
    { key: "recovered_amount", header: "Recovered", align: "right", cell: (r) => formatCurrency(r.recovered_amount) },
    { key: "out", header: "Outstanding", align: "right", cell: (r) => <span className="font-semibold">{formatCurrency(Number(r.amount) - Number(r.recovered_amount))}</span> },
    { key: "acc", header: "Paid from", hideOnMobile: true, cell: (r) => r.cash_accounts?.name },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "a", header: "", align: "right", cell: (r) => (canVoid && r.status === "posted" && Number(r.recovered_amount) === 0 ? <VoidButton rpc="void_cash_record" args={{ p_kind: "advance", p_id: r.id }} what="advance" /> : null) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <p className="text-sm text-muted-foreground">Advances are recovered through the “advance recovery” line of monthly salaries.</p>
        <div className="sm:ml-auto">{canCreate ? <EntityDialog entity="employee_advance" {...common} size="sm" /> : null}</div>
      </Toolbar>
      <DataTable columns={columns} rows={data ?? []} />
    </div>
  );
}

async function PayrollTab({ sp, common, canCreate, canEdit, canVoid, canPay }: { sp: Record<string, string | string[] | undefined>; common: Common; canCreate: boolean; canEdit: boolean; canVoid: boolean; canPay: boolean }) {
  const raw = param(sp, "month");
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : startOfMonth(common.today);
  const supabase = await createClient();
  const { data } = await supabase.from("salary_records").select("*, employees(full_name, employee_code, position)").eq("salary_month", month).order("created_at");
  const rows = (data ?? []) as Row[];
  const live = rows.filter((r) => r.status !== "void");
  const sum = (k: string) => live.reduce((a, r) => a + Number(r[k]), 0);
  const columns: Column[] = [
    { key: "emp", header: "Employee", cell: (r) => <span className="font-medium">{r.employees?.full_name}</span> },
    { key: "days", header: "Present / days", align: "right", hideOnMobile: true, cell: (r) => `${r.present_days ?? "—"} / ${r.working_days ?? "—"}` },
    { key: "basic_salary", header: "Basic", align: "right", cell: (r) => formatCurrency(r.basic_salary) },
    { key: "allow", header: "+ Allow. / OT", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(Number(r.allowances) + Number(r.overtime)) },
    { key: "deductions", header: "− Deductions", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.deductions) },
    { key: "advance_deduction", header: "− Advance", align: "right", hideOnMobile: true, cell: (r) => formatCurrency(r.advance_deduction) },
    { key: "net_salary", header: "Net pay", align: "right", cell: (r) => <span className="font-semibold">{formatCurrency(r.net_salary)}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "paid", header: "Paid", hideOnMobile: true, cell: (r) => (r.paid_date ? `${formatDate(r.paid_date)} · ${titleCase(r.payment_method)}` : "—") },
    {
      key: "a", header: "", align: "right",
      cell: (r) =>
        r.status === "pending" ? (
          <div className="flex justify-end gap-1">
            {canEdit ? <EntityDialog entity="salary" {...common} id={r.id} initial={r} variant="ghost" size="icon-sm" /> : null}
            {canPay ? <PaySalaryDialog id={r.id} name={r.employees?.full_name} amount={Number(r.net_salary)} accounts={common.options.cashAccounts ?? []} today={common.today} /> : null}
            {canVoid ? (
              <ConfirmAction rpc="void_salary" args={{ p_id: r.id }} requireReason title="Void this salary record?" description="Only pending (unpaid) salaries can be voided." confirmLabel="Void" trigger={<Button variant="ghost" size="xs" className="text-destructive">Void</Button>} />
            ) : null}
          </div>
        ) : null,
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <form className="flex items-end gap-2">
          <input type="hidden" name="tab" value="payroll" />
          <Input type="month" name="month" defaultValue={month.slice(0, 7)} className="h-9 w-44" aria-label="Payroll month" />
          <Button type="submit" variant="outline" size="sm" className="h-9">Show</Button>
        </form>
        <div className="flex gap-2 sm:ml-auto">
          {canCreate ? <GeneratePayrollButton month={month} /> : null}
          {canCreate ? <EntityDialog entity="salary" {...common} initial={{ salary_month: month }} size="default" label="Add salary" /> : null}
        </div>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        empty={<p className="p-8 text-center text-sm text-muted-foreground">No salary records for {formatDate(month, { day: undefined })}. Use “Generate payroll” to create them from basic salaries and attendance.</p>}
        footer={
          <TableRow className="font-semibold">
            <TableCell>Total ({live.length})</TableCell>
            <TableCell className="hidden md:table-cell" />
            <TableCell className="text-right tabular">{formatCurrency(sum("basic_salary"))}</TableCell>
            <TableCell className="hidden text-right tabular md:table-cell">{formatCurrency(sum("allowances") + sum("overtime"))}</TableCell>
            <TableCell className="hidden text-right tabular md:table-cell">{formatCurrency(sum("deductions"))}</TableCell>
            <TableCell className="hidden text-right tabular md:table-cell">{formatCurrency(sum("advance_deduction"))}</TableCell>
            <TableCell className="text-right tabular">{formatCurrency(sum("net_salary"))}</TableCell>
            <TableCell colSpan={3} />
          </TableRow>
        }
      />
    </div>
  );
}
