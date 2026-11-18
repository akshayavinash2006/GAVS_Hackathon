import { z } from "zod";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { createDraftOrders } from "@/lib/orders";
import { shopOr401 } from "@/lib/session";
import { buildSnapshot } from "@/lib/snapshot";

const Body = z.object({
  items: z.array(z.object({ sku_id: z.string().max(80), qty: z.number().int().positive().max(5000) })).max(200).optional(),
});

/** Turns the current plan (or a hand-picked list) into drafts. Never approves. */
export async function POST(req: Request) {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    const body = Body.parse(await req.json().catch(() => ({})));
    const store = getStore();
    const snap = await buildSnapshot(store, s.shop.id);
    if (!snap) return Response.json({ error: "Shop not found" }, { status: 404 });
    const orders = await createDraftOrders(store, snap, "owner", { items: body.items });
    return Response.json({ orders });
  } catch (e) {
    return errorResponse(e);
  }
}
