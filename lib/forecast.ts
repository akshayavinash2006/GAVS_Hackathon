import festivalsData from "@/data/festivals.json";
import type { Batch, Category, Festival, Shop, Sku, StockEvent } from "./types";
import { DAY_MS, addDays, daysBetween, istDate, round } from "./util";

export const FESTIVALS: Festival[] = festivalsData.festivals as Festival[];

// ---------------------------------------------------------------------------
// Velocity + stock estimation without a billing system.
//
// The shop never records sales. What we do see:
//   • purchases (from distributor bills)            → stock goes up by qty
//   • "level" observations ("Maggi 10 bacha")        → stock is exactly N
//   • stock-outs ("Parle-G khatam")                  → stock is 0
//   • optional sale logs                             → known consumption
// Between two observations, consumption = stock_before + purchased − stock_after.
// Dividing by elapsed days gives an observed sell rate; recent segments weigh more.
// ---------------------------------------------------------------------------

export interface SkuStats {
  sku_id: string;
  velocity: number; // units/day
  stock: number; // estimated units on hand now
  days_cover: number; // Infinity when velocity is 0
  last_purchase: string | null;
  stockouts_30d: number;
  observations: number; // how many rate segments backed the velocity
  confidence: "high" | "medium" | "low";
}

type TimelineItem =
  | { t: number; kind: "in"; qty: number }
  | { t: number; kind: "obs"; qty: number; stockout: boolean }
  | { t: number; kind: "sale"; qty: number }
  | { t: number; kind: "waste"; qty: number };

/** Days between t0 and t1 weighted by the festival multiplier, so a Diwali week counts as "more days" of demand. */
function effectiveDays(t0: number, t1: number, mult: (t: number) => number): number {
  let total = 0;
  for (let t = t0; t < t1; ) {
    const next = Math.min(t1, t + DAY_MS);
    total += ((next - t) / DAY_MS) * mult(t);
    t = next;
  }
  return total;
}

/**
 * `velocity` is the de-seasonalized baseline (units/day on an ordinary day);
 * forecasts multiply festival uplift back in.
 */
export function computeSkuStats(
  sku: Pick<Sku, "id" | "base_velocity" | "category">,
  batches: Batch[],
  events: StockEvent[],
  now: Date = new Date(),
  festivals: Festival[] = FESTIVALS,
): SkuStats {
  const nowT = now.getTime();
  const cache = new Map<string, number>();
  const mult = (t: number) => {
    const k = istDate(t);
    let m = cache.get(k);
    if (m === undefined) {
      m = festivalMultiplier(sku.category, new Date(t), festivals).mult;
      cache.set(k, m);
    }
    return m;
  };

  const tl: TimelineItem[] = [];
  for (const b of batches) tl.push({ t: Date.parse(b.purchased_at), kind: "in", qty: b.qty_in });
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (e.type === "level") tl.push({ t, kind: "obs", qty: e.qty, stockout: false });
    else if (e.type === "stockout") tl.push({ t, kind: "obs", qty: 0, stockout: true });
    else if (e.type === "sale") tl.push({ t, kind: "sale", qty: e.qty });
    else if (e.type === "writeoff") tl.push({ t, kind: "waste", qty: e.qty });
  }
  tl.sort((a, b) => a.t - b.t || (a.kind === "in" ? -1 : 1));

  const rates: { rate: number; t: number }[] = [];
  let lastObs: { t: number; qty: number } | null = null;
  let added = 0;
  let sold = 0;
  let wasted = 0;
  for (const it of tl) {
    if (it.kind === "in") {
      if (!lastObs) lastObs = { t: it.t, qty: 0 };
      // An empty shelf sells nothing: restart the clock when stock comes back in.
      else if (lastObs.qty === 0 && added === 0) lastObs = { t: it.t, qty: 0 };
      added += it.qty;
    } else if (it.kind === "sale") {
      sold += it.qty;
    } else if (it.kind === "waste") {
      wasted += it.qty; // thrown away, not demand
    } else {
      if (lastObs) {
        const days = (it.t - lastObs.t) / DAY_MS;
        const consumed = lastObs.qty + added - wasted - it.qty;
        if (days >= 0.5 && consumed >= 0) {
          // A stock-out is noticed after the shelf went empty, so the true rate was higher.
          const rate = (consumed / effectiveDays(lastObs.t, it.t, mult)) * (it.stockout ? 1.15 : 1);
          rates.push({ rate, t: it.t });
        }
      }
      lastObs = { t: it.t, qty: it.qty };
      added = 0;
      sold = 0;
      wasted = 0;
    }
  }

  // Sale logs in the last 28 days give a direct rate too.
  const saleSince = nowT - 28 * DAY_MS;
  const recentSales = events.filter((e) => e.type === "sale" && Date.parse(e.ts) >= saleSince);
  if (recentSales.length >= 5) {
    const first = Math.min(...recentSales.map((e) => Date.parse(e.ts)));
    const span = effectiveDays(Math.min(first, nowT - 7 * DAY_MS), nowT, mult);
    rates.push({ rate: recentSales.reduce((s, e) => s + e.qty, 0) / span, t: nowT });
  }

  // Robustness: a late "khatam" or a miscount can produce one absurd segment.
  if (rates.length >= 3) {
    const sorted = rates.map((r) => r.rate).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const r of rates) r.rate = Math.min(r.rate, Math.max(median * 3, 0.05));
  }

  let velocity = 0;
  if (rates.length) {
    let wsum = 0;
    for (const r of rates) {
      const w = Math.exp(-Math.max(0, nowT - r.t) / DAY_MS / 21);
      velocity += r.rate * w;
      wsum += w;
    }
    velocity /= wsum;
  } else if (batches.length) {
    // No observations yet. Re-buying is the only evidence of selling: whatever
    // was bought before the latest purchase sold in the time between them.
    // One big purchase on its own tells us almost nothing.
    const sorted = [...batches].sort((a, b) => a.purchased_at.localeCompare(b.purchased_at));
    const firstT = Date.parse(sorted[0].purchased_at);
    const lastT = Date.parse(sorted[sorted.length - 1].purchased_at);
    const span = effectiveDays(firstT, lastT, mult);
    if (sorted.length >= 2 && span >= 3) {
      const soldBeforeLast = sorted.slice(0, -1).reduce((s, b) => s + b.qty_in, 0);
      velocity = soldBeforeLast / span;
    } else {
      velocity = Math.min(sku.base_velocity, sorted[0].qty_in / 21) * 0.5;
    }
  }

  let stock = 0;
  if (lastObs) {
    const depletion = velocity * effectiveDays(lastObs.t, nowT, mult);
    stock = Math.max(0, lastObs.qty + added - wasted - Math.max(depletion, sold));
  }

  const lastBatch = batches.reduce<Batch | null>((m, b) => (!m || b.purchased_at > m.purchased_at ? b : m), null);
  const stockouts_30d = events.filter((e) => e.type === "stockout" && Date.parse(e.ts) >= nowT - 30 * DAY_MS).length;
  const confidence = rates.length >= 3 ? "high" : rates.length >= 1 ? "medium" : "low";
  const todayRate = velocity * mult(nowT);

  return {
    sku_id: sku.id,
    velocity: round(velocity, 3),
    stock: round(stock, 1),
    days_cover: todayRate > 0 ? round(stock / todayRate, 1) : Infinity,
    last_purchase: lastBatch?.purchased_at ?? null,
    stockouts_30d,
    observations: rates.length,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Expiry risk (first-expiry-first-out).
// Remaining stock is assumed to sit in the latest-expiring batches. For each
// batch we ask: at the current sell rate, how many of its units are still left
// on its expiry date? Those units, times cost, are the money at risk.
// ---------------------------------------------------------------------------

export interface BatchRisk {
  batch_id: string;
  sku_id: string;
  expiry_date: string;
  days_to_expiry: number;
  units_left: number;
  units_at_risk: number;
  value_at_risk: number;
  expired: boolean;
}

export function batchRisks(batches: Batch[], stats: SkuStats, now: Date = new Date()): BatchRisk[] {
  const dated = batches.filter((b) => b.expiry_date);
  if (!dated.length || stats.stock <= 0) return [];
  // Allocate the estimated stock to the latest-expiring batches first.
  const byExpiryDesc = [...dated].sort((a, b) => (b.expiry_date! > a.expiry_date! ? 1 : -1));
  let remaining = stats.stock;
  const left = new Map<string, number>();
  for (const b of byExpiryDesc) {
    const take = Math.min(b.qty_in, remaining);
    left.set(b.id, take);
    remaining -= take;
  }
  const out: BatchRisk[] = [];
  let soldBefore = 0; // units in earlier-expiring batches that sell first
  for (const b of [...dated].sort((a, b) => (a.expiry_date! > b.expiry_date! ? 1 : -1))) {
    const units = left.get(b.id) ?? 0;
    if (units <= 0) continue;
    const dte = daysBetween(now, b.expiry_date!);
    let atRisk: number;
    if (dte <= 0) atRisk = units;
    else {
      const sellable = Math.max(0, stats.velocity * dte - soldBefore);
      atRisk = Math.max(0, units - sellable);
    }
    soldBefore += units;
    if (atRisk >= 0.5) {
      out.push({
        batch_id: b.id,
        sku_id: b.sku_id,
        expiry_date: b.expiry_date!,
        days_to_expiry: dte,
        units_left: round(units, 1),
        units_at_risk: Math.round(atRisk),
        value_at_risk: Math.round(atRisk * b.unit_cost),
        expired: dte <= 0,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Festival-aware demand forecast.
// ---------------------------------------------------------------------------

export function applicableFestivals(region: Shop["region"] | undefined, festivals = FESTIVALS): Festival[] {
  return festivals.filter((f) => f.regions.includes("all") || (region && f.regions.includes(region)));
}

export function festivalMultiplier(
  category: Category,
  date: Date,
  festivals: Festival[] = FESTIVALS,
): { mult: number; festival: Festival | null } {
  const day = istDate(date);
  let mult = 1;
  let which: Festival | null = null;
  for (const f of festivals) {
    const until = daysBetween(day, f.date);
    if (until < 0 || until > f.lead_days) continue;
    const u = f.uplift[category] ?? f.uplift.default ?? 1;
    if (u > mult) {
      mult = u;
      which = f;
    }
  }
  return { mult, festival: which };
}

export interface Forecast {
  units: number;
  baseline: number;
  festival: string | null;
  peak_mult: number;
}

export function forecastDemand(
  velocity: number,
  category: Category,
  now: Date,
  horizonDays: number,
  festivals: Festival[] = FESTIVALS,
): Forecast {
  let units = 0;
  let peak = 1;
  let fest: string | null = null;
  for (let d = 0; d < horizonDays; d++) {
    const { mult, festival } = festivalMultiplier(category, addDays(now, d), festivals);
    units += velocity * mult;
    if (mult > peak) {
      peak = mult;
      fest = festival?.name ?? null;
    }
  }
  return { units: round(units, 1), baseline: round(velocity * horizonDays, 1), festival: fest, peak_mult: peak };
}

export function upcomingFestivals(now: Date, withinDays: number, festivals: Festival[] = FESTIVALS) {
  return festivals
    .map((f) => ({ ...f, days_away: daysBetween(now, f.date) }))
    .filter((f) => f.days_away >= 0 && f.days_away <= withinDays)
    .sort((a, b) => a.days_away - b.days_away);
}

/** Days until the distributor's next visit (0 = today). */
export function daysUntilVisit(visitDays: number[], now: Date, fallback: number): number {
  if (!visitDays.length) return fallback;
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  const dow = ist.getUTCDay();
  let best = 7;
  for (const v of visitDays) best = Math.min(best, (v - dow + 7) % 7);
  return best;
}
