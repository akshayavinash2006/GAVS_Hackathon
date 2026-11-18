export type Lang = "en" | "hi";

export type Category =
  | "staples"
  | "oil_ghee"
  | "dairy"
  | "bakery"
  | "snacks"
  | "beverages"
  | "instant_food"
  | "spices"
  | "sweets_dryfruits"
  | "pooja"
  | "personal_care"
  | "home_care";

export interface Sku {
  id: string;
  name: string;
  brand: string;
  category: Category;
  pack: string;
  mrp: number;
  cost: number; // typical landed cost per unit for the shop
  case_qty: number; // units per case / outer the distributor sells
  shelf_life_days: number;
  base_velocity: number; // typical units/day for a small kirana (seed + cold-start prior)
  aliases: string[];
  shop_id?: string | null; // set for shop-specific custom SKUs
}

export interface Shop {
  id: string;
  name: string;
  owner_name: string;
  owner_phone: string | null; // E.164, e.g. +919812345678
  locality: string;
  pincode: string;
  region: "north" | "south" | "east" | "west";
  cluster_id: string;
  cash_budget: number; // weekly purchase budget set by the owner (₹)
  language: Lang;
  open_to_joint_orders: boolean;
  created_at: string;
}

export interface Distributor {
  id: string;
  shop_id: string;
  name: string;
  phone: string | null;
  kind: "distributor" | "wholesale" | "dairy";
  visit_days: number[]; // 0=Sun … 6=Sat
  lead_days: number; // days from order to delivery when not on a visit schedule
  accepts_returns: boolean;
  categories: Category[];
}

export interface Batch {
  id: string;
  shop_id: string;
  sku_id: string;
  qty_in: number;
  unit_cost: number;
  expiry_date: string | null; // YYYY-MM-DD
  purchased_at: string; // ISO
  bill_id: string | null;
  distributor_id: string | null;
}

export type StockEventType = "stockout" | "level" | "sale" | "writeoff";

export interface StockEvent {
  id: string;
  shop_id: string;
  sku_id: string;
  type: StockEventType;
  qty: number;
  source: "seed" | "web" | "whatsapp" | "scan" | "upi";
  ts: string;
}

export interface Bill {
  id: string;
  shop_id: string;
  distributor_id: string | null;
  distributor_name: string;
  bill_date: string;
  total: number;
  image_path: string | null;
  parsed: unknown;
  created_at: string;
}

export interface CreditEntry {
  id: string;
  shop_id: string;
  customer: string;
  amount: number; // + credit given, − repaid
  ts: string;
  source: "seed" | "web" | "whatsapp" | "scan";
}

export type OrderStatus = "pending_approval" | "approved" | "rejected" | "cancelled";
export type Actor = "owner" | "agent" | "cron" | "system";

export interface OrderItem {
  sku_id: string;
  name: string;
  qty: number;
  unit_cost: number;
  reason: string;
}

export interface Order {
  id: string;
  shop_id: string;
  distributor_id: string | null;
  distributor_name: string;
  status: OrderStatus;
  total: number;
  items: OrderItem[];
  created_by: Actor;
  note: string | null;
  joint_group_id: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface SkuAlias {
  id: string;
  shop_id: string | null;
  sku_id: string;
  alias: string;
}

export interface AgentStep {
  tool: string;
  args: unknown;
  result: string; // truncated JSON summary
}

export interface AgentRun {
  id: string;
  shop_id: string;
  channel: "web" | "whatsapp" | "cron";
  input: string;
  steps: AgentStep[];
  output: string;
  created_at: string;
}

export interface Festival {
  name: string;
  date: string; // YYYY-MM-DD
  lead_days: number;
  regions: string[];
  uplift: Partial<Record<Category | "default", number>>;
  approx?: boolean;
}
