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
  UNIPILE_BASE_URL: z.string().url().optional(),
  UNIPILE_ACCESS_TOKEN: z.string().min(1).optional(),
  UNIPILE_HOSTED_AUTH_PROVIDERS: z.string().min(1).default("*:MAILING"),
  UNIPILE_AUTH_SUCCESS_REDIRECT_URI: z.string().url().default("http://localhost:3000/api/unipile/callback"),
  UNIPILE_AUTH_FAILURE_REDIRECT_URI: z.string().url().default("http://localhost:3000/?error=unipile-auth-failed"),
  UNIPILE_AUTH_NOTIFY_URI: z.string().url().default("http://localhost:3000/api/unipile/notify"),
  UNIPILE_GOOGLE_SCOPES: z.string().optional(),
  UNIPILE_MICROSOFT_SCOPES: z.string().optional(),
  UNIPILE_SCRAPE_PAGE_SIZE: z.coerce.number().int().positive().max(250).default(100),
  UNIPILE_SCRAPE_MAX_PAGES_PER_RUN: z.coerce.number().int().positive().max(100).default(10),
  UNIPILE_SCRAPE_REQUEST_DELAY_MS: z.coerce.number().int().min(0).max(10_000).default(250),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  EMAIL_DISCOVERY_WORKER_CONCURRENCY: z.coerce.number().int().positive().max(10).default(2),
  EMAIL_DISCOVERY_JOB_PAGE_BATCH_SIZE: z.coerce.number().int().positive().max(20).default(1),
  EMAIL_CLASSIFICATION_WORKER_CONCURRENCY: z.coerce.number().int().positive().max(20).default(6),
  EMAIL_CLASSIFICATION_JOB_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(20),
  AZURE_API_KEY: z.string().min(1).optional(),
  AZURE_OPENAI_BASE_URL: z.string().url().default("https://cronwell-codex-2.openai.azure.com/openai/v1"),
  AZURE_OPENAI_MODEL: z.string().min(1).default("gpt-5.5"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  OPENAI_CLASSIFY_BATCH_SIZE: z.coerce.number().int().positive().max(50).default(20),
  MODEL_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).default("low"),
  MODEL_TEXT_VERBOSITY: z.enum(["low", "medium", "high"]).default("low"),
  MODEL_CLASSIFY_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(16_000).default(3000),
  MODEL_CLASSIFY_TIMEOUT_MS: z.coerce.number().int().positive().max(300_000).default(60_000),
  ANTHROPIC_BASE_URL: z.string().url().default("https://api.deepseek.com/anthropic"),
  ANTHROPIC_AUTH_TOKEN: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("deepseek-v4-pro[1m]"),
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

export function requireUnipileEnv() {
  if (!env.UNIPILE_BASE_URL || !env.UNIPILE_ACCESS_TOKEN) {
    throw new Error("UNIPILE_BASE_URL and UNIPILE_ACCESS_TOKEN are required for Unipile hosted auth and scraping.");
  }

  return {
    baseUrl: env.UNIPILE_BASE_URL.replace(/\/$/, ""),
    accessToken: env.UNIPILE_ACCESS_TOKEN,
  };
}
