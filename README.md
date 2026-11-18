# Dukaan Saathi

An agentic AI stock assistant for kiranas (problem 5.1). Kiranas tie up 15–20% of working capital in dead stock while running out of fast movers. Dukaan Saathi learns from records the shop **already has** (distributor bills, khata pages, WhatsApp messages), so it's useful in the first week, with no billing system to adopt.

**Two hard boundaries, enforced in code ([lib/guardrails.ts](lib/guardrails.ts)) rather than in the prompt:**
1. Purchases never exceed the weekly cash budget the owner sets.
2. The owner approves every order. The agent and the morning cron can only create drafts.

## What it does

| | |
|---|---|
| **Reads photos** | Distributor bill → stock in + expiry dates. Khata page → customer credit. Shelf photo → counts. Gemini reads the image; a local-name matcher cross-checks every line, and the owner confirms the unsure ones (which teaches it the shop's own item names). |
| **Infers sales without a POS** | Velocity comes from the gaps between purchases, "khatam" / "20 bacha" reports and logged write-offs, de-seasonalized for festivals ([lib/forecast.ts](lib/forecast.ts)). |
| **Flags expiry risk** | First-expiry-first-out: how many units of each batch won't sell before expiry, what that's worth, and what to do (return on the distributor's next visit, discount, bundle, or pass to a neighbour who sells it faster). |
| **Plans reorders under a budget** | Two passes: first cover every item until its next delivery, then top up by priority (urgency, festival uplift, margin, past stock-outs). Items with stock at risk of expiry are held back. Perishables are capped at what sells before expiry ([lib/reorder.ts](lib/reorder.ts)). |
| **Holds back cash for khata** | 20% of outstanding customer credit is reserved, so the shop isn't caught short when a distributor wants cash. |
| **Festival-aware** | [data/festivals.json](data/festivals.json) applies category uplift (sweets ×3 before Diwali, pooja items before Karthigai Deepam…) in each festival's lead window. |
| **Agent (web + WhatsApp)** | A Gemini function-calling loop with 10 tools ([lib/agent/tools.ts](lib/agent/tools.ts)). It answers in Hindi, Hinglish, Kannada, Tamil or English, takes voice notes, and records stock and credit. It has no tool to approve or place orders, or to change the budget. |
| **Morning agent** | Vercel Cron at 07:00 IST drafts a reorder and sends a WhatsApp brief. The owner replies **YES/HAAN** to approve. Approval is deterministic code, never the LLM, and only works from the owner's registered number. |
| **Neighbour shops** | Joint orders for bulk slabs, and transfer offers for near-expiry stock. |
| **Following the money** | [/insights](app/insights/page.tsx) shows anonymized pincode-level demand for the next 7 days (minimum 3 opted-in shops). This is the product distributors and FMCG brands would pay for. |

## Architecture

```
Next.js 15 (App Router) on Vercel
├─ app/(shop)/…          mobile-first PWA: Today · Stock · Scan · Orders · Ask · Settings
├─ app/insights          distributor/brand view (aggregated)
├─ app/api/agent         web chat → agent
├─ app/api/whatsapp      Twilio webhook → approvals | photo ingest | agent (replies async via after())
├─ app/api/cron/daily-brief   scheduled agent (vercel.json)
├─ lib/agent/            Gemini tool loop with model fallback, deadlines and an audit trail (agent_runs)
├─ lib/forecast|reorder|guardrails|snapshot|cluster   deterministic core (unit-tested)
└─ lib/db/               Supabase store, or in-memory store when Supabase isn't configured
```

The LLM does the language work: reading messy bills, understanding "Surf ka chhota packet", talking to the owner. Numbers, budgets and approvals are deterministic code.

## Run locally

```bash
npm install
cp .env.example .env.local   # every key is optional
npm run dev                  # http://localhost:3000
npm test                     # 20 unit/integration tests
```

With no keys set it runs on in-memory demo data (three Koramangala kiranas with six weeks of synthetic history) and the "Try a sample bill" flow.

## Deploy to Vercel

1. **Supabase**: create a project, then open SQL Editor and run [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql). Copy the project URL and the service-role (secret) key.
2. **Gemini**: create an API key at https://aistudio.google.com/apikey.
3. **Vercel**: import the GitHub repo (framework: Next.js, no build settings needed). Add the environment variables:
   - `GEMINI_API_KEY`; optionally `GEMINI_MODEL` (default `gemini-3.8-flash`) and `GEMINI_FALLBACK_MODELS`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only; never prefix with `NEXT_PUBLIC_`)
   - `CRON_SECRET` (any long random string; Vercel Cron sends it automatically)
4. Deploy. The first visit seeds the demo shops.
5. **WhatsApp (optional)**: in the Twilio Console, open Messaging → Try it out → WhatsApp sandbox. Set "When a message comes in" to `https://<app>.vercel.app/api/whatsapp` (POST). Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_WHATSAPP_FROM` in Vercel, then save the owner's number in the app's Settings and join the sandbox from that phone.

Notes
- Vercel Hobby allows one cron run per day, which is enough for the morning brief.
- API routes set `maxDuration = 60`. The agent stops starting new steps after 40s and gives up on model calls at 52s, falling back across Gemini models when one is overloaded.
- Photos are downscaled in the browser before upload, to stay under Vercel's 4.5 MB request limit.

## Before using with real shops

- Replace the demo sign-in (pick a shop → httpOnly cookie, [lib/session.ts](lib/session.ts)) with Supabase Auth phone OTP.
- Set `WHATSAPP_DEMO_FALLBACK=false` so unknown numbers can't talk to a demo shop.
- Verify the lunar festival dates (marked `approx`) each year.
- Grow the catalog ([data/catalog.ts](data/catalog.ts), ~60 SKUs today) from real distributor price lists; shops also add items and aliases as they scan.
