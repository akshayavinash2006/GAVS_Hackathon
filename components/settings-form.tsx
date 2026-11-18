"use client";

import { Check, Loader2, LogOut, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./actions";
import { Badge, Card, SectionTitle, btn, input } from "./ui";

interface Props {
  shop: { cash_budget: number; language: "en" | "hi"; owner_phone: string; open_to_joint_orders: boolean };
  status: { store: "memory" | "supabase"; gemini: boolean; whatsapp: boolean; whatsappFrom: string | null; canReset: boolean };
  distributors: { name: string; visits: string; returns: boolean }[];
}

export function SettingsForm({ shop, status, distributors }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(shop);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      await api("/api/settings", { method: "PATCH", body: { ...form, owner_phone: form.owner_phone.trim() } });
      setMsg({ ok: true, text: "Saved" });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="rise text-2xl font-semibold tracking-tight">Settings</h1>
      <Card>
        <div className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium">Weekly budget (₹)</span>
            <span className="block text-xs text-ink-3">Hard limit. Only you can change it.</span>
            <input
              inputMode="numeric"
              value={form.cash_budget}
              onChange={(e) => setForm({ ...form, cash_budget: Number(e.target.value.replace(/\D/g, "")) || 0 })}
              className={input + " tabular mt-1.5 text-lg font-semibold"}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Language</span>
            <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as "en" | "hi" })} className={input + " mt-1.5"}>
              <option value="en">English</option>
              <option value="hi">हिन्दी / Hinglish</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">WhatsApp number</span>
            <span className="block text-xs text-ink-3">7am brief · approves orders</span>
            <input
              type="tel"
              placeholder="+919812345678"
              value={form.owner_phone}
              onChange={(e) => setForm({ ...form, owner_phone: e.target.value })}
              className={input + " mt-1.5"}
            />
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={form.open_to_joint_orders} onChange={(e) => setForm({ ...form, open_to_joint_orders: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[var(--brand)]" />
            <span>
              <span className="font-medium">Buy with neighbours</span>
              <span className="block text-xs text-ink-3">Shares only item needs, never sales or khata</span>
            </span>
          </label>
          <button className={btn.primary + " w-full"} disabled={busy === "save"} onClick={save}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save
          </button>
          {msg && <p className={msg.ok ? "text-sm text-good-text" : "text-sm text-critical"}>{msg.text}</p>}
        </div>
      </Card>

      <Card>
        <SectionTitle>Suppliers</SectionTitle>
        <ul className="divide-y divide-line text-sm">
          {distributors.map((d) => (
            <li key={d.name} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <div className="truncate">{d.name}</div>
                <div className="text-xs text-ink-3">visits: {d.visits}</div>
              </div>
              {d.returns && <Badge tone="neutral" icon={false}>takes returns</Badge>}
            </li>
          ))}
        </ul>
        
      </Card>

      <Card>
        <SectionTitle>Connections</SectionTitle>
        <ul className="space-y-2 text-sm">
          <li className="flex justify-between gap-2">
            <span>AI (Gemini)</span>
            {status.gemini ? <Badge tone="good">connected</Badge> : <Badge tone="warning">set GEMINI_API_KEY</Badge>}
          </li>
          <li className="flex justify-between gap-2">
            <span>Database</span>
            {status.store === "supabase" ? <Badge tone="good">Supabase</Badge> : <Badge tone="warning">in-memory demo</Badge>}
          </li>
          <li className="flex justify-between gap-2">
            <span>WhatsApp (Twilio)</span>
            {status.whatsapp ? <Badge tone="good">connected</Badge> : <Badge tone="warning">not set up</Badge>}
          </li>
        </ul>
        <div className="mt-3 rounded-2xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-3">
          <p className="font-medium text-ink">WhatsApp in 3 steps</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li>Save the number above.</li>
            <li>
              From that phone, send the sandbox join code to {status.whatsappFrom ? <b>{status.whatsappFrom.replace("whatsapp:", "")}</b> : "your Twilio sandbox number"}.
            </li>
            <li>Send a bill photo, &quot;Maggi khatam&quot;, or a voice note. Reply YES to the morning brief to approve.</li>
          </ol>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        {status.canReset && (
          <button
            className={btn.secondary}
            disabled={!!busy}
            onClick={async () => {
              if (!confirm("Reload all three demo shops with fresh data? Your changes will be lost.")) return;
              setBusy("reset");
              try {
                await api("/api/admin/reset");
                router.push("/dashboard");
                router.refresh();
              } catch (e) {
                setMsg({ ok: false, text: (e as Error).message });
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reset demo data
          </button>
        )}
        <button
          className={btn.secondary}
          onClick={async () => {
            await api("/api/session", { method: "DELETE" });
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut className="h-4 w-4" /> Switch shop
        </button>
      </div>
    </div>
  );
}
