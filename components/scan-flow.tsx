"use client";

import { AlertTriangle, BookOpen, Camera, CheckCircle2, FileText, LayoutGrid, Loader2, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { cn, inr } from "@/lib/util";
import { api } from "./actions";
import { Badge, Card, btn } from "./ui";

type Kind = "distributor_bill" | "khata" | "shelf";

interface Line {
  raw_name: string;
  sku_id: string | null;
  sku_name: string | null;
  confident: boolean;
  alternatives: { sku_id: string; name: string }[];
  qty: number;
  unit_cost: number | null;
  mrp: number | null;
  expiry_date: string | null;
  category: string;
  warning: string | null;
}

interface ScanResult {
  kind: Kind | "other";
  distributor_name: string;
  bill_date: string;
  bill_total: number | null;
  notes: string | null;
  lines: Line[];
  khata_entries: { customer: string; amount: number; kind: "given" | "repaid"; date?: string | null }[];
  shelf_counts: { raw_name: string; qty: number; sku_id: string | null; sku_name: string | null }[];
  image_path: string | null;
  demo: boolean;
  catalog: { id: string; name: string }[];
}

type EditLine = Line & { include: boolean; mode: "match" | "new"; new_name: string };

const KINDS: { id: Kind; label: string; icon: typeof FileText }[] = [
  { id: "distributor_bill", label: "Bill", icon: FileText },
  { id: "khata", label: "Khata", icon: BookOpen },
  { id: "shelf", label: "Shelf", icon: LayoutGrid },
];

/** Phone photos are 3–8MB. Downscale to ~1600px JPEG so they fit Vercel's request limit and upload fast on 4G. */
async function downscale(file: File, max = 1600): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/heic") return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}

export function ScanFlow({ aiEnabled }: { aiEnabled: boolean }) {
  const [kind, setKind] = useState<Kind>("distributor_bill");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [dist, setDist] = useState("");
  const [date, setDate] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function scan(file: File | null, sample = false) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const fd = new FormData();
      fd.set("hint", kind);
      if (sample) fd.set("sample", "1");
      if (file) fd.set("file", new File([await downscale(file)], "photo.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/scan", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't read the photo");
      const r = data as ScanResult;
      setResult(r);
      setDist(r.distributor_name);
      setDate(r.bill_date);
      setLines(r.lines.map((l) => ({ ...l, include: l.qty > 0, mode: l.sku_id ? "match" : "new", new_name: l.raw_name })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function commit() {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      if (result.kind === "khata") {
        const r = await api<{ result: { recorded: number } }>("/api/scan/commit", { body: { kind: "khata", entries: result.khata_entries } });
        setSaved(`${r.result.recorded} khata entries saved.`);
      } else if (result.kind === "shelf") {
        const counts = result.shelf_counts.filter((c) => c.sku_id).map((c) => ({ sku_id: c.sku_id!, raw_name: c.raw_name, qty: c.qty }));
        const r = await api<{ result: { recorded: number } }>("/api/scan/commit", { body: { kind: "shelf", counts } });
        setSaved(`${r.result.recorded} shelf counts saved.`);
      } else {
        const payload = lines
          .filter((l) => l.include)
          .map((l) => ({
            raw_name: l.raw_name,
            sku_id: l.mode === "match" ? l.sku_id : null,
            new_item: l.mode === "new" ? { name: l.new_name || l.raw_name, category: l.category, mrp: l.mrp } : undefined,
            qty: l.qty,
            unit_cost: l.unit_cost,
            mrp: l.mrp,
            expiry_date: l.expiry_date,
          }));
        const r = await api<{ result: { total: number; lines: unknown[]; learned_aliases: number; new_items: number; distributor: string } }>("/api/scan/commit", {
          body: { kind: "distributor_bill", distributor_name: dist, bill_date: date, image_path: result.image_path, lines: payload },
        });
        setSaved(
          `${r.result.lines.length} items from ${r.result.distributor} added (${inr(r.result.total)}). Learned ${r.result.learned_aliases} local name${r.result.learned_aliases === 1 ? "" : "s"}${r.result.new_items ? `, created ${r.result.new_items} new item(s)` : ""}.`,
        );
      }
      setResult(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const update = (i: number, patch: Partial<EditLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  if (saved) {
    return (
      <Card className="py-10 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-good-soft">
          <CheckCircle2 className="h-8 w-8 text-good-text" />
        </div>
        <p className="mx-auto mt-4 max-w-xs font-medium">{saved}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/dashboard" className={btn.primary}>Done</Link>
          <button className={btn.secondary} onClick={() => setSaved(null)}>Scan another</button>
        </div>
      </Card>
    );
  }

  if (!result) {
    return (
      <div className="space-y-6">
        <h1 className="rise text-2xl font-semibold tracking-tight">Scan</h1>
        <div className="rise grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1" style={{ ["--d" as string]: "40ms" }}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={cn("flex flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-medium transition", kind === k.id ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink-2")}
            >
              <k.icon className={cn("h-5 w-5", kind === k.id && "text-brand")} />
              {k.label}
            </button>
          ))}
        </div>

        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => scan(e.target.files?.[0] ?? null)} />
        <button
          className="rise group relative mx-auto grid aspect-square w-56 place-items-center rounded-full disabled:opacity-40"
          style={{ ["--d" as string]: "80ms" }}
          disabled={busy || !aiEnabled}
          onClick={() => fileRef.current?.click()}
          aria-label="Take or choose a photo"
        >
          <span className={cn("absolute inset-0 rounded-full bg-gradient-to-br from-brand/25 to-brand-2/20 blur-2xl transition", busy ? "animate-pulse" : "group-hover:opacity-80")} />
          <span className="absolute inset-3 rounded-full border border-brand/30" />
          <span className="btn-glow relative grid h-32 w-32 place-items-center rounded-full text-brand-ink transition group-active:scale-95">
            {busy ? <Loader2 className="h-10 w-10 animate-spin" /> : <Camera className="h-11 w-11" strokeWidth={1.8} />}
          </span>
        </button>
        <p className="-mt-2 text-center text-sm text-ink-3">{busy ? "Reading…" : aiEnabled ? `Photo of a ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}` : "Set GEMINI_API_KEY to scan photos"}</p>

        <button className={btn.secondary + " w-full"} disabled={busy} onClick={() => scan(null, true)}>
          <Sparkles className="h-4 w-4 text-brand" /> Try a sample bill
        </button>
        {error && <p className="text-center text-sm text-critical">{error}</p>}
      </div>
    );
  }

  // ---------- Review ----------
  if (result.kind === "khata" || result.kind === "shelf") {
    const isKhata = result.kind === "khata";
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">{isKhata ? "Khata entries found" : "Shelf counts found"}</h1>
        <Card>
          <ul className="divide-y divide-line text-sm">
            {isKhata
              ? result.khata_entries.map((k, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span>{k.customer}</span>
                    <span className={cn("tabular", k.kind === "repaid" && "text-good-text")}>
                      {k.kind === "repaid" ? "−" : "+"}
                      {inr(k.amount)}
                    </span>
                  </li>
                ))
              : result.shelf_counts.map((c, i) => (
                  <li key={i} className="flex justify-between py-2">
                    <span>
                      {c.sku_name ?? c.raw_name} {!c.sku_id && <Badge tone="warning">not matched</Badge>}
                    </span>
                    <span className="tabular">{c.qty}</span>
                  </li>
                ))}
          </ul>
        </Card>
        <div className="flex gap-2">
          <button className={btn.primary + " flex-1"} disabled={busy} onClick={commit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
          <button className={btn.secondary} onClick={() => setResult(null)}>
            <RotateCcw className="h-4 w-4" /> Retake
          </button>
        </div>
        {error && <p className="text-sm text-critical">{error}</p>}
      </div>
    );
  }

  if (result.kind === "other" || lines.length === 0) {
    return (
      <Card className="text-center">
        <p className="font-medium">Couldn&apos;t find a bill in that photo.</p>
        <p className="mt-1 text-sm text-ink-2">Try again in good light, with the whole bill in the frame.</p>
        <button className={btn.secondary + " mt-4"} onClick={() => setResult(null)}>
          <RotateCcw className="h-4 w-4" /> Retake
        </button>
      </Card>
    );
  }

  const included = lines.filter((l) => l.include);
  const total = Math.round(included.reduce((s, l) => s + l.qty * (l.unit_cost ?? 0), 0));
  const unsure = lines.filter((l) => !l.confident).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Check the bill</h1>
        <p className="mt-1 flex flex-wrap gap-2 text-sm">
          <Badge tone="good">{lines.length - unsure} matched</Badge>
          {unsure > 0 && <Badge tone="warning">{unsure} to check</Badge>}
          {result.demo && <Badge tone="neutral" icon={false}>sample</Badge>}
        </p>
      </div>

      <Card className="grid grid-cols-[1fr_auto] gap-3">
        <label className="text-xs text-ink-3">
          Supplier
          <input value={dist} onChange={(e) => setDist(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-ink outline-none" />
        </label>
        <label className="text-xs text-ink-3">
          Bill date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-ink outline-none" />
        </label>
      </Card>

      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className={cn("rounded-3xl border bg-surface p-3.5", !l.include ? "border-line opacity-60" : l.confident ? "border-line" : "border-warning/40")}>
            <div className="flex items-start gap-2">
              <input type="checkbox" checked={l.include} onChange={(e) => update(i, { include: e.target.checked })} className="mt-1 h-4 w-4 accent-[var(--brand)]" aria-label="include line" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <code className="truncate text-xs text-ink-3">{l.raw_name}</code>
                  {l.confident ? <Badge tone="good">matched</Badge> : <Badge tone="warning">check</Badge>}
                </div>
                <select
                  className="mt-1.5 w-full rounded-xl border border-line bg-surface-2 px-2 py-2 text-sm"
                  value={l.mode === "new" ? "__new" : l.sku_id ?? ""}
                  onChange={(e) =>
                    e.target.value === "__new"
                      ? update(i, { mode: "new" })
                      : update(i, { mode: "match", sku_id: e.target.value, sku_name: result.catalog.find((c) => c.id === e.target.value)?.name ?? null, confident: true })
                  }
                >
                  {!l.sku_id && l.mode === "match" && <option value="">Choose item…</option>}
                  {l.alternatives.length > 0 && (
                    <optgroup label="Suggestions">
                      {l.sku_id && <option value={l.sku_id}>{l.sku_name}</option>}
                      {l.alternatives.map((a) => (
                        <option key={a.sku_id} value={a.sku_id}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value="__new">➕ New item (not in list)</option>
                  <optgroup label="All items">
                    {result.catalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {l.mode === "new" && (
                  <input value={l.new_name} onChange={(e) => update(i, { new_name: e.target.value })} placeholder="Item name" className="mt-2 w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none" />
                )}
                <div className="mt-2 grid grid-cols-[3.75rem_4.25rem_minmax(0,1fr)] gap-2 text-xs text-ink-3 [&_input]:min-w-0 [&_label]:min-w-0">
                  <label>
                    Qty (pcs)
                    <input inputMode="numeric" value={l.qty} onChange={(e) => update(i, { qty: Number(e.target.value.replace(/\D/g, "")) || 0 })} className="tabular mt-0.5 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-ink outline-none" />
                  </label>
                  <label>
                    Cost/pc ₹
                    <input inputMode="decimal" value={l.unit_cost ?? ""} onChange={(e) => update(i, { unit_cost: e.target.value === "" ? null : Number(e.target.value) || 0 })} className="tabular mt-0.5 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-ink outline-none" />
                  </label>
                  <label>
                    Expiry
                    <input type="date" value={l.expiry_date ?? ""} onChange={(e) => update(i, { expiry_date: e.target.value || null })} className="mt-0.5 w-full rounded-lg border border-line bg-surface-2 px-1 py-1.5 text-ink outline-none" />
                  </label>
                </div>
                {l.warning && (
                  <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2 py-1.5 text-xs text-ink">
                    <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-[#b47b00]" /> {l.warning}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-24 rounded-3xl border border-line-strong bg-surface/90 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-ink-2">{included.length} items</span>
          <span className="tabular font-semibold">
            {inr(total)}
            {result.bill_total ? <span className="font-normal text-ink-3"> / bill says {inr(result.bill_total)}</span> : null}
          </span>
        </div>
        <div className="flex gap-2">
          <button className={btn.primary + " flex-1"} disabled={busy || included.some((l) => l.mode === "match" && !l.sku_id)} onClick={commit}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save to stock
          </button>
          <button className={btn.secondary} onClick={() => setResult(null)}>
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      </div>
    </div>
  );
}
