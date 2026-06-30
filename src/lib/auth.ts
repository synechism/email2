import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization as organizationPlugin } from "better-auth/plugins/organization";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    camelCase: true,
    transaction: true,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: [organizationPlugin(), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
