import type {
  AgentRun,
  AppUser,
  Batch,
  Bill,
  CreditEntry,
  Distributor,
  Order,
  OrderStatus,
  Shop,
  Sku,
  SkuAlias,
  StockEvent,
} from "../types";

export interface SeedData {
  shops: Shop[];
  distributors: Distributor[];
  batches: Batch[];
  events: StockEvent[];
  bills: Bill[];
  credit: CreditEntry[];
  orders: Order[];
  aliases: SkuAlias[];
  customSkus: Sku[];
}

/** Persistence boundary. Supabase in production, in-memory for local/demo. */
export interface Store {
  readonly kind: "supabase" | "memory";

  listShops(): Promise<Shop[]>;
  getShop(id: string): Promise<Shop | null>;
  findShopByPhone(phone: string): Promise<Shop | null>;
  findShopByLinkCode(code: string): Promise<Shop | null>;
  createShop(shop: Shop, distributors: Distributor[]): Promise<void>;
  updateShop(id: string, patch: Partial<Shop>): Promise<void>;

  createUser(user: AppUser): Promise<void>;
  findUserByUsername(username: string): Promise<AppUser | null>;
  getUser(id: string): Promise<AppUser | null>;

  listCustomSkus(shopId: string): Promise<Sku[]>;
  addCustomSku(sku: Sku): Promise<void>;
  listAliases(shopId: string): Promise<SkuAlias[]>;
  addAliases(aliases: SkuAlias[]): Promise<void>;

  listDistributors(shopId: string): Promise<Distributor[]>;
  addDistributor(d: Distributor): Promise<void>;

  listBatches(shopId: string): Promise<Batch[]>;
  addBatches(batches: Batch[]): Promise<void>;

  listEvents(shopId: string): Promise<StockEvent[]>;
  addEvents(events: StockEvent[]): Promise<void>;

  addBill(bill: Bill): Promise<void>;
  listBills(shopId: string): Promise<Bill[]>;

  listCredit(shopId: string): Promise<CreditEntry[]>;
  addCredit(entries: CreditEntry[]): Promise<void>;

  listOrders(shopId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  addOrder(order: Order): Promise<void>;
  updateOrder(id: string, patch: Partial<Order>, expectStatus?: OrderStatus): Promise<boolean>;

  addAgentRun(run: AgentRun): Promise<void>;
  listAgentRuns(shopId: string, limit?: number): Promise<AgentRun[]>;

  /** Replaces the demo shops' data only. Real shops and accounts are never touched. */
  resetDemo(data: SeedData): Promise<void>;

  /** Throws if the database is missing tables/columns this version needs. */
  checkSchema(): Promise<void>;

  /** Optional: keep the original bill/khata photo. Returns the storage path. */
  uploadImage?(path: string, data: Uint8Array, contentType: string): Promise<string>;
}
