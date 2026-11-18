import { CATALOG } from "@/data/catalog";
import { FESTIVALS, festivalMultiplier } from "./forecast";
import type { SeedData } from "./db/store";
import type { Batch, Bill, Category, CreditEntry, Distributor, Shop, Sku } from "./types";
import { addDays, hashString, istDate, rng, round, uid } from "./util";

// Generates six weeks of plausible history for three neighbouring kiranas in
// Koramangala, Bengaluru, simulated day by day with real FEFO stock. What gets
// stored is only what such a shop would actually have on record: distributor
// bills, the odd "khatam" / "10 bacha" message, logged expiries and khata entries.
// The true daily sales are never stored, and the app has to infer them.

const SHOPS: Omit<Shop, "created_at" | "is_demo" | "link_code" | "link_code_expires">[] = [
  { id: "shop-sharma", name: "Sharma General Store", owner_name: "Rajesh Sharma", owner_phone: null, locality: "Koramangala 5th Block", pincode: "560095", region: "south", cluster_id: "blr-koramangala", cash_budget: 18000, language: "hi", open_to_joint_orders: true },
  { id: "shop-lakshmi", name: "Sri Lakshmi Kirana", owner_name: "Lakshmi Narayan", owner_phone: null, locality: "Koramangala 6th Block", pincode: "560095", region: "south", cluster_id: "blr-koramangala", cash_budget: 14000, language: "en", open_to_joint_orders: true },
  { id: "shop-balaji", name: "Balaji Provisions", owner_name: "Venkatesh R", owner_phone: null, locality: "Koramangala 7th Block", pincode: "560095", region: "south", cluster_id: "blr-koramangala", cash_budget: 12000, language: "en", open_to_joint_orders: true },
];

const DISTRIBUTORS: Omit<Distributor, "id" | "shop_id">[] = [
  { name: "Sri Ganesh Agencies (HUL, Reckitt)", phone: null, kind: "distributor", visit_days: [2], lead_days: 2, accepts_returns: true, categories: ["personal_care", "home_care", "beverages"] },
  { name: "Mahaveer Distributors (Parle, Britannia, Nestlé)", phone: null, kind: "distributor", visit_days: [1, 4], lead_days: 2, accepts_returns: true, categories: ["snacks", "instant_food"] },
  { name: "Nandini Milk Agent", phone: null, kind: "dairy", visit_days: [0, 1, 2, 3, 4, 5, 6], lead_days: 1, accepts_returns: false, categories: ["dairy", "bakery"] },
  { name: "Chickpet Wholesale Market", phone: null, kind: "wholesale", visit_days: [6], lead_days: 1, accepts_returns: false, categories: ["staples", "oil_ghee", "spices", "sweets_dryfruits", "pooja"] },
];

const DEAD_STOCK_CANDIDATES = ["horlicks-500g", "kissan-jam-200g", "dettol-handwash-200ml", "gulab-jamun-mix-200g", "mtr-rava-idli-500g", "boost-500g", "paneer-200g"];
const FESTIVE_CATS: Category[] = ["sweets_dryfruits", "pooja", "oil_ghee"];
const CUSTOMERS = ["Ramesh (Flat 302)", "Anita aunty", "Suresh auto driver", "Meena", "Bahadur watchman", "Kavya PG", "Imran bhai", "Gowda sir", "Priya (tuition)", "Joseph uncle", "Shanti amma", "Ravi construction"];

function poisson(lambda: number, r: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda > 25) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * (r() + r() + r() - 1.5) * 1.4));
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= r();
  } while (p > L);
  return k - 1;
}

function at(day: Date, hour: number, r: () => number): string {
  // `day` is a UTC midnight that represents an IST calendar day.
  return new Date(day.getTime() + (hour - 5.5) * 3600_000 + Math.floor(r() * 50) * 60_000).toISOString();
}

export function generateSeed(now: Date = new Date()): SeedData {
  const today = new Date(istDate(now) + "T00:00:00Z");
  const data: SeedData = { shops: [], distributors: [], batches: [], events: [], bills: [], credit: [], orders: [], aliases: [], customSkus: [] };

  for (const base of SHOPS) {
    const r = rng(hashString(base.id + istDate(now)));
    const shop: Shop = { ...base, is_demo: true, link_code: null, link_code_expires: null, created_at: addDays(today, -45).toISOString() };
    data.shops.push(shop);

    const dists: Distributor[] = DISTRIBUTORS.map((d, i) => ({ ...d, id: `${shop.id}-dist-${i + 1}`, shop_id: shop.id }));
    data.distributors.push(...dists);
    const distFor = (sku: Sku) => dists.find((d) => d.categories.includes(sku.category)) ?? dists[3];

    const shopFactor = 0.75 + r() * 0.5;
    const dead = new Set(DEAD_STOCK_CANDIDATES.filter(() => r() < 0.55).slice(0, 4));
    if (dead.size < 2) dead.add("horlicks-500g").add("kissan-jam-200g");

    const billsByKey = new Map<string, Bill>();
    const getBill = (day: Date, dist: Distributor): Bill => {
      const key = `${istDate(day)}|${dist.id}`;
      let b = billsByKey.get(key);
      if (!b) {
        b = { id: uid("bill"), shop_id: shop.id, distributor_id: dist.id, distributor_name: dist.name, bill_date: istDate(day), total: 0, image_path: null, parsed: { source: "seed" }, created_at: at(day, 9, r) };
        billsByKey.set(key, b);
      }
      return b;
    };

    for (const sku of CATALOG) {
      if (!dead.has(sku.id) && r() < 0.1) continue; // not every shop stocks everything
      const dist = distFor(sku);
      const v = sku.base_velocity * shopFactor * (0.6 + r() * 0.8);
      const cycle = Math.max(1, Math.round(7 / Math.max(1, dist.visit_days.length)));
      const perishable = sku.shelf_life_days <= 14;
      const lots: { batch: Batch; left: number }[] = [];
      let reportedOut = false;

      const buy = (day: Date, qty: number, expiry: Date) => {
        const bill = getBill(day, dist);
        const unit = round(sku.cost * (0.97 + r() * 0.06), 2);
        const batch: Batch = { id: uid("bat"), shop_id: shop.id, sku_id: sku.id, qty_in: qty, unit_cost: unit, expiry_date: istDate(expiry), purchased_at: bill.created_at, bill_id: bill.id, distributor_id: dist.id };
        bill.total += qty * unit;
        data.batches.push(batch);
        lots.push({ batch, left: qty });
        reportedOut = false;
      };
      const caseRound = (q: number) => (perishable || q < sku.case_qty * 0.6 ? Math.max(1, Math.round(q)) : Math.ceil(q / sku.case_qty) * sku.case_qty);
      const expiryFor = (day: Date) => addDays(day, Math.max(1, Math.round(sku.shelf_life_days * (perishable ? 1 : 0.55 + r() * 0.45))));

      // Opening stock six weeks ago.
      const start = addDays(today, -42);
      buy(start, caseRound(v * (perishable ? cycle + 1 : cycle + 5)), expiryFor(start));

      for (let d = -41; d <= -1; d++) {
        const day = addDays(today, d);
        const { mult } = festivalMultiplier(sku.category, day, FESTIVALS);

        // Discard expired lots; owners log some of it.
        for (const lot of lots) {
          if (lot.left > 0 && lot.batch.expiry_date! <= istDate(day)) {
            if (r() < 0.6) data.events.push({ id: uid("ev"), shop_id: shop.id, sku_id: sku.id, type: "writeoff", qty: lot.left, source: "seed", ts: at(day, 9, r) });
            lot.left = 0;
          }
        }

        // Morning: the salesman visits / the owner restocks, based on what is on the shelf.
        const stockAM = lots.reduce((s, l) => s + l.left, 0);
        const ist = day.getUTCDay();
        if (perishable && dist.visit_days.includes(ist)) {
          // Daily dairy/bread: top up to about a day's sales, sometimes a bit over.
          const want = v * mult * (cycle + 0.3) * (0.95 + r() * 0.35) - stockAM;
          if (want >= 1) buy(day, Math.round(want), expiryFor(day));
        } else if (dist.visit_days.includes(ist) && stockAM < v * (cycle + 2) * mult) {
          // Festival demand is guessed: owners over-buy festive categories.
          const upcoming = festivalMultiplier(sku.category, addDays(day, 5), FESTIVALS).mult;
          const guess = FESTIVE_CATS.includes(sku.category) && upcoming > 1.2 ? 1.6 + r() : 0.9 + r() * 0.5;
          buy(day, caseRound(v * (cycle + 4) * guess * Math.max(1, mult * 0.8)), expiryFor(day));
        }

        // Salesman pushes a "scheme" on slow movers with short-dated stock.
        if (dead.has(sku.id) && d === -24) {
          buy(day, Math.max(sku.case_qty, 12), addDays(today, 4 + Math.floor(r() * 16)));
        }

        // Daytime: sell FEFO; evening: maybe notice an empty shelf or count stock.
        let demand = poisson(v * mult, r);
        for (const lot of [...lots].sort((a, b) => a.batch.expiry_date!.localeCompare(b.batch.expiry_date!))) {
          if (demand <= 0) break;
          const take = Math.min(lot.left, demand);
          lot.left -= take;
          demand -= take;
        }
        const stock = lots.reduce((s, l) => s + l.left, 0);

        if (stock <= 0 && !reportedOut && v >= 0.3 && r() < 0.65) {
          data.events.push({ id: uid("ev"), shop_id: shop.id, sku_id: sku.id, type: "stockout", qty: 0, source: "seed", ts: at(day, 19, r) });
          reportedOut = true;
        } else if (stock > 0 && v >= 0.8 && r() < 0.05) {
          data.events.push({ id: uid("ev"), shop_id: shop.id, sku_id: sku.id, type: "level", qty: Math.max(0, Math.round(stock * (0.9 + r() * 0.2))), source: "seed", ts: at(day, 20, r) });
        }

      }
    }

    for (const b of billsByKey.values()) {
      b.total = Math.round(b.total);
      data.bills.push(b);
    }

    // Khata: running credit for regulars, with some repayments.
    for (const c of CUSTOMERS) {
      if (r() < 0.25) continue;
      const n = 2 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) {
        const d = -Math.floor(r() * 40) - 1;
        const amt = Math.round((150 + r() * 900) / 10) * 10;
        const entry: CreditEntry = { id: uid("cr"), shop_id: shop.id, customer: c, amount: amt, ts: at(addDays(today, d), 18, r), source: "seed" };
        data.credit.push(entry);
        if (r() < 0.35) data.credit.push({ ...entry, id: uid("cr"), amount: -Math.round(amt * (0.5 + r() * 0.5)), ts: at(addDays(today, Math.min(-1, d + 5)), 10, r) });
      }
    }
  }

  // Sanity: stable ordering for inserts.
  data.batches.sort((a, b) => a.purchased_at.localeCompare(b.purchased_at));
  data.events.sort((a, b) => a.ts.localeCompare(b.ts));
  return data;
}

