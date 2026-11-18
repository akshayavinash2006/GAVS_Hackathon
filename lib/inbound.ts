import "server-only";
import { runAgent } from "./agent/orchestrator";
import { geminiConfigured } from "./ai/gemini";
import { readDocument, reviewLines } from "./ai/read-document";
import type { Store } from "./db/store";
import { GuardrailError } from "./guardrails";
import { commitBill, recordCredit, recordStockEvents } from "./ingest";
import { decideOrder } from "./orders";
import { buildSnapshot } from "./snapshot";
import type { Shop } from "./types";
import { inr, istDate } from "./util";

const YES = /^\s*(yes|y|haan|haa|ha|han|ok|okay|approve|approved|हाँ|हां|ಹೌದು|ஆம்)\b/i;
const NO = /^\s*(no|n|nahi|nahin|nako|cancel|reject|नहीं|ಬೇಡ|வேண்டாம்)\b/i;

export interface Inbound {
  text: string;
  media: { base64: string; mimeType: string }[];
  /** True only when the sender's number is this shop's registered owner number. */
  verifiedOwner: boolean;
}

/** Handles one WhatsApp message and returns the reply text. */
export async function handleInbound(store: Store, shop: Shop, msg: Inbound): Promise<string> {
  const hi = shop.language === "hi";

  // 1) Approve / reject drafts. Deterministic: the LLM is never involved in approvals.
  if (!msg.media.length && (YES.test(msg.text) || NO.test(msg.text))) {
    const snap = await buildSnapshot(store, shop.id);
    if (snap?.pending.length) {
      if (!msg.verifiedOwner) {
        return hi
          ? "Order approve karne ke liye Settings mein apna WhatsApp number jodein."
          : "To approve orders from WhatsApp, add this number as the owner's number in Settings.";
      }
      const decision = YES.test(msg.text) ? "approve" : "reject";
      const done: string[] = [];
      const failed: string[] = [];
      for (const o of snap.pending) {
        try {
          await decideOrder(store, shop.id, o.id, decision, "owner");
          done.push(`${o.distributor_name.split(" (")[0]} ${inr(o.total)}`);
        } catch (e) {
          failed.push(`${o.distributor_name.split(" (")[0]}: ${e instanceof GuardrailError ? e.message : "error"}`);
        }
      }
      const head =
        decision === "approve"
          ? hi ? "✅ Approve ho gaya. Salesman ko yeh order dein:" : "✅ Approved. Give these to the salesman:"
          : hi ? "❌ Draft cancel kar diya." : "❌ Drafts dropped.";
      return [head, ...done.map((d) => `• ${d}`), ...(failed.length ? ["", ...failed] : [])].join("\n");
    }
  }

  // 2) Photos: bill, khata page or shelf.
  const images = msg.media.filter((m) => m.mimeType.startsWith("image/"));
  if (images.length && geminiConfigured()) {
    const replies: string[] = [];
    for (const img of images.slice(0, 3)) replies.push(await ingestPhoto(store, shop, img, msg.text));
    return replies.join("\n\n");
  }

  // 3) Everything else (text, voice notes) goes to the agent.
  const audio = msg.media.filter((m) => m.mimeType.startsWith("audio/"));
  const out = await runAgent({ store, shopId: shop.id, channel: "whatsapp", message: msg.text, media: audio });
  return out.text;
}

async function ingestPhoto(store: Store, shop: Shop, img: { base64: string; mimeType: string }, caption: string): Promise<string> {
  const snap = await buildSnapshot(store, shop.id);
  if (!snap) return "Shop not found";
  const hint = /khata|udhar|udhaar|credit/i.test(caption) ? "khata" : /shelf|rack/i.test(caption) ? "shelf" : undefined;
  const doc = await readDocument({ base64: img.base64, mimeType: img.mimeType, skus: [...snap.skuMap.values()], hint, today: istDate() });

  if (doc.doc_type === "distributor_bill" && doc.items.length) {
    const lines = reviewLines(doc, snap.matcher, snap.skuMap);
    const sure = lines.filter((l) => l.confident && l.sku_id);
    const unsure = lines.filter((l) => !(l.confident && l.sku_id));
    const res = await commitBill(store, shop.id, {
      distributor_name: doc.distributor_name ?? "Unknown supplier",
      bill_date: doc.bill_date,
      lines: sure.map((l) => ({ raw_name: l.raw_name, sku_id: l.sku_id, qty: l.qty, unit_cost: l.unit_cost, mrp: l.mrp, expiry_date: l.expiry_date })),
      parsed: doc,
    });
    const estimated = res.lines.filter((l) => l.expiry_estimated).length;
    const out = [`🧾 ${res.distributor}: ${res.lines.length} items saved (${inr(res.total)}).`];
    if (estimated) out.push(`Expiry not visible for ${estimated}; estimated from shelf life.`);
    if (unsure.length) {
      out.push("Not sure about these, please check them on the Scan screen:");
      for (const u of unsure.slice(0, 6)) out.push(`• "${u.raw_name}"${u.sku_name ? ` → ${u.sku_name}?` : ""}`);
    }
    return out.join("\n");
  }
  if (doc.doc_type === "khata" && doc.khata_entries.length) {
    const n = await recordCredit(store, shop.id, doc.khata_entries, "whatsapp");
    const after = await buildSnapshot(store, shop.id);
    return `📒 ${n} khata entries saved. Outstanding credit: ${inr(after?.budget.credit_outstanding ?? 0)}.`;
  }
  if (doc.doc_type === "shelf" && doc.shelf_counts.length) {
    const res = await recordStockEvents(store, shop.id, doc.shelf_counts.map((c) => ({ name: c.raw_name, sku_id: c.sku_id, type: "level" as const, qty: c.qty })), "whatsapp");
    return `📦 Counted ${res.filter((r) => r.matched).length} items from the shelf photo. Thanks, the forecast is updated.`;
  }
  return "I couldn't read that photo. Send a clear photo of a bill, a khata page or a shelf.";
}
