"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Upload, UserPlus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/forms/search-select";
import { createUser, setPermission, updateSequence, updateSettings, updateUser } from "@/app/actions/settings";
import { createClient } from "@/lib/supabase/client";
import type { AppSettings, Row } from "@/lib/types";

const ROLES = [
  { value: "admin", label: "Administrator" },
  { value: "manager", label: "Manager" },
  { value: "accountant", label: "Accountant" },
  { value: "staff", label: "Staff" },
];

function F({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-foreground/80">{label}</span>
      {children}
      {help ? <span className="text-xs text-muted-foreground">{help}</span> : null}
    </label>
  );
}

export function CompanySettingsForm({ settings, canEdit }: { settings: AppSettings; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = React.useState(settings);
  const [pending, start] = React.useTransition();
  const [uploading, setUploading] = React.useState(false);
  const set = <K extends keyof AppSettings>(k: K, val: AppSettings[K]) => setV((p) => ({ ...p, [k]: val }));

  const save = () =>
    start(async () => {
      const res = await updateSettings({ ...v, tax_rate: Number(v.tax_rate), mortality_alert_pct: Number(v.mortality_alert_pct), medicine_expiry_days: Number(v.medicine_expiry_days) });
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        router.refresh();
      } else toast.error(res.error);
    });

  const upload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2 MB");
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
      const path = `logo-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      set("logo_url", data.publicUrl);
      toast.success("Logo uploaded — click Save to apply");
    } catch (e) {
      toast.error(`Upload failed: ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>Shown on invoices, reports and the sidebar.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <F label="Company name"><Input value={v.company_name} onChange={(e) => set("company_name", e.target.value)} disabled={!canEdit} /></F>
          <F label="NTN / tax number"><Input value={v.ntn_number ?? ""} onChange={(e) => set("ntn_number", e.target.value)} disabled={!canEdit} /></F>
          <F label="Phone"><Input value={v.phone ?? ""} onChange={(e) => set("phone", e.target.value)} disabled={!canEdit} /></F>
          <F label="Email"><Input type="email" value={v.email ?? ""} onChange={(e) => set("email", e.target.value)} disabled={!canEdit} /></F>
          <div className="sm:col-span-2"><F label="Business address"><Textarea rows={2} value={v.address ?? ""} onChange={(e) => set("address", e.target.value)} disabled={!canEdit} /></F></div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <div className="flex size-14 items-center justify-center overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {v.logo_url ? <img src={v.logo_url} alt="Company logo" className="size-full object-contain" /> : <span className="text-xs text-muted-foreground">Logo</span>}
            </div>
            {canEdit ? (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload logo
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
            ) : null}
            {v.logo_url && canEdit ? <Button variant="ghost" size="sm" onClick={() => set("logo_url", null)}>Remove</Button> : null}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Regional, tax &amp; controls</CardTitle>
          <CardDescription>Currency, time zone, language, sales tax and operational rules.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <F label="Currency"><Input value={v.currency} maxLength={3} onChange={(e) => set("currency", e.target.value.toUpperCase())} disabled={!canEdit} /></F>
          <F label="Time zone"><Input value={v.timezone} onChange={(e) => set("timezone", e.target.value)} disabled={!canEdit} /></F>
          <F label="Language" help="Urdu switches the navigation to Urdu and right-to-left layout.">
            <SearchSelect value={v.language} onChange={(x) => set("language", (x || "en") as "en" | "ur")} options={[{ value: "en", label: "English" }, { value: "ur", label: "اردو — Urdu" }]} clearable={false} disabled={!canEdit} />
          </F>
          <F label="Invoice footer"><Input value={v.invoice_footer ?? ""} onChange={(e) => set("invoice_footer", e.target.value)} disabled={!canEdit} /></F>
          <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Charge sales tax on invoices</p>
              <p className="text-xs text-muted-foreground">Applied to (subtotal − discount) on new invoices.</p>
            </div>
            <Switch checked={v.tax_enabled} onCheckedChange={(c) => set("tax_enabled", c)} disabled={!canEdit} />
          </div>
          <F label="Tax label"><Input value={v.tax_label} onChange={(e) => set("tax_label", e.target.value)} disabled={!canEdit || !v.tax_enabled} /></F>
          <F label="Tax rate (%)"><Input type="number" min={0} max={100} step="0.01" value={v.tax_rate} onChange={(e) => set("tax_rate", e.target.value as unknown as number)} disabled={!canEdit || !v.tax_enabled} /></F>
          <F label="Mortality alert (% per day)"><Input type="number" min={0} step="0.01" value={v.mortality_alert_pct} onChange={(e) => set("mortality_alert_pct", e.target.value as unknown as number)} disabled={!canEdit} /></F>
          <F label="Medicine expiry warning (days)"><Input type="number" min={0} value={v.medicine_expiry_days} onChange={(e) => set("medicine_expiry_days", e.target.value as unknown as number)} disabled={!canEdit} /></F>
          <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Allow negative egg stock</p>
              <p className="text-xs text-muted-foreground">Administrator override. Leave off so sales can never exceed stock.</p>
            </div>
            <Switch checked={v.allow_negative_stock} onCheckedChange={(c) => set("allow_negative_stock", c)} disabled={!canEdit} />
          </div>
        </CardContent>
      </Card>
      {canEdit ? (
        <div className="flex justify-end lg:col-span-2">
          <Button onClick={save} disabled={pending} size="lg">
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save settings
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function SequenceRow({ seq, canEdit }: { seq: Row; canEdit: boolean }) {
  const router = useRouter();
  const [prefix, setPrefix] = React.useState(seq.prefix);
  const [next, setNext] = React.useState(String(seq.next_number));
  const [padding, setPadding] = React.useState(String(seq.padding));
  const [pending, start] = React.useTransition();
  const dirty = prefix !== seq.prefix || next !== String(seq.next_number) || padding !== String(seq.padding);
  const preview = `${prefix}${String(Math.max(1, Number(next) || 1)).padStart(Math.min(12, Math.max(1, Number(padding) || 1)), "0")}`;
  return (
    <div className="grid grid-cols-2 items-end gap-2 border-b py-3 last:border-0 sm:grid-cols-[1.2fr_1fr_0.8fr_0.6fr_1fr_auto]">
      <div className="col-span-2 sm:col-span-1">
        <p className="text-sm font-medium">{seq.label}</p>
        <p className="font-mono text-xs text-muted-foreground">Next: {preview}</p>
      </div>
      <F label="Prefix"><Input value={prefix} onChange={(e) => setPrefix(e.target.value)} disabled={!canEdit} /></F>
      <F label="Next #"><Input type="number" min={1} value={next} onChange={(e) => setNext(e.target.value)} disabled={!canEdit} /></F>
      <F label="Digits"><Input type="number" min={1} max={12} value={padding} onChange={(e) => setPadding(e.target.value)} disabled={!canEdit} /></F>
      <span className="hidden sm:block" />
      {canEdit ? (
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await updateSequence({ doc_type: seq.doc_type, prefix, next_number: next, padding });
              if (r.ok) {
                toast.success(r.message ?? "Saved");
                router.refresh();
              } else toast.error(r.error);
            })
          }
        >
          Save
        </Button>
      ) : null}
    </div>
  );
}

export function PermissionMatrix({ roles, modules, perms }: { roles: Row[]; modules: Row[]; perms: Row[] }) {
  const router = useRouter();
  const [state, setState] = React.useState(perms);
  const [busy, setBusy] = React.useState<string | null>(null);
  const actions = [["can_view", "View"], ["can_create", "Create"], ["can_edit", "Edit"], ["can_delete", "Void / delete"]] as const;
  const toggle = async (role: string, module: string, action: (typeof actions)[number][0], value: boolean) => {
    const key = `${role}${module}${action}`;
    setBusy(key);
    const res = await setPermission({ role_code: role as "manager", module, action, value });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    setState((s) =>
      s.map((p) => {
        if (p.role_code !== role || p.module !== module) return p;
        const n = { ...p, [action]: value };
        if (value && action !== "can_view") n.can_view = true;
        if (!value && action === "can_view") Object.assign(n, { can_create: false, can_edit: false, can_delete: false });
        return n;
      }),
    );
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-4">
      {roles.filter((r) => r.code !== "admin").map((role) => (
        <Card key={role.code}>
          <CardHeader>
            <CardTitle className="text-base">{role.name}</CardTitle>
            <CardDescription>{role.description}</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground uppercase">
                  <th className="px-6 py-2 text-left font-semibold">Module</th>
                  {actions.map(([, l]) => (
                    <th key={l} className="px-3 py-2 text-center font-semibold">{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => {
                  const p = state.find((x) => x.role_code === role.code && x.module === m.code);
                  return (
                    <tr key={m.code} className="border-b last:border-0">
                      <td className="px-6 py-2 font-medium">{m.name}</td>
                      {actions.map(([a, l]) => (
                        <td key={a} className="px-3 py-2 text-center">
                          {busy === `${role.code}${m.code}${a}` ? (
                            <Loader2 className="mx-auto size-4 animate-spin" />
                          ) : (
                            <Checkbox aria-label={`${role.name} ${l} ${m.name}`} checked={Boolean(p?.[a])} onCheckedChange={(c) => toggle(role.code, m.code, a, c === true)} />
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">Administrators always have full access. Permissions are enforced in the database (Row Level Security and function checks), not only in the interface.</p>
    </div>
  );
}

export function UserRow({ user, currentUserId }: { user: Row; currentUserId: string }) {
  const router = useRouter();
  const [role, setRole] = React.useState(user.role_code);
  const [active, setActive] = React.useState<boolean>(user.is_active);
  const [pending, start] = React.useTransition();
  const dirty = role !== user.role_code || active !== user.is_active;
  return (
    <div className="flex flex-wrap items-center gap-3 border-b px-6 py-3 last:border-0">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">{user.full_name || user.email}{user.id === currentUserId ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </div>
      <div className="w-44"><SearchSelect value={role} onChange={(x) => setRole(x || role)} options={ROLES} clearable={false} /></div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Active</label>
      <Button
        size="sm"
        disabled={!dirty || pending}
        onClick={() =>
          start(async () => {
            const r = await updateUser({ id: user.id, full_name: user.full_name || user.email || "User", role_code: role, is_active: active, phone: user.phone });
            if (r.ok) {
              toast.success(r.message ?? "Saved");
              router.refresh();
            } else toast.error(r.error);
          })
        }
      >
        Save
      </Button>
    </div>
  );
}

export function CreateUserDialog({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [v, setV] = React.useState({ email: "", full_name: "", password: "", role_code: "staff" });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus /> Add user</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a user account</DialogTitle>
          <DialogDescription>
            {enabled ? "The account is created confirmed; share the temporary password securely and ask the user to change it." : "The server has no SUPABASE_SERVICE_ROLE_KEY. Invite users from the Supabase dashboard instead, then set their role here."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <F label="Full name"><Input value={v.full_name} onChange={(e) => setV({ ...v, full_name: e.target.value })} /></F>
          <F label="Email"><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></F>
          <F label="Temporary password"><Input type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} /></F>
          <F label="Role"><SearchSelect value={v.role_code} onChange={(x) => setV({ ...v, role_code: x || "staff" })} options={ROLES} clearable={false} /></F>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending || !enabled}
            onClick={() =>
              start(async () => {
                const r = await createUser(v as Parameters<typeof createUser>[0]);
                if (r.ok) {
                  toast.success(r.message ?? "Created");
                  setOpen(false);
                  setV({ email: "", full_name: "", password: "", role_code: "staff" });
                  router.refresh();
                } else toast.error(r.error);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null} Create account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
