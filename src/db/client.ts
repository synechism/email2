import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

const connectionString = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/email_scraper";

const globalForDb = globalThis as unknown as {
  pgPool?: Pool;
};

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString,
    max: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

export const db = drizzle(pool, { schema });
