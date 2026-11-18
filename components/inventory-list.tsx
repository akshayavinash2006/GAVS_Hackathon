"use client";

import { Check, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { cn, inr } from "@/lib/util";
import { api } from "./actions";
import { Badge, btn, input } from "./ui";

export interface InvRow {
  sku_id: string;
  name: string;
  category: string;
  aliases: string[];
  stock: number;
  per_day: number;
  days_cover: number | null;
  status: "out" | "low" | "ok" | "slow" | "at_risk";
  confidence: "high" | "medium" | "low";
  value: number;
  supplier: string;
  next_expiry: string | null;
  at_risk_units: number;
}

const FILTERS = [
  { id: "all", label: "All" },
  { id: "out", label: "Out" },
  { id: "low", label: "Low" },
  { id: "at_risk", label: "Expiry risk" },
  { id: "slow", label: "Slow" },
] as const;

const statusBadge: Record<InvRow["status"], { tone: "critical" | "warning" | "good" | "neutral"; label: string }> = {
  out: { tone: "critical", label: "Out" },
  low: { tone: "warning", label: "Low" },
  at_risk: { tone: "critical", label: "Expiry risk" },
  slow: { tone: "neutral", label: "Slow" },
  ok: { tone: "good", label: "OK" },
};

function rate(v: number) {
  if (v >= 1) return `${v.toFixed(1)}/day`;
  if (v > 0) return `${(v * 7).toFixed(1)}/wk`;
  return "—";
}

export function InventoryList({ rows, initialStatus }: { rows: InvRow[]; initialStatus: string }) {
  const [filter, setFilter] = useState(FILTERS.some((f) => f.id === initialStatus) ? initialStatus : "all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!needle || r.name.toLowerCase().includes(needle) || r.aliases.some((a) => a.toLowerCase().includes(needle))),
    );
  }, [rows, filter, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="rise flex items-end justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
        <span className="tabular text-sm text-ink-3">{rows.length} items</span>
      </div>
      <label className="rise flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-3.5 py-3 transition focus-within:border-brand/60" style={{ ["--d" as string]: "40ms" }}>
        <Search className="h-4 w-4 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="chai patti, surf, doodh…" className="w-full bg-transparent outline-none placeholder:text-ink-3" />
      </label>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition",
              filter === f.id ? "bg-ink text-bg" : "bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {f.label} <span className="tabular opacity-60">{counts[f.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {shown.map((r, i) => {
          const cover = r.days_cover === null ? 0 : Math.min(1, r.days_cover / 21);
          const bar = r.status === "out" || r.status === "at_risk" ? "bg-critical" : r.status === "low" ? "bg-warning" : r.status === "slow" ? "bg-ink-3" : "bg-brand";
          return (
            <li key={r.sku_id} className="rise overflow-hidden rounded-2xl border border-line bg-surface" style={{ ["--d" as string]: `${Math.min(i, 12) * 25}ms` }}>
              <button className="flex w-full items-center gap-3 px-3.5 py-3 text-left" onClick={() => setOpen(open === r.sku_id ? null : r.sku_id)}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.name}</span>
                    {r.status !== "ok" && <Badge tone={statusBadge[r.status].tone}>{statusBadge[r.status].label}</Badge>}
                  </div>
                  <div className="mt-2 flex items-center gap-2.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" title={r.days_cover === null ? "no recent sales" : `${r.days_cover.toFixed(1)} days of stock`}>
                      <div className={cn("bar-grow h-full rounded-full", bar)} style={{ width: `${Math.max(3, cover * 100)}%` }} />
                    </div>
                    <span className="tabular w-14 shrink-0 text-right text-[11px] text-ink-3">{r.status === "out" ? "out" : r.days_cover === null ? "—" : `${r.days_cover < 10 ? r.days_cover.toFixed(1) : Math.round(r.days_cover)}d`}</span>
                  </div>
                </div>
                <div className="tabular w-12 shrink-0 text-right text-lg font-semibold">
                  {r.confidence === "low" && r.stock > 0 ? "~" : ""}
                  {r.stock}
                </div>
              </button>
              {open === r.sku_id && <QuickUpdate row={r} onDone={() => setOpen(null)} />}
            </li>
          );
        })}
        {shown.length === 0 && <li className="py-10 text-center text-sm text-ink-3">Nothing here</li>}
      </ul>
    </div>
  );
}

function QuickUpdate({ row, onDone }: { row: InvRow; onDone: () => void }) {
  const router = useRouter();
  const [count, setCount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function send(type: "stockout" | "level" | "writeoff", qty?: number) {
    setBusy(type);
    setMsg(null);
    try {
      await api("/api/stock", { body: { updates: [{ sku_id: row.sku_id, name: row.name, type, qty }] } });
      setMsg("Saved");
      router.refresh();
      setTimeout(onDone, 600);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-line bg-surface-2/60 px-3.5 py-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        <span>{rate(row.per_day)}</span>
        <span>{inr(row.value)}</span>
        <span>{row.supplier}</span>
        {row.at_risk_units > 0 && <span className="text-critical">{row.at_risk_units} may expire</span>}
      </div>
      <div className="flex gap-2">
        <input
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
          placeholder="Count on shelf"
          className={input + " min-w-0 flex-1"}
        />
        <button className={btn.primary} disabled={!count || !!busy} onClick={() => send("level", Number(count))} aria-label="Save count">
          {busy === "level" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button className={btn.secondary} disabled={!!busy} onClick={() => send("stockout")}>
          {busy === "stockout" && <Loader2 className="h-4 w-4 animate-spin" />} Ran out
        </button>
        <button className={btn.danger} disabled={!count || !!busy} onClick={() => send("writeoff", Number(count))}>
          Threw away {count || ""}
        </button>
      </div>
      {msg && <p className="text-xs text-good-text">{msg}</p>}
    </div>
  );
}
