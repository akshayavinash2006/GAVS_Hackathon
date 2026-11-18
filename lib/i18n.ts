import type { Lang } from "./types";

const dict = {
  home: { en: "Today", hi: "आज" },
  scan: { en: "Scan", hi: "स्कैन" },
  stock: { en: "Stock", hi: "स्टॉक" },
  orders: { en: "Orders", hi: "ऑर्डर" },
  chat: { en: "Ask", hi: "पूछें" },
  settings: { en: "Settings", hi: "सेटिंग" },
  expiring: { en: "Act now", hi: "अभी करें" },
  runningLow: { en: "Running out", hi: "खत्म हो रहा" },
  suggested: { en: "Suggested order", hi: "सुझाया ऑर्डर" },
  moneyAtRisk: { en: "At risk of expiry", hi: "एक्सपायरी का खतरा" },
  createDraft: { en: "Create draft", hi: "ड्राफ्ट बनाएं" },
} as const;

export type Key = keyof typeof dict;

export function t(key: Key, lang: Lang): string {
  return dict[key][lang] ?? dict[key].en;
}
