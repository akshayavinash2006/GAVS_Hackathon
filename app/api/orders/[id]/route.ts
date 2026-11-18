import { z } from "zod";
import { getStore } from "@/lib/db";
import { errorResponse } from "@/lib/http";
import { decideOrder, editDraft } from "@/lib/orders";
import { shopOr401 } from "@/lib/session";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("edit"), items: z.array(z.object({ sku_id: z.string().max(80), qty: z.number().int().min(0).max(5000) })).max(200) }),
]);

/** The owner's decision. The session cookie identifies the owner of this shop. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await shopOr401();
  if ("error" in s) return s.error;
  try {
    const { id } = await params;
    const body = Body.parse(await req.json());
    const store = getStore();
    const order = body.action === "edit" ? await editDraft(store, s.shop.id, id, body.items) : await decideOrder(store, s.shop.id, id, body.action, "owner");
    return Response.json({ order });
  } catch (e) {
    return errorResponse(e);
  }
}
