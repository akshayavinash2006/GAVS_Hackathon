import { z } from "zod";
import { clusterFromPincode, hashPassword, regionFromPincode, validatePassword, validateUsername } from "@/lib/auth";
import { ensureSeeded, getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { setSession } from "@/lib/session";
import type { Category, Distributor, Shop } from "@/lib/types";
import { uid } from "@/lib/util";

const SUPPLIER_TEMPLATES: Record<string, { name: string; kind: Distributor["kind"]; categories: Category[]; accepts_returns: boolean; lead_days: number }> = {
  fmcg: { name: "FMCG distributor", kind: "distributor", categories: ["personal_care", "home_care", "beverages"], accepts_returns: true, lead_days: 2 },
  snacks: { name: "Biscuits & snacks distributor", kind: "distributor", categories: ["snacks", "instant_food"], accepts_returns: true, lead_days: 2 },
  dairy: { name: "Milk & bread agent", kind: "dairy", categories: ["dairy", "bakery"], accepts_returns: false, lead_days: 1 },
  wholesale: { name: "Wholesale market", kind: "wholesale", categories: ["staples", "oil_ghee", "spices", "sweets_dryfruits", "pooja"], accepts_returns: false, lead_days: 1 },
};

const Body = z.object({
  username: z.string().trim().toLowerCase(),
  password: z.string(),
  owner_name: z.string().trim().min(1, "Enter your name").max(60),
  shop_name: z.string().trim().min(2, "Enter the shop's name").max(80),
  locality: z.string().trim().max(80).default(""),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code"),
  cash_budget: z.number().int().min(500, "Budget looks too low").max(10_000_000),
  language: z.enum(["en", "hi"]),
  suppliers: z
    .array(z.object({ type: z.enum(["fmcg", "snacks", "dairy", "wholesale"]), name: z.string().trim().max(80).optional(), visit_days: z.array(z.number().int().min(0).max(6)).max(7) }))
    .max(8)
    .default([]),
});

export async function POST(req: Request) {
  if (rateLimited(`signup:${clientIp(req)}`, 10, 60 * 60_000)) return Response.json({ error: "Too many sign-ups from here. Try again later." }, { status: 429 });
  try {
    const b = Body.parse(await req.json());
    const bad = validateUsername(b.username) ?? validatePassword(b.password);
    if (bad) return Response.json({ error: bad }, { status: 400 });

    const store = getStore();
    await ensureSeeded(store);
    if (await store.findUserByUsername(b.username)) return Response.json({ error: "That username is taken" }, { status: 409 });

    const now = new Date().toISOString();
    const shop: Shop = {
      id: uid("shop"),
      name: b.shop_name,
      owner_name: b.owner_name,
      owner_phone: null,
      locality: b.locality,
      pincode: b.pincode,
      region: regionFromPincode(b.pincode),
      cluster_id: clusterFromPincode(b.pincode),
      cash_budget: b.cash_budget,
      language: b.language,
      open_to_joint_orders: true,
      is_demo: false,
      link_code: null,
      link_code_expires: null,
      created_at: now,
    };
    const distributors: Distributor[] = b.suppliers.map((s) => {
      const t = SUPPLIER_TEMPLATES[s.type];
      return {
        id: uid("dist"),
        shop_id: shop.id,
        name: s.name || t.name,
        phone: null,
        kind: t.kind,
        visit_days: s.type === "dairy" && !s.visit_days.length ? [0, 1, 2, 3, 4, 5, 6] : [...new Set(s.visit_days)].sort(),
        lead_days: t.lead_days,
        accepts_returns: t.accepts_returns,
        categories: t.categories,
      };
    });

    await store.createShop(shop, distributors);
    try {
      await store.createUser({ id: uid("usr"), username: b.username, password_hash: await hashPassword(b.password), shop_id: shop.id, created_at: now });
    } catch (e) {
      if (/duplicate|unique/i.test(String(e))) return Response.json({ error: "That username is taken" }, { status: 409 });
      throw e;
    }
    const user = await store.findUserByUsername(b.username);
    await setSession(shop.id, user!.id);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues[0]?.message ?? "Check the form" }, { status: 400 });
    return errorResponse(e);
  }
}
