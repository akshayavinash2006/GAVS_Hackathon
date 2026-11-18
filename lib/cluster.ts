import type { Store } from "./db/store";
import { buildSnapshot, type ShopSnapshot } from "./snapshot";
import type { Category } from "./types";

// Neighbouring shops in the same pincode cluster. Used for joint orders,
// stock transfers of near-expiry goods, and the aggregated demand view that
// distributors and brands would pay for.

export async function clusterSnapshots(store: Store, clusterId: string, now = new Date()): Promise<ShopSnapshot[]> {
  const shops = (await store.listShops()).filter((s) => s.cluster_id === clusterId);
  const snaps = await Promise.all(shops.map((s) => buildSnapshot(store, s.id, now)));
  return snaps.filter((s): s is ShopSnapshot => !!s);
}

export interface JointOpportunity {
  sku_id: string;
  name: string;
  distributor_name: string;
  my_qty: number;
  neighbours: { shop_name: string; qty: number }[];
  combined_qty: number;
  combined_value: number;
  est_saving: number;
}

/** Bulk slab most distributors and wholesale markets give on bigger drops. */
export function bulkDiscountRate(combinedValue: number): number {
  if (combinedValue >= 5000) return 0.05;
  if (combinedValue >= 2500) return 0.035;
  if (combinedValue >= 1000) return 0.02;
  return 0;
}

export function findJointOpportunities(
  me: ShopSnapshot,
  neighbours: ShopSnapshot[],
  lines: { sku_id: string; name: string; qty: number; unit_cost: number; distributor_name: string }[],
): JointOpportunity[] {
  const others = neighbours.filter((n) => n.shop.id !== me.shop.id && n.shop.open_to_joint_orders);
  const out: JointOpportunity[] = [];
  for (const line of lines) {
    const dist = me.inventory.find((r) => r.sku.id === line.sku_id)?.distributor;
    if (dist?.kind === "dairy") continue;
    const ns = others
      .map((n) => {
        const fromPlan = n.plan.lines.find((l) => l.sku_id === line.sku_id)?.qty ?? 0;
        const fromDrafts = n.pending.flatMap((o) => o.items).filter((i) => i.sku_id === line.sku_id).reduce((s, i) => s + i.qty, 0);
        return { shop_name: n.shop.name, qty: Math.max(fromPlan, fromDrafts) };
      })
      .filter((n) => n.qty > 0);
    if (!ns.length) continue;
    const combined_qty = line.qty + ns.reduce((s, n) => s + n.qty, 0);
    const combined_value = Math.round(combined_qty * line.unit_cost);
    const rate = bulkDiscountRate(combined_value);
    if (!rate) continue;
    out.push({
      sku_id: line.sku_id,
      name: line.name,
      distributor_name: line.distributor_name,
      my_qty: line.qty,
      neighbours: ns,
      combined_qty,
      combined_value,
      est_saving: Math.round(line.qty * line.unit_cost * rate),
    });
  }
  return out.sort((a, b) => b.est_saving - a.est_saving);
}

export interface TransferOffer {
  sku_id: string;
  name: string;
  units: number;
  to_shop: string;
  their_velocity: number;
  days_to_expiry: number;
}

/** Near-expiry stock that a neighbour sells faster, so it can move before it expires. */
export function findTransferOffers(me: ShopSnapshot, neighbours: ShopSnapshot[]): TransferOffer[] {
  const out: TransferOffer[] = [];
  for (const alert of me.expiring) {
    if (alert.risk.expired) continue;
    const mine = me.inventory.find((r) => r.sku.id === alert.sku.id)?.stats.velocity ?? 0;
    for (const n of neighbours) {
      if (n.shop.id === me.shop.id || !n.shop.open_to_joint_orders) continue;
      const row = n.inventory.find((r) => r.sku.id === alert.sku.id);
      const theirs = row?.stats.velocity ?? 0;
      const theirFree = theirs * alert.risk.days_to_expiry - (row?.stats.stock ?? 0);
      if (theirs > mine * 1.5 && theirFree >= 2) {
        out.push({ sku_id: alert.sku.id, name: alert.sku.name, units: Math.min(alert.risk.units_at_risk, Math.floor(theirFree)), to_shop: n.shop.name, their_velocity: theirs, days_to_expiry: alert.risk.days_to_expiry });
      }
    }
  }
  return out;
}

export interface DemandRow {
  sku_id: string;
  name: string;
  brand: string;
  category: Category;
  units_7d: number;
  baseline_7d: number;
  value_7d: number;
  shops: number;
  stockout_shops: number;
  festival: string | null;
}

export const MIN_SHOPS_FOR_INSIGHTS = 3;

/** Anonymized: per-SKU totals only, and only when enough shops contribute. */
export function aggregateDemand(snaps: ShopSnapshot[]): { rows: DemandRow[]; byCategory: { category: Category; value_7d: number; baseline_value_7d: number }[]; shops: number } | null {
  if (snaps.length < MIN_SHOPS_FOR_INSIGHTS) return null;
  const rows = new Map<string, DemandRow>();
  for (const s of snaps) {
    for (const r of s.inventory) {
      if (r.stats.velocity <= 0) continue;
      const row = rows.get(r.sku.id) ?? {
        sku_id: r.sku.id,
        name: r.sku.name,
        brand: r.sku.brand,
        category: r.sku.category,
        units_7d: 0,
        baseline_7d: 0,
        value_7d: 0,
        shops: 0,
        stockout_shops: 0,
        festival: null,
      };
      row.units_7d += r.forecast7.units;
      row.baseline_7d += r.forecast7.baseline;
      row.value_7d += r.forecast7.units * r.unit_cost;
      row.shops += 1;
      if (r.status === "out" || r.status === "low") row.stockout_shops += 1;
      row.festival = row.festival ?? r.forecast7.festival;
      rows.set(r.sku.id, row);
    }
  }
  const list = [...rows.values()]
    .filter((r) => r.shops >= Math.min(2, snaps.length))
    .map((r) => ({ ...r, units_7d: Math.round(r.units_7d), baseline_7d: Math.round(r.baseline_7d), value_7d: Math.round(r.value_7d) }))
    .sort((a, b) => b.value_7d - a.value_7d);
  const cats = new Map<Category, { value_7d: number; baseline_value_7d: number }>();
  for (const r of list) {
    const c = cats.get(r.category) ?? { value_7d: 0, baseline_value_7d: 0 };
    c.value_7d += r.value_7d;
    c.baseline_value_7d += r.units_7d > 0 ? Math.round((r.value_7d * r.baseline_7d) / r.units_7d) : 0;
    cats.set(r.category, c);
  }
  return {
    rows: list,
    byCategory: [...cats.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.value_7d - a.value_7d),
    shops: snaps.length,
  };
}
