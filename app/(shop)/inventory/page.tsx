import { InventoryList, type InvRow } from "@/components/inventory-list";
import { getStore } from "@/lib/db";
import { requireShop } from "@/lib/session";
import { buildSnapshot } from "@/lib/snapshot";

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const shop = await requireShop();
  const snap = await buildSnapshot(getStore(), shop.id);
  if (!snap) return null;
  const { status } = await searchParams;
  const rows: InvRow[] = snap.inventory.map((r) => ({
    sku_id: r.sku.id,
    name: r.sku.name,
    category: r.sku.category,
    aliases: r.sku.aliases.slice(0, 4),
    stock: Math.round(r.stats.stock),
    per_day: r.stats.velocity,
    days_cover: Number.isFinite(r.stats.days_cover) ? r.stats.days_cover : null,
    status: r.status,
    confidence: r.stats.confidence,
    value: r.stock_value,
    supplier: r.distributor?.name.split(" (")[0] ?? "—",
    next_expiry: r.risks[0]?.expiry_date ?? null,
    at_risk_units: r.risks.reduce((s, x) => s + x.units_at_risk, 0),
  }));
  return <InventoryList rows={rows} initialStatus={status ?? "all"} />;
}
