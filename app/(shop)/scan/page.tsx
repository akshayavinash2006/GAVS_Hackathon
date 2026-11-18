import { ScanFlow } from "@/components/scan-flow";
import { geminiConfigured } from "@/lib/ai/gemini";
import { requireShop } from "@/lib/session";

export default async function ScanPage() {
  await requireShop();
  return <ScanFlow aiEnabled={geminiConfigured()} />;
}
