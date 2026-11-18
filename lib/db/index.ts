import "server-only";
import { generateSeed } from "../seed";
import { MemoryStore } from "./memory";
import type { Store } from "./store";
import { SupabaseStore } from "./supabase";

const g = globalThis as unknown as { __dukaanStore?: Store; __dukaanSeeding?: Promise<void> };

export function supabaseConfigured(): boolean {
  return !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/** Accepts the project URL with or without a trailing /rest/v1 or slash. */
function supabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

export function getStore(): Store {
  if (!g.__dukaanStore) {
    g.__dukaanStore = supabaseConfigured() ? new SupabaseStore(supabaseUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()) : new MemoryStore();
  }
  return g.__dukaanStore;
}

/** True when Supabase is reachable but the migration hasn't been run. */
export function isMissingSchema(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /schema cache|does not exist|PGRST205|PGRST204|42703|relation .* does not exist/i.test(msg);
}

/** Makes sure the three demo shops exist. Real shops are never touched. */
export async function ensureSeeded(store: Store = getStore()): Promise<void> {
  await store.checkSchema();
  if ((await store.listShops()).some((s) => s.is_demo)) return;
  if (!g.__dukaanSeeding) {
    g.__dukaanSeeding = store.resetDemo(generateSeed()).finally(() => {
      g.__dukaanSeeding = undefined;
    });
  }
  await g.__dukaanSeeding;
}

export type { Store };
