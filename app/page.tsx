import { BarChart3, Camera, CheckCheck, MessageCircle, Users } from "lucide-react";
import Link from "next/link";
import { ShopPicker } from "@/components/shop-picker";
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
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:pt-10">
      <header className="flex items-center gap-2.5">
        <span className="btn-glow grid h-9 w-9 place-items-center rounded-xl text-sm font-black text-brand-ink">DS</span>
        <span className="font-semibold tracking-tight">Dukaan Saathi</span>
        <Link href="/insights" className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm text-ink-2 transition hover:border-line-strong hover:text-ink">
          <BarChart3 className="h-4 w-4" /> For distributors
        </Link>
      </header>

      <div className="mt-14 grid items-start gap-12 lg:mt-20 lg:grid-cols-[1.15fr_1fr]">
        <section className="min-w-0">
          <span className="rise inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> AI stock assistant for kiranas
          </span>
          <h1 className="rise mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl" style={{ ["--d" as string]: "60ms" }}>
            Stop losing money to <span className="text-gradient">dead stock.</span>
          </h1>
          <p className="rise mt-5 max-w-md text-lg text-ink-2" style={{ ["--d" as string]: "120ms" }}>
            Knows what&apos;s expiring, what&apos;s running out, and what to order, from the bills you already have.
          </p>

          <div className="rise mt-8 grid max-w-lg grid-cols-3 gap-2" style={{ ["--d" as string]: "180ms" }}>
            {[
              ["15–20%", "capital stuck"],
              ["₹5–10k", "expires monthly"],
              ["1 week", "to be useful"],
            ].map(([v, l]) => (
              <div key={l} className="min-w-0 rounded-2xl border border-line bg-surface px-3 py-2.5">
                <div className="tabular truncate text-lg font-semibold">{v}</div>
                <div className="truncate text-[11px] text-ink-3">{l}</div>
              </div>
            ))}
          </div>

          <ul className="mt-8 grid max-w-lg grid-cols-2 gap-3">
            {features.map((f, i) => (
              <li key={f.title} className="rise flex items-start gap-3" style={{ ["--d" as string]: `${240 + i * 50}ms` }}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                  <f.icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-medium">{f.title}</div>
                  <div className="text-xs text-ink-3">{f.body}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rise min-w-0 lg:sticky lg:top-10" style={{ ["--d" as string]: "200ms" }}>
          <div className="glow-brand rounded-[2rem] border border-line p-5">
            <h2 className="text-lg font-semibold">Open a demo shop</h2>
            <p className="mb-5 mt-0.5 text-sm text-ink-3">Koramangala, Bengaluru · 6 weeks of data</p>
            <ShopPicker shops={shops.map((s) => ({ id: s.id, name: s.name, owner_name: s.owner_name, locality: s.locality }))} />
            {store.kind === "memory" && <p className="mt-4 text-xs text-ink-3">Demo mode: data resets on restart.</p>}
          </div>
        </section>
      </div>
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
