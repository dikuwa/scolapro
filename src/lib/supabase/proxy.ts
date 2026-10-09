import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set(["/login", "/join"]);

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.has(pathname) || pathname.startsWith("/auth/") || pathname.startsWith("/verify/");
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Keep the UI available as a synthetic design preview until a ScolaPro
  // Supabase environment is intentionally connected.
  if (!url || !publishableKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const pathname = request.nextUrl.pathname;

  if (!isAuthenticated && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);

    return NextResponse.redirect(loginUrl);
  }

  // #1204: a temporary-credential session must rotate its password before
  // accessing normal page routes. No service-role credentials are used here.
  // The API/action authorization boundary requires its own follow-up checks.
  if (isAuthenticated && !isPublicPath(pathname) && pathname !== "/password-rotation") {
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("must_change_password")
      .eq("user_id", data!.claims!.sub)
      .maybeSingle();
    if (profileError) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "";
      return NextResponse.redirect(loginUrl);
    }
    if (profile?.must_change_password === true) {
      const rotationUrl = request.nextUrl.clone();
      rotationUrl.pathname = "/password-rotation";
      rotationUrl.search = "";
      return NextResponse.redirect(rotationUrl);
    }
  }

  if (isAuthenticated && pathname === "/login") {
    // A locally verifiable JWT can outlive its backing Auth user (for example
    // after a local stack/reset/reseed boundary). Do not bounce such a stale
    // session back into the protected app forever. Validate the actual Auth
    // user only on the login route before redirecting away from it.
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (!userError && user?.id === data?.claims?.sub) {
      const destination = request.nextUrl.searchParams.get("next") || "/";
      const appUrl = request.nextUrl.clone();
      appUrl.pathname = destination.startsWith("/") ? destination : "/";
      appUrl.search = "";

      return NextResponse.redirect(appUrl);
    }

    return response;
  }

  return response;
}
