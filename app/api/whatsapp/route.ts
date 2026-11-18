import { after } from "next/server";
import { ensureSeeded, getStore } from "@/lib/db";
import { handleInbound } from "@/lib/inbound";
import { downloadMedia, fromWhatsApp, sendWhatsApp, twilioConfigured, twiml, validTwilioSignature } from "@/lib/whatsapp";

export const maxDuration = 60;

// Twilio WhatsApp webhook. Point the sandbox's "When a message comes in" URL at
// https://<your-app>.vercel.app/api/whatsapp (HTTP POST).

function publicUrl(req: Request): string {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "") + new URL(req.url).pathname;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return `${proto}://${host}${new URL(req.url).pathname}`;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") params[k] = v;

  const token = process.env.TWILIO_AUTH_TOKEN;
  if (token) {
    if (!validTwilioSignature(token, req.headers.get("x-twilio-signature"), publicUrl(req), params)) {
      return new Response("Invalid signature", { status: 403 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return new Response("WhatsApp is not configured", { status: 503 });
  }

  const store = getStore();
  await ensureSeeded(store);
  const phone = fromWhatsApp(params.From ?? "");

  // "LINK 123456": prove this number belongs to the shop that issued the code.
  const link = (params.Body ?? "").match(/^\s*link\s+(\d{6})\s*$/i);
  if (link && phone) {
    const target = await store.findShopByLinkCode(link[1]);
    if (!target || !target.link_code_expires || Date.parse(target.link_code_expires) < Date.now()) {
      return twiml("That code has expired or is wrong. Get a new one from Settings in the app.");
    }
    const previous = await store.findShopByPhone(phone);
    if (previous && previous.id !== target.id) await store.updateShop(previous.id, { owner_phone: null });
    await store.updateShop(target.id, { owner_phone: phone, link_code: null, link_code_expires: null });
    return twiml(`✅ Linked to ${target.name}. You'll get the morning brief here, and you can reply HAAN/YES to approve orders.`);
  }
  let shop = phone ? await store.findShopByPhone(phone) : null;
  const verifiedOwner = !!shop;
  if (!shop && process.env.WHATSAPP_DEMO_FALLBACK !== "false") {
    // Unknown number: talk to the demo shop (read/update only; approvals need a linked number).
    const demos = (await store.listShops()).filter((s) => s.is_demo);
    shop = demos.find((s) => s.id === process.env.WHATSAPP_DEMO_SHOP_ID) ?? demos[0] ?? null;
  }
  if (!shop) return twiml("This number isn't linked to a shop yet. In the app, open Settings → Link WhatsApp to get your code.");

  const numMedia = Math.min(3, Number(params.NumMedia ?? 0));
  const work = async () => {
    const media: { base64: string; mimeType: string }[] = [];
    for (let i = 0; i < numMedia; i++) {
      const url = params[`MediaUrl${i}`];
      if (url) {
        try {
          media.push(await downloadMedia(url));
        } catch (e) {
          console.warn("media download failed", e);
        }
      }
    }
    return handleInbound(store, shop!, { text: params.Body ?? "", media, verifiedOwner });
  };

  // Twilio waits ~15s for a reply. The agent can take longer, so with REST
  // credentials we acknowledge at once and send the answer when it's ready.
  if (twilioConfigured()) {
    after(async () => {
      try {
        await sendWhatsApp(phone, await work());
      } catch (e) {
        console.error("whatsapp reply failed", e);
        await sendWhatsApp(phone, "Sorry, something went wrong. Please try again.").catch(() => {});
      }
    });
    return twiml();
  }
  try {
    return twiml(await work());
  } catch (e) {
    console.error(e);
    return twiml("Sorry, something went wrong. Please try again.");
  }
}
