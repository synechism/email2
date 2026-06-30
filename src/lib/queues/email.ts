import { Job, Queue } from "bullmq";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { emailThread } from "@/db/schema";
import { env } from "@/lib/env";

export const EMAIL_DISCOVERY_QUEUE = "email-discovery";
export const EMAIL_CLASSIFICATION_QUEUE = "email-classification";

export type EmailDiscoveryJobData = {
  mailboxId: string;
  pagesRemaining?: number;
};

export type EmailClassificationJobData = {
  organizationId: string;
  threadId?: string;
  threadIds?: string[];
};

type QueueGlobals = {
  emailDiscoveryQueue?: Queue<EmailDiscoveryJobData>;
  emailClassificationQueue?: Queue<EmailClassificationJobData>;
};

type EmailQueueCounts = ReturnType<typeof emptyQueueCounts> & {
  unavailable?: boolean;
};

const globalForQueues = globalThis as typeof globalThis & QueueGlobals;

export function redisConnectionOptions() {
  const url = new URL(env.REDIS_URL);

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
}

export function getEmailDiscoveryQueue() {
  globalForQueues.emailDiscoveryQueue ??= new Queue<EmailDiscoveryJobData>(EMAIL_DISCOVERY_QUEUE, {
    connection: redisConnectionOptions(),
    defaultJobOptions: defaultJobOptions(),
  });

  return globalForQueues.emailDiscoveryQueue;
}

export function getEmailClassificationQueue() {
  globalForQueues.emailClassificationQueue ??= new Queue<EmailClassificationJobData>(EMAIL_CLASSIFICATION_QUEUE, {
    connection: redisConnectionOptions(),
    defaultJobOptions: defaultJobOptions(),
  });

  return globalForQueues.emailClassificationQueue;
}

export async function enqueueEmailDiscoveryJob(data: EmailDiscoveryJobData) {
  return getEmailDiscoveryQueue().add("discover-mailbox", data);
}

export async function enqueueThreadClassificationJobs(organizationId: string, threadIds: string[]) {
  const uniqueThreadIds = [...new Set(threadIds)];

  if (uniqueThreadIds.length === 0) {
    return [];
  }

  const chunks = chunk(uniqueThreadIds, env.EMAIL_CLASSIFICATION_JOB_BATCH_SIZE);

  return getEmailClassificationQueue().addBulk(
    chunks.map((threadIds) => ({
      name: "classify-thread-batch",
      data: {
        organizationId,
        threadIds,
      },
    })),
  );
}

export async function enqueueOrganizationClassificationJobs(organizationId: string) {
  const threadRows = await db.select({ id: emailThread.id }).from(emailThread).where(eq(emailThread.organizationId, organizationId));
  const threadIds = threadRows.map((thread) => thread.id);

  await enqueueThreadClassificationJobs(organizationId, threadIds);

  return {
    threadsQueued: threadIds.length,
  };
}

export async function removeMailboxQueueJobs({
  mailboxId,
  threadIds,
}: {
  mailboxId: string;
  threadIds: string[];
}) {
  const deletedThreadIds = new Set(threadIds);
  const discoveryJobsRemoved = await removeMatchingJobs(getEmailDiscoveryQueue(), (job) => {
    return job.data.mailboxId === mailboxId;
  });
  const classificationJobsRemoved = await removeMatchingJobs(getEmailClassificationQueue(), (job) => {
    const jobThreadIds = classificationJobThreadIds(job.data);

    return jobThreadIds.length > 0 && jobThreadIds.every((threadId) => deletedThreadIds.has(threadId));
  });

  return {
    discoveryJobsRemoved,
    classificationJobsRemoved,
  };
}

export async function getEmailQueueCounts() {
  const [discovery, classification] = await Promise.all([
    getEmailDiscoveryQueue().getJobCounts("waiting", "active", "delayed", "failed"),
    getEmailClassificationQueue().getJobCounts("waiting", "active", "delayed", "failed"),
  ]);

  return {
    discovery: normalizeCounts(discovery),
    classification: normalizeCounts(classification),
  };
}

export async function getEmailQueueCountsSafe() {
  try {
    return await Promise.race([
      getEmailQueueCounts(),
      new Promise<EmailQueueCounts>((resolve) =>
        setTimeout(() => resolve({ ...emptyQueueCounts(), unavailable: true }), 500),
      ),
    ]);
  } catch {
    return { ...emptyQueueCounts(), unavailable: true };
  }
}

async function removeMatchingJobs<T>(queue: Queue<T>, predicate: (job: Job<T>) => boolean | Promise<boolean>) {
  const jobs = await queue.getJobs(["waiting", "delayed", "failed", "paused"], 0, -1, false);
  let removed = 0;

  for (const job of jobs) {
    if (await predicate(job)) {
      await job.remove();
      removed += 1;
    }
  }

  return removed;
}

function classificationJobThreadIds(data: EmailClassificationJobData) {
  if (data.threadIds?.length) {
    return data.threadIds;
  }

  return data.threadId ? [data.threadId] : [];
}

function defaultJobOptions() {
  return {
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 2_000,
    },
    removeOnComplete: {
      age: 60 * 60,
      count: 1_000,
    },
    removeOnFail: {
      age: 24 * 60 * 60,
      count: 1_000,
    },
  };
}

function normalizeCounts(counts: Record<string, number>) {
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    delayed: counts.delayed ?? 0,
    failed: counts.failed ?? 0,
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function emptyQueueCounts() {
  return {
    discovery: {
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
    },
    classification: {
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
    },
  };
}
