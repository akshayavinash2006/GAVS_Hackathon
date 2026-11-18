import { SettingsForm } from "@/components/settings-form";
import { geminiConfigured } from "@/lib/ai/gemini";
import { getStore } from "@/lib/db";
import { currentUsername, requireShop } from "@/lib/session";
import { twilioConfigured } from "@/lib/whatsapp";

export default async function SettingsPage() {
  const shop = await requireShop();
  const store = getStore();
  const [distributors, username] = await Promise.all([store.listDistributors(shop.id), currentUsername()]);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <SettingsForm
      shop={{ name: shop.name, cash_budget: shop.cash_budget, language: shop.language, open_to_joint_orders: shop.open_to_joint_orders }}
      account={{ username, is_demo: shop.is_demo, owner_phone: shop.owner_phone }}
      status={{
        store: store.kind,
        gemini: geminiConfigured(),
        whatsapp: twilioConfigured(),
        canReset: shop.is_demo && (store.kind === "memory" || process.env.ALLOW_DEMO_RESET === "true"),
      }}
      distributors={distributors.map((d) => ({
        name: d.name,
        visits: d.visit_days.length === 7 ? "daily" : d.visit_days.map((v) => DAYS[v]).join(", ") || "on call",
        returns: d.accepts_returns,
      }))}
    />
  );
}
