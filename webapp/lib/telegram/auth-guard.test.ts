import { describe, expect, it, vi, beforeEach } from "vitest";
import { assertTelegramWriteScope, TelegramScopeError } from "@/lib/telegram/auth-guard";
import * as links from "@/lib/telegram/links";

describe("assertTelegramWriteScope", () => {
  const supabase = {} as never;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("passes when chat is linked to the same user", async () => {
    vi.spyOn(links, "getLinkByChatId").mockResolvedValue({
      userId: "user-a",
      telegramUserId: 1,
      telegramChatId: 99,
      username: null,
      linkedAt: new Date().toISOString(),
    });
    await expect(assertTelegramWriteScope(supabase, 99, "user-a")).resolves.toBeUndefined();
  });

  it("throws when chat is not linked", async () => {
    vi.spyOn(links, "getLinkByChatId").mockResolvedValue(null);
    await expect(assertTelegramWriteScope(supabase, 99, "user-a")).rejects.toThrow(
      TelegramScopeError
    );
  });

  it("throws when userId does not match link", async () => {
    vi.spyOn(links, "getLinkByChatId").mockResolvedValue({
      userId: "user-a",
      telegramUserId: 1,
      telegramChatId: 99,
      username: null,
      linkedAt: new Date().toISOString(),
    });
    await expect(assertTelegramWriteScope(supabase, 99, "user-b")).rejects.toThrow(
      TelegramScopeError
    );
  });
});
