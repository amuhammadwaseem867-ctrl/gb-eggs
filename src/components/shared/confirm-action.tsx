"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { deleteEntity, runRpc } from "@/app/actions/entities";

interface Props {
  /** RPC name (allow-listed server side). */
  rpc?: string;
  args?: Record<string, unknown>;
  /** Or delete an entity row. */
  deleteEntity?: { entity: string; id: string };
  title: string;
  description: string;
  confirmLabel?: string;
  requireReason?: boolean;
  trigger: React.ReactNode;
  destructive?: boolean;
}

/** Confirmation dialog for irreversible actions (cancel, void, delete). */
export function ConfirmAction({ rpc, args = {}, deleteEntity: del, title, description, confirmLabel = "Confirm", requireReason, trigger, destructive = true }: Props) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();

  const run = () =>
    start(async () => {
      const res = del
        ? await deleteEntity(del.entity, del.id)
        : await runRpc(rpc!, requireReason ? { ...args, p_reason: reason } : args);
      if (res.ok) {
        toast.success(res.message ?? "Done");
        setOpen(false);
        setReason("");
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireReason ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason (kept in the audit trail)</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Back</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={pending || (requireReason && !reason.trim())}
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
            >
              {pending ? <Loader2 className="animate-spin" /> : null}
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
