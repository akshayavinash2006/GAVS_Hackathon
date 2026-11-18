import { ArrowRightLeft, CheckCheck, History, Users } from "lucide-react";
import { CreateDraftButton } from "@/components/actions";
import { CountUp } from "@/components/count-up";
import { OrderCard } from "@/components/order-card";
import { Badge, Card, Empty, SectionTitle } from "@/components/ui";
import { clusterSnapshots, findJointOpportunities, findTransferOffers } from "@/lib/cluster";
import { getStore } from "@/lib/db";
import { requireShop } from "@/lib/session";
import { inr } from "@/lib/util";

export default async function OrdersPage() {
  const shop = await requireShop();
  const snaps = await clusterSnapshots(getStore(), shop.cluster_id);
  const snap = snaps.find((s) => s.shop.id === shop.id);
  if (!snap) return null;

  const lines = snap.pending.flatMap((o) => o.items.map((i) => ({ sku_id: i.sku_id, name: i.name, qty: i.qty, unit_cost: i.unit_cost, distributor_name: o.distributor_name })));
  const joint = shop.open_to_joint_orders ? findJointOpportunities(snap, snaps, lines) : [];
  const transfers = shop.open_to_joint_orders ? findTransferOffers(snap, snaps) : [];
  const history = snap.orders.filter((o) => o.status !== "pending_approval").slice(0, 15);
  const pendingTotal = snap.pending.reduce((s, o) => s + o.total, 0);
  const saving = joint.reduce((s, j) => s + j.est_saving, 0);

  return (
    <div className="space-y-4">
      <div className="rise flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          {snap.pending.length > 0 && (
            <p className="tabular text-sm text-ink-3">
              {snap.pending.length} to approve · {inr(pendingTotal)}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-ink-3">Budget left</div>
          <div className="tabular text-lg font-semibold text-brand">
            <CountUp value={snap.budget.available} prefix="₹" />
          </div>
        </div>
      </div>

      {snap.pending.length === 0 ? (
        <Card delay={60} className="space-y-3 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-good-soft">
            <CheckCheck className="h-7 w-7 text-good-text" />
          </div>
          <p className="text-ink-2">Nothing waiting</p>
          {snap.plan.lines.length > 0 && <CreateDraftButton label={`Draft suggested order · ${inr(snap.plan.total)}`} />}
        </Card>
      ) : (
        <div className="space-y-3">
          {snap.pending.map((o, i) => (
            <div key={o.id} className="rise" style={{ ["--d" as string]: `${60 + i * 50}ms` }}>
              <OrderCard order={o} />
            </div>
          ))}
        </div>
      )}

      {joint.length > 0 && (
        <Card delay={200}>
          <SectionTitle icon={Users} right={<Badge tone="good">save {inr(saving)}</Badge>}>
            Buy with neighbours
          </SectionTitle>
          <ul className="space-y-2">
            {joint.slice(0, 6).map((j) => (
              <li key={j.sku_id} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{j.name}</div>
                  <div className="truncate text-xs text-ink-3">
                    {j.my_qty} + {j.neighbours.map((n) => n.qty).join(" + ")} = {j.combined_qty} pcs · {j.neighbours.length + 1} shops
                  </div>
                </div>
                <span className="tabular shrink-0 text-sm font-semibold text-good-text">−{inr(j.est_saving)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {transfers.length > 0 && (
        <Card delay={240}>
          <SectionTitle icon={ArrowRightLeft}>Pass on before expiry</SectionTitle>
          <ul className="space-y-2">
            {transfers.slice(0, 5).map((t) => (
              <li key={t.sku_id + t.to_shop} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5 text-sm">
                <span className="tabular grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft font-semibold text-brand">{t.units}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="truncate text-xs text-ink-3">→ {t.to_shop}</div>
                </div>
                <span className="shrink-0 text-xs text-ink-3">{t.days_to_expiry}d left</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card delay={280}>
        <SectionTitle icon={History}>History</SectionTitle>
        {history.length === 0 ? (
          <Empty>No orders yet</Empty>
        ) : (
          <ul className="space-y-1">
            {history.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 rounded-xl px-1 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{o.distributor_name.split(" (")[0]}</div>
                  <div className="text-xs text-ink-3">
                    {new Date(o.decided_at ?? o.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })} · {o.items.length} items
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tabular text-sm">{inr(o.total)}</span>
                  <Badge tone={o.status === "approved" ? "good" : "neutral"}>{o.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
