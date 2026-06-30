# Email Thread Scraper

Next.js app for connecting Nylas grants, scraping mailbox messages into Postgres, grouping by Nylas thread ID, and assigning an initial local thread kind.

## Setup

1. Start Postgres:

   ```bash
   docker compose up -d
   ```

2. Create `.env.local` from `.env.example` and fill in:

   - `NYLAS_API_KEY`
   - `NYLAS_CLIENT_ID`
   - `NYLAS_REDIRECT_URI`
   - `BETTER_AUTH_SECRET`

3. Apply the schema:

   ```bash
   npm run db:migrate
   ```

4. Run the app:

   ```bash
   npm run dev
   ```

## Scraping Strategy

The first Nylas pass deliberately treats `/messages` as the source of truth and avoids listing `/threads` in the hot path. Nylas notes that the Threads endpoint can make many provider calls per request, so the app builds thread rows by aggregating message pages locally.

The current algorithm:

- Request only selected fields: IDs, thread IDs, recipients, subject, snippet, timestamps, folder IDs, flags, and attachment metadata.
- Use `limit`, `page_token`, and `next_cursor` for resumable pagination.
- Persist `nextCursor` on the grant after every page so a failed scrape resumes from the last completed page.
- Bound each request-triggered scrape with `NYLAS_SCRAPE_MAX_PAGES_PER_RUN`.
- Respect `Retry-After` and retry 429/502/503/504 responses with exponential backoff.
- Upsert messages by `(nylasGrantId, nylasMessageId)`.
- Upsert threads by `(nylasGrantId, nylasThreadId)`.
- Recompute thread rollups from persisted messages instead of incrementing counters blindly.
- Classify touched threads locally using metadata/snippet keywords for `sourcing`, `purchase_order`, `logistics`, or `uncategorized`.
- If `OPENAI_API_KEY` is set, classify touched threads in batches with an OpenAI model and structured JSON output. The app sends only selected metadata/snippets, sets `store: false`, and treats email content as untrusted data.

This is intentionally worker-shaped: `runNylasScrape()` is isolated in `src/lib/nylas/scraper.ts`, so the next step can move it behind BullMQ without rewriting route/UI code.
