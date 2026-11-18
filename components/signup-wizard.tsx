"use client";

import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Loader2, Milk, Package, ShoppingBasket, Warehouse } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/util";
import { api } from "./actions";
import { btn, input } from "./ui";

type SupplierType = "fmcg" | "snacks" | "dairy" | "wholesale";

const SUPPLIERS: { type: SupplierType; label: string; hint: string; icon: typeof Package; days: number[] }[] = [
  { type: "fmcg", label: "FMCG distributor", hint: "Soap, detergent, tea", icon: Package, days: [2] },
  { type: "snacks", label: "Biscuits & snacks", hint: "Biscuits, chips, noodles", icon: ShoppingBasket, days: [1, 4] },
  { type: "dairy", label: "Milk & bread", hint: "Daily delivery", icon: Milk, days: [0, 1, 2, 3, 4, 5, 6] },
  { type: "wholesale", label: "Wholesale market", hint: "Atta, dal, oil, spices", icon: Warehouse, days: [6] },
];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const STEPS = ["Account", "Shop", "Setup"];

export function SignupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({
    username: "",
    password: "",
    owner_name: "",
    shop_name: "",
    locality: "",
    pincode: "",
    cash_budget: 15000,
    language: "en" as "en" | "hi",
  });
  const [suppliers, setSuppliers] = useState<Record<SupplierType, number[] | null>>({ fmcg: [2], snacks: [1, 4], dairy: [0, 1, 2, 3, 4, 5, 6], wholesale: [6] });
  const set = (k: keyof typeof f) => (v: string | number) => setF((x) => ({ ...x, [k]: v }));

  const stepError = (): string | null => {
    if (step === 0) {
      if (!/^[a-z0-9_.]{3,32}$/.test(f.username)) return "Username: 3–32 lowercase letters, numbers, _ or .";
      if (f.password.length < 8) return "Password must be at least 8 characters";
    }
    if (step === 1) {
      if (!f.owner_name.trim()) return "Enter your name";
      if (f.shop_name.trim().length < 2) return "Enter the shop's name";
      if (!/^[1-9]\d{5}$/.test(f.pincode)) return "Enter a 6-digit PIN code";
    }
    if (step === 2 && f.cash_budget < 500) return "Set a weekly budget";
    return null;
  };

  async function next() {
    const err = stepError();
    if (err) return setError(err);
    setError(null);
    if (step < 2) return setStep(step + 1);
    setBusy(true);
    try {
      await api("/api/auth/signup", {
        body: {
          ...f,
          suppliers: (Object.entries(suppliers) as [SupplierType, number[] | null][]).filter(([, d]) => d).map(([type, visit_days]) => ({ type, visit_days })),
        },
      });
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      if (/username/i.test(msg)) setStep(0);
      setBusy(false);
    }
  }

  return (
    <div>
      {/* progress */}
      <div className="mb-6 flex gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div className="h-1 overflow-hidden rounded-full bg-surface-3">
              <div className={cn("h-full rounded-full bg-gradient-to-r from-brand to-brand-2 transition-all duration-500", i <= step ? "w-full" : "w-0")} />
            </div>
            <div className={cn("mt-1.5 text-xs", i === step ? "text-ink" : "text-ink-3")}>{s}</div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
        className="space-y-3"
      >
        <div key={step} className="rise space-y-3">
          {step === 0 && (
            <>
              <input className={input} placeholder="Choose a username" autoComplete="username" autoCapitalize="none" value={f.username} onChange={(e) => set("username")(e.target.value.toLowerCase().replace(/\s/g, ""))} autoFocus />
              <div className="relative">
                <input
                  className={input + " pr-11"}
                  placeholder="Password (8+ characters)"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={f.password}
                  onChange={(e) => set("password")(e.target.value)}
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-ink-3" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex gap-1">
                {[8, 12, 16].map((n) => (
                  <div key={n} className={cn("h-1 flex-1 rounded-full", f.password.length >= n ? "bg-brand" : "bg-surface-3")} />
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <input className={input} placeholder="Your name" autoComplete="name" value={f.owner_name} onChange={(e) => set("owner_name")(e.target.value)} autoFocus />
              <input className={input} placeholder="Shop name" value={f.shop_name} onChange={(e) => set("shop_name")(e.target.value)} />
              <div className="grid grid-cols-[1fr_8rem] gap-2">
                <input className={input} placeholder="Area / locality" value={f.locality} onChange={(e) => set("locality")(e.target.value)} />
                <input className={input + " tabular"} placeholder="PIN code" inputMode="numeric" maxLength={6} value={f.pincode} onChange={(e) => set("pincode")(e.target.value.replace(/\D/g, ""))} />
              </div>
              <p className="text-xs text-ink-3">Shops with the same PIN code can buy together.</p>
            </>
          )}

          {step === 2 && (
            <>
              <label className="block">
                <span className="text-sm font-medium">Weekly purchase budget</span>
                <div className="relative mt-1.5">
                  <span className="absolute inset-y-0 left-3.5 grid place-items-center text-lg text-ink-3">₹</span>
                  <input
                    className={input + " tabular pl-8 text-lg font-semibold"}
                    inputMode="numeric"
                    value={f.cash_budget || ""}
                    onChange={(e) => set("cash_budget")(Number(e.target.value.replace(/\D/g, "")) || 0)}
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  {[10000, 15000, 25000, 50000].map((v) => (
                    <button
                      type="button"
                      key={v}
                      onClick={() => set("cash_budget")(v)}
                      className={cn("tabular flex-1 rounded-xl py-1.5 text-xs transition", f.cash_budget === v ? "bg-ink text-bg" : "bg-surface-2 text-ink-2")}
                    >
                      ₹{v / 1000}k
                    </button>
                  ))}
                </div>
              </label>

              <div>
                <span className="text-sm font-medium">Language</span>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-2xl bg-surface p-1">
                  {[
                    ["en", "English"],
                    ["hi", "हिन्दी"],
                  ].map(([v, l]) => (
                    <button type="button" key={v} onClick={() => set("language")(v)} className={cn("rounded-xl py-2 text-sm font-medium transition", f.language === v ? "bg-surface-3 text-ink" : "text-ink-3")}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-sm font-medium">Who supplies you?</span>
                <div className="mt-1.5 space-y-2">
                  {SUPPLIERS.map((s) => {
                    const days = suppliers[s.type];
                    const on = !!days;
                    return (
                      <div key={s.type} className={cn("rounded-2xl border p-3 transition", on ? "border-brand/40 bg-brand-soft" : "border-line bg-surface")}>
                        <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setSuppliers((x) => ({ ...x, [s.type]: on ? null : s.days }))}>
                          <s.icon className={cn("h-5 w-5 shrink-0", on ? "text-brand" : "text-ink-3")} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{s.label}</span>
                            <span className="block text-xs text-ink-3">{s.hint}</span>
                          </span>
                          <span className={cn("grid h-5 w-5 place-items-center rounded-md border", on ? "border-brand bg-brand text-brand-ink" : "border-line-strong")}>{on && <Check className="h-3.5 w-3.5" />}</span>
                        </button>
                        {on && s.type !== "dairy" && (
                          <div className="mt-2.5 flex items-center gap-1 pl-8">
                            <span className="mr-1 text-[11px] text-ink-3">Visits</span>
                            {DAYS.map((d, i) => {
                              const active = days.includes(i);
                              return (
                                <button
                                  type="button"
                                  key={i}
                                  onClick={() => setSuppliers((x) => ({ ...x, [s.type]: active ? days.filter((v) => v !== i) : [...days, i] }))}
                                  className={cn("grid h-7 w-7 place-items-center rounded-lg text-[11px] font-semibold transition", active ? "bg-brand text-brand-ink" : "bg-surface-3 text-ink-3")}
                                  aria-label={`Visits on day ${i}`}
                                >
                                  {d}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-ink-3">Not sure? Skip it. Suppliers are added automatically when you scan their bills.</p>
              </div>
            </>
          )}
        </div>

        {error && <p className="text-sm text-critical">{error}</p>}

        <div className="flex gap-2 pt-2">
          {step > 0 && (
            <button type="button" className={btn.secondary + " px-4"} onClick={() => setStep(step - 1)} disabled={busy} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <button className={btn.primary + " flex-1"} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {step < 2 ? "Continue" : "Create my shop"}
            {!busy && step < 2 && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </div>
  );
}
