import { getStore } from "@/lib/db";
import { errorResponse, hasSecret } from "@/lib/http";
import { generateSeed } from "@/lib/seed";

export const maxDuration = 60;

/**
 * Reloads the demo shops with fresh synthetic history. Open in memory mode or
 * when ALLOW_DEMO_RESET=true; otherwise it needs CRON_SECRET, so a shared link
 * can't wipe a real database.
 */
export async function POST(req: Request) {
  const store = getStore();
  const allowed = store.kind === "memory" || process.env.ALLOW_DEMO_RESET === "true" || hasSecret(req);
  if (!allowed) return Response.json({ error: "Not allowed" }, { status: 403 });
  try {
    const seed = generateSeed();
    await store.resetDemo(seed);
    return Response.json({ ok: true, shops: seed.shops.length, batches: seed.batches.length, events: seed.events.length });
  } catch (e) {
    return errorResponse(e);
  }
}
