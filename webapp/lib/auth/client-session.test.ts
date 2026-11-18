import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getSession } }) }));
const configured = vi.fn(() => true);
vi.mock("@/lib/supabase/env", () => ({ isSupabaseAuthConfigured: () => configured() }));

import { readClientSession } from "@/lib/auth/client-session";

describe("readClientSession", () => {
  beforeEach(() => {
    getSession.mockReset();
    configured.mockReturnValue(true);
  });

  it("maps the cookie session to the app's user shape without calling the server", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "u1", email: "a@b.co", user_metadata: { has_password: true } } } },
      error: null,
    });
    await expect(readClientSession()).resolves.toEqual({
      configured: true,
      user: { id: "u1", email: "a@b.co", hasPassword: true },
    });
  });

  it("reports signed out when there is no session", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: null });
    await expect(readClientSession()).resolves.toEqual({ configured: true, user: null });
  });

  it("reports auth as not configured without touching Supabase", async () => {
    configured.mockReturnValue(false);
    await expect(readClientSession()).resolves.toEqual({ configured: false, user: null });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("surfaces a session read error (so RequireAuth shows its retry screen)", async () => {
    getSession.mockResolvedValue({ data: { session: null }, error: { message: "storage broke" } });
    await expect(readClientSession()).rejects.toThrow("storage broke");
  });
});
