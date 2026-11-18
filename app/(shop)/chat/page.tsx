import { Chat } from "@/components/chat";
import { geminiConfigured } from "@/lib/ai/gemini";
import { requireShop } from "@/lib/session";

export default async function ChatPage() {
  const shop = await requireShop();
  const suggestions =
    shop.language === "hi"
      ? ["Aaj kya order karun?", "Kya expire hone wala hai?", "Maggi khatam ho gaya", "Parle-G 20 bacha hai", "Festival ke liye kya mangau?", "Padosi dukaan ke saath order?"]
      : ["What should I order today?", "What's about to expire?", "Maggi is finished", "20 Parle-G left", "What do I need for the festival?", "Can I order with neighbours?"];
  return <Chat suggestions={suggestions} aiEnabled={geminiConfigured()} />;
}
