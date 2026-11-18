import { CATALOG } from "@/data/catalog";
import type { Store } from "./db/store";
import {
  applicableFestivals,
  batchRisks,
  computeSkuStats,
  daysUntilVisit,
  forecastDemand,
  upcomingFestivals,
  type BatchRisk,
  type Forecast,
  type SkuStats,
} from "./forecast";
import { budgetView, type BudgetView } from "./guardrails";
import { planReorder, type ReorderPlan } from "./reorder";
import { SkuMatcher } from "./sku-match";
import type { Batch, CreditEntry, Distributor, Festival, Order, Shop, Sku, SkuAlias, StockEvent } from "./types";
import { DAY_MS, groupBy, round } from "./util";

/** Beyond this, unsold units are "slow stock", not an expiry emergency. */
export const EXPIRY_ALERT_DAYS = 60;

export type StockStatus = "out" | "low" | "ok" | "slow" | "at_risk";

export interface InventoryRow {
  sku: Sku;
  stats: SkuStats;
  risks: BatchRisk[];
  distributor: Distributor | null;
  forecast7: Forecast;
  unit_cost: number;
  stock_value: number;
  status: StockStatus;
}

export interface ExpiryAction {
  kind: "return" | "discount" | "bundle" | "writeoff" | "transfer";
  label: string;
  detail: string;
}

export interface ExpiryAlert {
  risk: BatchRisk;
  sku: Sku;
  action: ExpiryAction;
}

export interface ShopSnapshot {
  shop: Shop;
  now: Date;
  skus: Sku[];
  skuMap: Map<string, Sku>;
  distributors: Distributor[];
  inventory: InventoryRow[];
  expiring: ExpiryAlert[];
  budget: BudgetView;
  plan: ReorderPlan;
  orders: Order[];
  pending: Order[];
  festivals: (Festival & { days_away: number })[];
  lastCost: Map<string, number>;
  matcher: SkuMatcher;
  metrics: {
    stock_value: number;
    value_at_risk: number;
    slow_stock_value: number;
    out_count: number;
    low_count: number;
    stockouts_30d: number;
    writeoff_value_30d: number;
  };
}

export function suggestExpiryAction(risk: BatchRisk, sku: Sku, dist: Distributor | null, now: Date): ExpiryAction {
  const visitIn = dist ? daysUntilVisit(dist.visit_days, now, dist.lead_days) : null;
  if (risk.expired) {
    return dist?.accepts_returns
      ? { kind: "return", label: "Remove & claim credit", detail: `Expired. Take it off the shelf and ask ${dist.name} for a credit note on the next visit.` }
      : { kind: "writeoff", label: "Remove from shelf", detail: "Expired. Take it off the shelf today, because selling it risks customers' trust." };
  }
  if (risk.days_to_expiry <= 7) {
    const pct = risk.days_to_expiry <= 3 ? 25 : 15;
    const price = Math.round(sku.mrp * (1 - pct / 100));
    return { kind: "discount", label: `Sell at ₹${price} (−${pct}%)`, detail: `Put it at the counter. ${risk.units_at_risk} units won't sell at the normal pace in ${risk.days_to_expiry} days.` };
  }
  if (dist?.accepts_returns && visitIn !== null && visitIn < risk.days_to_expiry - 2) {
    return { kind: "return", label: "Return to distributor", detail: `Hand ${risk.units_at_risk} units back to ${dist.name} on the visit in ${visitIn} day(s), before expiry.` };
  }
  return { kind: "bundle", label: "Bundle / small discount", detail: `Offer ${risk.units_at_risk} units with a fast mover or at 10% off; ${risk.days_to_expiry} days left.` };
}

export async function buildSnapshot(store: Store, shopId: string, now: Date = new Date()): Promise<ShopSnapshot | null> {
  const shop = await store.getShop(shopId);
  if (!shop) return null;
  const [custom, aliases, distributors, batches, events, credit, orders] = await Promise.all([
    store.listCustomSkus(shopId),
    store.listAliases(shopId),
    store.listDistributors(shopId),
    store.listBatches(shopId),
    store.listEvents(shopId),
    store.listCredit(shopId),
    store.listOrders(shopId),
  ]);
  return computeSnapshot({ shop, custom, aliases, distributors, batches, events, credit, orders, now });
}

export function computeSnapshot(input: {
  shop: Shop;
  custom: Sku[];
  aliases: SkuAlias[];
  distributors: Distributor[];
  batches: Batch[];
  events: StockEvent[];
  credit: CreditEntry[];
  orders: Order[];
  now: Date;
}): ShopSnapshot {
  const { shop, custom, aliases, distributors, batches, events, credit, orders, now } = input;
  const allSkus: Sku[] = [...CATALOG, ...custom];
  const skuMap = new Map(allSkus.map((s) => [s.id, s]));
  const distMap = new Map(distributors.map((d) => [d.id, d]));
  const batchesBySku = groupBy(batches, (b) => b.sku_id);
  const eventsBySku = groupBy(events, (e) => e.sku_id);

  const lastCost = new Map<string, number>();
  const lastDist = new Map<string, string>();
  for (const b of [...batches].sort((a, b) => a.purchased_at.localeCompare(b.purchased_at))) {
    lastCost.set(b.sku_id, b.unit_cost);
    if (b.distributor_id) lastDist.set(b.sku_id, b.distributor_id);
  }
  const distributorFor = (sku: Sku): Distributor | null =>
    (lastDist.get(sku.id) && distMap.get(lastDist.get(sku.id)!)) ||
    distributors.find((d) => d.categories.includes(sku.category)) ||
    distributors.find((d) => d.kind === "wholesale") ||
    null;

  const festivals = applicableFestivals(shop.region);
  const stats = new Map<string, SkuStats>();
  const risks = new Map<string, BatchRisk[]>();
  const inventory: InventoryRow[] = [];
  const skus = allSkus.filter((s) => batchesBySku.has(s.id));

  for (const sku of skus) {
    const bs = batchesBySku.get(sku.id) ?? [];
    const st = computeSkuStats(sku, bs, eventsBySku.get(sku.id) ?? [], now, festivals);
    const rk = batchRisks(bs, st, now);
    stats.set(sku.id, st);
    risks.set(sku.id, rk);
    const dist = distributorFor(sku);
    const lead = dist ? daysUntilVisit(dist.visit_days, now, dist.lead_days) : 2;
    const unit = lastCost.get(sku.id) ?? sku.cost;
    let status: StockStatus = "ok";
    if (rk.some((x) => x.days_to_expiry <= EXPIRY_ALERT_DAYS)) status = "at_risk";
    else if (st.stock < 0.5) status = "out";
    else if (st.days_cover <= lead + 2) status = "low";
    else if (st.days_cover > 45) status = "slow";
    inventory.push({
      sku,
      stats: st,
      risks: rk,
      distributor: dist,
      forecast7: forecastDemand(st.velocity, sku.category, now, 7, festivals),
      unit_cost: unit,
      stock_value: Math.round(st.stock * unit),
      status,
    });
  }

  const expiring: ExpiryAlert[] = inventory
    .flatMap((row) => row.risks.map((risk) => ({ risk, sku: row.sku, action: suggestExpiryAction(risk, row.sku, row.distributor, now) })))
    .filter((a) => a.risk.days_to_expiry <= EXPIRY_ALERT_DAYS)
    .sort((a, b) => a.risk.days_to_expiry - b.risk.days_to_expiry || b.risk.value_at_risk - a.risk.value_at_risk);

  const budget = budgetView(shop, credit, orders, now);
  const pending = orders.filter((o) => o.status === "pending_approval");
  const pendingQty = new Map<string, number>();
  const inTransitSince = now.getTime() - 3 * DAY_MS;
  for (const o of orders) {
    const counts = o.status === "pending_approval" || (o.status === "approved" && Date.parse(o.decided_at ?? o.created_at) >= inTransitSince);
    if (!counts) continue;
    for (const it of o.items) pendingQty.set(it.sku_id, (pendingQty.get(it.sku_id) ?? 0) + it.qty);
  }
  // Drafts waiting for approval aren't spent yet, but the plan shouldn't double-count them.
  const pendingValue = pending.reduce((s, o) => s + o.total, 0);

  const plan = planReorder({
    skus,
    stats,
    risks,
    distributorFor,
    lastCost,
    pendingQty,
    festivals,
    now,
    availableBudget: Math.max(0, budget.available - pendingValue),
  });

  const since30 = now.getTime() - 30 * DAY_MS;
  const writeoff_value_30d = Math.round(
    events
      .filter((e) => e.type === "writeoff" && Date.parse(e.ts) >= since30)
      .reduce((s, e) => s + e.qty * (lastCost.get(e.sku_id) ?? skuMap.get(e.sku_id)?.cost ?? 0), 0),
  );

  return {
    shop,
    now,
    skus,
    skuMap,
    distributors,
    inventory: inventory.sort((a, b) => a.stats.days_cover - b.stats.days_cover),
    expiring,
    budget,
    plan,
    orders,
    pending,
    festivals: upcomingFestivals(now, 30, festivals),
    lastCost,
    matcher: new SkuMatcher(allSkus, aliases),
    metrics: {
      stock_value: inventory.reduce((s, r) => s + r.stock_value, 0),
      value_at_risk: expiring.reduce((s, a) => s + a.risk.value_at_risk, 0),
      slow_stock_value: inventory.filter((r) => r.status === "slow").reduce((s, r) => s + r.stock_value, 0),
      out_count: inventory.filter((r) => r.status === "out").length,
      low_count: inventory.filter((r) => r.status === "low").length,
      stockouts_30d: inventory.reduce((s, r) => s + r.stats.stockouts_30d, 0),
      writeoff_value_30d,
    },
  };
}

export function velocityLabel(v: number): string {
  if (v >= 1) return `${round(v, 1)}/day`;
  if (v > 0) return `${round(v * 7, 1)}/week`;
  return "no sales seen";
}
