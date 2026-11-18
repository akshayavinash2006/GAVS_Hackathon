import { sampleBill } from "@/data/sample-bill";
import { geminiConfigured } from "@/lib/ai/gemini";
import { readDocument, reviewLines, type DocRead } from "@/lib/ai/read-document";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { shopOr401 } from "@/lib/session";
import { buildSnapshot } from "@/lib/snapshot";
import { istDate, uid } from "@/lib/util";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept ~4.5MB; the client downsizes photos first.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export async function POST(req: Request) {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    const store = getStore();
    const snap = await buildSnapshot(store, s.shop.id);
    if (!snap) return Response.json({ error: "Shop not found" }, { status: 404 });

    const form = await req.formData();
    const sample = form.get("sample") === "1";
    const hint = form.get("hint");
    let doc: DocRead;
    let image_path: string | null = null;

    if (sample || !geminiConfigured()) {
      doc = sampleBill();
    } else {
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "Attach a photo" }, { status: 400 });
      if (file.size > MAX_BYTES) return Response.json({ error: "Photo too large (max 4MB)" }, { status: 413 });
      if (!IMAGE_TYPES.includes(file.type)) return Response.json({ error: "Upload a JPG, PNG or WebP photo" }, { status: 415 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      doc = await readDocument({
        base64: Buffer.from(bytes).toString("base64"),
        mimeType: file.type,
        skus: [...snap.skuMap.values()],
        hint: hint === "distributor_bill" || hint === "khata" || hint === "shelf" ? hint : undefined,
        today: istDate(),
      });
      if (store.uploadImage) {
        try {
          image_path = await store.uploadImage(`${s.shop.id}/${istDate()}/${uid("img")}.${file.type.split("/")[1]}`, bytes, file.type);
        } catch (e) {
          console.warn("photo not stored", e);
        }
      }
    }

    const lines = reviewLines(doc, snap.matcher, snap.skuMap).map((l) => {
      const row = l.sku_id ? snap.inventory.find((r) => r.sku.id === l.sku_id) : undefined;
      let warning: string | null = null;
      const atRisk = row?.risks.reduce((x, r) => x + r.units_at_risk, 0) ?? 0;
      if (atRisk > 0) warning = `${atRisk} units already on the shelf may expire unsold`;
      else if (row && row.status === "slow") warning = `Slow mover: about ${Math.round(row.stats.days_cover)} days of stock already`;
      if (l.expiry_date && row) {
        const sellDays = row.stats.velocity > 0 ? (l.qty + row.stats.stock) / row.stats.velocity : Infinity;
        const daysLeft = (Date.parse(l.expiry_date) - Date.now()) / 86_400_000;
        if (sellDays > daysLeft) warning = `At the current pace this won't all sell before ${l.expiry_date}`;
      }
      return { ...l, warning };
    });

    const shelf = doc.shelf_counts.map((c) => {
      const m = snap.matcher.match(c.raw_name);
      return { raw_name: c.raw_name, qty: Math.round(c.qty), sku_id: m.best && m.confidence !== "low" ? m.best.sku_id : null, sku_name: m.best?.name ?? null };
    });

    return Response.json({
      kind: doc.doc_type,
      distributor_name: doc.distributor_name ?? "",
      bill_date: doc.bill_date ?? istDate(),
      bill_total: doc.bill_total ?? null,
      notes: doc.notes ?? null,
      lines,
      khata_entries: doc.khata_entries,
      shelf_counts: shelf,
      image_path,
      demo: sample || !geminiConfigured(),
      catalog: [...snap.skuMap.values()].map((x) => ({ id: x.id, name: x.name })).sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
