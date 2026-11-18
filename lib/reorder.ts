import { daysUntilVisit, forecastDemand, type BatchRisk, type SkuStats } from "./forecast";
import type { Distributor, Festival, Sku } from "./types";
import { clamp, round } from "./util";

export interface ReorderLine {
  sku_id: string;
  name: string;
  category: Sku["category"];
  qty: number;
  unit_cost: number;
  line_total: number;
  distributor_id: string | null;
  distributor_name: string;
  priority: number;
  urgency: "critical" | "soon" | "top-up";
  days_cover: number;
  forecast_units: number;
  festival: string | null;
  reason: string;
}

export interface ReorderPlan {
  available_budget: number;
  total: number;
  lines: ReorderLine[];
  deferred: ReorderLine[]; // wanted, but didn't fit in the budget
  held_back: { sku_id: string; name: string; reason: string }[]; // deliberately not reordered
}

export interface PlanInput {
  skus: Sku[];
  stats: Map<string, SkuStats>;
  risks: Map<string, BatchRisk[]>;
  distributorFor: (sku: Sku) => Distributor | null;
  lastCost: Map<string, number>;
  pendingQty: Map<string, number>; // already in a pending/approved order not yet delivered
  festivals: Festival[];
  now: Date;
  availableBudget: number;
  safetyDays?: number;
}

/** Perishables: never buy more than this share of what sells before expiry. */
const PERISHABLE_FILL = 0.8;

type Want = ReorderLine & { min_qty: number; case_qty: number };

/**
 * Two passes under a hard cash limit:
 *   1. In priority order, buy just enough of each item to last until the
 *      next delivery plus a safety margin. No shelf should go empty.
 *   2. With what's left, top items up to a full cycle's worth, in priority order.
 * This spreads a tight budget across many items instead of one big line.
 */
export function planReorder(input: PlanInput): ReorderPlan {
  const safety = input.safetyDays ?? 2;
  const wanted: Want[] = [];
  const held_back: ReorderPlan["held_back"] = [];

  for (const sku of input.skus) {
    const st = input.stats.get(sku.id);
    if (!st || st.velocity <= 0.01) continue;

    const risk = input.risks.get(sku.id) ?? [];
    const atRiskUnits = risk.reduce((s, r) => s + r.units_at_risk, 0);
    if (atRiskUnits > 0) {
      held_back.push({ sku_id: sku.id, name: sku.name, reason: `${atRiskUnits} units may expire unsold, so clear those first` });
      continue;
    }

    const dist = input.distributorFor(sku);
    const lead = dist ? daysUntilVisit(dist.visit_days, input.now, dist.lead_days) : 2;
    const cycle = dist && dist.visit_days.length ? Math.max(1, Math.round(7 / dist.visit_days.length)) : 7;
    const pending = input.pendingQty.get(sku.id) ?? 0;
    const fc = forecastDemand(st.velocity, sku.category, input.now, lead + cycle + safety, input.festivals);
    const fcMin = forecastDemand(st.velocity, sku.category, input.now, lead + Math.min(cycle, safety) + 1, input.festivals);
    let need = fc.units - st.stock - pending;
    if (need < 0.5) continue;
    let minNeed = Math.max(1, Math.min(need, fcMin.units - st.stock - pending));

    // Dead-stock prevention for short shelf-life items.
    if (sku.shelf_life_days <= 30) {
      const maxSellable = st.velocity * sku.shelf_life_days * PERISHABLE_FILL * (fc.peak_mult || 1);
      need = Math.min(need, Math.max(1, maxSellable - st.stock));
      minNeed = Math.min(minNeed, need);
    }

    const caseQty = Math.max(1, sku.case_qty);
    let qty = Math.ceil(need);
    // Round to full cases only for long-life goods and when it doesn't more than double the need.
    if (caseQty > 1 && sku.shelf_life_days > 30 && need >= caseQty * 0.5) {
      const cases = Math.ceil(need / caseQty) * caseQty;
      if (cases <= need * 2) qty = cases;
    }

    const unit = input.lastCost.get(sku.id) ?? sku.cost;
    const urgency: ReorderLine["urgency"] =
      st.days_cover <= lead + 1 ? "critical" : st.days_cover <= lead + safety + 1 ? "soon" : "top-up";
    const margin = clamp((sku.mrp - unit) / unit, 0, 0.5);
    const priority = round(
      (urgency === "critical" ? 10 : urgency === "soon" ? 6 : 2) +
        (fc.festival ? 2 * (fc.peak_mult - 1) : 0) +
        margin * 8 +
        Math.min(st.velocity, 10) * 0.3 +
        Math.min(st.stockouts_30d, 3) * 0.8,
      2,
    );

    const why: string[] = [];
    if (st.stock <= 0.5) why.push("out of stock");
    else why.push(`~${Math.round(st.stock)} left, ${st.days_cover.toFixed(1)} days of cover`);
    if (lead > 0) why.push(`next ${dist?.name.split(" (")[0] ?? "supply"} visit in ${lead}d`);
    if (fc.festival) why.push(`${fc.festival} demand ×${fc.peak_mult}`);
    if (st.stockouts_30d) why.push(`ran out ${st.stockouts_30d}× in 30 days`);

    wanted.push({
      sku_id: sku.id,
      name: sku.name,
      category: sku.category,
      qty,
      min_qty: Math.min(qty, Math.ceil(minNeed)),
      case_qty: caseQty,
      unit_cost: unit,
      line_total: Math.round(qty * unit),
      distributor_id: dist?.id ?? null,
      distributor_name: dist?.name ?? "Wholesale market",
      priority,
      urgency,
      days_cover: st.days_cover,
      forecast_units: fc.units,
      festival: fc.festival,
      reason: why.join("; "),
    });
  }

  wanted.sort((a, b) => b.priority - a.priority);
  let budget = Math.floor(Math.max(0, input.availableBudget));
  // Whole rupees, rounded up, so the sum of line totals can never exceed the budget.
  const cost = (q: number, unit: number) => Math.ceil(q * unit);
  const maxAffordable = (unit: number) => {
    let q = Math.floor(budget / unit);
    while (q > 0 && cost(q, unit) > budget) q--;
    return q;
  };
  const alloc = new Map<string, number>();

  // Pass 1: cover until the next delivery.
  for (const w of wanted) {
    const q = Math.min(w.min_qty, maxAffordable(w.unit_cost));
    if (q > 0) {
      alloc.set(w.sku_id, q);
      budget -= cost(q, w.unit_cost);
    }
  }
  // Pass 2: top up to the full quantity (in whole cases where that was the plan).
  for (const w of wanted) {
    const have = alloc.get(w.sku_id) ?? 0;
    const extra = Math.min(w.qty - have, Math.floor((budget + cost(have, w.unit_cost)) / w.unit_cost) - have);
    if (extra <= 0) continue;
    let add = extra;
    if (w.qty % w.case_qty === 0 && w.case_qty > 1 && have + extra < w.qty) {
      // Can't afford the full case quantity: keep what we have, don't buy odd lots.
      add = Math.max(0, Math.floor((have + extra) / w.case_qty) * w.case_qty - have);
    }
    while (add > 0 && cost(have + add, w.unit_cost) - cost(have, w.unit_cost) > budget) add--;
    if (add > 0) {
      budget -= cost(have + add, w.unit_cost) - cost(have, w.unit_cost);
      alloc.set(w.sku_id, have + add);
    }
  }

  const lines: ReorderLine[] = [];
  const deferred: ReorderLine[] = [];
  for (const w of wanted) {
    const { min_qty: _m, case_qty: _c, ...line } = w;
    const q = alloc.get(w.sku_id) ?? 0;
    if (q > 0) {
      const reduced = q < w.qty;
      lines.push({ ...line, qty: q, line_total: cost(q, w.unit_cost), reason: reduced ? `${line.reason}; reduced to fit budget` : line.reason });
      if (reduced) deferred.push({ ...line, qty: w.qty - q, line_total: Math.round((w.qty - q) * w.unit_cost) });
    } else {
      deferred.push(line);
    }
  }

  return {
    available_budget: Math.round(input.availableBudget),
    total: lines.reduce((s, l) => s + l.line_total, 0),
    lines,
    deferred,
    held_back,
  };
}
