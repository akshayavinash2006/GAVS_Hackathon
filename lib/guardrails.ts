import type { Actor, CreditEntry, Order, OrderItem, OrderStatus, Shop, Sku } from "./types";
import { DAY_MS } from "./util";

// Hard boundaries from the problem statement, enforced in code, never by prompt:
//   1. Purchases stay within the cash budget the owner sets.
//   2. The owner approves every order. Agents and cron can only create drafts.

export class GuardrailError extends Error {
  constructor(
    message: string,
    public code: "over_budget" | "not_allowed" | "invalid_item" | "bad_transition",
  ) {
    super(message);
  }
}

export interface BudgetView {
  weekly_budget: number;
  credit_outstanding: number;
  credit_reserve: number;
  committed_7d: number; // approved orders in the last 7 days
  usable: number; // budget − reserve
  available: number; // usable − committed
}

export function creditOutstanding(entries: CreditEntry[]): number {
  const byCustomer = new Map<string, number>();
  for (const e of entries) byCustomer.set(e.customer, (byCustomer.get(e.customer) ?? 0) + e.amount);
  let total = 0;
  for (const v of byCustomer.values()) if (v > 0) total += v;
  return Math.round(total);
}

/**
 * Money lent to customers on khata is money not in the till. We hold back 20%
 * of what is outstanding (capped at 40% of the budget) so the shop isn't caught
 * short when a distributor wants cash on delivery.
 */
export function budgetView(shop: Shop, credit: CreditEntry[], orders: Order[], now: Date = new Date()): BudgetView {
  const outstanding = creditOutstanding(credit);
  const reserve = Math.round(Math.min(0.4 * shop.cash_budget, 0.2 * outstanding));
  const since = now.getTime() - 7 * DAY_MS;
  const committed = orders
    .filter((o) => o.status === "approved" && Date.parse(o.decided_at ?? o.created_at) >= since)
    .reduce((s, o) => s + o.total, 0);
  const usable = Math.max(0, shop.cash_budget - reserve);
  return {
    weekly_budget: shop.cash_budget,
    credit_outstanding: outstanding,
    credit_reserve: reserve,
    committed_7d: Math.round(committed),
    usable,
    available: Math.max(0, Math.round(usable - committed)),
  };
}

const MAX_QTY = 5000;

/** Prices come from our catalog / last bill, never from the model. */
export function priceItems(
  items: { sku_id: string; qty: number; reason?: string; unit_cost?: number }[],
  skus: Map<string, Sku>,
  lastCost: Map<string, number> = new Map(),
): OrderItem[] {
  if (!items.length) throw new GuardrailError("Order has no items", "invalid_item");
  return items.map((it) => {
    const sku = skus.get(it.sku_id);
    if (!sku) throw new GuardrailError(`Unknown item: ${it.sku_id}`, "invalid_item");
    const qty = Math.round(Number(it.qty));
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY)
      throw new GuardrailError(`Invalid quantity for ${sku.name}: ${it.qty}`, "invalid_item");
    return {
      sku_id: sku.id,
      name: sku.name,
      qty,
      unit_cost: lastCost.get(sku.id) ?? sku.cost,
      reason: it.reason ?? "",
    };
  });
}

export function orderTotal(items: OrderItem[]): number {
  return Math.round(items.reduce((s, i) => s + i.qty * i.unit_cost, 0));
}

export function assertWithinBudget(total: number, budget: BudgetView, what = "This order"): void {
  if (total > budget.available) {
    throw new GuardrailError(
      `${what} (₹${total.toLocaleString("en-IN")}) is more than the ₹${budget.available.toLocaleString("en-IN")} left in this week's budget.`,
      "over_budget",
    );
  }
}

/** Whoever creates an order, it always starts as a draft waiting for the owner. */
export function initialStatus(_actor: Actor): OrderStatus {
  return "pending_approval";
}

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, Actor[]>>> = {
  pending_approval: {
    approved: ["owner"],
    rejected: ["owner"],
    cancelled: ["owner", "system"],
  },
  approved: {},
  rejected: {},
  cancelled: {},
};

export function assertTransition(order: Order, to: OrderStatus, actor: Actor): void {
  const allowed = TRANSITIONS[order.status][to];
  if (!allowed) throw new GuardrailError(`Cannot move an order from ${order.status} to ${to}`, "bad_transition");
  if (!allowed.includes(actor)) throw new GuardrailError(`Only the owner can mark an order ${to}`, "not_allowed");
}

/** Approval re-checks the budget at the moment the owner says yes. */
export function approveOrder(order: Order, actor: Actor, budget: BudgetView, now: Date = new Date()): Order {
  assertTransition(order, "approved", actor);
  const total = orderTotal(order.items);
  assertWithinBudget(total, budget);
  return { ...order, total, status: "approved", decided_at: now.toISOString() };
}
