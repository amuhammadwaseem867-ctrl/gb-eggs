"use client";

import * as React from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/forms/form-field";
import { saveEntity } from "@/app/actions/entities";
import { getEntity } from "@/lib/forms/entities";
import { buildSchema, defaultValues } from "@/lib/forms/schema";
import type { Option } from "@/lib/types";
import { collectionTotals } from "@/lib/calc";
import { cn } from "@/lib/utils";

export interface EntityFormProps {
  entity: string;
  options?: Record<string, Option[]>;
  initial?: Record<string, unknown> | null;
  id?: string | null;
  today: string;
  /** Values fixed by the context (e.g. the customer on a ledger page). */
  fixed?: Record<string, unknown>;
  onDone?: () => void;
  onCancel?: () => void;
}

export function EntityForm({ entity, options = {}, initial, id, today, fixed, onDone, onCancel }: EntityFormProps) {
  const def = getEntity(entity);
  const router = useRouter();
  const editing = Boolean(id);
  const fields = def.fields.filter((f) => !(editing && f.createOnly));
  const schema = buildSchema(def.fields, def.refine ?? [], editing ? "edit" : "create");
  const [pending, startTransition] = React.useTransition();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { ...withAccountDefault(fields, defaultValues(fields, today, initial), options), ...stringify(fixed) },
    mode: "onTouched",
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const res = await saveEntity(entity, { ...(values as Record<string, unknown>), ...(fixed ?? {}) }, id);
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        form.reset();
        router.refresh();
        onDone?.();
      } else {
        toast.error(res.error);
      }
    });
  });

  const fixedKeys = new Set(Object.keys(fixed ?? {}));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields
          .filter((f) => !fixedKeys.has(f.name))
          .map((f) => (
            <FormField key={f.name} field={f} control={form.control} errors={form.formState.errors} options={f.source ? options[f.source] : undefined} />
          ))}
      </div>
      {entity === "egg_collection" ? <CollectionPreview control={form.control} /> : null}
      <div className="flex justify-end gap-2 border-t pt-4">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={pending} className="min-w-28">
          {pending ? <Loader2 className="animate-spin" /> : null}
          {def.submitLabel ?? (editing ? "Save changes" : "Save")}
        </Button>
      </div>
    </form>
  );
}

/** Pre-selects the first cash/bank account for required account fields. */
function withAccountDefault(fields: ReturnType<typeof getEntity>["fields"], values: Record<string, unknown>, options: Record<string, Option[]>) {
  const out = { ...values };
  for (const f of fields) {
    if (f.source === "cashAccounts" && f.required && !out[f.name] && options.cashAccounts?.length) out[f.name] = options.cashAccounts[0].value;
  }
  return out;
}

function stringify(v?: Record<string, unknown>) {
  if (!v) return {};
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === null || x === undefined ? "" : String(x)]));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CollectionPreview({ control }: { control: Control<any> }) {
  const v = useWatch({ control }) as Record<string, string>;
  const n = (k: string) => Number(v[k] || 0);
  const t = collectionTotals({
    morning: n("morning_eggs"), evening: n("evening_eggs"), small: n("small_eggs"), medium: n("medium_eggs"),
    large: n("large_eggs"), xl: n("xl_eggs"), dirty: n("dirty_eggs"), broken: n("broken_eggs"), rejected: n("rejected_eggs"),
  });
  return (
    <div className={cn("grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm sm:grid-cols-4", t.balanced ? "border-primary/30 bg-accent/40" : "border-warning/50 bg-warning/10")}>
      <Metric label="Total collected" value={t.total} />
      <Metric label="Graded" value={t.graded} />
      <Metric label="Saleable" value={t.saleable} />
      <Metric label="Broken + rejected" value={t.losses} />
      {!t.balanced && t.total > 0 ? (
        <p className="col-span-full text-xs text-foreground/80">Breakdown differs from total by {Math.abs(t.total - t.graded)} eggs.</p>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-base font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
