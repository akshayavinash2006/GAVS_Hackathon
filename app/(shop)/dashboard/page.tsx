import { ArrowRight, ChevronDown, Flame, MessageCircle, PackageX, Sparkles, Turtle } from "lucide-react";
import Link from "next/link";
import { CreateDraftButton } from "@/components/actions";
import { CountUp } from "@/components/count-up";
import { GettingStarted } from "@/components/getting-started";
import { Tilt } from "@/components/tilt";
import { Card, BudgetMeter, Empty, SectionTitle } from "@/components/ui";
import { composeBrief } from "@/lib/brief";
import { getStore } from "@/lib/db";
import { t } from "@/lib/i18n";
import { requireShop } from "@/lib/session";
import { buildSnapshot } from "@/lib/snapshot";
import { cn, inr } from "@/lib/util";

const ACTION_STYLE: Record<string, string> = {
  return: "bg-series-1/15 text-[#7fb2f0]",
  discount: "bg-warning-soft text-warning-text",
  bundle: "bg-brand-soft text-brand",
  writeoff: "bg-critical-soft text-critical",
  transfer: "bg-brand-soft text-brand",
};

export default async function Dashboard() {
  const shop = await requireShop();
  const snap = await buildSnapshot(getStore(), shop.id);
  if (!snap) return null;
  // Brand-new shop with no bills yet: guide them to the first one.
  if (snap.inventory.length === 0) return <GettingStarted shop={shop} />;
  const L = shop.language;
  const m = snap.metrics;
  const fest = snap.festivals.find((f) => f.days_away <= 14);
  const short = snap.inventory
    .filter((r) => r.status === "out" || r.status === "low")
    .sort((a, b) => b.stats.velocity * b.unit_cost - a.stats.velocity * a.unit_cost);
  const pendingTotal = snap.pending.reduce((s, o) => s + o.total, 0);
  const suppliers = new Set(snap.plan.lines.map((l) => l.distributor_name)).size;
  const hour = Number(new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }));
  const hello = L === "hi" ? "Namaste" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="rise flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-3">{new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "short" })}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {hello}, {shop.owner_name.split(" ")[0]}
          </h1>
        </div>
        {fest && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs">
            🪔 <span className="max-w-[9rem] truncate">{fest.name.split(" / ")[0]}</span>
            <span className="font-semibold text-brand">{fest.days_away}d</span>
          </span>
        )}
      </div>

      {/* Hero */}
      <Card className="glow-critical border-spin critical p-5" delay={60} tilt>
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <span className={cn("h-2 w-2 rounded-full bg-critical", m.value_at_risk > 0 && "pulse-dot")} />
          {t("moneyAtRisk", L)}
        </div>
        <div className="depth tabular mt-1 text-5xl font-semibold tracking-tight">
          <CountUp value={m.value_at_risk} prefix="₹" />
        </div>
        <div className="depth-sm mt-5 grid grid-cols-3 gap-2">
          <HeroPill icon={PackageX} label="Out" value={m.out_count} tone="text-critical" href="/inventory?status=out" />
          <HeroPill icon={Flame} label="Low" value={m.low_count} tone="text-warning-text" href="/inventory?status=low" />
          <HeroPill icon={Turtle} label="Slow" value={inr(m.slow_stock_value)} tone="text-ink-2" href="/inventory?status=slow" />
        </div>
      </Card>

      {/* Drafts waiting */}
      {snap.pending.length > 0 && (
        <Link href="/orders" className="rise lift flex items-center gap-3 rounded-3xl border border-warning/30 bg-warning-soft p-4" style={{ ["--d" as string]: "120ms" }}>
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-warning/20 text-lg">🧾</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">{snap.pending.length} draft{snap.pending.length > 1 ? "s" : ""} to approve</span>
            <span className="tabular block text-sm text-ink-2">{inr(pendingTotal)}</span>
          </span>
          <ArrowRight className="h-5 w-5 text-warning-text" />
        </Link>
      )}

      {/* Act now: expiry carousel */}
      <section className="rise" style={{ ["--d" as string]: "160ms" }}>
        <SectionTitle right={snap.expiring.length > 0 && <span className="text-xs text-ink-3">{snap.expiring.length} item{snap.expiring.length === 1 ? "" : "s"}</span>}>{t("expiring", L)}</SectionTitle>
        {snap.expiring.length === 0 ? (
          <Empty>All clear 👍</Empty>
        ) : (
          <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
            {snap.expiring.slice(0, 8).map((e) => {
              const urgent = e.risk.days_to_expiry <= 7;
              return (
                <Tilt key={e.risk.batch_id} max={10} className="w-[15.5rem] shrink-0 snap-start rounded-3xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn("depth grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-lg shadow-black/40", urgent ? "bg-critical-soft text-critical" : "bg-warning-soft text-warning-text")}>
                      <div className="text-center leading-none">
                        <div className="tabular text-lg font-bold">{e.risk.expired ? "!" : e.risk.days_to_expiry}</div>
                        <div className="text-[9px] font-medium uppercase">{e.risk.expired ? "exp" : "days"}</div>
                      </div>
                    </div>
                    <div className="tabular text-right">
                      <div className="text-lg font-semibold">{inr(e.risk.value_at_risk)}</div>
                      <div className="text-xs text-ink-3">{e.risk.units_at_risk} pcs</div>
                    </div>
                  </div>
                  <div className="mt-3 line-clamp-1 font-medium">{e.sku.name}</div>
                  <div className={cn("mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", ACTION_STYLE[e.action.kind])} title={e.action.detail}>
                    {e.action.label}
                  </div>
                </Tilt>
              );
            })}
          </div>
        )}
      </section>

      {/* Budget */}
      <Card delay={200} tilt>
        <BudgetMeter budget={snap.budget} />
      </Card>

      {/* Running out */}
      <Card delay={240}>
        <SectionTitle right={<Link href="/inventory?status=out" className="text-xs font-medium text-brand">All</Link>}>{t("runningLow", L)}</SectionTitle>
        {short.length === 0 ? (
          <Empty>Shelves look full</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {short.slice(0, 8).map((r) => {
              const out = r.status === "out";
              const cover = Math.min(1, (Number.isFinite(r.stats.days_cover) ? r.stats.days_cover : 0) / 7);
              return (
                <div key={r.sku.id} className="rounded-2xl bg-surface-2 p-3">
                  <div className="truncate text-sm font-medium">{r.sku.name}</div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div className={cn("bar-grow h-full rounded-full", out ? "bg-critical" : "bg-warning")} style={{ width: `${Math.max(4, cover * 100)}%` }} />
                    </div>
                    <span className={cn("tabular text-xs font-semibold", out ? "text-critical" : "text-warning-text")}>{out ? "0" : `~${Math.round(r.stats.stock)}`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Suggested order */}
      <Card className="glow-brand border-spin p-5" delay={280} tilt>
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <Sparkles className="h-4 w-4 text-brand" /> {t("suggested", L)}
        </div>
        {snap.plan.lines.length === 0 ? (
          <p className="mt-3 text-ink-2">{snap.pending.length ? "Your drafts cover it." : "Nothing needed right now."}</p>
        ) : (
          <>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div className="depth tabular text-4xl font-semibold tracking-tight">
                <CountUp value={snap.plan.total} prefix="₹" />
              </div>
              <div className="pb-1.5 text-right text-xs text-ink-3">
                {snap.plan.lines.length} items · {suppliers} suppliers
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {snap.plan.lines.slice(0, 6).map((l) => (
                <span key={l.sku_id} className="rounded-full bg-surface-3/80 px-2.5 py-1 text-xs text-ink-2">
                  {l.name.split(" ").slice(0, 2).join(" ")} <span className="text-ink-3">×{l.qty}</span>
                </span>
              ))}
              {snap.plan.lines.length > 6 && <span className="rounded-full px-2 py-1 text-xs text-ink-3">+{snap.plan.lines.length - 6}</span>}
            </div>
            {snap.plan.held_back.length > 0 && <p className="mt-3 text-xs text-ink-3">Skipping {snap.plan.held_back.length} items with expiring stock</p>}
            <div className="mt-4">
              <CreateDraftButton label={t("createDraft", L)} />
            </div>
          </>
        )}
      </Card>

      {/* WhatsApp preview */}
      <Card delay={320} className="p-0">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#25d366]/15">
              <MessageCircle className="h-4.5 w-4.5 text-[#25d366]" />
            </span>
            <span className="flex-1 text-sm font-medium">Morning WhatsApp brief</span>
            <ChevronDown className="h-4 w-4 text-ink-3 transition group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4">
            <div className="rounded-2xl rounded-tl-sm bg-[#0b3d2e] p-3 text-sm leading-relaxed whitespace-pre-wrap text-[#e7f6ef]">{composeBrief(snap, "whatsapp").replace(/\*/g, "")}</div>
          </div>
        </details>
      </Card>
    </div>
  );
}

function HeroPill({ icon: Icon, label, value, tone, href }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; tone: string; href: string }) {
  return (
    <Link href={href} className="lift rounded-2xl border border-line bg-bg/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-ink-3">
        <Icon className={cn("h-3.5 w-3.5", tone)} /> {label}
      </div>
      <div className="tabular mt-0.5 text-lg font-semibold">{typeof value === "number" ? <CountUp value={value} /> : value}</div>
    </Link>
  );
}
