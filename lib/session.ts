import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ensureSeeded, getStore } from "./db";
import type { Shop } from "./types";

// Demo sign-in: picking a shop sets an httpOnly cookie. For real shops, swap
// this for Supabase Auth phone OTP; nothing else depends on how the shop was chosen.

export const SHOP_COOKIE = "dukaan_shop";

export async function currentShop(): Promise<Shop | null> {
  const id = (await cookies()).get(SHOP_COOKIE)?.value;
  if (!id) return null;
  const store = getStore();
  await ensureSeeded(store);
  return store.getShop(id);
}

export async function requireShop(): Promise<Shop> {
  const shop = await currentShop();
  if (!shop) redirect("/");
  return shop;
}

/** For route handlers: returns the shop or a 401 response. */
export async function shopOr401(): Promise<{ shop: Shop } | { error: Response }> {
  const shop = await currentShop();
  if (!shop) return { error: Response.json({ error: "Pick a shop first" }, { status: 401 }) };
  return { shop };
}
