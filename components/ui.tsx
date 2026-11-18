import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";
import type { BudgetView } from "@/lib/guardrails";
import { cn, inr } from "@/lib/util";
import { CountUp } from "./count-up";

export function Card({ className, children, delay = 0 }: { className?: string; children: React.ReactNode; delay?: number }) {
  return (
    <section className={cn("rise rounded-3xl border border-line bg-surface p-4", className)} style={{ ["--d" as string]: `${delay}ms` }}>
      {children}
    </section>
  );
}

export function SectionTitle({ children, right, icon: Icon }: { children: React.ReactNode; right?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        {Icon && <Icon className="h-4 w-4 text-ink-3" />}
        {children}
      </h2>
      {right}
    </div>
  );
}

type Tone = "critical" | "warning" | "good" | "neutral" | "brand";

const toneClass: Record<Tone, string> = {
  critical: "bg-critical-soft text-critical",
  warning: "bg-warning-soft text-warning-text",
  good: "bg-good-soft text-good-text",
  neutral: "bg-surface-3 text-ink-2",
  brand: "bg-brand-soft text-brand",
};

const toneIcon: Record<Tone, React.ComponentType<{ className?: string }> | null> = {
  critical: CircleAlert,
  warning: AlertTriangle,
  good: CheckCircle2,
  neutral: null,
  brand: null,
};

/** Status always travels as icon + label, never colour alone. */
export function Badge({ tone = "neutral", children, icon = true }: { tone?: Tone; children: React.ReactNode; icon?: boolean }) {
  const Icon = icon ? toneIcon[tone] : null;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", toneClass[tone])}>
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone, prefix }: { label: string; value: number | string; sub?: string; tone?: Tone; prefix?: string }) {
  const Icon = tone ? toneIcon[tone] : null;
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-1 text-xs text-ink-3">
        {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", tone === "critical" && "text-critical", tone === "warning" && "text-warning-text", tone === "good" && "text-good-text")} />}
        <span className="truncate">{label}</span>
      </div>
      <div className="tabular mt-1 text-xl font-semibold text-ink">{typeof value === "number" ? <CountUp value={value} prefix={prefix} /> : value}</div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

export const btn = {
  primary:
    "btn-glow inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold text-brand-ink disabled:opacity-40 disabled:shadow-none active:scale-[0.97] transition",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm font-medium text-ink hover:bg-surface-3 disabled:opacity-40 active:scale-[0.97] transition",
  ghost: "inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-40",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm font-medium text-critical hover:bg-critical-soft disabled:opacity-40 active:scale-[0.97] transition",
};

export const input = "w-full rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none transition focus:border-brand/60 placeholder:text-ink-3";

/**
 * Weekly budget: approved spend + khata reserve as filled segments, the rest
 * as remaining track. Legend carries identity; segments animate in.
 */
export function BudgetMeter({ budget }: { budget: BudgetView }) {
  const total = Math.max(1, budget.weekly_budget);
  const spent = Math.min(budget.committed_7d, total);
  const reserve = Math.min(budget.credit_reserve, total - spent);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-ink-3">Left this week</div>
          <div className="tabular text-3xl font-semibold tracking-tight">
            <CountUp value={budget.available} prefix="₹" />
          </div>
        </div>
        <div className="tabular pb-1 text-xs text-ink-3">of {inr(budget.weekly_budget)}</div>
      </div>
      <div
        className="mt-3 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-track"
        role="img"
        aria-label={`Approved ${inr(spent)}, khata reserve ${inr(reserve)}, left ${inr(budget.available)}`}
      >
        {spent > 0 && <div className="bar-grow h-full rounded-l-full bg-series-1" style={{ width: pct(spent) }} title={`Approved: ${inr(spent)}`} />}
        {reserve > 0 && (
          <div className={cn("bar-grow h-full bg-series-2", spent <= 0 && "rounded-l-full")} style={{ width: pct(reserve), ["--d" as string]: "350ms" }} title={`Khata reserve: ${inr(reserve)}`} />
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <Legend color="bg-series-1" label="Approved" value={spent} />
        <Legend color="bg-series-2" label="Khata reserve" value={reserve} />
        <Legend color="bg-track ring-1 ring-line-strong" label="Left" value={budget.available} />
      </div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      {label} <span className="tabular text-ink">{inr(value)}</span>
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-surface-2 px-3 py-5 text-center text-sm text-ink-3">{children}</p>;
}
