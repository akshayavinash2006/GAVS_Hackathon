"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { btn } from "./ui";

export async function api<T = unknown>(url: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? "POST",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export function CreateDraftButton({ label, disabled }: { label: string; disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className={btn.primary + " w-full"}
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api("/api/orders/draft", { body: {} });
            router.push("/orders");
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </button>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
    </div>
  );
}
