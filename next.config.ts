import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Turbopack設定（Next.js 16デフォルト）
  turbopack: {},
  // サーバーコンポーネントで tiktoken を使用するための設定
  serverExternalPackages: ["tiktoken"],
};

export default nextConfig;
