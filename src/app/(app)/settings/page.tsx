import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { LinkTabs } from "@/components/shared/table-controls";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { CompanySettingsForm, CreateUserDialog, PermissionMatrix, SequenceRow, UserRow } from "@/components/settings/settings-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, requirePage } from "@/lib/auth";
import { type PageSearchProps, paging, param, todayIn } from "@/lib/data/query";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime, formatNumber } from "@/lib/format";
import type { Row } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageSearchProps) {
  const session = await requirePage("settings");
  const sp = await searchParams;
  const isAdmin = session.role === "admin";
  const tab = param(sp, "tab") ?? "company";
  const canEdit = can(session, "settings", "edit");
  const supabase = await createClient();
  const tabs = [
    { value: "company", label: "Company & tax" },
    { value: "numbering", label: "Invoice numbering" },
    { value: "packaging", label: "Packaging" },
    ...(isAdmin ? [{ value: "users", label: "Users & roles" }, { value: "permissions", label: "Permissions" }, { value: "audit", label: "Audit log" }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Company profile, invoicing, packaging conversions, users and security." />
      <LinkTabs tabs={tabs} />
      {tab === "company" ? <CompanySettingsForm settings={session.settings} canEdit={canEdit} /> : null}
      {tab === "numbering" ? <Numbering canEdit={canEdit} /> : null}
      {tab === "packaging" ? <Packaging canEdit={canEdit} today={todayIn(session.settings.timezone)} /> : null}
      {tab === "users" && isAdmin ? <Users currentUserId={session.userId} /> : null}
      {tab === "permissions" && isAdmin ? <Permissions /> : null}
      {tab === "audit" && isAdmin ? <Audit sp={sp} /> : null}
    </div>
  );

  async function Numbering({ canEdit }: { canEdit: boolean }) {
    const { data } = await supabase.from("document_sequences").select("*").order("label");
    return (
      <Card>
        <CardHeader>
          <CardTitle>Document numbering</CardTitle>
          <CardDescription>Numbers are issued under a row lock, so they are unique and gap-free even with simultaneous users. Document numbers are unique, so lowering the next number below one already issued will make new documents fail until it is raised again.</CardDescription>
        </CardHeader>
        <CardContent>
          {(data ?? []).map((s) => (
            <SequenceRow key={s.doc_type} seq={s} canEdit={canEdit} />
          ))}
        </CardContent>
      </Card>
    );
  }

  async function Packaging({ canEdit, today }: { canEdit: boolean; today: string }) {
    const { data } = await supabase.from("packaging_types").select("*").order("sort_order");
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Egg tray capacity and other packaging conversions. Stock is always held in individual eggs. Egg grades are managed under <Link className="text-primary hover:underline" href="/inventory?tab=grades">Inventory → Grades</Link>.</p>
          {canEdit ? <EntityDialog entity="packaging_type" today={today} size="sm" /> : null}
        </div>
        <DataTable
          rowKey={(r) => r.code}
          columns={[
            { key: "code", header: "Code", cell: (r) => <span className="font-mono">{r.code}</span> },
            { key: "name", header: "Name", cell: (r) => <span className="font-medium">{r.name}</span> },
            { key: "eggs_per_unit", header: "Eggs per unit", align: "right", cell: (r) => formatNumber(r.eggs_per_unit) },
            { key: "is_active", header: "Status", cell: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} /> },
            { key: "a", header: "", align: "right", cell: (r) => (canEdit && r.code !== "egg" ? <EntityDialog entity="packaging_type" today={today} id={r.code} initial={r} variant="ghost" size="icon-sm" /> : null) },
          ]}
          rows={data ?? []}
        />
      </div>
    );
  }

  async function Users({ currentUserId }: { currentUserId: string }) {
    const { data } = await supabase.from("profiles").select("*").order("created_at");
    const hasServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
    return (
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Users</CardTitle>
            <CardDescription>Assign roles and deactivate accounts. Inactive users can sign in but see nothing.</CardDescription>
          </div>
          <CreateUserDialog enabled={hasServiceKey} />
        </CardHeader>
        <CardContent className="px-0">
          {(data ?? []).map((u) => (
            <UserRow key={u.id} user={u} currentUserId={currentUserId} />
          ))}
        </CardContent>
      </Card>
    );
  }

  async function Permissions() {
    const [{ data: roles }, { data: modules }, { data: perms }] = await Promise.all([
      supabase.from("roles").select("*").order("code"),
      supabase.from("app_modules").select("*").order("sort_order"),
      supabase.from("role_permissions").select("*"),
    ]);
    const order = ["manager", "accountant", "staff"];
    return <PermissionMatrix roles={(roles ?? []).sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))} modules={modules ?? []} perms={perms ?? []} />;
  }

  async function Audit({ sp }: { sp: Record<string, string | string[] | undefined> }) {
    const { page, pageSize, from, to } = paging(sp, 50);
    let q = supabase.from("audit_logs").select("*", { count: "exact" }).order("id", { ascending: false });
    const table = param(sp, "table");
    if (table && /^[a-z_]+$/.test(table)) q = q.eq("table_name", table);
    const { data, count } = await q.range(from, to);
    const { data: users } = await supabase.from("profiles").select("id, full_name, email");
    const who = (id: string | null) => (id ? users?.find((u) => u.id === id)?.full_name ?? id.slice(0, 8) : "System");
    const changed = (r: Row) => {
      if (r.action !== "UPDATE" || !r.old_data || !r.new_data) return r.action === "INSERT" ? "Created" : "Deleted";
      const keys = Object.keys(r.new_data).filter((k) => !["updated_at"].includes(k) && JSON.stringify(r.new_data[k]) !== JSON.stringify(r.old_data[k]));
      return keys.map((k) => `${k}: ${JSON.stringify(r.old_data[k])} → ${JSON.stringify(r.new_data[k])}`).join("; ").slice(0, 220) || "—";
    };
    return (
      <DataTable
        dense
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        columns={[
          { key: "changed_at", header: "When", cell: (r) => <span className="text-xs whitespace-nowrap">{formatDateTime(r.changed_at)}</span> },
          { key: "who", header: "User", cell: (r) => who(r.changed_by) },
          { key: "table_name", header: "Table", cell: (r) => <Link className="font-mono text-xs text-primary hover:underline" href={`/settings?tab=audit&table=${r.table_name}`}>{r.table_name}</Link> },
          { key: "action", header: "Action", cell: (r) => <StatusBadge status={r.action === "DELETE" ? "out" : r.action === "INSERT" ? "in" : "pending"} label={r.action} /> },
          { key: "changes", header: "Changes", cell: (r) => <span className="font-mono text-[11px] text-muted-foreground">{changed(r)}</span> },
        ]}
        rows={data ?? []}
      />
    );
  }
}
