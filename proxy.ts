import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie on app pages and gates /app behind
 * login. API routes verify identity themselves in lib/auth.ts, so they are
 * not matched here (avoids a second auth round-trip per request).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && path.startsWith("/app")) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  if (user && path === "/login") {
    const app = request.nextUrl.clone();
    app.pathname = "/app";
    app.search = "";
    return NextResponse.redirect(app);
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/login"],
};
