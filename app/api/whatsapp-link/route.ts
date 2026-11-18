import { newLinkCode } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { shopOr401 } from "@/lib/session";

const TTL_MS = 15 * 60_000;

/** Issue a one-time code; the owner sends "LINK <code>" from their WhatsApp to prove the number is theirs. */
export async function POST() {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    const store = getStore();
    let code = newLinkCode();
    for (let i = 0; i < 5 && (await store.findShopByLinkCode(code)); i++) code = newLinkCode();
    const expires = new Date(Date.now() + TTL_MS).toISOString();
    await store.updateShop(s.shop.id, { link_code: code, link_code_expires: expires });
    const from = (process.env.TWILIO_WHATSAPP_FROM ?? "").replace(/^whatsapp:/, "");
    return Response.json({ code, expires, whatsapp_number: from || null, wa_link: from ? `https://wa.me/${from.replace(/\D/g, "")}?text=${encodeURIComponent(`LINK ${code}`)}` : null });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Unlink the current WhatsApp number. */
export async function DELETE() {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    await getStore().updateShop(s.shop.id, { owner_phone: null, link_code: null, link_code_expires: null });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
