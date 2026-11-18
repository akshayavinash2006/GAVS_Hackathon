import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Minimal Twilio WhatsApp client over REST, so there's no SDK dependency.
// Works with the free Twilio WhatsApp Sandbox (no Meta approval needed for a demo).

export function twilioConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

/** https://www.twilio.com/docs/usage/security#validating-requests */
export function validTwilioSignature(authToken: string, signature: string | null, url: string, params: Record<string, string>): boolean {
  if (!signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function toWhatsApp(phone: string): string {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}

export function fromWhatsApp(addr: string): string {
  return addr.replace(/^whatsapp:/, "");
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
}

/** WhatsApp messages cap at ~1600 chars; split on line breaks. */
export function chunk(text: string, max = 1500): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + "\n" + line).length > max && cur) {
      out.push(cur);
      cur = line;
    } else cur = cur ? cur + "\n" + line : line;
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

export async function sendWhatsApp(to: string, body: string): Promise<void> {
  if (!twilioConfigured()) throw new Error("Twilio is not configured");
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  for (const part of chunk(body)) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: toWhatsApp(process.env.TWILIO_WHATSAPP_FROM!), To: toWhatsApp(to), Body: part }),
    });
    if (!res.ok) throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`);
  }
}

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

export async function downloadMedia(url: string): Promise<{ base64: string; mimeType: string }> {
  // Only fetch from Twilio's media host, with our credentials.
  const u = new URL(url);
  if (!/(^|\.)twilio\.com$/.test(u.hostname)) throw new Error("Unexpected media host");
  const res = await fetch(url, { headers: { Authorization: authHeader() }, redirect: "follow" });
  if (!res.ok) throw new Error(`Media download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_MEDIA_BYTES) throw new Error("Media too large");
  return { base64: buf.toString("base64"), mimeType: (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0] };
}

export function twiml(message?: string): Response {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = message ? `<Response><Message>${esc(message)}</Message></Response>` : "<Response></Response>";
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { "Content-Type": "text/xml" } });
}
