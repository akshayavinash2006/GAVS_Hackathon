import { z } from "zod";
import { ensureSeeded, getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { clearSession, setSession } from "@/lib/session";

/** Open a demo shop (no login). Real shops can only be opened by logging in. */
export async function POST(req: Request) {
  try {
    const { shop_id } = z.object({ shop_id: z.string().min(1).max(80) }).parse(await req.json());
    const store = getStore();
    await ensureSeeded(store);
    const shop = await store.getShop(shop_id);
    if (!shop || !shop.is_demo) return Response.json({ error: "Unknown demo shop" }, { status: 404 });
    await setSession(shop.id, null);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Log out. */
export async function DELETE() {
  await clearSession();
  return Response.json({ ok: true });
}
