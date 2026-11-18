import "server-only";
import { ZodError } from "zod";
import { GuardrailError } from "./guardrails";

export function errorResponse(e: unknown): Response {
  if (e instanceof GuardrailError) return Response.json({ error: e.message, code: e.code }, { status: e.code === "not_allowed" ? 403 : 400 });
  if (e instanceof ZodError) return Response.json({ error: "Invalid request", issues: e.issues.slice(0, 5) }, { status: 400 });
  console.error(e);
  const msg = e instanceof Error ? e.message : "Something went wrong";
  return Response.json({ error: msg }, { status: 500 });
}

/** Bearer (or ?key=) check for cron/admin routes. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export function hasSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const key = new URL(req.url).searchParams.get("key") ?? "";
  return auth === `Bearer ${secret}` || key === secret;
}
