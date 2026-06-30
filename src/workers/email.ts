import { Worker } from "bullmq";
import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { emailThread } from "@/db/schema";
import { classifyTouchedThreads, refreshThreadRollups } from "@/lib/email/threads";
import { env } from "@/lib/env";
import { runNylasScrape } from "@/lib/nylas/scraper";
import {
  EMAIL_CLASSIFICATION_QUEUE,
  EMAIL_DISCOVERY_QUEUE,
  enqueueEmailDiscoveryJob,
  enqueueThreadClassificationJobs,
  redisConnectionOptions,
  type EmailClassificationJobData,
  type EmailDiscoveryJobData,
} from "@/lib/queues/email";

export function startEmailWorkers() {
  const discoveryWorker = new Worker<EmailDiscoveryJobData>(
    EMAIL_DISCOVERY_QUEUE,
    async (job) => {
      const maxPages = discoveryJobPageLimit(job.data);
      const result = await runNylasScrape(job.data.id, { maxPages });

      if (result.status !== "failed") {
        const pagesRemaining = Math.max(0, (job.data.pagesRemaining ?? env.NYLAS_SCRAPE_MAX_PAGES_PER_RUN) - result.pagesProcessed);
        const shouldContinue = Boolean(result.nextCursor && pagesRemaining > 0);
        const pendingThreadIds = shouldContinue ? [] : await getPendingThreadIds(job.data);
        const threadIds = [...new Set([...result.touchedThreadIds, ...pendingThreadIds])];

        await enqueueThreadClassificationJobs(result.organizationId, threadIds);

        if (shouldContinue) {
          await enqueueEmailDiscoveryJob({
            ...job.data,
            pagesRemaining,
          });
        }

        return {
          ...result,
          pagesRemaining,
          discoveryContinued: shouldContinue,
          classificationJobsQueued: threadIds.length,
        };
      }

      return {
        ...result,
        classificationJobsQueued: 0,
      };
    },
    {
      connection: redisConnectionOptions(),
      concurrency: env.EMAIL_DISCOVERY_WORKER_CONCURRENCY,
    },
  );

  const classificationWorker = new Worker<EmailClassificationJobData>(
    EMAIL_CLASSIFICATION_QUEUE,
    async (job) => {
      const threadIds = getClassificationThreadIds(job.data);

      if (threadIds.length === 0) {
        return {
          threadCount: 0,
        };
      }

      await refreshThreadRollups(threadIds);
      await classifyTouchedThreads(threadIds, job.data.organizationId);

      return {
        threadCount: threadIds.length,
        threadIds,
      };
    },
    {
      connection: redisConnectionOptions(),
      concurrency: env.EMAIL_CLASSIFICATION_WORKER_CONCURRENCY,
    },
  );

  for (const worker of [discoveryWorker, classificationWorker]) {
    worker.on("completed", (job) => {
      console.log(`[worker] ${job.queueName}/${job.name} completed`, job.id);
    });

    worker.on("failed", (job, error) => {
      console.error(`[worker] ${job?.queueName}/${job?.name} failed`, job?.id, error);
    });
  }

  return [discoveryWorker, classificationWorker];
}

function discoveryJobPageLimit(jobData: EmailDiscoveryJobData) {
  return Math.min(env.EMAIL_DISCOVERY_JOB_PAGE_BATCH_SIZE, jobData.pagesRemaining ?? env.NYLAS_SCRAPE_MAX_PAGES_PER_RUN);
}

function getClassificationThreadIds(jobData: EmailClassificationJobData) {
  if (jobData.threadIds?.length) {
    return [...new Set(jobData.threadIds)];
  }

  return jobData.threadId ? [jobData.threadId] : [];
}

async function getPendingThreadIds(jobData: EmailDiscoveryJobData) {
  const rows = await db
    .select({ id: emailThread.id })
    .from(emailThread)
    .where(and(eq(emailThread.nylasGrantId, jobData.id), eq(emailThread.kind, "uncategorized")));

  return rows.map((row) => row.id);
}
