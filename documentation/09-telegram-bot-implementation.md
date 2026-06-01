# Telegram bot — implementation reference

Use this after enabling **Agent** mode. Say: **“Apply documentation/09-telegram-bot-implementation.md”**.

`grammy` is already in `webapp/package.json`. Run migration `028` in Supabase before testing.

## File checklist

- [x] `webapp/supabase/migrations/028_telegram_integration.sql`
- [x] `webapp/lib/telegram/*.ts`
- [x] `webapp/app/api/telegram/webhook/route.ts`
- [x] `webapp/app/api/integrations/telegram/link/route.ts`
- [x] `webapp/components/integrations/TelegramLinkCard.tsx`
- [x] `webapp/components/tabs/TabMe.tsx` — `<TelegramLinkCard />` after PartnerCard
- [x] `webapp/.env.example` — TELEGRAM_* vars
- [x] `webapp/README.md` — Telegram section

## Core patterns

**Supabase (webhook):** always `createAdminClient()` from [`lib/supabase/admin.ts`](../webapp/lib/supabase/admin.ts); filter every query with `.eq("user_id", userId)`.

**Manual expense:** same insert as [`app/api/expenses/route.ts`](../webapp/app/api/expenses/route.ts) POST (non-auto path) + `syncExpenseLedgerAfterCreate`.

**Poker:** `insertPokerSession(supabase, userId, body)` from [`lib/poker/save-session.ts`](../webapp/lib/poker/save-session.ts).

**Travel:** same as [`app/api/travel/trips/[id]/expenses/route.ts`](../webapp/app/api/travel/trips/[id]/expenses/route.ts) POST.

**Budget summary:** replicate data load from [`app/api/expenses/summary/route.ts`](../webapp/app/api/expenses/summary/route.ts) into `lib/telegram/budget.ts` → `loadMonthBudgetSummary(supabase, userId, ym)`.

## Callback data conventions

| Prefix | Meaning |
|--------|---------|
| `menu:expense` | Start expense flow |
| `menu:poker` | Poker type picker |
| `menu:travel` | Travel year picker |
| `menu:budget` | Show `/budget` text |
| `menu:main` | Main menu |
| `exp:cat:{budgetLineId}` | Category selected |
| `exp:page:{n}` | Category page |
| `poker:cash` / `poker:tour` | Session type |
| `poker:game:{id}` | Cash game |
| `poker:result:placed` / `busted` | Tournament |
| `travel:year:{yyyy}` | Year |
| `travel:trip:{id}` | Trip |
| `travel:sub:{encoded}` | Subcategory (URL-encode name) |

## Conversation flows

| flow | steps |
|------|-------|
| `expense` | `pick_category` → `amount` → `note` → save |
| `poker_cash` | `game` → `buyin` → `cashout` → save |
| `poker_tour` | `tname` → `ename` → `result` → `buyin` → (`won` if placed) → save |
| `travel` | `year` → `trip` → `sub` → `amount` → `note` → save |

Store in `telegram_conversations`: `{ chat_id, flow, step, payload }`.

## Webhook route sketch

```ts
// app/api/telegram/webhook/route.ts
import { webhookCallback } from "grammy";
import { getTelegramBot, isTelegramConfigured } from "@/lib/telegram/bot";
import { verifyTelegramWebhookSecret } from "@/lib/telegram/config";

export async function POST(req: Request) {
  if (!isTelegramConfigured()) return Response.json({ error: "Not configured" }, { status: 503 });
  if (!verifyTelegramWebhookSecret(req)) return new Response("Unauthorized", { status: 401 });
  const bot = getTelegramBot();
  return webhookCallback(bot, "std")(req);
}
```

## Link API sketch

- `POST` — create 6-char code, 10 min TTL, return `{ code, expiresAt, botUsername }`
- `GET` — `{ linked, username?, linkedAt? }`
- `DELETE` — remove row from `telegram_links` for `auth.uid()`

## Me tab

`TelegramLinkCard`: POST to create code, show `t.me/{botUsername}?start={code}`, DELETE to unlink.

---

Full SQL for migration 028 is identical to the plan section **Database (new migration 028)**.
