import { composeBrief } from "@/lib/brief";
import { ensureSeeded, getStore } from "@/lib/db";
import { errorResponse, hasSecret } from "@/lib/http";
import { createDraftOrders } from "@/lib/orders";
import { buildSnapshot } from "@/lib/snapshot";
import { uid } from "@/lib/util";
import { sendWhatsApp, twilioConfigured } from "@/lib/whatsapp";

export const maxDuration = 60;

/**
 * The scheduled agent (vercel.json: 01:30 UTC = 07:00 IST). For every shop it
 * drafts a reorder within budget if none is waiting, then sends the morning brief
 * on WhatsApp. It only ever creates drafts; the owner approves.
 */
export async function GET(req: Request) {
  if (!hasSecret(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const store = getStore();
    await ensureSeeded(store);
    const results = [];
    for (const shop of await store.listShops()) {
      let snap = await buildSnapshot(store, shop.id);
      if (!snap) continue;
      let drafted = 0;
      if (!snap.pending.length && snap.plan.lines.length) {
        try {
          drafted = (await createDraftOrders(store, snap, "cron", { note: "Prepared by the morning agent" })).length;
          snap = (await buildSnapshot(store, shop.id))!;
        } catch (e) {
          console.warn(`draft for ${shop.id} skipped`, e);
        }
      }
      const brief = composeBrief(snap, "whatsapp");
      let sent = false;
      if (shop.owner_phone && twilioConfigured()) {
        try {
          await sendWhatsApp(shop.owner_phone, brief);
          sent = true;
        } catch (e) {
          console.error(`brief to ${shop.id} failed`, e);
        }
      }
      await store.addAgentRun({ id: uid("run"), shop_id: shop.id, channel: "cron", input: "morning brief", steps: [{ tool: "create_draft_order", args: {}, result: `${drafted} drafts` }], output: brief, created_at: new Date().toISOString() });
      results.push({ shop: shop.id, drafted, sent, value_at_risk: snap.metrics.value_at_risk });
    }
    return Response.json({ ok: true, results });
  } catch (e) {
    return errorResponse(e);
  }
}
