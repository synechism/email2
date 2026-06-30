import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default("postgres://postgres:postgres@localhost:5432/email_scraper"),
  BETTER_AUTH_SECRET: z.string().min(16).default("development-secret-change-before-production"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  NYLAS_API_KEY: z.string().min(1).optional(),
  NYLAS_CLIENT_ID: z.string().min(1).optional(),
  NYLAS_API_URI: z.string().url().default("https://api.us.nylas.com"),
  NYLAS_REDIRECT_URI: z.string().url().default("http://localhost:3000/api/nylas/callback"),
  NYLAS_DEFAULT_PROVIDER: z.string().optional(),
  NYLAS_OAUTH_SCOPES: z.string().optional(),
  NYLAS_SCRAPE_PAGE_SIZE: z.coerce.number().int().positive().max(200).default(50),
  NYLAS_SCRAPE_MAX_PAGES_PER_RUN: z.coerce.number().int().positive().max(100).default(20),
  NYLAS_SCRAPE_REQUEST_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(250),
});

export const env = envSchema.parse(process.env);

export function requireNylasEnv() {
  if (!env.NYLAS_API_KEY || !env.NYLAS_CLIENT_ID) {
    throw new Error("NYLAS_API_KEY and NYLAS_CLIENT_ID are required for Nylas OAuth and scraping.");
  }

  return {
    apiKey: env.NYLAS_API_KEY,
    clientId: env.NYLAS_CLIENT_ID,
    apiUri: env.NYLAS_API_URI.replace(/\/$/, ""),
    redirectUri: env.NYLAS_REDIRECT_URI,
  };
}
