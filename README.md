# Email Thread Scraper

Next.js app for connecting Nylas grants and Unipile accounts, scraping mailbox messages into Postgres, grouping by provider thread ID, and classifying email threads with a model-backed worker.

## Setup

1. Start Postgres and Redis:

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

4. Run the app and workers in separate terminals:

   ```bash
   npm run dev
   ```

   ```bash
   npm run worker
   ```

## Scraping Strategy

The Nylas path deliberately treats `/messages` as the source of truth and avoids listing `/threads` in the hot path. Nylas notes that the Threads endpoint can make many provider calls per request, so the app builds thread rows by aggregating message pages locally.

The current algorithm:

- Request only selected fields: IDs, thread IDs, recipients, subject, snippet, timestamps, folder IDs, flags, and attachment metadata.
- Use `limit`, `page_token`, and `next_cursor` for resumable pagination.
- Persist `nextCursor` on the grant/account after every page so a failed scrape resumes from the last completed page.
- Bound each discovery job with `NYLAS_SCRAPE_MAX_PAGES_PER_RUN` or `UNIPILE_SCRAPE_MAX_PAGES_PER_RUN`.
- Respect `Retry-After` and retry 429/502/503/504 responses with exponential backoff.
- Upsert messages by `(nylasGrantId, nylasMessageId)`.
- Upsert threads by `(nylasGrantId, nylasThreadId)`.
- Recompute thread rollups from persisted messages instead of incrementing counters blindly.
- Enqueue discovery through BullMQ's `email-discovery` queue.
- Enqueue model classification through BullMQ's `email-classification` queue, one job per touched thread.
- The Next.js app only creates OAuth/account records and enqueues work. `npm run worker` performs the slow scraping and classification process.

Classification uses the configured model provider and falls back locally if model providers fail. The app sends only selected metadata/snippets, sets `store: false` for Responses providers, and treats email content as untrusted data.
