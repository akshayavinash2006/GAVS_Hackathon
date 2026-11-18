import { SettingsForm } from "@/components/settings-form";
import { geminiConfigured } from "@/lib/ai/gemini";
import { getStore } from "@/lib/db";
import { requireShop } from "@/lib/session";
import { twilioConfigured } from "@/lib/whatsapp";

export default async function SettingsPage() {
  const shop = await requireShop();
  const store = getStore();
  const distributors = await store.listDistributors(shop.id);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <SettingsForm
      shop={{ cash_budget: shop.cash_budget, language: shop.language, owner_phone: shop.owner_phone ?? "", open_to_joint_orders: shop.open_to_joint_orders }}
      status={{
        store: store.kind,
        gemini: geminiConfigured(),
        whatsapp: twilioConfigured(),
        whatsappFrom: process.env.TWILIO_WHATSAPP_FROM ?? null,
        canReset: store.kind === "memory" || process.env.ALLOW_DEMO_RESET === "true",
      }}
      distributors={distributors.map((d) => ({
        name: d.name,
        visits: d.visit_days.length === 7 ? "daily" : d.visit_days.map((v) => DAYS[v]).join(", ") || "on call",
        returns: d.accepts_returns,
      }))}
    />
  );
}
