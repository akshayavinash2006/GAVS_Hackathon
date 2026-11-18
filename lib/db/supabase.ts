import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SeedData, Store } from "./store";
import type { AgentRun, Order, OrderStatus, Shop, Sku } from "../types";

// Server-only. Uses the service-role key; every table has RLS enabled with no
// public policies, so the anon key can read nothing. Never import from a client component.

const PAGE = 1000;

export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private db: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  private async all<T>(table: string, col: string, val: string, order?: string): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = this.db.from(table).select("*").eq(col, val).range(from, from + PAGE - 1);
      if (order) q = q.order(order, { ascending: true });
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  private async insert(table: string, rows: object[]) {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await this.db.from(table).insert(rows.slice(i, i + 500));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
  }

  async listShops() {
    const { data, error } = await this.db.from("shops").select("*").order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as Shop[];
  }
  async getShop(id: string) {
    const { data, error } = await this.db.from("shops").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Shop) ?? null;
  }
  async findShopByPhone(phone: string) {
    const { data, error } = await this.db.from("shops").select("*").eq("owner_phone", phone).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Shop) ?? null;
  }
  async updateShop(id: string, patch: Partial<Shop>) {
    const { id: _ignore, ...rest } = patch;
    const { error } = await this.db.from("shops").update(rest).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async listCustomSkus(shopId: string) {
    return this.all<Sku>("custom_skus", "shop_id", shopId);
  }
  async addCustomSku(sku: Sku) {
    await this.insert("custom_skus", [sku]);
  }
  async listAliases(shopId: string) {
    const { data, error } = await this.db.from("sku_aliases").select("*").or(`shop_id.eq.${shopId},shop_id.is.null`);
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  async addAliases(aliases: Parameters<Store["addAliases"]>[0]) {
    if (!aliases.length) return;
    const { error } = await this.db.from("sku_aliases").upsert(aliases, { onConflict: "shop_id,alias,sku_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  async listDistributors(shopId: string) {
    return this.all<Parameters<Store["addDistributor"]>[0]>("distributors", "shop_id", shopId);
  }
  async addDistributor(d: Parameters<Store["addDistributor"]>[0]) {
    await this.insert("distributors", [d]);
  }

  async listBatches(shopId: string) {
    return this.all<Parameters<Store["addBatches"]>[0][number]>("batches", "shop_id", shopId, "purchased_at");
  }
  async addBatches(b: Parameters<Store["addBatches"]>[0]) {
    await this.insert("batches", b);
  }

  async listEvents(shopId: string) {
    return this.all<Parameters<Store["addEvents"]>[0][number]>("stock_events", "shop_id", shopId, "ts");
  }
  async addEvents(e: Parameters<Store["addEvents"]>[0]) {
    await this.insert("stock_events", e);
  }

  async addBill(b: Parameters<Store["addBill"]>[0]) {
    await this.insert("bills", [b]);
  }
  async listBills(shopId: string) {
    const { data, error } = await this.db.from("bills").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async listCredit(shopId: string) {
    return this.all<Parameters<Store["addCredit"]>[0][number]>("credit_ledger", "shop_id", shopId);
  }
  async addCredit(c: Parameters<Store["addCredit"]>[0]) {
    await this.insert("credit_ledger", c);
  }

  async listOrders(shopId: string) {
    const { data, error } = await this.db.from("orders").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Order[];
  }
  async getOrder(id: string) {
    const { data, error } = await this.db.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Order) ?? null;
  }
  async addOrder(o: Order) {
    await this.insert("orders", [o]);
  }
  /** Conditional update: only applies if the order is still in `expectStatus`. */
  async updateOrder(id: string, patch: Partial<Order>, expectStatus?: OrderStatus) {
    const { id: _ignore, ...rest } = patch;
    let q = this.db.from("orders").update(rest).eq("id", id);
    if (expectStatus) q = q.eq("status", expectStatus);
    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  }

  async addAgentRun(r: AgentRun) {
    await this.insert("agent_runs", [r]);
  }
  async listAgentRuns(shopId: string, limit = 20) {
    const { data, error } = await this.db.from("agent_runs").select("*").eq("shop_id", shopId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as AgentRun[];
  }

  async uploadImage(path: string, data: Uint8Array, contentType: string) {
    const { error } = await this.db.storage.from("bills").upload(path, data, { contentType, upsert: false });
    if (error) throw new Error(`upload: ${error.message}`);
    return `bills/${path}`;
  }

  async reset(data: SeedData) {
    // Children first, then parents.
    for (const t of ["agent_runs", "orders", "credit_ledger", "stock_events", "batches", "bills", "sku_aliases", "custom_skus", "distributors", "shops"]) {
      const { error } = await this.db.from(t).delete().neq("id", "__none__");
      if (error) throw new Error(`reset ${t}: ${error.message}`);
    }
    await this.insert("shops", data.shops);
    await this.insert("distributors", data.distributors);
    await this.insert("custom_skus", data.customSkus);
    await this.insert("sku_aliases", data.aliases);
    await this.insert("bills", data.bills);
    await this.insert("batches", data.batches);
    await this.insert("stock_events", data.events);
    await this.insert("credit_ledger", data.credit);
    await this.insert("orders", data.orders);
  }
}
