import { ArrowLeft, Lock, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Badge, Card, SectionTitle, Stat } from "@/components/ui";
import { MIN_SHOPS_FOR_INSIGHTS, aggregateDemand, clusterSnapshots } from "@/lib/cluster";
import { ensureSeeded, getStore } from "@/lib/db";
import { inr } from "@/lib/util";

export const dynamic = "force-dynamic";

const CAT_LABEL: Record<string, string> = {
  staples: "Staples",
  oil_ghee: "Oil & ghee",
  dairy: "Dairy",
  bakery: "Bakery",
  snacks: "Snacks & biscuits",
  beverages: "Beverages",
  instant_food: "Instant food",
  spices: "Spices",
  sweets_dryfruits: "Sweets & dry fruits",
  pooja: "Pooja",
  personal_care: "Personal care",
  home_care: "Home care",
};

const pctChange = (now: number, base: number) => (base > 0 ? Math.round(((now - base) / base) * 100) : 0);

export default async function Insights({ searchParams }: { searchParams: Promise<{ cluster?: string }> }) {
  const store = getStore();
  await ensureSeeded(store);
  const shops = await store.listShops();
  const clusters = [...new Set(shops.map((s) => s.cluster_id))];
  const { cluster: requested } = await searchParams;
  const cluster = requested && clusters.includes(requested) ? requested : clusters[0];
  // Only shops that opted in to sharing (Settings) are pooled.
  const snaps = cluster ? (await clusterSnapshots(store, cluster)).filter((s) => s.shop.open_to_joint_orders) : [];
  const agg = aggregateDemand(snaps);
  const area = snaps[0]?.shop;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Dukaan Saathi
      </Link>
      <span className="rise mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">
        <span className="h-1.5 w-1.5 rounded-full bg-series-1" /> For distributors &amp; brands
        {area && <span className="text-ink-3">· {area.locality.replace(/ \d+\w* Block$/, "")} {area.pincode}</span>}
      </span>
      <h1 className="rise mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ ["--d" as string]: "60ms" }}>
        Next week&apos;s demand
      </h1>

      {!agg ? (
        <Card className="mt-6">
          <p className="flex items-center gap-2 text-sm">
            <Lock className="h-4 w-4" /> Needs at least {MIN_SHOPS_FOR_INSIGHTS} shops in an area before anything is shown, so no single shop can be identified.
          </p>
        </Card>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Shops pooled" value={`${agg.shops}`} sub="anonymised" />
            <Stat label="Demand, next 7 days" value={inr(agg.rows.reduce((s, r) => s + r.value_7d, 0))} sub="at shop cost" />
            <Stat label="Items tracked" value={`${agg.rows.length}`} />
            <Stat label="Shops low on ≥1 top item" value={`${new Set(snaps.filter((s) => s.inventory.some((r) => r.status === "out" || r.status === "low")).map((s) => s.shop.id)).size}`} tone="warning" />
          </div>

          <Card className="mt-4" delay={120}>
            <SectionTitle
              right={
                <span className="flex items-center gap-3 text-xs text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-series-1" /> next 7 days
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-0.5 bg-ink" /> normal week
                  </span>
                </span>
              }
            >
              Demand by category
            </SectionTitle>
            {(() => {
              const max = Math.max(...agg.byCategory.map((c) => Math.max(c.value_7d, c.baseline_value_7d)), 1);
              return (
                <ul className="space-y-2.5">
                  {agg.byCategory.map((c) => {
                    const change = pctChange(c.value_7d, c.baseline_value_7d);
                    return (
                      <li key={c.category} className="group grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_auto]">
                        <span className="truncate text-ink-2">{CAT_LABEL[c.category] ?? c.category}</span>
                        <span className="relative h-5" title={`${CAT_LABEL[c.category]}: ${inr(c.value_7d)} next 7 days vs ${inr(c.baseline_value_7d)} in a normal week`}>
                          <span className="bar-grow absolute inset-y-0 left-0 rounded-r-[4px] bg-series-1 transition-opacity group-hover:opacity-80" style={{ width: `${(c.value_7d / max) * 100}%` }} />
                          <span className="absolute -top-0.5 h-6 w-0.5 bg-ink" style={{ left: `${(c.baseline_value_7d / max) * 100}%` }} />
                        </span>
                        <span className="tabular w-24 text-right text-xs">
                          {inr(c.value_7d)}
                          {change >= 5 && <span className="ml-1 text-ink-2">+{change}%</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </Card>

          <Card className="mt-4" delay={120}>
            <SectionTitle right={<span className="text-xs text-ink-3">top 25 by value</span>}>Item-level forecast</SectionTitle>
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-ink-3">
                    <th className="py-2 font-normal">Item</th>
                    <th className="py-2 text-right font-normal">Units, 7d</th>
                    <th className="py-2 text-right font-normal">vs normal</th>
                    <th className="py-2 text-right font-normal">Value</th>
                    <th className="py-2 text-right font-normal">Shops low</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {agg.rows.slice(0, 25).map((r) => {
                    const ch = pctChange(r.units_7d, r.baseline_7d);
                    return (
                      <tr key={r.sku_id} className="border-b border-line last:border-0">
                        <td className="py-2 pr-2">
                          <div className="font-sans">{r.name}</div>
                          {r.festival && <div className="text-xs text-ink-3">{r.festival}</div>}
                        </td>
                        <td className="py-2 text-right">{r.units_7d.toLocaleString("en-IN")}</td>
                        <td className="py-2 text-right">
                          {ch >= 5 ? (
                            <span className="inline-flex items-center gap-1">
                              <TrendingUp className="h-3.5 w-3.5" />+{ch}%
                            </span>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right">{inr(r.value_7d)}</td>
                        <td className="py-2 text-right">{r.stockout_shops > 0 ? <Badge tone="warning">{r.stockout_shops} of {r.shops}</Badge> : <span className="text-ink-3">0</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="mt-4 flex items-start gap-2 text-xs text-ink-3">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Anonymised · min {MIN_SHOPS_FOR_INSIGHTS} shops · no names, khata or prices
          </p>
        </>
      )}
    </main>
  );
}
