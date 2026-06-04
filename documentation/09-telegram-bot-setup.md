# Telegram bot setup

Complete these steps before using the bot in production. Implementation lives under `webapp/lib/telegram/` and `webapp/app/api/telegram/webhook`.

## 1. Create the bot (BotFather)

1. Message [@BotFather](https://t.me/BotFather) → `/newbot`.
2. Save the **token** (`TELEGRAM_BOT_TOKEN`) and **username** (`@your_bot`).

## 2. Webhook secret

```bash
openssl rand -hex 32
```

Save as `TELEGRAM_WEBHOOK_SECRET` (local `.env.local` and Vercel).

## 3. Environment variables

In `webapp/.env.local` and Vercel (Production):

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | BotFather token (server-only) |
| `TELEGRAM_WEBHOOK_SECRET` | Random secret for webhook verification |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for webhook (links + writes) |

Run migration [`028_telegram_integration.sql`](../webapp/supabase/migrations/028_telegram_integration.sql) in Supabase SQL Editor.

## 4. Register webhook (after deploy)

```bash
export TELEGRAM_BOT_TOKEN="..."
export TELEGRAM_WEBHOOK_SECRET="..."
export APP_URL="https://your-app.vercel.app"

curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${APP_URL}/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message","callback_query"]' \
  -d "drop_pending_updates=true"
```

Verify: `curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"`

## 5. Link your account

1. Sign in to the web app → **Me** → **Connect Telegram**.
2. Copy the code (valid ~10 minutes).
3. In Telegram, open your bot → `/start YOUR_CODE`.
4. Use `/menu` to log expenses, poker, or travel costs.

## Commands

Register with BotFather `/setcommands`:

```
start - Link account or help
menu - Main menu
budget - Monthly budget summary
cancel - Cancel current input
```

## Local development (do this first)

Telegram must reach your machine over **HTTPS**. Use a tunnel to `localhost:3000`.

### Prerequisites (one-time)

1. **BotFather** — `/newbot` → save `TELEGRAM_BOT_TOKEN` and `@username`.
2. **Webhook secret** — `openssl rand -hex 32` → save as `TELEGRAM_WEBHOOK_SECRET`.
3. **Supabase** — run migration [`028_telegram_integration.sql`](../webapp/supabase/migrations/028_telegram_integration.sql) in the SQL Editor.
4. **`webapp/.env.local`** — add (restart `npm run dev` after saving):

   ```env
   TELEGRAM_BOT_TOKEN=7123456789:AAH...
   TELEGRAM_WEBHOOK_SECRET=your_hex_secret
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

   You also need the usual Supabase URL/anon key and a way to sign in locally (magic link or `AUTH_BYPASS_DEV` + `DEV_USER_ID`).

5. **Optional** — BotFather `/setcommands` (see [Commands](#commands) below).

### Each dev session

**Terminal 1 — app**

```bash
cd webapp
npm run dev
```

Confirm http://localhost:3000 loads and you can sign in.

**Terminal 2 — tunnel**

Install ngrok (macOS with Homebrew):

```bash
brew install ngrok/ngrok/ngrok
```

One-time: sign up at [ngrok.com](https://ngrok.com), copy your authtoken, then:

```bash
ngrok config add-authtoken YOUR_TOKEN
```

Start the tunnel (with `npm run dev` already running on port 3000):

```bash
ngrok http 3000
```

Copy the **HTTPS** URL (e.g. `https://abc123.ngrok-free.app`). Free ngrok URLs change every restart.

**Terminal 3 — point Telegram at your tunnel**

```bash
cd webapp
export TELEGRAM_BOT_TOKEN="paste_from_env_local"
export TELEGRAM_WEBHOOK_SECRET="paste_from_env_local"
export APP_URL="https://abc123.ngrok-free.app"   # no trailing slash or spaces

# Verify the URL looks correct (no space before /api):
echo "${APP_URL}/api/telegram/webhook"

curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${APP_URL}/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message","callback_query"]' \
  -d "drop_pending_updates=true" | jq .

curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" | jq .
```

Check `result.url` matches your ngrok URL and `last_error_message` is empty.

**Link your account**

1. Browser → http://localhost:3000 → sign in → **Me** → **Connect Telegram** → **Connect Telegram** (generates code).
2. Telegram → open your bot → `/start AB12CD` (use the code from the app).
3. Bot should reply “Account linked” and show the menu. Try `/menu`.

### Switching back to production

Telegram allows **one webhook URL** per bot. Before testing on Vercel again:

```bash
# Point webhook at production
export APP_URL="https://your-app.vercel.app"
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=${APP_URL}/api/telegram/webhook" \
  -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  -d 'allowed_updates=["message","callback_query"]'
```

Or remove webhook entirely (not needed for normal operation):

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook"
```

### Local troubleshooting

| Issue | Fix |
|-------|-----|
| Me tab says bot not configured | `TELEGRAM_*` missing in `.env.local` — restart `npm run dev` |
| `getWebhookInfo` shows wrong URL | Re-run `setWebhook` with current ngrok HTTPS URL |
| 401 / bot silent | `TELEGRAM_WEBHOOK_SECRET` must match `secret_token` in `setWebhook` |
| ngrok browser warning | Open the ngrok URL once in a browser if Telegram reports SSL/errors |
| Code expired | Generate a new code in Me (10 min TTL) |
| Link works but expense fails | Confirm migration 028 ran; check terminal running `npm run dev` for `[telegram]` errors |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Bot silent | Check `getWebhookInfo` URL and `last_error_message` |
| `Bot not initialized` in dev logs | Fixed in app via `bot.init()` — restart `npm run dev` and send `/start` again |
| 401 on webhook | `TELEGRAM_WEBHOOK_SECRET` must match `secret_token` in `setWebhook` |
| Not linked | Generate a new code in Me tab and `/start CODE` again |
