import { z } from "zod";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { shopOr401 } from "@/lib/session";

const Body = z.object({
  cash_budget: z.number().int().min(0).max(10_000_000).optional(),
  language: z.enum(["en", "hi"]).optional(),
  owner_phone: z
    .string()
    .regex(/^\+\d{8,15}$/, "Use international format, e.g. +919812345678")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  open_to_joint_orders: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    const patch = Body.parse(await req.json());
    const store = getStore();
    if (patch.owner_phone) {
      const other = await store.findShopByPhone(patch.owner_phone);
      if (other && other.id !== s.shop.id) return Response.json({ error: "That number is linked to another shop" }, { status: 409 });
    }
    await store.updateShop(s.shop.id, patch);
    return Response.json({ shop: await store.getShop(s.shop.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
