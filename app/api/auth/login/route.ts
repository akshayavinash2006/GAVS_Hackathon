import { z } from "zod";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth";
import { ensureSeeded, getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { clientIp, rateLimited } from "@/lib/rate-limit";
import { setSession } from "@/lib/session";

const Body = z.object({ username: z.string().trim().toLowerCase().max(64), password: z.string().max(200) });

export async function POST(req: Request) {
  try {
    const { username, password } = Body.parse(await req.json());
    if (rateLimited(`login:${clientIp(req)}`, 10, 10 * 60_000) || rateLimited(`login-user:${username}`, 8, 10 * 60_000)) {
      return Response.json({ error: "Too many attempts. Wait a few minutes and try again." }, { status: 429 });
    }
    const store = getStore();
    await ensureSeeded(store);
    const user = await store.findUserByUsername(username);
    // Always run the hash so timing doesn't reveal whether the username exists.
    const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) return Response.json({ error: "Wrong username or password" }, { status: 401 });
    await setSession(user.shop_id, user.id);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
