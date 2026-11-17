import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// The static-asset extension exclusion must never apply under /api/: Next still routes
// `/api/expenses/abc.png` to `/api/expenses/[id]`, so skipping middleware there would skip
// the session check (SEC-003). `(?!api/)` scopes the extension rule to non-API paths.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|(?!api/).*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
