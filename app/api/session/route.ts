import { cookies } from "next/headers";
import { z } from "zod";
import { ensureSeeded, getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { SHOP_COOKIE } from "@/lib/session";

export async function POST(req: Request) {
  try {
    const { shop_id } = z.object({ shop_id: z.string().min(1).max(80) }).parse(await req.json());
    const store = getStore();
    await ensureSeeded(store);
    const shop = await store.getShop(shop_id);
    if (!shop) return Response.json({ error: "Unknown shop" }, { status: 404 });
    (await cookies()).set(SHOP_COOKIE, shop.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  (await cookies()).delete(SHOP_COOKIE);
  return Response.json({ ok: true });
}
