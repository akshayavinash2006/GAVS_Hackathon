import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_TTL_DAYS, signSession, verifySession } from "./auth";
import { ensureSeeded, getStore } from "./db";
import type { Shop } from "./types";

// Who is looking at which shop. A signed cookie carries { shop, user }.
// Demo shops can be opened by anyone; a real shop needs its owner's login.

export const SESSION_COOKIE = "dukaan_session";

export async function setSession(shopId: string, userId: string | null): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, signSession({ s: shopId, u: userId }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 86400,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentShop(): Promise<Shop | null> {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const store = getStore();
  await ensureSeeded(store);
  const shop = await store.getShop(session.s);
  if (!shop) return null;
  if (shop.is_demo) return shop;
  // Real shop: the session must belong to this shop's owner account.
  if (!session.u) return null;
  const user = await store.getUser(session.u);
  return user && user.shop_id === shop.id ? shop : null;
}

/** The logged-in account's username (null for demo shops). */
export async function currentUsername(): Promise<string | null> {
  const session = verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session?.u) return null;
  return (await getStore().getUser(session.u))?.username ?? null;
}

export async function requireShop(): Promise<Shop> {
  const shop = await currentShop();
  if (!shop) redirect("/login");
  return shop;
}

/** For route handlers: returns the shop or a 401 response. */
export async function shopOr401(): Promise<{ shop: Shop } | { error: Response }> {
  const shop = await currentShop();
  if (!shop) return { error: Response.json({ error: "Please log in" }, { status: 401 }) };
  return { shop };
}
