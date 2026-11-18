import type { Sku, SkuAlias } from "./types";

// Local-name matching: shops say "surf ka chhota packet", bills say
// "SURF EXL EZ WSH 500G". We score each SKU by trigram similarity against its
// name, brand+name and every alias (global + this shop's learned aliases),
// with a bonus when every word of an alias appears in the query.

const UNIT_MAP: [RegExp, string][] = [
  [/(\d+)\s*(gms?|grams?|gr)\b/g, "$1g"],
  [/(\d+)\s*(kgs?|kilo)\b/g, "$1kg"],
  [/(\d+)\s*(ltrs?|litres?|liters?|lt)\b/g, "$1l"],
  [/(\d+)\s*(mls?)\b/g, "$1ml"],
];

const STOP = new Set(["ka", "ki", "ke", "the", "a", "pkt", "packet", "pack", "pc", "pcs", "nos", "no", "rs", "mrp"]);

export function normalizeName(raw: string): string {
  let s = raw.toLowerCase().normalize("NFKC");
  s = s.replace(/[’'`]/g, "");
  for (const [re, rep] of UNIT_MAP) s = s.replace(re, rep);
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  return s
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(" ")
    .trim();
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.split(" ")) {
    if (!word) continue;
    const w = `  ${word} `;
    for (let i = 0; i < w.length - 2; i++) out.add(w.slice(i, i + 3));
  }
  return out;
}

export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export interface MatchCandidate {
  sku_id: string;
  name: string;
  score: number;
  via: string;
}

export interface MatchResult {
  query: string;
  best: MatchCandidate | null;
  candidates: MatchCandidate[];
  confidence: "high" | "medium" | "low";
}

const SIZE_RE = /\b\d+(g|kg|l|ml)\b/;
const stripSize = (s: string) => s.replace(/\b\d+(g|kg|l|ml)?\b/g, " ").replace(/\s+/g, " ").trim();

export class SkuMatcher {
  private entries: { sku: Sku; text: string; via: string; learned: boolean }[] = [];

  constructor(skus: Sku[], aliases: SkuAlias[] = []) {
    const byId = new Map(skus.map((s) => [s.id, s]));
    for (const sku of skus) {
      this.entries.push({ sku, text: normalizeName(sku.name), via: "name", learned: false });
      this.entries.push({ sku, text: normalizeName(`${sku.brand} ${sku.name}`), via: "brand", learned: false });
      for (const a of sku.aliases) this.entries.push({ sku, text: normalizeName(a), via: `alias:${a}`, learned: false });
    }
    for (const a of aliases) {
      const sku = byId.get(a.sku_id);
      if (sku) this.entries.push({ sku, text: normalizeName(a.alias), via: `learned:${a.alias}`, learned: true });
    }
  }

  match(raw: string, limit = 3): MatchResult {
    const q = normalizeName(raw);
    const qWords = new Set(q.split(" "));
    const qSize = q.match(SIZE_RE)?.[0];
    const qNoSize = stripSize(q);
    const best = new Map<string, MatchCandidate>();
    for (const e of this.entries) {
      if (!e.text) continue;
      let score: number;
      if (q === e.text) score = e.learned ? 1.2 : 1.1;
      else {
        // Compare names without pack sizes: "75g" alone must never make a match.
        score = similarity(qNoSize, stripSize(e.text));
        const words = stripSize(e.text).split(" ").filter(Boolean);
        if (words.length && words.every((w) => qWords.has(w))) score += 0.25 * Math.min(1, words.join("").length / 5);
        // Pack sizes refine a name match: agree → small boost, disagree → penalty.
        const sSize = normalizeName(e.sku.name).match(SIZE_RE)?.[0];
        if (qSize && sSize && score >= 0.2) score += qSize === sSize ? 0.15 : -0.2;
      }
      if (e.learned) score += 0.05;
      const prev = best.get(e.sku.id);
      if (!prev || score > prev.score) best.set(e.sku.id, { sku_id: e.sku.id, name: e.sku.name, score, via: e.via });
    }
    const candidates = [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
    const top = candidates[0] ?? null;
    const gap = top && candidates[1] ? top.score - candidates[1].score : 1;
    let confidence: MatchResult["confidence"] = "low";
    if (top && (top.score >= 1 || (top.score >= 0.5 && gap >= 0.12))) confidence = "high";
    else if (top && top.score >= 0.3) confidence = "medium";
    return { query: raw, best: top && top.score >= 0.2 ? top : null, candidates, confidence };
  }
}
