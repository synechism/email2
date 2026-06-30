import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { startEmailWorkers } = await import("@/workers/email");

const workers = startEmailWorkers();

console.log("[worker] Email discovery and classification workers started.");

async function shutdown() {
  console.log("[worker] Shutting down...");
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
