import type { ShopSnapshot } from "./snapshot";
import { inr } from "./util";

/**
 * Items whose stock estimate we trust least but which matter most. The brief
 * asks the owner to count them, and every answer sharpens the forecast. That is
 * how the shop gets useful data within the first week without a billing system.
 */
export function stockCheckAsks(snap: ShopSnapshot, n = 3): string[] {
  return snap.inventory
    .filter((r) => r.stats.confidence !== "high" && r.stats.velocity > 0.2)
    .sort((a, b) => b.stats.velocity * b.unit_cost - a.stats.velocity * a.unit_cost)
    .slice(0, n)
    .map((r) => r.sku.name);
}

export function composeBrief(snap: ShopSnapshot, format: "whatsapp" | "web" = "whatsapp"): string {
  const hi = snap.shop.language === "hi";
  const b = (s: string) => (format === "whatsapp" ? `*${s}*` : s);
  const lines: string[] = [];
  const name = snap.shop.owner_name.split(" ")[0];

  lines.push(hi ? `🙏 Namaste ${name} ji, aaj ka stock brief:` : `🙏 Good morning ${name}, here's today's stock brief:`);

  const exp = snap.expiring.filter((e) => e.risk.days_to_expiry <= 21).slice(0, 3);
  if (exp.length) {
    lines.push("");
    lines.push(b(hi ? `⚠️ Expiry ka khatra (${inr(snap.metrics.value_at_risk)})` : `⚠️ Expiry risk (${inr(snap.metrics.value_at_risk)})`));
    for (const e of exp) {
      const when = e.risk.expired ? (hi ? "expire ho gaya" : "expired") : hi ? `${e.risk.days_to_expiry} din` : `${e.risk.days_to_expiry}d`;
      lines.push(`• ${e.sku.name}: ${e.risk.units_at_risk} pcs, ${when}. ${e.action.label}`);
    }
  }

  const out = snap.inventory.filter((r) => r.status === "out" || r.status === "low").sort((a, b) => b.stats.velocity * b.unit_cost - a.stats.velocity * a.unit_cost).slice(0, 4);
  if (out.length) {
    lines.push("");
    lines.push(b(hi ? "📉 Khatam / kam ho raha" : "📉 Out or running low"));
    lines.push(out.map((r) => `${r.sku.name}${r.status === "out" ? " (0)" : ` (~${Math.round(r.stats.stock)})`}`).join(", "));
  }

  const fest = snap.festivals[0];
  if (fest && fest.days_away <= 14) {
    lines.push("");
    lines.push(hi ? `🪔 ${fest.name} ${fest.days_away} din mein, demand badhegi.` : `🪔 ${fest.name} in ${fest.days_away} days, demand will rise.`);
  }

  lines.push("");
  if (snap.pending.length) {
    const total = snap.pending.reduce((s, o) => s + o.total, 0);
    const items = snap.pending.reduce((s, o) => s + o.items.length, 0);
    lines.push(b(hi ? `🧾 Draft order taiyaar: ${items} items, ${inr(total)}` : `🧾 Draft order ready: ${items} items, ${inr(total)}`));
    for (const o of snap.pending.slice(0, 3)) lines.push(`• ${o.distributor_name.split(" (")[0]}: ${inr(o.total)}`);
    lines.push(hi ? `Budget bacha: ${inr(snap.budget.available)}. Approve karne ke liye *HAAN* likhein, cancel ke liye *NAHI*.` : `Budget left: ${inr(snap.budget.available)}. Reply *YES* to approve or *NO* to drop it.`);
  } else if (snap.plan.lines.length) {
    lines.push(hi ? `🧾 Suggested order: ${snap.plan.lines.length} items, ${inr(snap.plan.total)} (budget ${inr(snap.budget.available)})` : `🧾 Suggested order: ${snap.plan.lines.length} items, ${inr(snap.plan.total)} (budget ${inr(snap.budget.available)})`);
  }

  const asks = stockCheckAsks(snap);
  if (asks.length) {
    lines.push("");
    lines.push(hi ? `🔢 Inka stock gin ke batayein: ${asks.join(", ")}` : `🔢 Quick count please: ${asks.join(", ")}`);
  }
  return lines.join("\n").replace(/\*\*/g, "*");
}
