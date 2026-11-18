import type { DocRead } from "@/lib/ai/read-document";
import { addDays, istDate } from "@/lib/util";

/**
 * A typical abbreviated distributor invoice, used for the "try a sample bill"
 * demo and when no Gemini key is configured. Names are written the way
 * distributor billing software prints them.
 */
export function sampleBill(now = new Date()): DocRead {
  const exp = (days: number) => istDate(addDays(now, days));
  return {
    doc_type: "distributor_bill",
    distributor_name: "Mahaveer Distributors",
    bill_date: istDate(now),
    bill_total: 5290,
    items: [
      { raw_name: "PRL G 80G 10RS", sku_id: "parle-g-80g", qty_units: 96, unit_cost: 8.6, mrp: 10, expiry: exp(150), category: "snacks", confidence: 0.9 },
      { raw_name: "MAGGI MSL NDL 70G", sku_id: "maggi-70g", qty_units: 96, unit_cost: 12.9, mrp: 15, expiry: exp(240), category: "instant_food", confidence: 0.95 },
      { raw_name: "BRIT GD DAY CSHW 100G", sku_id: "good-day-100g", qty_units: 48, unit_cost: 25.8, mrp: 30, expiry: exp(120), category: "snacks", confidence: 0.85 },
      { raw_name: "LAYS CLSC SLTD 52G", sku_id: "lays-classic-52g", qty_units: 30, unit_cost: 16.9, mrp: 20, expiry: exp(75), category: "snacks", confidence: 0.9 },
      { raw_name: "KURKURE MSL MNCH 90", sku_id: "kurkure-masala-90g", qty_units: 30, unit_cost: 17, mrp: 20, expiry: exp(80), category: "snacks", confidence: 0.8 },
      { raw_name: "SNFST YPE MGC MSL 60G", sku_id: null, qty_units: 48, unit_cost: 12.8, mrp: 15, expiry: exp(200), category: "instant_food", confidence: 0.5 },
      { raw_name: "SNFST DARK FANTASY 75G", sku_id: null, qty_units: 24, unit_cost: 34, mrp: 40, expiry: exp(110), category: "snacks", confidence: 0.4 },
      { raw_name: "MTR GLB JMN MIX 200", sku_id: "gulab-jamun-mix-200g", qty_units: 12, unit_cost: 104, mrp: 120, expiry: exp(25), category: "sweets_dryfruits", confidence: 0.7 },
    ],
    khata_entries: [],
    shelf_counts: [],
    notes: "Sample bill. Check the Yippee and Dark Fantasy lines.",
  };
}
