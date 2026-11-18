"use client";

import { ChevronRight, Loader2, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ShopPicker({ shops }: { shops: { id: string; name: string; owner_name: string; locality: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pick(id: string) {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shop_id: id }) });
    if (res.ok) router.push("/dashboard");
    else {
      setError("Couldn't open that shop. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {shops.map((s) => (
        <button
          key={s.id}
          onClick={() => pick(s.id)}
          disabled={!!busy}
          className="lift group flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2/70 p-3.5 text-left transition active:scale-[0.99] disabled:opacity-60"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition group-hover:bg-brand group-hover:text-brand-ink">
            <Store className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{s.name}</span>
            <span className="block truncate text-xs text-ink-2">
              {s.owner_name} · {s.locality}
            </span>
          </span>
          {busy === s.id ? <Loader2 className="h-4 w-4 animate-spin text-ink-3" /> : <ChevronRight className="h-4 w-4 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink" />}
        </button>
      ))}
      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
