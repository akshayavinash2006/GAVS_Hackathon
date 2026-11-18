import { ZodError, z } from "zod";
import { GuardrailError } from "@/lib/guardrails";
import { runAgent } from "@/lib/agent/orchestrator";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { shopOr401 } from "@/lib/session";

export const maxDuration = 60;

const Body = z.object({
  message: z.string().max(2000).default(""),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20).default([]),
  audio: z.object({ base64: z.string().max(8_000_000), mimeType: z.string().regex(/^audio\//) }).optional(),
});

export async function POST(req: Request) {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    const body = Body.parse(await req.json());
    if (!body.message.trim() && !body.audio) return Response.json({ error: "Say something" }, { status: 400 });
    const out = await runAgent({
      store: getStore(),
      shopId: s.shop.id,
      channel: "web",
      message: body.message,
      history: body.history,
      media: body.audio ? [body.audio] : undefined,
    });
    return Response.json(out);
  } catch (e) {
    if (e instanceof ZodError || e instanceof GuardrailError) return errorResponse(e);
    // AI/provider failures: log the details, show the owner something readable.
    console.error("agent failed", e);
    const busy = e instanceof Error && /busy|429|503|504|quota|deadline|timeout/i.test(e.message);
    return Response.json(
      { error: busy ? "The assistant is busy right now. Please try again in a minute." : "The assistant couldn't answer that. Please try again." },
      { status: busy ? 503 : 500 },
    );
  }
}
