import "server-only";
import { clusterSnapshots, findJointOpportunities, findTransferOffers } from "../cluster";
import type { Store } from "../db/store";
import { forecastDemand } from "../forecast";
import { GuardrailError } from "../guardrails";
import { recordCredit, recordStockEvents } from "../ingest";
import { createDraftOrders } from "../orders";
import { buildSnapshot, type ShopSnapshot } from "../snapshot";
import type { AgentRun } from "../types";
import { round } from "../util";

// Tools the agent can call. Deliberately absent: approving, placing or
// paying for orders, and changing the budget. Those belong to the owner.

export interface ToolContext {
  store: Store;
  shopId: string;
  now: Date;
  channel: AgentRun["channel"];
  createdOrderIds: string[];
  snap?: ShopSnapshot;
}

async function snapshot(ctx: ToolContext): Promise<ShopSnapshot> {
  if (!ctx.snap) {
    const s = await buildSnapshot(ctx.store, ctx.shopId, ctx.now);
    if (!s) throw new Error("Shop not found");
    ctx.snap = s;
  }
  return ctx.snap;
}
const invalidate = (ctx: ToolContext) => {
  ctx.snap = undefined;
};

const cover = (d: number) => (Number.isFinite(d) ? round(d, 1) : null);

type Handler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;

export const TOOL_DECLARATIONS = [
  {
    name: "get_shop_overview",
    description: "Today's picture: weekly budget and what's left after khata reserve and approved orders, money at risk of expiry, items out/low, pending draft orders, upcoming festivals.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "get_inventory",
    description: "Estimated stock per item, sell rate and days of cover. Stock is inferred from bills and owner updates, so it is an estimate.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Item name or local name to look up (optional)" },
        status: { type: "string", enum: ["out", "low", "at_risk", "slow", "ok"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_expiry_risks",
    description: "Batches likely to expire before they sell, with value at risk and a suggested action (return, discount, bundle, transfer to a neighbour shop).",
    parametersJsonSchema: { type: "object", properties: { within_days: { type: "number" } } },
  },
  {
    name: "forecast_demand",
    description: "Festival-aware demand forecast for named items (or the top sellers if none are given).",
    parametersJsonSchema: {
      type: "object",
      properties: { items: { type: "array", items: { type: "string" } }, horizon_days: { type: "number" } },
    },
  },
  {
    name: "get_reorder_plan",
    description: "The suggested reorder list that fits the remaining weekly budget, grouped by distributor, plus what was deferred for budget and what was held back because of expiry risk.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "create_draft_order",
    description: "Save a DRAFT order for the owner to approve. Without items it drafts the current reorder plan. It cannot place or approve orders, and it is refused if over budget.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: { type: "object", properties: { item: { type: "string" }, qty: { type: "number" } }, required: ["item", "qty"] },
        },
        note: { type: "string" },
      },
    },
  },
  {
    name: "record_stock_update",
    description: "Record what the owner reports: an item ran out (stockout), how many are left (level), units sold (sale), or units thrown away/expired (writeoff).",
    parametersJsonSchema: {
      type: "object",
      properties: {
        updates: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              type: { type: "string", enum: ["stockout", "level", "sale", "writeoff"] },
              qty: { type: "number" },
            },
            required: ["item", "type"],
          },
        },
      },
      required: ["updates"],
    },
  },
  {
    name: "record_credit",
    description: "Record khata entries: credit given to a customer or money they repaid.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        entries: {
          type: "array",
          items: {
            type: "object",
            properties: { customer: { type: "string" }, amount: { type: "number" }, kind: { type: "string", enum: ["given", "repaid"] } },
            required: ["customer", "amount", "kind"],
          },
        },
      },
      required: ["entries"],
    },
  },
  {
    name: "find_joint_orders",
    description: "Check whether neighbouring shops in the same area need the same items, so a combined order would earn a bulk discount. Also finds neighbours who could take near-expiry stock.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "match_item",
    description: "Find which catalog item a local or abbreviated name refers to.",
    parametersJsonSchema: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
  },
];

const handlers: Record<string, Handler> = {
  async get_shop_overview(_a, ctx) {
    const s = await snapshot(ctx);
    return {
      shop: s.shop.name,
      today: s.now.toISOString().slice(0, 10),
      budget: {
        weekly_budget: s.budget.weekly_budget,
        held_back_for_khata: s.budget.credit_reserve,
        already_approved_this_week: s.budget.committed_7d,
        left_to_spend_this_week: s.budget.available,
        customer_credit_outstanding: s.budget.credit_outstanding,
      },
      metrics: s.metrics,
      pending_drafts: s.pending.map((o) => ({ id: o.id, distributor: o.distributor_name, total: o.total, items: o.items.length })),
      reorder_plan_total: s.plan.total,
      reorder_lines: s.plan.lines.length,
      expiring_soon: s.expiring.slice(0, 5).map((e) => ({ item: e.sku.name, units: e.risk.units_at_risk, days: e.risk.days_to_expiry, value: e.risk.value_at_risk, action: e.action.label })),
      festivals: s.festivals.slice(0, 3).map((f) => ({ name: f.name, in_days: f.days_away, approx_date: f.approx ?? false })),
    };
  },

  async get_inventory(a, ctx) {
    const s = await snapshot(ctx);
    let rows = s.inventory;
    if (typeof a.query === "string" && a.query.trim()) {
      const m = s.matcher.match(a.query);
      const ids = new Set(m.candidates.filter((c) => c.score >= 0.25).map((c) => c.sku_id));
      rows = rows.filter((r) => ids.has(r.sku.id));
    }
    if (typeof a.status === "string") rows = rows.filter((r) => r.status === a.status);
    const limit = Math.min(40, Number(a.limit) || 20);
    return rows.slice(0, limit).map((r) => ({
      item: r.sku.name,
      est_stock: Math.round(r.stats.stock),
      per_day: round(r.stats.velocity, 2),
      days_cover: cover(r.stats.days_cover),
      status: r.status,
      estimate_confidence: r.stats.confidence,
      supplier: r.distributor?.name ?? null,
    }));
  },

  async get_expiry_risks(a, ctx) {
    const s = await snapshot(ctx);
    const within = Number(a.within_days) || 30;
    const neighbours = await clusterSnapshots(ctx.store, s.shop.cluster_id, ctx.now);
    return {
      alerts: s.expiring
        .filter((e) => e.risk.days_to_expiry <= within)
        .map((e) => ({ item: e.sku.name, expiry: e.risk.expiry_date, days_left: e.risk.days_to_expiry, units_at_risk: e.risk.units_at_risk, value_at_risk: e.risk.value_at_risk, suggested: e.action.label, detail: e.action.detail })),
      neighbour_transfer_offers: findTransferOffers(s, neighbours),
      total_value_at_risk: s.metrics.value_at_risk,
    };
  },

  async forecast_demand(a, ctx) {
    const s = await snapshot(ctx);
    const horizon = Math.min(30, Math.max(1, Number(a.horizon_days) || 7));
    let rows = s.inventory;
    if (Array.isArray(a.items) && a.items.length) {
      const ids = new Set(a.items.map((n) => s.matcher.match(String(n)).best?.sku_id).filter(Boolean));
      rows = rows.filter((r) => ids.has(r.sku.id));
    } else {
      rows = [...rows].sort((x, y) => y.stats.velocity * y.unit_cost - x.stats.velocity * x.unit_cost).slice(0, 12);
    }
    return rows.map((r) => {
      const f = forecastDemand(r.stats.velocity, r.sku.category, ctx.now, horizon);
      return { item: r.sku.name, horizon_days: horizon, forecast_units: Math.round(f.units), normal_units: Math.round(f.baseline), festival: f.festival, est_stock: Math.round(r.stats.stock) };
    });
  },

  async get_reorder_plan(_a, ctx) {
    const s = await snapshot(ctx);
    return {
      available_budget: s.plan.available_budget,
      total: s.plan.total,
      lines: s.plan.lines.slice(0, 30).map((l) => ({ item: l.name, qty: l.qty, cost: l.line_total, supplier: l.distributor_name, urgency: l.urgency, why: l.reason })),
      more_lines: Math.max(0, s.plan.lines.length - 30),
      deferred_for_budget: s.plan.deferred.slice(0, 10).map((l) => ({ item: l.name, qty: l.qty, cost: l.line_total })),
      held_back_expiry_risk: s.plan.held_back,
    };
  },

  async create_draft_order(a, ctx) {
    const s = await snapshot(ctx);
    let items: { sku_id: string; qty: number; reason?: string }[] | undefined;
    const unmatched: string[] = [];
    if (Array.isArray(a.items) && a.items.length) {
      items = [];
      for (const raw of a.items as { item?: string; qty?: number }[]) {
        const m = s.matcher.match(String(raw.item ?? ""));
        if (m.best && m.confidence !== "low") items.push({ sku_id: m.best.sku_id, qty: Number(raw.qty), reason: "requested by owner" });
        else unmatched.push(String(raw.item));
      }
      if (!items.length) return { error: "Could not identify those items", unmatched };
    }
    try {
      const orders = await createDraftOrders(ctx.store, s, ctx.channel === "cron" ? "cron" : "agent", { items, note: typeof a.note === "string" ? a.note : undefined });
      invalidate(ctx);
      ctx.createdOrderIds.push(...orders.map((o) => o.id));
      if (!orders.length) return { message: "Nothing needs reordering right now." };
      return {
        status: "DRAFT, waiting for owner approval (not sent to any distributor)",
        orders: orders.map((o) => ({ id: o.id, supplier: o.distributor_name, total: o.total, items: o.items.map((i) => `${i.name} × ${i.qty}`) })),
        grand_total: orders.reduce((x, o) => x + o.total, 0),
        unmatched,
      };
    } catch (e) {
      if (e instanceof GuardrailError) return { refused: e.message, code: e.code };
      throw e;
    }
  },

  async record_stock_update(a, ctx) {
    const ups = Array.isArray(a.updates) ? (a.updates as { item: string; type: string; qty?: number }[]) : [];
    const valid = ups.filter((u) => ["stockout", "level", "sale", "writeoff"].includes(u.type));
    const res = await recordStockEvents(
      ctx.store,
      ctx.shopId,
      valid.map((u) => ({ name: String(u.item), type: u.type as "stockout", qty: u.qty })),
      ctx.channel === "whatsapp" ? "whatsapp" : "web",
      ctx.now,
    );
    invalidate(ctx);
    return {
      recorded: res.filter((r) => r.matched).map((r) => ({ said: r.input, item: r.matched!.name, type: r.type, qty: r.qty })),
      need_clarification: res.filter((r) => !r.matched).map((r) => ({ said: r.input, did_you_mean: r.alternatives })),
    };
  },

  async record_credit(a, ctx) {
    const entries = Array.isArray(a.entries) ? (a.entries as { customer: string; amount: number; kind: "given" | "repaid" }[]) : [];
    const n = await recordCredit(ctx.store, ctx.shopId, entries, ctx.channel === "whatsapp" ? "whatsapp" : "web", ctx.now);
    invalidate(ctx);
    const s = await snapshot(ctx);
    return { recorded: n, credit_outstanding: s.budget.credit_outstanding, budget_reserve_now: s.budget.credit_reserve };
  },

  async find_joint_orders(_a, ctx) {
    const s = await snapshot(ctx);
    const neighbours = await clusterSnapshots(ctx.store, s.shop.cluster_id, ctx.now);
    const lines = s.pending.length
      ? s.pending.flatMap((o) => o.items.map((i) => ({ sku_id: i.sku_id, name: i.name, qty: i.qty, unit_cost: i.unit_cost, distributor_name: o.distributor_name })))
      : s.plan.lines.map((l) => ({ sku_id: l.sku_id, name: l.name, qty: l.qty, unit_cost: l.unit_cost, distributor_name: l.distributor_name }));
    const joint = findJointOpportunities(s, neighbours, lines);
    return {
      based_on: s.pending.length ? "pending drafts" : "reorder plan",
      joint_orders: joint.slice(0, 8),
      total_possible_saving: joint.reduce((x, j) => x + j.est_saving, 0),
      transfer_offers: findTransferOffers(s, neighbours),
    };
  },

  async match_item(a, ctx) {
    const s = await snapshot(ctx);
    const m = s.matcher.match(String(a.name ?? ""));
    return { confidence: m.confidence, candidates: m.candidates.map((c) => ({ item: c.name, score: round(c.score, 2) })) };
  },
};

export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const h = handlers[name];
  if (!h) return { error: `Unknown tool ${name}` };
  try {
    return await h(args ?? {}, ctx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
