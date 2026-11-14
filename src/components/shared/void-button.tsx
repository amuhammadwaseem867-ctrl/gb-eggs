import { Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-action";

/** Small "Void" row action that calls an allow-listed RPC with a reason. */
export function VoidButton({ rpc, args, what = "record", label = "Void" }: { rpc: string; args: Record<string, unknown>; what?: string; label?: string }) {
  return (
    <ConfirmAction
      rpc={rpc}
      args={args}
      requireReason
      title={`${label} this ${what}?`}
      description="The record stays in the history marked as void, and its stock / cash effects are reversed. This cannot be undone."
      confirmLabel={label}
      trigger={
        <Button variant="ghost" size="xs" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Ban /> {label}
        </Button>
      }
    />
  );
}

export function DeleteButton({ entity, id, what = "record" }: { entity: string; id: string; what?: string }) {
  return (
    <ConfirmAction
      deleteEntity={{ entity, id }}
      title={`Delete this ${what}?`}
      description="Only records that are not used anywhere else can be deleted. Consider deactivating instead."
      confirmLabel="Delete"
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${what}`} className="text-muted-foreground hover:text-destructive">
          <Trash2 />
        </Button>
      }
    />
  );
}
