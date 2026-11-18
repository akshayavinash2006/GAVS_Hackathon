export const DAY_MS = 86_400_000;

export function uid(prefix = ""): string {
  const id = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return prefix ? `${prefix}_${id}` : id;
}

/** Deterministic PRNG (mulberry32) for reproducible seed data. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Calendar date (YYYY-MM-DD) in India time. */
export function istDate(d: Date | number | string = new Date()): string {
  const t = new Date(d).getTime() + 5.5 * 3600_000;
  return new Date(t).toISOString().slice(0, 10);
}

export function addDays(d: Date | string | number, days: number): Date {
  return new Date(new Date(d).getTime() + days * DAY_MS);
}

/** Whole days from `from` to `to` (calendar dates, IST). Negative if `to` is earlier. */
export function daysBetween(from: Date | string | number, to: Date | string | number): number {
  const a = Date.parse(istDate(from));
  const b = Date.parse(istDate(to));
  return Math.round((b - a) / DAY_MS);
}

export function inr(n: number, opts: { decimals?: number } = {}): string {
  const v = Number.isFinite(n) ? n : 0;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: opts.decimals ?? 0, minimumFractionDigits: 0 });
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function groupBy<T, K extends string | number>(items: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
