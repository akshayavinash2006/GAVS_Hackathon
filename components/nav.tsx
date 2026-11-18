"use client";

import { Camera, ClipboardList, Home, MessageCircle, Package } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/util";

export function BottomNav({ labels, pending }: { labels: Record<"home" | "scan" | "stock" | "orders" | "chat", string>; pending: number }) {
  const path = usePathname();
  const items = [
    { href: "/dashboard", label: labels.home, icon: Home },
    { href: "/inventory", label: labels.stock, icon: Package },
    { href: "/scan", label: labels.scan, icon: Camera, primary: true },
    { href: "/orders", label: labels.orders, icon: ClipboardList, badge: pending },
    { href: "/chat", label: labels.chat, icon: MessageCircle },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      <ul className="mx-auto grid max-w-md grid-cols-5 items-center rounded-[28px] border border-line-strong bg-surface/80 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
        {items.map((it) => {
          const active = path.startsWith(it.href);
          if (it.primary) {
            return (
              <li key={it.href} className="flex justify-center">
                <Link href={it.href} aria-label={it.label} className="btn-glow -my-4 grid h-14 w-14 place-items-center rounded-2xl text-brand-ink transition active:scale-95">
                  <it.icon className="h-6 w-6" strokeWidth={2.2} />
                </Link>
              </li>
            );
          }
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-[22px] py-2 text-[10.5px] font-medium transition-colors",
                  active ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2",
                )}
              >
                <it.icon className={cn("h-5 w-5", active && "text-brand")} strokeWidth={active ? 2.3 : 1.9} />
                {it.label}
                {!!it.badge && (
                  <span className="absolute right-[calc(50%-18px)] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-critical px-1 text-[10px] font-bold text-white" aria-label={`${it.badge} waiting`}>
                    {it.badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
