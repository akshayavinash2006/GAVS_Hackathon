"use client";

import { Check, Copy, ExternalLink, Loader2, LogOut, MessageCircle, RotateCcw, Unlink, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./actions";
import { Badge, Card, SectionTitle, btn, input } from "./ui";

interface Props {
  shop: { name: string; cash_budget: number; language: "en" | "hi"; open_to_joint_orders: boolean };
  account: { username: string | null; is_demo: boolean; owner_phone: string | null };
  status: { store: "memory" | "supabase"; gemini: boolean; whatsapp: boolean; canReset: boolean };
  distributors: { name: string; visits: string; returns: boolean }[];
}

export function SettingsForm({ shop, account, status, distributors }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(shop);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      await api("/api/settings", { method: "PATCH", body: { ...form, shop_name: form.name } });
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
          {!account.is_demo && (
            <label className="block text-sm">
              <span className="font-medium">Shop name</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input + " mt-1.5"} />
            </label>
          )}
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

      <WhatsAppLink phone={account.owner_phone} configured={status.whatsapp} />

      <Card>
        <SectionTitle>Suppliers</SectionTitle>
        {distributors.length === 0 ? (
          <p className="text-sm text-ink-3">Added automatically when you scan a bill.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {distributors.map((d) => (
              <li key={d.name} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <div className="truncate">{d.name}</div>
                  <div className="text-xs text-ink-3">visits: {d.visits}</div>
                </div>
                {d.returns && (
                  <Badge tone="neutral" icon={false}>
                    takes returns
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
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
      </Card>

      <Card>
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-surface-3 text-ink-2">
            <UserRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{account.is_demo ? "Demo shop" : account.username}</div>
            <div className="text-xs text-ink-3">{account.is_demo ? "Anyone can open this shop" : "Logged in"}</div>
          </div>
          <button
            className={btn.secondary + " px-3.5"}
            onClick={async () => {
              await api("/api/session", { method: "DELETE" });
              router.push("/");
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" /> {account.is_demo ? "Exit" : "Log out"}
          </button>
        </div>
        {status.canReset && (
          <button
            className={btn.ghost + " mt-3 w-full"}
            disabled={!!busy}
            onClick={async () => {
              if (!confirm("Reload the demo shops with fresh data? Changes to demo shops will be lost.")) return;
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
      </Card>
    </div>
  );
}

function WhatsAppLink({ phone, configured }: { phone: string | null; configured: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState<{ code: string; whatsapp_number: string | null; wa_link: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getCode() {
    setBusy(true);
    setError(null);
    try {
      setCode(await api("/api/whatsapp-link"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="whatsapp" className="rise scroll-mt-20 rounded-3xl border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#25d366]/15">
          <MessageCircle className="h-5 w-5 text-[#25d366]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">WhatsApp</div>
          <div className="truncate text-xs text-ink-3">{phone ? `Linked · ${phone}` : "Morning brief · approve by reply"}</div>
        </div>
        {phone && <Badge tone="good">linked</Badge>}
      </div>

      {!configured ? (
        <p className="mt-3 text-xs text-ink-3">WhatsApp isn&apos;t set up on this server yet.</p>
      ) : code ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl bg-surface-2 p-4 text-center">
            <div className="text-xs text-ink-3">Send this from your WhatsApp{code.whatsapp_number ? ` to ${code.whatsapp_number}` : ""}</div>
            <div className="tabular mt-1 text-3xl font-semibold tracking-[0.15em]">LINK {code.code}</div>
            <div className="mt-1 text-[11px] text-ink-3">Valid for 15 minutes</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {code.wa_link && (
              <a href={code.wa_link} target="_blank" rel="noreferrer" className={btn.primary}>
                <ExternalLink className="h-4 w-4" /> Open WhatsApp
              </a>
            )}
            <button
              className={btn.secondary}
              onClick={() => {
                navigator.clipboard?.writeText(`LINK ${code.code}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            className={btn.ghost + " w-full"}
            onClick={() => {
              setCode(null);
              router.refresh();
            }}
          >
            I&apos;ve sent it, refresh
          </button>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button className={btn.primary + " flex-1"} onClick={getCode} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {phone ? "Link a different number" : "Link WhatsApp"}
          </button>
          {phone && (
            <button
              className={btn.danger + " px-3.5"}
              aria-label="Unlink"
              onClick={async () => {
                await api("/api/whatsapp-link", { method: "DELETE" });
                router.refresh();
              }}
            >
              <Unlink className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
    </section>
  );
}
