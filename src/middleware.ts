import { NextRequest, NextResponse } from "next/server";

// 認証が必要なパスのパターン
const protectedRoutes = [
  "/dashboard",
  "/repositories",
  "/reviews",
  "/settings",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // セッショントークンを確認
  const sessionToken =
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("better-auth.session")?.value ||
    request.cookies.get("__Secure-better-auth.session_token")?.value;

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // 保護されたルートに未認証でアクセス
  if (isProtectedRoute && !sessionToken) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  // 認証ルート（/sign-in, /sign-up）へのアクセスは、
  // ページ側でセッション検証を行い、有効な場合のみリダイレクトする
  // これにより、無効なセッションクッキーが残っている場合の無限ループを防ぐ

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
