"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Undo2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchSelect } from "@/components/forms/search-select";
import { createReturn } from "@/app/actions/documents";
import { PAYMENT_METHODS } from "@/lib/forms/schema";
import { formatCurrency, formatNumber } from "@/lib/format";
import { returnCredit } from "@/lib/calc";
import type { Option } from "@/lib/types";

interface Item {
  id: string;
  grade: string;
  quantity_eggs: number;
  returned_eggs: number;
  line_total: number;
}

interface Props {
  kind: "sale" | "purchase";
  docId: string;
  today: string;
  items: Item[];
  subtotal: number;
  discount: number;
  taxRate: number;
  /** Amount already paid beyond what is owed today (before this return). */
  balanceDue: number;
  walkIn: boolean;
  accounts: Option[];
}

export function ReturnDialog({ kind, docId, today, items, subtotal, discount, taxRate, balanceDue, walkIn, accounts }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [qty, setQty] = React.useState<Record<string, string>>({});
  const [cond, setCond] = React.useState<Record<string, "good" | "damaged">>({});
  const [date, setDate] = React.useState(today);
  const [reason, setReason] = React.useState("");
  const [refund, setRefund] = React.useState("0");
  const [account, setAccount] = React.useState(accounts[0]?.value ?? "");
  const [method, setMethod] = React.useState("cash");

  const credit = items.reduce((a, it) => {
    const q = Number(qty[it.id] || 0);
    if (!q) return a;
    return a + returnCredit({ lineTotal: it.line_total, lineEggs: it.quantity_eggs, qty: q, subtotal, discount, taxRate: kind === "sale" ? taxRate : 0 }).total;
  }, 0);
  const overpaid = Math.max(0, credit - balanceDue);

  const submit = () =>
    start(async () => {
      const res = await createReturn({
        kind,
        doc_id: docId,
        return_date: date,
        reason,
        refund_amount: walkIn ? 0 : Number(refund || 0),
        cash_account_id: account || null,
        payment_method: method,
        items: items.map((it) => ({ item_id: it.id, quantity_eggs: Number(qty[it.id] || 0), condition: cond[it.id] ?? "good" })),
      });
      if (res.ok) {
        toast.success(res.message ?? "Return recorded");
        setOpen(false);
        setQty({});
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Undo2 /> {kind === "sale" ? "Sales return" : "Return to supplier"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kind === "sale" ? "Record a customer return" : "Return eggs to supplier"}</DialogTitle>
          <DialogDescription>
            {kind === "sale"
              ? "Good eggs go back into stock; damaged eggs are written off as a loss. The credit is the egg's share of the invoice after discount, plus tax."
              : "Returned eggs leave stock and reduce what you owe the supplier."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {items.map((it) => {
            const left = it.quantity_eggs - it.returned_eggs;
            return (
              <div key={it.id} className="grid grid-cols-[1fr_7rem] items-center gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_7rem_8rem]">
                <div>
                  <p className="text-sm font-medium">{it.grade}</p>
                  <p className="text-xs text-muted-foreground">{formatNumber(left)} of {formatNumber(it.quantity_eggs)} eggs returnable</p>
                </div>
                <Input type="number" min={0} max={left} step={1} placeholder="Eggs" className="tabular text-right" value={qty[it.id] ?? ""} onChange={(e) => setQty({ ...qty, [it.id]: e.target.value })} disabled={left <= 0} aria-label={`Eggs to return for ${it.grade}`} />
                {kind === "sale" ? (
                  <SearchSelect value={cond[it.id] ?? "good"} onChange={(x) => setCond({ ...cond, [it.id]: (x || "good") as "good" | "damaged" })} options={[{ value: "good", label: "Good — restock" }, { value: "damaged", label: "Damaged — loss" }]} clearable={false} className="col-span-2 sm:col-span-1" />
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ret-date">Return date</Label>
            <Input id="ret-date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Credit value</p>
            <p className="tabular flex h-9 items-center text-base font-semibold">{formatCurrency(credit)}</p>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="ret-reason">Reason</Label>
            <Textarea id="ret-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {walkIn ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">Walk-in sale: the credit ({formatCurrency(overpaid)}) is refunded in cash automatically.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ret-refund">{kind === "sale" ? "Cash refund to customer" : "Cash refund from supplier"}</Label>
                <Input id="ret-refund" type="number" min={0} step="0.01" className="tabular text-right" value={refund} onChange={(e) => setRefund(e.target.value)} />
                <p className="text-xs text-muted-foreground">Up to {formatCurrency(overpaid)} (amount already paid beyond the new balance). Leave 0 to keep it as account credit.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">Refund account / method</p>
                <SearchSelect value={account} onChange={setAccount} options={accounts} />
                <SearchSelect value={method} onChange={setMethod} options={PAYMENT_METHODS} clearable={false} />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || credit <= 0}>
            {pending ? <Loader2 className="animate-spin" /> : null} Post return
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
