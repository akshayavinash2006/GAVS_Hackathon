import "server-only";
import { z } from "zod";
import type { SkuMatcher } from "../sku-match";
import type { Category, Sku } from "../types";
import { generateJson, mediaPart } from "./gemini";

// Reads a photo the owner already has (distributor bill, khata page or shelf)
// into structured data. The model proposes a SKU for every line; we
// cross-check it against the trigram matcher and only auto-accept when both agree.

const CATEGORIES: Category[] = ["staples", "oil_ghee", "dairy", "bakery", "snacks", "beverages", "instant_food", "spices", "sweets_dryfruits", "pooja", "personal_care", "home_care"];

const DocSchema = z.object({
  doc_type: z.enum(["distributor_bill", "khata", "shelf", "other"]),
  distributor_name: z.string().optional().nullable(),
  bill_date: z.string().optional().nullable(),
  bill_total: z.number().optional().nullable(),
  items: z
    .array(
      z.object({
        raw_name: z.string(),
        sku_id: z.string().optional().nullable(),
        qty_units: z.number(),
        unit_cost: z.number().optional().nullable(),
        mrp: z.number().optional().nullable(),
        expiry: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
        confidence: z.number().optional().nullable(),
      }),
    )
    .default([]),
  khata_entries: z
    .array(z.object({ customer: z.string(), amount: z.number(), kind: z.enum(["given", "repaid"]), date: z.string().optional().nullable() }))
    .default([]),
  shelf_counts: z.array(z.object({ raw_name: z.string(), sku_id: z.string().optional().nullable(), qty: z.number() })).default([]),
  notes: z.string().optional().nullable(),
});
export type DocRead = z.infer<typeof DocSchema>;

const JSON_SCHEMA = {
  type: "object",
  properties: {
    doc_type: { type: "string", enum: ["distributor_bill", "khata", "shelf", "other"] },
    distributor_name: { type: "string" },
    bill_date: { type: "string", description: "YYYY-MM-DD" },
    bill_total: { type: "number" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          raw_name: { type: "string", description: "Item name exactly as printed/written" },
          sku_id: { type: "string", description: "Best matching id from the catalog, omit if none fits" },
          qty_units: { type: "number", description: "Quantity in individual retail units (convert cases/boxes/dozens)" },
          unit_cost: { type: "number", description: "Cost per retail unit to the shop, after scheme/discount" },
          mrp: { type: "number" },
          expiry: { type: "string", description: "YYYY-MM-DD; for MM/YY use the last day of that month. If only MFG date + 'best before N months' is shown, compute it." },
          category: { type: "string", enum: CATEGORIES },
          confidence: { type: "number", description: "0-1, how sure you are about this line" },
        },
        required: ["raw_name", "qty_units"],
      },
    },
    khata_entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          customer: { type: "string" },
          amount: { type: "number" },
          kind: { type: "string", enum: ["given", "repaid"] },
          date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["customer", "amount", "kind"],
      },
    },
    shelf_counts: {
      type: "array",
      items: {
        type: "object",
        properties: { raw_name: { type: "string" }, sku_id: { type: "string" }, qty: { type: "number" } },
        required: ["raw_name", "qty"],
      },
    },
    notes: { type: "string", description: "Anything the owner should double-check, in one short sentence" },
  },
  required: ["doc_type", "items", "khata_entries", "shelf_counts"],
};

function catalogPrompt(skus: Sku[]): string {
  return skus.map((s) => `${s.id} | ${s.name} | ${s.aliases.slice(0, 3).join(", ")}`).join("\n");
}

export async function readDocument(opts: {
  base64: string;
  mimeType: string;
  skus: Sku[];
  hint?: "distributor_bill" | "khata" | "shelf";
  today: string;
}): Promise<DocRead> {
  const system = `You read photos from small Indian grocery shops (kiranas): printed or handwritten distributor bills/invoices, khata (credit) notebook pages, and shelf photos.
Text may be English, Hindi, Kannada, Tamil or a mix, and often abbreviated ("SURF EXL EZ WSH 500G", "PRL G 10RS").
Rules:
- Only report what you can actually see. Never invent lines, prices or dates.
- For bills: one entry per line item. Convert quantities to retail units (e.g. "2 CS" of a 48-unit case = 96). Use per-unit cost to the shop.
- Map each item to the closest catalog id when you are reasonably sure; otherwise leave sku_id out and give a category.
- For khata pages: each customer's credit given (udhaar) or repaid (jama) with amounts in rupees.
- For shelf photos: rough counts of clearly visible items.
- Today is ${opts.today}. Dates on bills are usually DD/MM/YY.
Catalog (id | name | local names):
${catalogPrompt(opts.skus)}`;
  const instruction = opts.hint ? `This should be a ${opts.hint.replace("_", " ")}.` : "Work out what kind of document this is.";
  return generateJson({
    system,
    parts: [mediaPart(opts.base64, opts.mimeType), { text: `${instruction} Extract it as JSON.` }],
    jsonSchema: JSON_SCHEMA,
    schema: DocSchema,
  });
}

export interface ReviewedLine {
  raw_name: string;
  sku_id: string | null;
  sku_name: string | null;
  confident: boolean;
  alternatives: { sku_id: string; name: string }[];
  qty: number;
  unit_cost: number | null;
  mrp: number | null;
  expiry_date: string | null;
  category: Category;
}

/** Cross-check the model's SKU guesses with the local-name matcher. */
export function reviewLines(doc: DocRead, matcher: SkuMatcher, skus: Map<string, Sku>): ReviewedLine[] {
  return doc.items.map((it) => {
    const m = matcher.match(it.raw_name);
    const llm = it.sku_id && skus.has(it.sku_id) ? it.sku_id : null;
    const inTop = llm ? m.candidates.some((c) => c.sku_id === llm) : false;
    let sku_id: string | null = null;
    let confident = false;
    if (llm && (inTop || (it.confidence ?? 0) >= 0.85)) {
      sku_id = llm;
      confident = inTop && (it.confidence ?? 0.8) >= 0.6;
    } else if (m.best && m.confidence !== "low") {
      sku_id = m.best.sku_id;
      confident = m.confidence === "high" && (!llm || llm === m.best.sku_id);
    } else if (llm) {
      sku_id = llm;
    }
    const alts = m.candidates.filter((c) => c.sku_id !== sku_id).map((c) => ({ sku_id: c.sku_id, name: c.name }));
    if (llm && llm !== sku_id) alts.unshift({ sku_id: llm, name: skus.get(llm)!.name });
    const expiry = it.expiry && /^\d{4}-\d{2}-\d{2}$/.test(it.expiry) ? it.expiry : null;
    const cat = (CATEGORIES as string[]).includes(it.category ?? "") ? (it.category as Category) : sku_id ? skus.get(sku_id)!.category : "staples";
    return {
      raw_name: it.raw_name,
      sku_id,
      sku_name: sku_id ? skus.get(sku_id)!.name : null,
      confident,
      alternatives: alts.slice(0, 3),
      qty: Math.max(0, Math.round(it.qty_units)),
      unit_cost: it.unit_cost ?? null,
      mrp: it.mrp ?? null,
      expiry_date: expiry,
      category: cat,
    };
  });
}
