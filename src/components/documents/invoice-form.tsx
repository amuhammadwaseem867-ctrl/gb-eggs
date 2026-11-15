"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, Save, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SearchSelect } from "@/components/forms/search-select";
import { saveDocument } from "@/app/actions/documents";
import { invoiceTotals } from "@/lib/calc";
import { formatCurrency, formatNumber } from "@/lib/format";
import { PAYMENT_METHODS } from "@/lib/forms/schema";
import type { Option } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Line {
  grade_id: string;
  unit_code: string;
  unit_qty: string;
  price: string;
}

interface FormValues {
  party_id: string;
  walk_in: boolean;
  walk_in_name: string;
  walk_in_phone: string;
  supplier_invoice_no: string;
  farm_id: string;
  date: string;
  discount: string;
  additional_charges: string;
  notes: string;
  paid_amount: string;
  payment_method: string;
  cash_account_id: string;
  items: Line[];
}

export interface InvoiceFormProps {
  kind: "sale" | "purchase";
  today: string;
  parties: Option[];
  locations: Option[];
  grades: (Option & { price?: number })[];
  units: (Option & { eggs: number })[];
  accounts: Option[];
  /** stock[farmId][gradeId] = eggs on hand */
  stock: Record<string, Record<string, number>>;
  taxRate: number;
  taxLabel: string;
  initial?: Partial<FormValues> & { id?: string };
}

export function InvoiceForm({ kind, today, parties, locations, grades, units, accounts, stock, taxRate, taxLabel, initial }: InvoiceFormProps) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const isSale = kind === "sale";
  const defaultUnit = units.find((u) => u.value === "tray")?.value ?? units[0]?.value ?? "egg";

  const form = useForm<FormValues>({
    defaultValues: {
      party_id: "", walk_in: false, walk_in_name: "", walk_in_phone: "", supplier_invoice_no: "",
      farm_id: locations[0]?.value ?? "", date: today, discount: "0", additional_charges: "0", notes: "",
      paid_amount: "0", payment_method: "cash", cash_account_id: accounts[0]?.value ?? "",
      items: [{ grade_id: "", unit_code: defaultUnit, unit_qty: "", price: "" }],
      ...initial,
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const v = useWatch({ control: form.control }) as FormValues;
  const eggsPer = (code: string) => units.find((u) => u.value === code)?.eggs ?? 1;

  const effectiveTax = isSale ? taxRate : 0;
  let totals: ReturnType<typeof invoiceTotals> | null = null;
  let totalsError: string | null = null;
  try {
    totals = invoiceTotals({
      lines: (v.items ?? []).map((l) => ({ unitQty: Number(l.unit_qty || 0), price: Number(l.price || 0) })),
      discount: Number(v.discount || 0),
      additionalCharges: Number(v.additional_charges || 0),
      taxRate: effectiveTax,
      paid: Number(v.paid_amount || 0),
    });
  } catch (e) {
    totalsError = (e as Error).message;
  }

  // Eggs requested per grade on this invoice vs. stock at the chosen location.
  const requested: Record<string, number> = {};
  for (const l of v.items ?? []) {
    if (!l.grade_id) continue;
    requested[l.grade_id] = (requested[l.grade_id] ?? 0) + Number(l.unit_qty || 0) * eggsPer(l.unit_code);
  }

  const onGrade = (index: number, gradeId: string) => {
    form.setValue(`items.${index}.grade_id`, gradeId);
    const g = grades.find((x) => x.value === gradeId);
    const current = form.getValues(`items.${index}.price`);
    if (g?.price && !current) {
      form.setValue(`items.${index}.price`, String(g.price * eggsPer(form.getValues(`items.${index}.unit_code`))));
    }
  };

  const submit = (confirm: boolean) =>
    form.handleSubmit((values) => {
      if (confirm && isSale && values.walk_in && Number(values.paid_amount || 0) < (totals?.total ?? 0)) {
        toast.error("Walk-in sales must be paid in full.");
        return;
      }
      start(async () => {
        const res = await saveDocument({
          id: initial?.id ?? null,
          kind,
          party_id: values.walk_in ? null : values.party_id || null,
          walk_in_name: values.walk_in ? values.walk_in_name : null,
          walk_in_phone: values.walk_in ? values.walk_in_phone : null,
          supplier_invoice_no: values.supplier_invoice_no || null,
          farm_id: values.farm_id,
          date: values.date,
          discount: values.discount || 0,
          additional_charges: values.additional_charges || 0,
          notes: values.notes || null,
          confirm,
          paid_amount: values.paid_amount || 0,
          payment_method: values.payment_method,
          cash_account_id: values.cash_account_id || null,
          items: values.items
            .filter((l) => l.grade_id && Number(l.unit_qty) > 0)
            .map((l) => ({ grade_id: l.grade_id, unit_code: l.unit_code, unit_qty: l.unit_qty, price: l.price || 0 })),
        });
        if (res.ok && res.data) {
          toast.success(res.message ?? "Saved");
          router.push(`/${isSale ? "sales" : "purchases"}/${res.data.id}`);
          router.refresh();
        } else if (!res.ok) toast.error(res.error);
      });
    })();

  const partyLabel = isSale ? "Customer" : "Supplier";

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isSale ? "Customer & invoice" : "Supplier & invoice"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {isSale ? (
              <div className="flex items-center justify-between rounded-xl border border-surface-line/70 bg-surface/50 px-3 py-2 backdrop-blur sm:col-span-2">
                <div>
                  <p className="text-sm font-medium">Walk-in customer</p>
                  <p className="text-xs text-muted-foreground">Cash sale without an account — must be paid in full.</p>
                </div>
                <Switch checked={v.walk_in} onCheckedChange={(c) => form.setValue("walk_in", c)} aria-label="Walk-in customer" />
              </div>
            ) : null}
            {isSale && v.walk_in ? (
              <>
                <Field label="Customer name" required>
                  <Input {...form.register("walk_in_name")} placeholder="Walk-in customer" />
                </Field>
                <Field label="Phone">
                  <Input {...form.register("walk_in_phone")} type="tel" />
                </Field>
              </>
            ) : (
              <Field label={partyLabel} required className="sm:col-span-2">
                <SearchSelect value={v.party_id} onChange={(x) => form.setValue("party_id", x)} options={parties} placeholder={`Select ${partyLabel.toLowerCase()}…`} />
              </Field>
            )}
            <Field label={isSale ? "Sell from (stock location)" : "Receive into (stock location)"} required>
              <SearchSelect value={v.farm_id} onChange={(x) => form.setValue("farm_id", x)} options={locations} clearable={false} />
            </Field>
            <Field label={isSale ? "Invoice date" : "Purchase date"} required>
              <Input type="date" max={today} {...form.register("date")} />
            </Field>
            {!isSale ? (
              <Field label="Supplier invoice #">
                <Input {...form.register("supplier_invoice_no")} />
              </Field>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">Items</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => append({ grade_id: "", unit_code: defaultUnit, unit_qty: "", price: "" })}>
              <Plus /> Add line
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="hidden grid-cols-[1.6fr_1fr_0.8fr_1fr_1fr_auto] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
              <span>Egg grade / size</span>
              <span>Unit</span>
              <span className="text-right">Qty</span>
              <span className="text-right">{isSale ? "Price / unit" : "Rate / unit"}</span>
              <span className="text-right">Amount</span>
              <span className="w-8" />
            </div>
            {fields.map((f, i) => {
              const line = v.items?.[i];
              const eggs = line ? Number(line.unit_qty || 0) * eggsPer(line.unit_code) : 0;
              const available = line?.grade_id ? stock[v.farm_id]?.[line.grade_id] ?? 0 : null;
              const short = isSale && line?.grade_id && available !== null && (requested[line.grade_id] ?? 0) > available;
              return (
                <div key={f.id} className="grid grid-cols-2 gap-2 rounded-lg border p-2 md:grid-cols-[1.6fr_1fr_0.8fr_1fr_1fr_auto] md:items-start md:border-0 md:p-0">
                  <div className="col-span-2 md:col-span-1">
                    <SearchSelect value={line?.grade_id ?? ""} onChange={(x) => onGrade(i, x)} options={grades} placeholder="Select grade" clearable={false} />
                    {line?.grade_id ? (
                      <p className={cn("mt-1 px-1 text-[11px]", short ? "font-medium text-destructive" : "text-muted-foreground")}>
                        {isSale ? `${formatNumber(available)} eggs in stock` : `${formatNumber(available)} now in stock`}
                        {short ? " — not enough stock" : ""}
                      </p>
                    ) : null}
                  </div>
                  <SearchSelect value={line?.unit_code ?? defaultUnit} onChange={(x) => form.setValue(`items.${i}.unit_code`, x)} options={units} clearable={false} />
                  <div>
                    <Input type="number" inputMode="decimal" min={0} step="any" placeholder="Qty" className="tabular text-right" {...form.register(`items.${i}.unit_qty`)} />
                    {eggs ? <p className="mt-1 px-1 text-right text-[11px] text-muted-foreground">{formatNumber(eggs)} eggs</p> : null}
                  </div>
                  <Input type="number" inputMode="decimal" min={0} step="0.01" placeholder="0.00" className="tabular text-right" {...form.register(`items.${i}.price`)} />
                  <p className="tabular flex h-9 items-center justify-end text-sm font-medium">{formatCurrency(totals?.lineTotals[i] ?? 0)}</p>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} disabled={fields.length === 1} aria-label="Remove line" className="justify-self-end">
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Field label="Notes">
              <Textarea rows={2} {...form.register("notes")} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-5 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Row label="Subtotal" value={formatCurrency(totals?.subtotal ?? 0)} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Discount">
                <Input type="number" min={0} step="0.01" className="tabular text-right" {...form.register("discount")} />
              </Field>
              <Field label={isSale ? "Delivery / other" : "Freight / other"}>
                <Input type="number" min={0} step="0.01" className="tabular text-right" {...form.register("additional_charges")} />
              </Field>
            </div>
            {isSale && taxRate > 0 ? <Row label={`${taxLabel} (${taxRate}%)`} value={formatCurrency(totals?.tax ?? 0)} /> : null}
            <div className="flex items-center justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{formatCurrency(totals?.total ?? 0)}</span>
            </div>
            {totalsError ? <p className="text-xs text-destructive">{totalsError}</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{isSale ? "Payment received" : "Payment made"}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Field label="Amount">
              <div className="flex gap-2">
                <Input type="number" min={0} step="0.01" className="tabular text-right" {...form.register("paid_amount")} />
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => form.setValue("paid_amount", String(totals?.total ?? 0))}>
                  Full
                </Button>
              </div>
            </Field>
            <Field label="Method">
              <SearchSelect value={v.payment_method} onChange={(x) => form.setValue("payment_method", x)} options={PAYMENT_METHODS} clearable={false} />
            </Field>
            <Field label="Account">
              <SearchSelect value={v.cash_account_id} onChange={(x) => form.setValue("cash_account_id", x)} options={accounts} />
            </Field>
            <Row label="Balance due" value={<span className={cn("font-semibold", (totals?.balance ?? 0) > 0 && "text-destructive")}>{formatCurrency(totals?.balance ?? 0)}</span>} />
            <p className="text-xs text-muted-foreground">Payments are only posted when the document is confirmed. Further payments can be added later.</p>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-2">
          <Button size="lg" className="h-10" disabled={pending || !!totalsError} onClick={() => submit(true)}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {isSale ? "Confirm invoice & deduct stock" : "Confirm purchase & add stock"}
          </Button>
          <Button variant="outline" size="lg" className="h-10" disabled={pending || !!totalsError || (isSale && v.walk_in)} onClick={() => submit(false)}>
            <Save /> Save as draft
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-medium text-foreground/80">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
