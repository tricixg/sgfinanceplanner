import { getTelegramBot, isTelegramConfigured } from "@/lib/telegram/bot";
import { verifyTelegramWebhookSecret } from "@/lib/telegram/config";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isTelegramConfigured()) {
    console.info("[telegram/webhook] not configured");
    return Response.json({ error: "Telegram bot not configured" }, { status: 503 });
  }
  if (!verifyTelegramWebhookSecret(req)) {
    console.error("[telegram/webhook] invalid secret");
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const bot = await getTelegramBot();
    await bot.handleUpdate(body);
    console.info("[telegram/webhook] update handled", {
      updateId: body?.update_id ?? null,
    });
    return new Response("OK");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook failed";
    console.error("[telegram/webhook] error", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
