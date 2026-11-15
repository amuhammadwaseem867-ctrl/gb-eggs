"use client";

import * as React from "react";
import { Pencil, Plus } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EntityForm, type EntityFormProps } from "@/components/forms/entity-form";
import { getEntity } from "@/lib/forms/entities";

interface Props extends Omit<EntityFormProps, "onDone" | "onCancel"> {
  label?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "xs" | "icon-sm";
  description?: string;
  icon?: "plus" | "edit" | "none";
}

export function EntityDialog({ label, variant = "default", size = "default", description, icon, ...form }: Props) {
  const [open, setOpen] = React.useState(false);
  const def = getEntity(form.entity);
  const editing = Boolean(form.id);
  const Icon = (icon ?? (editing ? "edit" : "plus")) === "edit" ? Pencil : Plus;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} aria-label={label ?? (editing ? `Edit ${def.title}` : `New ${def.title}`)}>
          {icon !== "none" ? <Icon /> : null}
          {size === "icon-sm" ? null : label ?? (editing ? "Edit" : `New ${def.title.toLowerCase()}`)}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${def.title.toLowerCase()}` : def.title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {open ? <EntityForm {...form} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
