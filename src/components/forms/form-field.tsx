"use client";

import { Controller, type Control, type FieldErrors, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchSelect } from "@/components/forms/search-select";
import type { FieldDef } from "@/lib/forms/schema";
import type { Option } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  field: FieldDef;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  errors: FieldErrors;
  options?: Option[];
}

export function FormField({ field, control, errors, options = [] }: Props) {
  const parentValue = useWatch({ control, name: field.dependsOn ?? "__none__" }) as string | undefined;
  const showValue = useWatch({ control, name: field.showIf?.field ?? "__none__" });
  if (field.showIf && !field.showIf.in.map(String).includes(String(showValue))) return null;

  const error = errors[field.name]?.message as string | undefined;
  const id = `f-${field.name}`;

  if (field.type === "hidden") {
    return <Controller control={control} name={field.name} render={({ field: f }) => <input type="hidden" {...f} value={f.value ?? ""} />} />;
  }

  const list = field.options ?? options;
  const filtered = field.dependsOn ? list.filter((o) => !parentValue || o.parent === parentValue) : list;

  return (
    <div className={cn("flex flex-col gap-1.5", field.wide && "sm:col-span-2")}>
      {field.type !== "checkbox" && (
        <Label htmlFor={id} className="text-[13px] font-medium text-foreground/80">
          {field.label}
          {field.required ? <span className="text-destructive"> *</span> : null}
        </Label>
      )}
      <Controller
        control={control}
        name={field.name}
        render={({ field: f }) => {
          switch (field.type) {
            case "textarea":
              return <Textarea id={id} rows={2} {...f} value={f.value ?? ""} placeholder={field.placeholder} aria-invalid={!!error} />;
            case "select":
              return (
                <SearchSelect
                  id={id}
                  value={(f.value as string) ?? ""}
                  onChange={f.onChange}
                  options={filtered}
                  invalid={!!error}
                  placeholder={field.dependsOn && !parentValue ? "Select the parent first" : field.placeholder ?? "Select…"}
                  clearable={!field.required}
                />
              );
            case "checkbox":
              return (
                <label htmlFor={id} className="flex h-9 items-center gap-2 text-sm">
                  <Checkbox id={id} checked={Boolean(f.value)} onCheckedChange={(v) => f.onChange(v === true)} />
                  {field.label}
                </label>
              );
            default:
              return (
                <Input
                  id={id}
                  type={field.type === "money" ? "number" : field.type}
                  inputMode={field.type === "number" || field.type === "money" ? "decimal" : undefined}
                  step={field.step ?? (field.type === "money" ? 0.01 : field.integer ? 1 : undefined)}
                  min={field.min}
                  max={field.max}
                  placeholder={field.placeholder}
                  aria-invalid={!!error}
                  {...f}
                  value={(f.value as string) ?? ""}
                  className="tabular"
                />
              );
          }
        }}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
    </div>
  );
}
