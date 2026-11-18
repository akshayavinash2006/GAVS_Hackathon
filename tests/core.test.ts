import { describe, expect, it } from "vitest";
import { CATALOG } from "@/data/catalog";
import { MemoryStore } from "@/lib/db/memory";
import { batchRisks, computeSkuStats, festivalMultiplier, forecastDemand } from "@/lib/forecast";
import { GuardrailError, approveOrder, assertTransition, budgetView, priceItems } from "@/lib/guardrails";
import { createDraftOrders, decideOrder, editDraft } from "@/lib/orders";
import { planReorder } from "@/lib/reorder";
import { generateSeed } from "@/lib/seed";
import { SkuMatcher } from "@/lib/sku-match";
import { buildSnapshot } from "@/lib/snapshot";
import { aggregateDemand, clusterSnapshots } from "@/lib/cluster";
import type { Batch, Festival, Order, Shop, StockEvent } from "@/lib/types";

const NOW = new Date("2026-11-18T06:00:00Z");
const day = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const skuMap = new Map(CATALOG.map((s) => [s.id, s]));

function batch(p: Partial<Batch>): Batch {
  return { id: Math.random().toString(36), shop_id: "s", sku_id: "maggi-70g", qty_in: 10, unit_cost: 13, expiry_date: null, purchased_at: day(-10), bill_id: null, distributor_id: null, ...p };
}
function ev(p: Partial<StockEvent>): StockEvent {
  return { id: Math.random().toString(36), shop_id: "s", sku_id: "maggi-70g", type: "level", qty: 0, source: "web", ts: day(-1), ...p };
}
const shop: Shop = { id: "s", name: "Test", owner_name: "T", owner_phone: null, locality: "", pincode: "1", region: "south", cluster_id: "c", cash_budget: 10000, language: "en", open_to_joint_orders: true, created_at: day(-60) };

describe("sku matching", () => {
  const m = new SkuMatcher(CATALOG, [{ id: "a", shop_id: "s", sku_id: "surf-excel-500g", alias: "neela packet" }]);
  it("matches local names and aliases", () => {
    expect(m.match("Parle G").best?.sku_id).toBe("parle-g-80g");
    expect(m.match("chai patti").best?.sku_id).toBe("red-label-250g");
    expect(m.match("doodh").best?.sku_id).toBe("nandini-milk-500ml");
    expect(m.match("आटा").best?.sku_id).toBe("aashirvaad-atta-5kg");
  });
  it("uses shop-learned aliases with high confidence", () => {
    const r = m.match("neela packet");
    expect(r.best?.sku_id).toBe("surf-excel-500g");
    expect(r.confidence).toBe("high");
  });
  it("respects pack sizes", () => {
    expect(m.match("maggi 280g").best?.sku_id).toBe("maggi-280g");
    expect(m.match("maggi 70 gm").best?.sku_id).toBe("maggi-70g");
  });
  it("never matches on pack size alone", () => {
    const r = m.match("SNFST DARK FANTASY 75G");
    expect(r.best?.sku_id).not.toBe("dettol-soap-75g");
    expect(r.confidence).not.toBe("high");
  });
  it("reads distributor abbreviations", () => {
    expect(m.match("MAGGI MSL NDL 70G").best?.sku_id).toBe("maggi-70g");
    expect(m.match("BRIT GD DAY CSHW 100G").best?.sku_id).toBe("good-day-100g");
  });
  it("is unsure about gibberish", () => {
    expect(m.match("xyzzy qwerty").confidence).toBe("low");
  });
});

describe("velocity and stock inference", () => {
  it("infers sell rate between a purchase and observations", () => {
    const st = computeSkuStats(skuMap.get("maggi-70g")!, [batch({ qty_in: 100, purchased_at: day(-10) })], [ev({ type: "level", qty: 50, ts: day(-5) })], NOW);
    expect(st.velocity).toBeCloseTo(10, 0);
    expect(st.stock).toBeCloseTo(0, 0); // 50 left five days ago at 10/day
  });
  it("treats a stock-out as an observation of zero", () => {
    const st = computeSkuStats(skuMap.get("maggi-70g")!, [batch({ qty_in: 40, purchased_at: day(-6) }), batch({ qty_in: 40, purchased_at: day(-1) })], [ev({ type: "stockout", ts: day(-2) })], NOW);
    expect(st.velocity).toBeGreaterThan(9);
    expect(st.stock).toBeGreaterThan(20);
    expect(st.stockouts_30d).toBe(1);
  });
});

describe("expiry risk", () => {
  it("flags units that won't sell before expiry, FEFO", () => {
    const bs = [batch({ id: "old", qty_in: 30, expiry_date: "2026-11-23" }), batch({ id: "new", qty_in: 30, expiry_date: "2027-03-01" })];
    const st = { sku_id: "x", velocity: 2, stock: 40, days_cover: 20, last_purchase: null, stockouts_30d: 0, observations: 3, confidence: "high" as const };
    const r = batchRisks(bs, st, NOW);
    // 30 in the newer batch, 10 left in the old one; 5 days × 2/day = 10 sell → nothing at risk
    expect(r).toHaveLength(0);
    const slow = batchRisks(bs, { ...st, velocity: 0.5 }, NOW);
    expect(slow[0].batch_id).toBe("old");
    expect(slow[0].units_at_risk).toBeGreaterThanOrEqual(7);
  });
});

describe("festival forecast", () => {
  const fest: Festival[] = [{ name: "Test Fest", date: "2026-11-25", lead_days: 5, regions: ["all"], uplift: { sweets_dryfruits: 3 } }];
  it("applies uplift only inside the lead window", () => {
    expect(festivalMultiplier("sweets_dryfruits", new Date("2026-11-19T06:00:00Z"), fest).mult).toBe(1);
    expect(festivalMultiplier("sweets_dryfruits", new Date("2026-11-21T06:00:00Z"), fest).mult).toBe(3);
    expect(festivalMultiplier("home_care", new Date("2026-11-21T06:00:00Z"), fest).mult).toBe(1);
    const f = forecastDemand(1, "sweets_dryfruits", NOW, 7, fest);
    expect(f.units).toBeGreaterThan(f.baseline);
    expect(f.festival).toBe("Test Fest");
  });
});

describe("reorder planner", () => {
  it("never exceeds the budget and puts critical items first", () => {
    const snapshotSkus = CATALOG.slice(0, 30);
    const stats = new Map(snapshotSkus.map((s, i) => [s.id, { sku_id: s.id, velocity: s.base_velocity, stock: i % 3 === 0 ? 0 : s.base_velocity * 2, days_cover: i % 3 === 0 ? 0 : 2, last_purchase: null, stockouts_30d: 0, observations: 3, confidence: "high" as const }]));
    for (const budget of [0, 500, 3000, 20000]) {
      const plan = planReorder({ skus: snapshotSkus, stats, risks: new Map(), distributorFor: () => null, lastCost: new Map(), pendingQty: new Map(), festivals: [], now: NOW, availableBudget: budget });
      expect(plan.total).toBeLessThanOrEqual(budget);
      if (plan.lines.length > 1) expect(plan.lines[0].priority).toBeGreaterThanOrEqual(plan.lines[plan.lines.length - 1].priority);
    }
  });
  it("holds back items with stock at risk of expiry", () => {
    const sku = skuMap.get("horlicks-500g")!;
    const stats = new Map([[sku.id, { sku_id: sku.id, velocity: 0.5, stock: 0, days_cover: 0, last_purchase: null, stockouts_30d: 0, observations: 3, confidence: "high" as const }]]);
    const risks = new Map([[sku.id, [{ batch_id: "b", sku_id: sku.id, expiry_date: "2026-11-25", days_to_expiry: 7, units_left: 10, units_at_risk: 6, value_at_risk: 1500, expired: false }]]]);
    const plan = planReorder({ skus: [sku], stats, risks, distributorFor: () => null, lastCost: new Map(), pendingQty: new Map(), festivals: [], now: NOW, availableBudget: 10000 });
    expect(plan.lines).toHaveLength(0);
    expect(plan.held_back[0].sku_id).toBe(sku.id);
  });
});

describe("guardrails", () => {
  const order: Order = { id: "o", shop_id: "s", distributor_id: null, distributor_name: "x", status: "pending_approval", total: 0, items: priceItems([{ sku_id: "maggi-70g", qty: 96 }], skuMap), created_by: "agent", note: null, joint_group_id: null, created_at: day(0), decided_at: null };
  it("only the owner can approve or reject", () => {
    expect(() => assertTransition(order, "approved", "agent")).toThrow(GuardrailError);
    expect(() => assertTransition(order, "approved", "cron")).toThrow(GuardrailError);
    expect(() => assertTransition(order, "rejected", "agent")).toThrow(GuardrailError);
    expect(() => assertTransition(order, "approved", "owner")).not.toThrow();
  });
  it("decided orders are final", () => {
    expect(() => assertTransition({ ...order, status: "approved" }, "rejected", "owner")).toThrow(GuardrailError);
  });
  it("approval re-checks the budget", () => {
    const tight = budgetView({ ...shop, cash_budget: 1000 }, [], [], NOW);
    expect(() => approveOrder(order, "owner", tight, NOW)).toThrow(/budget/);
    const ok = budgetView(shop, [], [], NOW);
    expect(approveOrder(order, "owner", ok, NOW).status).toBe("approved");
  });
  it("reserves cash against outstanding khata credit", () => {
    const b = budgetView(shop, [{ id: "1", shop_id: "s", customer: "A", amount: 5000, ts: day(-3), source: "web" }, { id: "2", shop_id: "s", customer: "A", amount: -1000, ts: day(-1), source: "web" }], [], NOW);
    expect(b.credit_outstanding).toBe(4000);
    expect(b.credit_reserve).toBe(800);
    expect(b.usable).toBe(9200);
  });
  it("rejects unknown items and silly quantities", () => {
    expect(() => priceItems([{ sku_id: "nope", qty: 1 }], skuMap)).toThrow(GuardrailError);
    expect(() => priceItems([{ sku_id: "maggi-70g", qty: -5 }], skuMap)).toThrow(GuardrailError);
    expect(() => priceItems([{ sku_id: "maggi-70g", qty: 1e9 }], skuMap)).toThrow(GuardrailError);
  });
});

describe("seeded demo end to end", async () => {
  const store = new MemoryStore();
  await store.reset(generateSeed(NOW));

  it("tells a coherent story for every shop", async () => {
    for (const s of await store.listShops()) {
      const snap = (await buildSnapshot(store, s.id, NOW))!;
      expect(snap.inventory.length).toBeGreaterThan(40);
      expect(snap.expiring.length).toBeGreaterThan(0); // planted short-dated stock
      expect(snap.plan.lines.length).toBeGreaterThan(0);
      expect(snap.plan.total).toBeLessThanOrEqual(snap.budget.available);
      expect(snap.metrics.value_at_risk).toBeGreaterThan(0);
    }
  });

  it("drafts, edits and approves orders only through guardrails", async () => {
    const snap = (await buildSnapshot(store, "shop-sharma", NOW))!;
    const drafts = await createDraftOrders(store, snap, "agent");
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((d) => d.status === "pending_approval")).toBe(true);
    await expect(decideOrder(store, "shop-sharma", drafts[0].id, "approve", "agent")).rejects.toThrow(GuardrailError);
    await expect(decideOrder(store, "shop-lakshmi", drafts[0].id, "approve", "owner")).rejects.toThrow(/not found/);
    const edited = await editDraft(store, "shop-sharma", drafts[0].id, drafts[0].items.map((i) => ({ sku_id: i.sku_id, qty: Math.max(1, Math.floor(i.qty / 2)) })));
    expect(edited.total).toBeLessThanOrEqual(drafts[0].total);
    const approved = await decideOrder(store, "shop-sharma", drafts[0].id, "approve", "owner");
    expect(approved.status).toBe("approved");
    await expect(decideOrder(store, "shop-sharma", drafts[0].id, "reject", "owner")).rejects.toThrow(GuardrailError);
  });

  it("aggregates pincode demand only with enough shops", async () => {
    const snaps = await clusterSnapshots(store, "blr-koramangala", NOW);
    const agg = aggregateDemand(snaps)!;
    expect(agg.shops).toBe(3);
    expect(agg.rows.length).toBeGreaterThan(20);
    expect(aggregateDemand(snaps.slice(0, 2))).toBeNull();
  });
});
