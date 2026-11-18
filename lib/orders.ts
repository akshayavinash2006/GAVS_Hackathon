import type { Store } from "./db/store";
import {
  GuardrailError,
  approveOrder,
  assertTransition,
  assertWithinBudget,
  initialStatus,
  orderTotal,
  priceItems,
} from "./guardrails";
import { buildSnapshot, type ShopSnapshot } from "./snapshot";
import type { Actor, Order } from "./types";
import { groupBy, uid } from "./util";

// The only code paths that create or change orders. Every caller (web, agent,
// WhatsApp, cron) goes through here so the guardrails can't be skipped.

export interface DraftRequest {
  items?: { sku_id: string; qty: number; reason?: string }[]; // omit to use the planner's lines
  note?: string;
}

/** Creates one pending_approval order per distributor. Never places anything. */
export async function createDraftOrders(store: Store, snap: ShopSnapshot, actor: Actor, req: DraftRequest = {}): Promise<Order[]> {
  const planned = req.items?.length
    ? req.items
    : snap.plan.lines.map((l) => ({ sku_id: l.sku_id, qty: l.qty, reason: l.reason }));
  if (!planned.length) return [];

  const priced = priceItems(planned, snap.skuMap, snap.lastCost);
  const total = orderTotal(priced);
  // Drafts that already exist count against the budget too, so a draft is only
  // ever something the owner could actually afford to approve.
  const pendingValue = snap.pending.reduce((s, o) => s + o.total, 0);
  assertWithinBudget(total + pendingValue, snap.budget, pendingValue ? "This order plus your other drafts" : "This order");

  const byDist = groupBy(priced, (it) => {
    const row = snap.inventory.find((r) => r.sku.id === it.sku_id);
    return row?.distributor?.id ?? "wholesale";
  });
  const now = new Date().toISOString();
  const orders: Order[] = [];
  for (const [distId, items] of byDist) {
    const dist = snap.distributors.find((d) => d.id === distId) ?? null;
    const order: Order = {
      id: uid("ord"),
      shop_id: snap.shop.id,
      distributor_id: dist?.id ?? null,
      distributor_name: dist?.name ?? "Wholesale market",
      status: initialStatus(actor),
      total: orderTotal(items),
      items,
      created_by: actor,
      note: req.note ?? null,
      joint_group_id: null,
      created_at: now,
      decided_at: null,
    };
    await store.addOrder(order);
    orders.push(order);
  }
  return orders;
}

export async function decideOrder(
  store: Store,
  shopId: string,
  orderId: string,
  decision: "approve" | "reject" | "cancel",
  actor: Actor,
): Promise<Order> {
  const order = await store.getOrder(orderId);
  if (!order || order.shop_id !== shopId) throw new GuardrailError("Order not found", "not_allowed");
  const now = new Date();
  let next: Order;
  if (decision === "approve") {
    const snap = await buildSnapshot(store, shopId, now);
    if (!snap) throw new GuardrailError("Shop not found", "not_allowed");
    next = approveOrder(order, actor, snap.budget, now);
  } else {
    const to = decision === "reject" ? "rejected" : "cancelled";
    assertTransition(order, to, actor);
    next = { ...order, status: to, decided_at: now.toISOString() };
  }
  const ok = await store.updateOrder(order.id, { status: next.status, total: next.total, decided_at: next.decided_at }, "pending_approval");
  if (!ok) throw new GuardrailError("This order was already decided", "bad_transition");
  return next;
}

/** Owner edits quantities on a draft. Prices are re-derived; budget re-checked. */
export async function editDraft(
  store: Store,
  shopId: string,
  orderId: string,
  items: { sku_id: string; qty: number }[],
): Promise<Order> {
  const order = await store.getOrder(orderId);
  if (!order || order.shop_id !== shopId) throw new GuardrailError("Order not found", "not_allowed");
  if (order.status !== "pending_approval") throw new GuardrailError("Only drafts can be edited", "bad_transition");
  const snap = await buildSnapshot(store, shopId);
  if (!snap) throw new GuardrailError("Shop not found", "not_allowed");
  const reasons = new Map(order.items.map((i) => [i.sku_id, i.reason]));
  const kept = items.filter((i) => i.qty > 0);
  if (!kept.length) return decideOrder(store, shopId, orderId, "cancel", "owner");
  const priced = priceItems(kept.map((i) => ({ ...i, reason: reasons.get(i.sku_id) ?? "added by owner" })), snap.skuMap, snap.lastCost);
  const total = orderTotal(priced);
  const otherPending = snap.pending.filter((o) => o.id !== orderId).reduce((s, o) => s + o.total, 0);
  assertWithinBudget(total + otherPending, snap.budget, otherPending ? "This draft plus your other drafts" : "This draft");
  const ok = await store.updateOrder(orderId, { items: priced, total }, "pending_approval");
  if (!ok) throw new GuardrailError("This order was already decided", "bad_transition");
  return { ...order, items: priced, total };
}
