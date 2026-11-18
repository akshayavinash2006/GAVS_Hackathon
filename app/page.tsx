import { ArrowDown, BarChart3, Camera, CheckCheck, MessageCircle, Users } from "lucide-react";
import Link from "next/link";
import { HeroShowcase } from "@/components/hero-showcase";
import { ShopPicker } from "@/components/shop-picker";
import { Tilt } from "@/components/tilt";
import { ensureSeeded, getStore, isMissingSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

const features = [
  { icon: Camera, title: "Snap bills", body: "Stock & expiry, no typing" },
  { icon: MessageCircle, title: "WhatsApp it", body: "“Maggi khatam” is enough" },
  { icon: CheckCheck, title: "You approve", body: "Never over your budget" },
  { icon: Users, title: "Buy together", body: "Bulk rates with neighbours" },
];

export default async function Home() {
  const store = getStore();
  try {
    await ensureSeeded(store);
  } catch (e) {
    if (isMissingSchema(e)) return <SetupNeeded />;
    throw e;
  }
  const shops = await store.listShops();

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-6">
      <header className="relative z-30 flex items-center gap-2.5">
        <span className="btn-glow grid h-9 w-9 place-items-center rounded-xl text-sm font-black text-brand-ink">DS</span>
        <span className="font-semibold tracking-tight">Dukaan Saathi</span>
        <Link href="/insights" className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line bg-bg/40 px-3 py-1.5 text-sm text-ink-2 backdrop-blur transition hover:border-line-strong hover:text-ink">
          <BarChart3 className="h-4 w-4" /> For distributors
        </Link>
      </header>

      {/* Hero: copy + 3D shelf */}
      <section className="relative z-0 grid items-center lg:min-h-[640px] lg:grid-cols-[1fr_1.1fr]">
        <div className="relative z-10 order-2 min-w-0 pt-2 lg:order-1 lg:pt-0">
          <span className="rise inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-ink-2 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> AI stock assistant for kiranas
          </span>
          <h1 className="rise mt-5 text-[2.6rem] font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl" style={{ ["--d" as string]: "60ms" }}>
            Stop losing money to <span className="text-gradient">dead stock.</span>
          </h1>
          <p className="rise mt-5 max-w-md text-lg text-ink-2" style={{ ["--d" as string]: "120ms" }}>
            Knows what&apos;s expiring, what&apos;s running out, and what to order, from the bills you already have.
          </p>
          <div className="rise mt-8 flex flex-wrap gap-3" style={{ ["--d" as string]: "180ms" }}>
            <a href="#demo" className="btn-glow inline-flex items-center gap-2 rounded-2xl px-5 py-3.5 font-semibold text-brand-ink transition active:scale-95">
              Open a demo shop <ArrowDown className="h-4 w-4" />
            </a>
            <Link href="/insights" className="inline-flex items-center gap-2 rounded-2xl border border-line bg-surface/60 px-5 py-3.5 font-medium backdrop-blur transition hover:border-line-strong">
              See area demand
            </Link>
          </div>
        </div>

        <div className="relative order-1 -mx-4 h-[420px] overflow-hidden sm:h-[520px] lg:order-2 lg:mx-0 lg:h-[680px] lg:overflow-visible">
          <HeroShowcase />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent lg:hidden" />
        </div>
      </section>

      {/* Numbers */}
      <section className="mt-14 grid grid-cols-3 gap-3 lg:mt-4">
        {[
          ["15–20%", "of capital stuck in dead stock"],
          ["₹5–10k", "expires every month"],
          ["1 week", "to start helping"],
        ].map(([v, l], i) => (
          <div key={l} className="rise min-w-0" style={{ ["--d" as string]: `${i * 60}ms` }}>
            <Tilt className="h-full rounded-3xl border border-line bg-surface p-4 sm:p-6">
              <div className="depth-sm tabular truncate text-2xl font-semibold sm:text-4xl">{v}</div>
              <div className="mt-1 text-xs text-ink-3 sm:text-sm">{l}</div>
            </Tilt>
          </div>
        ))}
      </section>

      {/* Features + demo */}
      <section className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_1.05fr]">
        <ul className="grid min-w-0 grid-cols-2 gap-3">
          {features.map((f, i) => (
            <li key={f.title} className="rise min-w-0" style={{ ["--d" as string]: `${i * 50}ms` }}>
              <Tilt className="h-full rounded-3xl border border-line bg-surface p-4 sm:p-5">
                <span className="depth grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand/25 to-brand-2/10 text-brand shadow-lg shadow-black/30">
                  <f.icon className="h-5 w-5" />
                </span>
                <div className="mt-4 font-semibold">{f.title}</div>
                <div className="mt-0.5 text-sm text-ink-3">{f.body}</div>
              </Tilt>
            </li>
          ))}
        </ul>

        <div id="demo" className="rise min-w-0 scroll-mt-6" style={{ ["--d" as string]: "120ms" }}>
          <Tilt max={4} className="glow-brand border-spin rounded-[2rem] border border-line p-5 sm:p-6">
            <h2 className="text-xl font-semibold">Open a demo shop</h2>
            <p className="mb-5 mt-0.5 text-sm text-ink-3">Koramangala, Bengaluru · 6 weeks of data</p>
            <div className="depth-sm">
              <ShopPicker shops={shops.map((s) => ({ id: s.id, name: s.name, owner_name: s.owner_name, locality: s.locality }))} />
            </div>
            {store.kind === "memory" && <p className="mt-4 text-xs text-ink-3">Demo mode: data resets on restart.</p>}
          </Tilt>
        </div>
      </section>
    </main>
  );
}

function SetupNeeded() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">One step left</h1>
      <p className="mt-2 text-ink-2">Supabase is connected, but the tables don&apos;t exist yet.</p>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-ink-2">
        <li>Supabase → SQL Editor → New query</li>
        <li>
          Paste <code className="rounded bg-surface-2 px-1.5 py-0.5 text-ink">supabase/migrations/0001_init.sql</code> and run it
        </li>
        <li>Reload this page</li>
      </ol>
    </main>
  );
}
