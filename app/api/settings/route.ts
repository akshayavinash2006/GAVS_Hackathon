import { z } from "zod";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { shopOr401 } from "@/lib/session";

// The WhatsApp number is not editable here: it's set only by the LINK code
// flow, which proves the owner actually has that phone.
const Body = z.object({
  shop_name: z.string().trim().min(2).max(80).optional(),
  cash_budget: z.number().int().min(0).max(10_000_000).optional(),
  language: z.enum(["en", "hi"]).optional(),
  open_to_joint_orders: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    const { shop_name, ...rest } = Body.parse(await req.json());
    const store = getStore();
    await store.updateShop(s.shop.id, { ...rest, ...(shop_name && !s.shop.is_demo ? { name: shop_name } : {}) });
    return Response.json({ shop: await store.getShop(s.shop.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
