import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: false, // GitHub OAuthのみ使用
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ["user:email", "read:user"],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7日
    updateAge: 60 * 60 * 24, // 1日ごとに更新
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5分キャッシュ
    },
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL || "http://localhost:3000",
  ],
});

export type Session = typeof auth.$Infer.Session;
