import { Camera, Check, ChevronRight, MessageCircle, Wallet } from "lucide-react";
import Link from "next/link";
import type { Shop } from "@/lib/types";
import { cn, inr } from "@/lib/util";
import { Tilt } from "./tilt";

/** Day-one dashboard: no bills yet, so guide the owner to the first one. */
export function GettingStarted({ shop }: { shop: Shop }) {
  const steps = [
    { done: true, icon: Check, title: "Shop created", sub: shop.name, href: null },
    { done: false, icon: Camera, title: "Scan your first bill", sub: "Adds stock + expiry dates", href: "/scan", primary: true },
    { done: !!shop.owner_phone, icon: MessageCircle, title: "Link WhatsApp", sub: shop.owner_phone ? shop.owner_phone : "Morning brief + approve by reply", href: "/settings#whatsapp" },
    { done: true, icon: Wallet, title: "Weekly budget", sub: inr(shop.cash_budget), href: "/settings" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="space-y-5">
      <div className="rise">
        <p className="text-sm text-ink-3">Welcome</p>
        <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s set up {shop.name.split(" ")[0]}</h1>
      </div>

      <section className="rise" style={{ ["--d" as string]: "60ms" }}>
        <Tilt max={4} className="glow-brand border-spin rounded-3xl border border-line p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-2">Getting started</span>
            <span className="tabular text-sm font-semibold text-brand">
              {doneCount}/{steps.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="bar-grow h-full rounded-full bg-gradient-to-r from-brand to-brand-2" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ul className="mt-4 space-y-2">
            {steps.map((s) => {
              const body = (
                <>
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
                      s.done ? "bg-good-soft text-good-text" : s.primary ? "btn-glow text-brand-ink" : "bg-surface-3 text-ink-2",
                    )}
                  >
                    {s.done ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block font-medium", s.done && "text-ink-2")}>{s.title}</span>
                    <span className="block truncate text-xs text-ink-3">{s.sub}</span>
                  </span>
                  {s.href && <ChevronRight className="h-4 w-4 text-ink-3" />}
                </>
              );
              return (
                <li key={s.title}>
                  {s.href ? (
                    <Link href={s.href} className={cn("lift flex items-center gap-3 rounded-2xl p-2.5", s.primary && !s.done ? "bg-surface-2" : "")}>
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl p-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Tilt>
      </section>

      <section className="rise grid grid-cols-3 gap-2" style={{ ["--d" as string]: "120ms" }}>
        {[
          ["Day 1", "Expiry alerts"],
          ["Day 3", "Running-low list"],
          ["Day 7", "Smart orders"],
        ].map(([d, l], i) => (
          <div key={d} className="rounded-2xl border border-line bg-surface p-3">
            <div className={cn("text-xs font-semibold", i === 0 ? "text-brand" : "text-ink-3")}>{d}</div>
            <div className="mt-1 text-sm">{l}</div>
          </div>
        ))}
      </section>

      <Link href="/scan" className="btn-glow rise flex items-center justify-center gap-2 rounded-2xl py-4 font-semibold text-brand-ink" style={{ ["--d" as string]: "160ms" }}>
        <Camera className="h-5 w-5" /> Scan a bill
      </Link>
    </div>
  );
}
