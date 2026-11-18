import { CATALOG } from "@/data/catalog";
import type { Store } from "./db/store";
import { normalizeName, similarity, SkuMatcher, type MatchResult } from "./sku-match";
import type { Batch, Bill, Category, CreditEntry, Distributor, Sku, StockEvent, StockEventType } from "./types";
import { addDays, istDate, round, uid } from "./util";

export interface BillLineInput {
  raw_name: string;
  sku_id: string | null; // null + new_item → create a shop-specific SKU
  new_item?: { name: string; category: Category; mrp?: number | null };
  qty: number;
  unit_cost: number | null;
  mrp?: number | null;
  expiry_date?: string | null;
}

export interface BillInput {
  distributor_name: string;
  bill_date?: string | null;
  lines: BillLineInput[];
  image_path?: string | null;
  parsed?: unknown;
}

async function allSkus(store: Store, shopId: string): Promise<Sku[]> {
  return [...CATALOG, ...(await store.listCustomSkus(shopId))];
}

export async function getMatcher(store: Store, shopId: string): Promise<SkuMatcher> {
  const [skus, aliases] = await Promise.all([allSkus(store, shopId), store.listAliases(shopId)]);
  return new SkuMatcher(skus, aliases);
}

async function resolveDistributor(store: Store, shopId: string, name: string): Promise<Distributor> {
  const dists = await store.listDistributors(shopId);
  const n = normalizeName(name || "Unknown supplier");
  let best: Distributor | null = null;
  let bestScore = 0;
  for (const d of dists) {
    const sc = similarity(n, normalizeName(d.name));
    if (sc > bestScore) {
      best = d;
      bestScore = sc;
    }
  }
  if (best && bestScore >= 0.35) return best;
  const created: Distributor = {
    id: uid("dist"),
    shop_id: shopId,
    name: name || "Unknown supplier",
    phone: null,
    kind: /market|wholesale|mandi|apmc/i.test(name) ? "wholesale" : "distributor",
    visit_days: [],
    lead_days: 2,
    accepts_returns: false,
    categories: [],
  };
  await store.addDistributor(created);
  return created;
}

export interface CommitResult {
  bill_id: string;
  distributor: string;
  total: number;
  lines: { name: string; qty: number; expiry_date: string | null; expiry_estimated: boolean }[];
  learned_aliases: number;
  new_items: number;
}

export async function commitBill(store: Store, shopId: string, input: BillInput, now = new Date()): Promise<CommitResult> {
  const skus = await allSkus(store, shopId);
  const skuMap = new Map(skus.map((s) => [s.id, s]));
  const dist = await resolveDistributor(store, shopId, input.distributor_name);
  const billId = uid("bill");
  const billDate = input.bill_date && /^\d{4}-\d{2}-\d{2}$/.test(input.bill_date) ? input.bill_date : istDate(now);
  const purchasedAt = now.toISOString();

  const batches: Batch[] = [];
  const aliases: { id: string; shop_id: string; sku_id: string; alias: string }[] = [];
  const lines: CommitResult["lines"] = [];
  let newItems = 0;

  for (const line of input.lines) {
    const qty = Math.round(Number(line.qty));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    let sku = line.sku_id ? skuMap.get(line.sku_id) : undefined;
    if (!sku && line.new_item) {
      const unit = line.unit_cost ?? 0;
      sku = {
        id: uid("sku"),
        shop_id: shopId,
        name: line.new_item.name.slice(0, 80),
        brand: "",
        category: line.new_item.category,
        pack: "",
        mrp: line.new_item.mrp ?? line.mrp ?? round(unit * 1.15),
        cost: unit,
        case_qty: 1,
        shelf_life_days: 180,
        base_velocity: 0.3,
        aliases: [line.raw_name],
      };
      await store.addCustomSku(sku);
      skuMap.set(sku.id, sku);
      newItems++;
    }
    if (!sku) continue;

    // The owner confirmed this raw name means this SKU, so remember it.
    if (line.raw_name && normalizeName(line.raw_name) !== normalizeName(sku.name)) {
      aliases.push({ id: uid("al"), shop_id: shopId, sku_id: sku.id, alias: line.raw_name.slice(0, 80) });
    }
    let expiry = line.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(line.expiry_date) ? line.expiry_date : null;
    const estimated = !expiry;
    if (!expiry) expiry = istDate(addDays(now, sku.shelf_life_days));
    batches.push({
      id: uid("bat"),
      shop_id: shopId,
      sku_id: sku.id,
      qty_in: qty,
      unit_cost: line.unit_cost && line.unit_cost > 0 ? round(line.unit_cost) : sku.cost,
      expiry_date: expiry,
      purchased_at: purchasedAt,
      bill_id: billId,
      distributor_id: dist.id,
    });
    lines.push({ name: sku.name, qty, expiry_date: expiry, expiry_estimated: estimated });
  }

  const total = Math.round(batches.reduce((s, b) => s + b.qty_in * b.unit_cost, 0));
  const bill: Bill = {
    id: billId,
    shop_id: shopId,
    distributor_id: dist.id,
    distributor_name: dist.name,
    bill_date: billDate,
    total,
    image_path: input.image_path ?? null,
    parsed: input.parsed ?? null,
    created_at: purchasedAt,
  };
  await store.addBill(bill);
  await store.addBatches(batches);
  await store.addAliases(aliases);
  return { bill_id: billId, distributor: dist.name, total, lines, learned_aliases: aliases.length, new_items: newItems };
}

export interface StockEventInput {
  name: string;
  sku_id?: string | null;
  type: StockEventType;
  qty?: number | null;
}

export interface RecordedEvent {
  input: string;
  type: StockEventType;
  qty: number;
  matched: { sku_id: string; name: string } | null;
  confidence: MatchResult["confidence"];
  alternatives: string[];
}

/** Records only confident matches; returns the rest so the agent can ask the owner. */
export async function recordStockEvents(
  store: Store,
  shopId: string,
  items: StockEventInput[],
  source: StockEvent["source"],
  now = new Date(),
): Promise<RecordedEvent[]> {
  const matcher = await getMatcher(store, shopId);
  const skus = new Map((await allSkus(store, shopId)).map((s) => [s.id, s]));
  const events: StockEvent[] = [];
  const out: RecordedEvent[] = [];
  for (const it of items) {
    const qty = it.type === "stockout" ? 0 : Math.max(0, Math.round(Number(it.qty ?? 0)));
    let sku = it.sku_id ? skus.get(it.sku_id) : undefined;
    let res: MatchResult | null = null;
    if (!sku) {
      res = matcher.match(it.name);
      if (res.best && res.confidence !== "low") sku = skus.get(res.best.sku_id);
    }
    const confidence = it.sku_id && sku ? "high" : res?.confidence ?? "low";
    if (sku && confidence !== "low") {
      events.push({ id: uid("ev"), shop_id: shopId, sku_id: sku.id, type: it.type, qty, source, ts: now.toISOString() });
    }
    out.push({
      input: it.name,
      type: it.type,
      qty,
      matched: sku && confidence !== "low" ? { sku_id: sku.id, name: sku.name } : null,
      confidence,
      alternatives: (res?.candidates ?? []).slice(0, 3).map((c) => c.name),
    });
  }
  await store.addEvents(events);
  return out;
}

export async function recordCredit(
  store: Store,
  shopId: string,
  entries: { customer: string; amount: number; kind: "given" | "repaid"; date?: string | null }[],
  source: CreditEntry["source"],
  now = new Date(),
): Promise<number> {
  const rows: CreditEntry[] = entries
    .filter((e) => e.customer && Number.isFinite(Number(e.amount)) && Number(e.amount) > 0)
    .map((e) => ({
      id: uid("cr"),
      shop_id: shopId,
      customer: e.customer.slice(0, 60),
      amount: Math.round(Number(e.amount)) * (e.kind === "repaid" ? -1 : 1),
      ts: e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? new Date(e.date + "T12:00:00+05:30").toISOString() : now.toISOString(),
      source,
    }));
  await store.addCredit(rows);
  return rows.length;
}
