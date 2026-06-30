import { Worker } from "bullmq";

import {
  enqueueMailboxDiscovery,
  getMailboxDiscoveryPageBudget,
  getMailboxPendingThreadIds,
  runMailboxScrape,
} from "@/lib/email/service";
import { classifyTouchedThreads, refreshThreadRollups } from "@/lib/email/threads";
import { env } from "@/lib/env";
import {
  EMAIL_CLASSIFICATION_QUEUE,
  EMAIL_DISCOVERY_QUEUE,
  enqueueThreadClassificationJobs,
  redisConnectionOptions,
  type EmailClassificationJobData,
  type EmailDiscoveryJobData,
} from "@/lib/queues/email";

export function startEmailWorkers() {
  const discoveryWorker = new Worker<EmailDiscoveryJobData>(
    EMAIL_DISCOVERY_QUEUE,
    async (job) => {
      const maxPages = await discoveryJobPageLimit(job.data);
      const result = await runMailboxScrape(job.data.mailboxId, { maxPages });

      if (result.status !== "failed") {
        const pageBudget = job.data.pagesRemaining ?? (await getMailboxDiscoveryPageBudget(job.data.mailboxId));
        const pagesRemaining = Math.max(0, pageBudget - result.pagesProcessed);
        const shouldContinue = Boolean(result.nextCursor && pagesRemaining > 0);
        const pendingThreadIds = shouldContinue ? [] : await getMailboxPendingThreadIds(job.data.mailboxId);
        const threadIds = [...new Set([...result.touchedThreadIds, ...pendingThreadIds])];

        await enqueueThreadClassificationJobs(result.organizationId, threadIds);

        if (shouldContinue) {
          await enqueueMailboxDiscovery({
            mailboxId: job.data.mailboxId,
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

async function discoveryJobPageLimit(jobData: EmailDiscoveryJobData) {
  return Math.min(
    env.EMAIL_DISCOVERY_JOB_PAGE_BATCH_SIZE,
    jobData.pagesRemaining ?? (await getMailboxDiscoveryPageBudget(jobData.mailboxId)),
  );
}

function getClassificationThreadIds(jobData: EmailClassificationJobData) {
  if (jobData.threadIds?.length) {
    return [...new Set(jobData.threadIds)];
  }

  return jobData.threadId ? [jobData.threadId] : [];
}
