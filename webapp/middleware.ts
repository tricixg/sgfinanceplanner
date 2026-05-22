import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isPinProtectionEnabled, isUnlockedRequest } from "@/lib/auth/pin";

export async function middleware(request: NextRequest) {
  if (!isPinProtectionEnabled()) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/auth/pin")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (!(await isUnlockedRequest(request))) {
      console.warn("[middleware] blocked API", pathname);
      return NextResponse.json({ error: "PIN required" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
