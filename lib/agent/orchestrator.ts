import "server-only";
import type { Content, Part } from "@google/genai";
import { generate, geminiConfigured } from "../ai/gemini";
import type { Store } from "../db/store";
import { composeBrief } from "../brief";
import { buildSnapshot } from "../snapshot";
import type { AgentRun, AgentStep, Shop } from "../types";
import { istDate, truncate, uid } from "../util";
import { TOOL_DECLARATIONS, runTool, type ToolContext } from "./tools";

const MAX_STEPS = 6;
const DEADLINE_MS = 40_000; // don't start a new step after this
const HARD_DEADLINE_MS = 52_000; // no model call may run past this (Vercel limit is 60s)

function systemPrompt(shop: Shop, channel: AgentRun["channel"], now: Date): string {
  return `You are "Dukaan Saathi", a stock assistant for ${shop.name}, a kirana run by ${shop.owner_name} in ${shop.locality} (${shop.pincode}).
Today is ${istDate(now)}.

What you do: help the owner avoid dead stock and expiries, avoid running out of fast movers, and plan purchases within their cash budget.

Hard rules:
- You can only create DRAFT orders. The owner approves every order themselves (Orders screen, or by replying YES on WhatsApp). Never say an order was placed, sent or confirmed.
- Never suggest buying beyond the remaining weekly budget. If the owner wants more, tell them to raise the budget in Settings. You cannot change it.
- Use tools for every number. Never invent stock levels, prices or dates. Stock figures are estimates inferred from bills and updates, so say "about" when giving them.
- When the owner reports stock ("Maggi khatam", "Parle-G 20 bacha", "5 bread phenk diya"), record it with record_stock_update. If an item name is unclear, ask, offering the suggestions the tool returns.
- When they mention khata/udhaar/credit, use record_credit.
- Before suggesting a big festival purchase, check expiry risks so you don't add to dead stock.

Style:
- Reply in the owner's language and script: Hindi, Hinglish, Kannada, Tamil or English, matching how they wrote. Default: ${shop.language === "hi" ? "Hinglish" : "simple English"}.
- Be brief and practical, like a sharp shop assistant. Use ₹ and plain numbers.${channel === "whatsapp" ? "\n- This is WhatsApp: at most 8 short lines, no markdown tables, *bold* sparingly." : "\n- Short bullet lists are fine."}`;
}

const WRITE_TOOLS = new Set(["record_stock_update", "record_credit", "create_draft_order"]);

/** When the model stalls mid-run, say honestly what (if anything) was already saved. */
function partialReply(steps: AgentStep[], ctx: ToolContext): string {
  const busy = "The AI is busy right now and couldn't finish the reply. Please ask again in a minute.";
  if (ctx.createdOrderIds.length) return `I've saved a draft order for you to review in Orders. ${busy}`;
  if (steps.some((s) => WRITE_TOOLS.has(s.tool))) return `I've saved what you told me. ${busy}`;
  return busy;
}

export interface AgentInput {
  store: Store;
  shopId: string;
  channel: AgentRun["channel"];
  message: string;
  media?: { base64: string; mimeType: string }[];
  history?: { role: "user" | "assistant"; text: string }[];
  now?: Date;
}

export interface AgentOutput {
  text: string;
  steps: AgentStep[];
  orderIds: string[];
  usedModel: boolean;
}

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const now = input.now ?? new Date();
  const shop = await input.store.getShop(input.shopId);
  if (!shop) throw new Error("Shop not found");
  const ctx: ToolContext = { store: input.store, shopId: input.shopId, now, channel: input.channel, createdOrderIds: [] };
  const steps: AgentStep[] = [];

  if (!geminiConfigured()) {
    const snap = await buildSnapshot(input.store, input.shopId, now);
    const text =
      "(Demo mode: set GEMINI_API_KEY to talk to the agent. Here is today's brief.)\n\n" +
      (snap ? composeBrief(snap, input.channel === "whatsapp" ? "whatsapp" : "web") : "");
    return { text, steps, orderIds: [], usedModel: false };
  }

  const contents: Content[] = [];
  for (const h of (input.history ?? []).slice(-8)) {
    contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.text }] });
  }
  const userParts: Part[] = [];
  for (const m of input.media ?? []) userParts.push({ inlineData: { data: m.base64, mimeType: m.mimeType } });
  userParts.push({ text: input.message || "(voice note attached)" });
  contents.push({ role: "user", parts: userParts });

  let text = "";
  const started = Date.now();
  for (let i = 0; i < MAX_STEPS; i++) {
    // Stay inside the serverless time limit (60s on Vercel) even when the AI is slow.
    if (Date.now() - started > DEADLINE_MS) {
      text = partialReply(steps, ctx);
      break;
    }
    let res: Awaited<ReturnType<typeof generate>>;
    try {
      res = await generate(
        {
          contents,
          config: {
            systemInstruction: systemPrompt(shop, input.channel, now),
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
            temperature: 0.3,
          },
        },
        started + HARD_DEADLINE_MS,
      );
    } catch (e) {
      if (!steps.length) throw e;
      text = partialReply(steps, ctx);
      break;
    }
    const calls = res.functionCalls ?? [];
    const modelContent = res.candidates?.[0]?.content;
    if (!calls.length) {
      text = res.text ?? "";
      break;
    }
    // Keep the model turn verbatim (it carries thought signatures some models require).
    contents.push(modelContent ?? { role: "model", parts: calls.map((c) => ({ functionCall: c })) });
    const responses: Part[] = [];
    for (const call of calls) {
      const name = call.name ?? "";
      const args = (call.args ?? {}) as Record<string, unknown>;
      const result = await runTool(name, args, ctx);
      steps.push({ tool: name, args, result: truncate(JSON.stringify(result), 600) });
      const response = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : { result };
      responses.push({ functionResponse: { id: call.id, name, response } });
    }
    contents.push({ role: "user", parts: responses });
  }
  if (!text) text = "Sorry, I couldn't finish that. Please try asking in a simpler way.";

  await input.store.addAgentRun({
    id: uid("run"),
    shop_id: input.shopId,
    channel: input.channel,
    input: truncate(input.message || "(media)", 500),
    steps,
    output: truncate(text, 2000),
    created_at: now.toISOString(),
  });

  return { text, steps, orderIds: ctx.createdOrderIds, usedModel: true };
}
