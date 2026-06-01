import type { Context } from "grammy";
import { mainMenuKeyboard } from "@/lib/telegram/keyboards";

export async function showMainMenu(ctx: Context): Promise<void> {
  await ctx.reply("What would you like to do?", { reply_markup: mainMenuKeyboard() });
}
