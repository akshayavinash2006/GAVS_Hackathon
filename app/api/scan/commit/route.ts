import { z } from "zod";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { commitBill, recordCredit, recordStockEvents } from "@/lib/ingest";
import { shopOr401 } from "@/lib/session";

const CATEGORY = z.enum(["staples", "oil_ghee", "dairy", "bakery", "snacks", "beverages", "instant_food", "spices", "sweets_dryfruits", "pooja", "personal_care", "home_care"]);

const Body = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("distributor_bill"),
    distributor_name: z.string().max(120).default(""),
    bill_date: z.string().max(20).nullable().optional(),
    image_path: z.string().max(300).nullable().optional(),
    lines: z
      .array(
        z.object({
          raw_name: z.string().max(120),
          sku_id: z.string().max(80).nullable(),
          new_item: z.object({ name: z.string().min(1).max(80), category: CATEGORY, mrp: z.number().nullable().optional() }).optional(),
          qty: z.number().min(0).max(10000),
          unit_cost: z.number().min(0).max(100000).nullable(),
          mrp: z.number().nullable().optional(),
          expiry_date: z.string().max(20).nullable().optional(),
        }),
      )
      .max(200),
  }),
  z.object({
    kind: z.literal("khata"),
    entries: z.array(z.object({ customer: z.string().min(1).max(60), amount: z.number().positive().max(1_000_000), kind: z.enum(["given", "repaid"]), date: z.string().nullable().optional() })).max(200),
  }),
  z.object({
    kind: z.literal("shelf"),
    counts: z.array(z.object({ sku_id: z.string().max(80), raw_name: z.string().max(120), qty: z.number().min(0).max(10000) })).max(200),
  }),
]);

export async function POST(req: Request) {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    const body = Body.parse(await req.json());
    const store = getStore();
    if (body.kind === "distributor_bill") {
      const res = await commitBill(store, s.shop.id, {
        distributor_name: body.distributor_name,
        bill_date: body.bill_date,
        image_path: body.image_path,
        lines: body.lines,
        parsed: { lines: body.lines.length },
      });
      return Response.json({ ok: true, result: res });
    }
    if (body.kind === "khata") {
      const n = await recordCredit(store, s.shop.id, body.entries, "scan");
      return Response.json({ ok: true, result: { recorded: n } });
    }
    const res = await recordStockEvents(
      store,
      s.shop.id,
      body.counts.map((c) => ({ name: c.raw_name, sku_id: c.sku_id, type: "level" as const, qty: c.qty })),
      "scan",
    );
    return Response.json({ ok: true, result: { recorded: res.filter((r) => r.matched).length } });
  } catch (e) {
    return errorResponse(e);
  }
}
