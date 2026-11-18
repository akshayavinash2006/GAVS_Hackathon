import { Settings } from "lucide-react";
import Link from "next/link";
import { BottomNav } from "@/components/nav";
import { getStore } from "@/lib/db";
import { t } from "@/lib/i18n";
import { requireShop } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const shop = await requireShop();
  const store = getStore();
  const pending = (await store.listOrders(shop.id)).filter((o) => o.status === "pending_approval").length;
  const L = shop.language;
  const initials = shop.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/70 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-sm font-bold text-brand-ink">{initials}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight">{shop.name}</span>
              <span className="block truncate text-xs leading-tight text-ink-3">{shop.locality}</span>
            </span>
          </Link>
          {store.kind === "memory" && <span className="ml-auto shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-3">demo</span>}
          <Link
            href="/settings"
            aria-label={t("settings", L)}
            className={`${store.kind === "memory" ? "" : "ml-auto"} grid h-9 w-9 place-items-center rounded-xl text-ink-3 transition hover:bg-surface-2 hover:text-ink`}
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
      <BottomNav labels={{ home: t("home", L), scan: t("scan", L), stock: t("stock", L), orders: t("orders", L), chat: t("chat", L) }} pending={pending} />
    </div>
  );
}
