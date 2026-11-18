import { z } from "zod";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { recordStockEvents } from "@/lib/ingest";
import { shopOr401 } from "@/lib/session";

const Body = z.object({
  updates: z
    .array(z.object({ sku_id: z.string().max(80), name: z.string().max(120), type: z.enum(["stockout", "level", "sale", "writeoff"]), qty: z.number().min(0).max(10000).optional() }))
    .min(1)
    .max(50),
});

/** One-tap updates from the Stock screen ("ran out", "count is 12", "threw away 3"). */
export async function POST(req: Request) {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    const { updates } = Body.parse(await req.json());
    const res = await recordStockEvents(getStore(), s.shop.id, updates, "web");
    return Response.json({ recorded: res.filter((r) => r.matched).length });
  } catch (e) {
    return errorResponse(e);
  }
}
