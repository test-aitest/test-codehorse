import { NextRequest, NextResponse } from "next/server";

// 認証が必要なパスのパターン
const protectedRoutes = ["/dashboard", "/repositories", "/reviews", "/settings"];

// 認証済みユーザーがアクセスすべきでないパス
const authRoutes = ["/sign-in", "/sign-up"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // セッショントークンを確認
  const sessionToken = request.cookies.get("better-auth.session_token")?.value;

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // 保護されたルートに未認証でアクセス
  if (isProtectedRoute && !sessionToken) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 認証済みユーザーがサインインページにアクセス
  if (isAuthRoute && sessionToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // 保護されたルート
    "/dashboard/:path*",
    "/repositories/:path*",
    "/reviews/:path*",
    "/settings/:path*",
    // 認証ルート
    "/sign-in",
    "/sign-up",
  ],
};
