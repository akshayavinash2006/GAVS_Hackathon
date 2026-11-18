import type { SeedData, Store } from "./store";
import type { AgentRun, AppUser, Distributor, Order, OrderStatus, Shop } from "../types";

type Data = SeedData & { runs: AgentRun[]; users: AppUser[] };

const empty = (): Data => ({
  shops: [],
  distributors: [],
  batches: [],
  events: [],
  bills: [],
  credit: [],
  orders: [],
  aliases: [],
  customSkus: [],
  runs: [],
  users: [],
});

/**
 * In-memory store used when Supabase isn't configured. State lives for the
 * life of the server process (on Vercel: per warm function instance), so it is
 * for local development and quick demos only.
 */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  constructor(private d: Data = empty()) {}

  async listShops() {
    return [...this.d.shops];
  }
  async getShop(id: string) {
    return this.d.shops.find((s) => s.id === id) ?? null;
  }
  async findShopByPhone(phone: string) {
    return this.d.shops.find((s) => s.owner_phone === phone) ?? null;
  }
  async findShopByLinkCode(code: string) {
    return this.d.shops.find((s) => s.link_code === code) ?? null;
  }
  async createShop(shop: Shop, distributors: Distributor[]) {
    if (this.d.shops.some((s) => s.id === shop.id)) throw new Error("Shop already exists");
    this.d.shops.push(structuredClone(shop));
    this.d.distributors.push(...structuredClone(distributors));
  }
  async createUser(user: AppUser) {
    if (this.d.users.some((u) => u.username === user.username)) throw new Error("duplicate key: username");
    this.d.users.push({ ...user });
  }
  async findUserByUsername(username: string) {
    return this.d.users.find((u) => u.username === username) ?? null;
  }
  async getUser(id: string) {
    return this.d.users.find((u) => u.id === id) ?? null;
  }
  async updateShop(id: string, patch: Partial<Shop>) {
    const s = this.d.shops.find((x) => x.id === id);
    if (s) Object.assign(s, patch, { id });
  }

  async listCustomSkus(shopId: string) {
    return this.d.customSkus.filter((s) => s.shop_id === shopId);
  }
  async addCustomSku(sku: Parameters<Store["addCustomSku"]>[0]) {
    this.d.customSkus.push(sku);
  }
  async listAliases(shopId: string) {
    return this.d.aliases.filter((a) => a.shop_id === shopId || a.shop_id === null);
  }
  async addAliases(aliases: Parameters<Store["addAliases"]>[0]) {
    for (const a of aliases) {
      if (!this.d.aliases.some((x) => x.shop_id === a.shop_id && x.alias === a.alias && x.sku_id === a.sku_id))
        this.d.aliases.push(a);
    }
  }

  async listDistributors(shopId: string) {
    return this.d.distributors.filter((x) => x.shop_id === shopId);
  }
  async addDistributor(dist: Parameters<Store["addDistributor"]>[0]) {
    this.d.distributors.push(dist);
  }

  async listBatches(shopId: string) {
    return this.d.batches.filter((x) => x.shop_id === shopId);
  }
  async addBatches(b: Parameters<Store["addBatches"]>[0]) {
    this.d.batches.push(...b);
  }

  async listEvents(shopId: string) {
    return this.d.events.filter((x) => x.shop_id === shopId);
  }
  async addEvents(e: Parameters<Store["addEvents"]>[0]) {
    this.d.events.push(...e);
  }

  async addBill(b: Parameters<Store["addBill"]>[0]) {
    this.d.bills.push(b);
  }
  async listBills(shopId: string) {
    return this.d.bills.filter((x) => x.shop_id === shopId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async listCredit(shopId: string) {
    return this.d.credit.filter((x) => x.shop_id === shopId);
  }
  async addCredit(c: Parameters<Store["addCredit"]>[0]) {
    this.d.credit.push(...c);
  }

  async listOrders(shopId: string) {
    return this.d.orders
      .filter((x) => x.shop_id === shopId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => structuredClone(o));
  }
  async getOrder(id: string) {
    const o = this.d.orders.find((x) => x.id === id);
    return o ? structuredClone(o) : null;
  }
  async addOrder(o: Order) {
    this.d.orders.push(structuredClone(o));
  }
  async updateOrder(id: string, patch: Partial<Order>, expectStatus?: OrderStatus) {
    const o = this.d.orders.find((x) => x.id === id);
    if (!o || (expectStatus && o.status !== expectStatus)) return false;
    Object.assign(o, structuredClone(patch), { id });
    return true;
  }

  async addAgentRun(r: AgentRun) {
    this.d.runs.push(r);
    if (this.d.runs.length > 500) this.d.runs.splice(0, this.d.runs.length - 500);
  }
  async listAgentRuns(shopId: string, limit = 20) {
    return this.d.runs
      .filter((x) => x.shop_id === shopId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }

  async resetDemo(data: SeedData) {
    const demo = new Set(this.d.shops.filter((s) => s.is_demo).map((s) => s.id));
    for (const s of data.shops) demo.add(s.id);
    const keep = <T extends { shop_id?: string | null }>(rows: T[]) => rows.filter((r) => !r.shop_id || !demo.has(r.shop_id));
    const fresh = structuredClone(data);
    this.d = {
      shops: [...this.d.shops.filter((s) => !demo.has(s.id)), ...fresh.shops],
      distributors: [...keep(this.d.distributors), ...fresh.distributors],
      batches: [...keep(this.d.batches), ...fresh.batches],
      events: [...keep(this.d.events), ...fresh.events],
      bills: [...keep(this.d.bills), ...fresh.bills],
      credit: [...keep(this.d.credit), ...fresh.credit],
      orders: [...keep(this.d.orders), ...fresh.orders],
      aliases: [...this.d.aliases.filter((a) => !a.shop_id || !demo.has(a.shop_id)), ...fresh.aliases],
      customSkus: [...keep(this.d.customSkus), ...fresh.customSkus],
      runs: this.d.runs.filter((r) => !demo.has(r.shop_id)),
      users: this.d.users.filter((u) => !demo.has(u.shop_id)),
    };
  }

  async checkSchema() {}
}
