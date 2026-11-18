"use client";

import { Check, ChevronDown, Loader2, Minus, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Order } from "@/lib/types";
import { cn, inr } from "@/lib/util";
import { api } from "./actions";
import { btn } from "./ui";

const PREVIEW = 4;

export function OrderCard({ order }: { order: Order }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(order.items.map((i) => [i.sku_id, i.qty])));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);

  const editedTotal = Math.round(order.items.reduce((s, i) => s + (qty[i.sku_id] ?? 0) * i.unit_cost, 0));
  const items = editing || expanded ? order.items : order.items.slice(0, PREVIEW);

  async function act(action: "approve" | "reject" | "edit") {
    setBusy(action);
    setError(null);
    try {
      await api(`/api/orders/${order.id}`, {
        method: "PATCH",
        body: action === "edit" ? { action, items: order.items.map((i) => ({ sku_id: i.sku_id, qty: qty[i.sku_id] ?? 0 })) } : { action },
      });
      setEditing(false);
      if (action !== "edit") {
        setDone(action === "approve" ? "approved" : "rejected");
        setTimeout(() => router.refresh(), 700);
      } else router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={cn("overflow-hidden rounded-3xl border bg-surface transition-all duration-500", done === "approved" ? "border-good/50 opacity-60" : done ? "border-line opacity-40" : "border-line")}>
      <div className="flex items-center gap-3 p-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-3 text-sm font-bold text-ink-2">
          {order.distributor_name
            .replace(/\(.*\)/, "")
            .trim()
            .split(" ")
            .slice(0, 2)
            .map((w) => w[0])
            .join("")}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{order.distributor_name.split(" (")[0]}</div>
          <div className="text-xs text-ink-3">
            {order.items.length} items{order.created_by === "cron" ? " · by morning agent" : ""}
          </div>
        </div>
        <div className="tabular text-xl font-semibold">{inr(editing ? editedTotal : order.total)}</div>
      </div>

      <ul className="space-y-0.5 px-2">
        {items.map((i) => (
          <li key={i.sku_id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm" title={i.reason}>
            <span className="min-w-0 flex-1 truncate text-ink-2">{i.name}</span>
            {editing ? (
              <div className="flex shrink-0 items-center gap-1">
                <button aria-label="less" className="grid h-8 w-8 place-items-center rounded-xl bg-surface-3" onClick={() => setQty((q) => ({ ...q, [i.sku_id]: Math.max(0, (q[i.sku_id] ?? 0) - 1) }))}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <input
                  inputMode="numeric"
                  className="tabular w-11 rounded-lg bg-transparent py-1 text-center font-semibold outline-none"
                  value={qty[i.sku_id] ?? 0}
                  onChange={(e) => setQty((q) => ({ ...q, [i.sku_id]: Number(e.target.value.replace(/\D/g, "")) || 0 }))}
                />
                <button aria-label="more" className="grid h-8 w-8 place-items-center rounded-xl bg-surface-3" onClick={() => setQty((q) => ({ ...q, [i.sku_id]: (q[i.sku_id] ?? 0) + 1 }))}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <span className="tabular shrink-0 font-medium">×{i.qty}</span>
            )}
          </li>
        ))}
      </ul>
      {!editing && order.items.length > PREVIEW && (
        <button onClick={() => setExpanded((x) => !x)} className="mx-4 mt-1 inline-flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink-2">
          {expanded ? "Less" : `+${order.items.length - PREVIEW} more`} <ChevronDown className={cn("h-3.5 w-3.5 transition", expanded && "rotate-180")} />
        </button>
      )}

      <div className="flex gap-2 p-4 pt-3">
        {done ? (
          <div className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold", done === "approved" ? "bg-good-soft text-good-text" : "bg-surface-2 text-ink-3")}>
            {done === "approved" ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />} {done === "approved" ? "Approved" : "Rejected"}
          </div>
        ) : editing ? (
          <>
            <button className={btn.primary + " flex-1"} disabled={!!busy} onClick={() => act("edit")}>
              {busy === "edit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
            </button>
            <button className={btn.secondary} disabled={!!busy} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className={btn.primary + " flex-1"} disabled={!!busy} onClick={() => act("approve")}>
              {busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
            </button>
            <button className={btn.secondary + " px-3.5"} disabled={!!busy} onClick={() => setEditing(true)} aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
            <button className={btn.danger + " px-3.5"} disabled={!!busy} onClick={() => act("reject")} aria-label="Reject">
              {busy === "reject" ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>
      {error && <p className="px-4 pb-4 text-sm text-critical">{error}</p>}
    </div>
  );
}
