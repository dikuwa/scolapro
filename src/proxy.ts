import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 resolves the request-boundary proxy next to the app directory.
// This app uses src/app, so the proxy must live here as src/proxy.ts — a root
// proxy.ts is never executed in this layout.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // /api is deliberately excluded from the proxy contract. Internal job,
    // cron, webhook and health routes authenticate with their own shared
    // secrets and would otherwise be redirected to /login, and the
    // session-authenticated API routes must keep returning JSON 401 responses
    // instead of an HTML redirect.
    //
    // manifest.webmanifest is excluded because the document links it without
    // crossorigin="use-credentials", so browsers fetch it with credentials
    // omitted. Gating it would redirect the PWA manifest to /login and break
    // installability, which is a behaviour change against the current app.
    "/((?!api/|_next/static|_next/image|favicon.ico|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
