import "server-only";
import { GoogleGenAI, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";
import type { z } from "zod";

let client: GoogleGenAI | null = null;

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function gemini(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/** Override with GEMINI_MODEL (any model your key lists for generateContent on the v1 API). */
export const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

/** Tried in order when the primary model is overloaded, rate-limited or unavailable. */
const FALLBACKS = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3.5-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

function transient(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /\b(429|500|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand|not found|NOT_FOUND|timeout|timed out|aborted|ETIMEDOUT|ECONNRESET|fetch failed/i.test(
    msg,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * generateContent with resilience: on overload/rate-limit, fall through the
 * model list and put the busy model on a one-minute cooldown, so later steps of
 * the same agent run go straight to a model that's answering. Errors that
 * aren't transient (bad request, auth) throw at once.
 */
export async function generate(
  params: Omit<GenerateContentParameters, "model">,
  /** Absolute time (ms) by which we must have an answer or give up. */
  deadline = Date.now() + 45_000,
): Promise<GenerateContentResponse> {
  const now = Date.now();
  const all = [MODEL, ...FALLBACKS.filter((m) => m !== MODEL)];
  // Skip models that were overloaded in the last minute; if all are, try them anyway.
  const fresh = all.filter((m) => (cooldown.get(m) ?? 0) < now);
  const models = fresh.length ? fresh : all;
  let last: unknown;
  for (let i = 0; i < models.length; i++) {
    const remaining = deadline - Date.now();
    // Gemini rejects request deadlines under 10s (400 INVALID_ARGUMENT), so don't start one.
    if (remaining < MIN_CALL_MS) break;
    try {
      const res = await gemini().models.generateContent({
        ...params,
        model: models[i],
        // A busy model can accept a request and then stall; cap each attempt.
        config: { ...params.config, httpOptions: { ...params.config?.httpOptions, timeout: Math.min(CALL_TIMEOUT_MS, remaining) } },
      });
      cooldown.delete(models[i]);
      return res;
    } catch (e) {
      last = e;
      if (!transient(e)) throw e;
      cooldown.set(models[i], Date.now() + COOLDOWN_MS);
      console.warn(`Gemini ${models[i]} failed (${e instanceof Error ? e.message.slice(0, 80) : e}); trying next`);
      if (i < models.length - 1) await sleep(300);
    }
  }
  throw new Error(`The AI service is busy right now. Please try again in a minute. (${last instanceof Error ? last.message.slice(0, 120) : ""})`);
}

const COOLDOWN_MS = 60_000;
const MIN_CALL_MS = 10_000;
const CALL_TIMEOUT_MS = Math.max(MIN_CALL_MS, Number(process.env.GEMINI_TIMEOUT_MS) || 20_000);
const cooldown = new Map<string, number>();

export function mediaPart(base64: string, mimeType: string): Part {
  return { inlineData: { data: base64, mimeType } };
}

/**
 * One structured call: JSON Schema in, validated object out. Optional fields
 * are left out of `required` instead of being nullable, which every Gemini
 * model handles reliably.
 */
export async function generateJson<T>(opts: { system: string; parts: Part[]; jsonSchema: object; schema: z.ZodType<T>; temperature?: number }): Promise<T> {
  const res = await generate({
    contents: [{ role: "user", parts: opts.parts }],
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: opts.jsonSchema,
      temperature: opts.temperature ?? 0.1,
    },
  });
  const text = res.text ?? "";
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Model did not return JSON");
    raw = JSON.parse(m[0]);
  }
  return opts.schema.parse(raw);
}
