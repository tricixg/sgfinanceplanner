import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  isPinProtectionEnabled,
  isUnlockedRequest as checkUnlocked,
  pinCookieOptions,
  PIN_COOKIE,
  verifyPin,
} from "@/lib/auth/pin";

export async function GET(req: NextRequest) {
  const enabled = isPinProtectionEnabled();
  const ok = await checkUnlocked(req);
  console.info("[api/auth/pin] GET", { enabled, ok });
  return NextResponse.json({ ok, enabled });
}

export async function POST(req: NextRequest) {
  if (!isPinProtectionEnabled()) {
    return NextResponse.json({ ok: true, enabled: false });
  }

  let body: { pin?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!verifyPin(pin)) {
    console.warn("[api/auth/pin] POST rejected — wrong pin");
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true, enabled: true });
  res.cookies.set(PIN_COOKIE, token, pinCookieOptions());
  console.info("[api/auth/pin] POST ok — session cookie set");
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(PIN_COOKIE, "", { ...pinCookieOptions(), maxAge: 0 });
  console.info("[api/auth/pin] DELETE — signed out");
  return res;
}
