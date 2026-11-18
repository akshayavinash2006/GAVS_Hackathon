import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

// ---------------------------------------------------------------------------
// Passwords: scrypt with a random per-user salt. Stored as scrypt$salt$hash.
// ---------------------------------------------------------------------------

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltB64, hashB64] = stored.split("$");
  if (kind !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Hash work for unknown usernames too, so response time doesn't reveal which usernames exist. */
export const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(KEYLEN).toString("base64");

export function validateUsername(u: string): string | null {
  if (!/^[a-z0-9_.]{3,32}$/.test(u)) return "Username: 3–32 characters, lowercase letters, numbers, _ or .";
  return null;
}

export function validatePassword(p: string): string | null {
  if (p.length < 8) return "Password must be at least 8 characters";
  if (p.length > 200) return "Password is too long";
  return null;
}

// ---------------------------------------------------------------------------
// Sessions: a signed cookie, no session table. HMAC-SHA256 over the payload.
// ---------------------------------------------------------------------------

export interface SessionPayload {
  s: string; // shop id
  u: string | null; // user id (null for demo shops)
  e: number; // expiry, epoch seconds
}

export const SESSION_TTL_DAYS = 30;

// Kept on globalThis so dev-mode module reloads don't rotate it (which would log everyone out).
const g = globalThis as unknown as { __dukaanSessionSecret?: string };

/**
 * SESSION_SECRET if set. Otherwise one derived from the Supabase service key
 * (stable across serverless instances), or a per-process random value as a last
 * resort (sessions then reset on restart, which is fine for the in-memory demo).
 */
export function sessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return createHash("sha256").update("dukaan-session:" + process.env.SUPABASE_SERVICE_ROLE_KEY).digest("hex");
  g.__dukaanSessionSecret ??= randomBytes(32).toString("hex");
  return g.__dukaanSessionSecret;
}

const b64url = (b: Buffer) => b.toString("base64url");
const sign = (data: string, secret: string) => b64url(createHmac("sha256", secret).update(data).digest());

export function signSession(p: Omit<SessionPayload, "e">, secret = sessionSecret(), now = Date.now()): string {
  const payload: SessionPayload = { ...p, e: Math.floor(now / 1000) + SESSION_TTL_DAYS * 86400 };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${sign(body, secret)}`;
}

export function verifySession(token: string | undefined, secret = sessionSecret(), now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof p.s !== "string" || typeof p.e !== "number" || p.e * 1000 < now) return null;
    return p;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Shop setup helpers
// ---------------------------------------------------------------------------

/** First digit of an Indian PIN code → postal region (used for festival calendars). */
export function regionFromPincode(pin: string): "north" | "south" | "east" | "west" {
  const d = pin.trim()[0];
  if (d === "1" || d === "2") return "north";
  if (d === "3" || d === "4") return "west";
  if (d === "5" || d === "6") return "south";
  return "east";
}

/** Neighbouring shops share a cluster: same PIN code. */
export function clusterFromPincode(pin: string): string {
  return `pin-${pin.trim()}`;
}

export function newLinkCode(): string {
  return String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, "0");
}
