import { describe, expect, it } from "vitest";
import { clusterFromPincode, hashPassword, newLinkCode, regionFromPincode, signSession, validatePassword, validateUsername, verifyPassword, verifySession } from "@/lib/auth";
import { MemoryStore } from "@/lib/db/memory";
import { generateSeed } from "@/lib/seed";
import type { Shop } from "@/lib/types";

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const a = await hashPassword("chai-patti-123");
    const b = await hashPassword("chai-patti-123");
    expect(a).not.toBe(b); // different salts
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("chai-patti-123", a)).toBe(true);
    expect(await verifyPassword("wrong-password", a)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });
  it("validates usernames and passwords", () => {
    expect(validateUsername("sharma_store")).toBeNull();
    expect(validateUsername("Sharma Store")).not.toBeNull();
    expect(validateUsername("ab")).not.toBeNull();
    expect(validatePassword("short")).not.toBeNull();
    expect(validatePassword("long-enough")).toBeNull();
  });
});

describe("sessions", () => {
  const secret = "test-secret";
  it("round-trips a signed session", () => {
    const t = signSession({ s: "shop_1", u: "usr_1" }, secret);
    expect(verifySession(t, secret)).toMatchObject({ s: "shop_1", u: "usr_1" });
  });
  it("rejects tampering, wrong secrets and expiry", () => {
    const t = signSession({ s: "shop_1", u: "usr_1" }, secret);
    const [body, mac] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ s: "shop_2", u: "usr_1", e: 9999999999 })).toString("base64url");
    expect(verifySession(`${forged}.${mac}`, secret)).toBeNull();
    expect(verifySession(t, "other-secret")).toBeNull();
    expect(verifySession(`${body}.`, secret)).toBeNull();
    expect(verifySession(t, secret, Date.now() + 40 * 86_400_000)).toBeNull();
    expect(verifySession(undefined, secret)).toBeNull();
  });
});

describe("shop setup helpers", () => {
  it("derives region and cluster from the PIN code", () => {
    expect(regionFromPincode("560095")).toBe("south");
    expect(regionFromPincode("110001")).toBe("north");
    expect(regionFromPincode("400001")).toBe("west");
    expect(regionFromPincode("700001")).toBe("east");
    expect(clusterFromPincode(" 560095 ")).toBe("pin-560095");
  });
  it("makes 6-digit link codes", () => {
    for (let i = 0; i < 50; i++) expect(newLinkCode()).toMatch(/^\d{6}$/);
  });
});

describe("demo reset never touches real shops", () => {
  it("replaces demo data and keeps real shops, users and their data", async () => {
    const store = new MemoryStore();
    await store.resetDemo(generateSeed());
    const real: Shop = {
      id: "shop_real", name: "Real Kirana", owner_name: "Asha", owner_phone: null, locality: "", pincode: "560001", region: "south",
      cluster_id: "pin-560001", cash_budget: 9000, language: "en", open_to_joint_orders: true, is_demo: false, link_code: null, link_code_expires: null,
      created_at: new Date().toISOString(),
    };
    await store.createShop(real, []);
    await store.createUser({ id: "usr_1", username: "asha", password_hash: "x", shop_id: real.id, created_at: real.created_at });
    await store.addEvents([{ id: "ev1", shop_id: real.id, sku_id: "maggi-70g", type: "stockout", qty: 0, source: "web", ts: real.created_at }]);

    await store.resetDemo(generateSeed());

    const shops = await store.listShops();
    expect(shops.filter((s) => s.is_demo)).toHaveLength(3);
    expect(shops.find((s) => s.id === real.id)).toBeTruthy();
    expect(await store.findUserByUsername("asha")).toBeTruthy();
    expect(await store.listEvents(real.id)).toHaveLength(1);
  });
});
