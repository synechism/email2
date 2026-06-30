"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Database,
  LinkIcon,
  LogOut,
  Mail,
  Play,
  RefreshCw,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";

type DashboardData = {
  counts: {
    threads: number;
    emails: number;
  };
  kindCounts: Array<{ kind: string; count: number }>;
  grants: Array<{
    id: string;
    grantId: string;
    email: string | null;
    provider: string | null;
    status: string;
    scrapeStatus: string;
    nextCursor: string | null;
    backfillCompletedAt: string | null;
    lastScrapedAt: string | null;
    lastError: string | null;
    createdAt: string;
    latestRun: null | {
      id: string;
      status: string;
      pagesProcessed: number;
      messagesUpserted: number;
      threadsTouched: number;
      providerRequestCount: number;
      error: string | null;
      startedAt: string;
      finishedAt: string | null;
    };
  }>;
  recentThreads: Array<{
    id: string;
    subject: string | null;
    messageCount: number;
    latestMessageAt: string | null;
    latestSnippet: string | null;
    kind: string;
    kindConfidence: number;
  }>;
};

export function Dashboard({
  initialData,
  organization,
  user,
  flash,
}: {
  initialData: DashboardData;
  organization: { id: string; name: string; slug: string; role: string };
  user: { name: string; email: string };
  flash?: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [grantId, setGrantId] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const [manualPending, setManualPending] = useState(false);
  const [reclassifyPending, setReclassifyPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = data.grants.some((grant) => grant.scrapeStatus === "running");

  const kindTotal = useMemo(
    () => data.kindCounts.reduce((total, item) => total + Number(item.count), 0),
    [data.kindCounts],
  );

  async function refreshDashboard() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = (await response.json()) as DashboardData | { error: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Unable to refresh dashboard.");
      }

      setData(payload as DashboardData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to refresh dashboard.");
    } finally {
      setRefreshing(false);
    }
  }

  async function addManualGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setManualPending(true);

    try {
      const response = await fetch("/api/nylas/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grantId, email: grantEmail }),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to add grant.");
      }

      setGrantId("");
      setGrantEmail("");
      await refreshDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add grant.");
    } finally {
      setManualPending(false);
    }
  }

  async function runScrape(id: string) {
    setError(null);
    setData((current) => ({
      ...current,
      grants: current.grants.map((grant) => (grant.id === id ? { ...grant, scrapeStatus: "running" } : grant)),
    }));

    try {
      const response = await fetch(`/api/nylas/grants/${id}/scrape`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Scrape failed.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Scrape failed.");
    } finally {
      await refreshDashboard();
    }
  }

  async function reclassifyThreads() {
    setError(null);
    setReclassifyPending(true);

    try {
      const response = await fetch("/api/threads/reclassify", { method: "POST" });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to rejudge threads.");
      }

      await refreshDashboard();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to rejudge threads.");
    } finally {
      setReclassifyPending(false);
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.refresh();
  }

  useEffect(() => {
    if (!running) {
      return;
    }

    const interval = window.setInterval(refreshDashboard, 2500);
    return () => window.clearInterval(interval);
  }, [running]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Nylas v3 mailbox scraper</p>
          <h1>{organization.name}</h1>
        </div>
        <div className="topbar-actions">
          <span className="user-pill">
            <Building2 size={15} />
            {organization.role}
          </span>
          <span className="user-pill">{user.email}</span>
          <button className="icon-button" type="button" onClick={refreshDashboard} disabled={refreshing} title="Refresh">
            <RefreshCw size={17} />
          </button>
          <button className="icon-button" type="button" onClick={signOut} title="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {flash ? <div className="notice success">{flash}</div> : null}
      {error ? <div className="notice danger">{error}</div> : null}

      <section className="metric-strip" aria-label="Scrape totals">
        <Metric icon={<Mail size={18} />} label="Emails" value={data.counts.emails} />
        <Metric icon={<Database size={18} />} label="Threads" value={data.counts.threads} />
        <Metric icon={<CheckCircle2 size={18} />} label="Judged" value={kindTotal} />
      </section>

      <section className="connect-band">
        <div>
          <h2>Mailbox grants</h2>
          <p>{data.grants.length} connected</p>
        </div>
        <div className="connect-actions">
          <button className="secondary-button" type="button" onClick={reclassifyThreads} disabled={reclassifyPending}>
            <RefreshCw size={16} />
            {reclassifyPending ? "Rejudging" : "Rejudge all"}
          </button>
          <a className="primary-button" href="/api/nylas/connect">
            <LinkIcon size={16} />
            Connect with Nylas
          </a>
        </div>
      </section>

      <div className="work-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Manual grant</h2>
          </div>
          <form className="compact-form" onSubmit={addManualGrant}>
            <label>
              Grant ID
              <input value={grantId} onChange={(event) => setGrantId(event.target.value)} required />
            </label>
            <label>
              Email
              <input value={grantEmail} onChange={(event) => setGrantEmail(event.target.value)} type="email" />
            </label>
            <button className="secondary-button" type="submit" disabled={manualPending}>
              <Play size={15} />
              {manualPending ? "Scraping" : "Add and scrape"}
            </button>
          </form>
        </section>

        <section className="panel grants-panel">
          <div className="panel-heading">
            <h2>Scrape runs</h2>
          </div>
          <div className="grant-list">
            {data.grants.length === 0 ? (
              <div className="empty-row">No grants connected.</div>
            ) : (
              data.grants.map((grant) => (
                <article className="grant-row" key={grant.id}>
                  <div className={`status-rail ${statusTone(grant.scrapeStatus)}`} />
                  <div className="grant-main">
                    <div className="grant-title">
                      <strong>{grant.email ?? grant.grantId}</strong>
                      <span>{grant.provider ?? "provider unknown"}</span>
                    </div>
                    <div className="run-meta">
                      <span>{grant.scrapeStatus}</span>
                      <span>{grant.backfillCompletedAt ? "backfill complete" : grant.nextCursor ? "cursor saved" : "new"}</span>
                      <span>{grant.lastScrapedAt ? formatDate(grant.lastScrapedAt) : "not scraped"}</span>
                    </div>
                    {grant.latestRun ? (
                      <div className="run-counters">
                        <span>{grant.latestRun.pagesProcessed} pages</span>
                        <span>{grant.latestRun.messagesUpserted} emails</span>
                        <span>{grant.latestRun.threadsTouched} threads</span>
                        <span>{grant.latestRun.providerRequestCount} provider calls</span>
                      </div>
                    ) : null}
                    {grant.lastError ? (
                      <p className="row-error">
                        <AlertTriangle size={14} />
                        {grant.lastError}
                      </p>
                    ) : null}
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => runScrape(grant.id)}
                    disabled={grant.scrapeStatus === "running"}
                    title="Run scrape batch"
                  >
                    <Play size={16} />
                  </button>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="work-grid lower">
        <section className="panel">
          <div className="panel-heading">
            <h2>Thread kinds</h2>
          </div>
          <div className="kind-list">
            {data.kindCounts.length === 0 ? (
              <div className="empty-row">No judgments yet.</div>
            ) : (
              data.kindCounts.map((item) => (
                <div className="kind-row" key={item.kind}>
                  <span>{labelKind(item.kind)}</span>
                  <strong>{item.count}</strong>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel threads-panel">
          <div className="panel-heading">
            <h2>Recent threads</h2>
          </div>
          <div className="thread-list">
            {data.recentThreads.length === 0 ? (
              <div className="empty-row">No threads scraped.</div>
            ) : (
              data.recentThreads.map((thread) => (
                <article className="thread-row" key={thread.id}>
                  <div>
                    <div className="thread-title">
                      <strong>{thread.subject || "(no subject)"}</strong>
                      <span>{thread.messageCount} emails</span>
                    </div>
                    <p>{thread.latestSnippet || "No snippet"}</p>
                  </div>
                  <div className="kind-chip">
                    {labelKind(thread.kind)}
                    <span>{Math.round(thread.kindConfidence * 100)}%</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <div>
        <strong>{value.toLocaleString("en-US")}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function statusTone(status: string) {
  if (status === "completed") return "complete";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return "idle";
}

function labelKind(kind: string) {
  return kind
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  const date = new Date(value);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  const day = new Intl.DateTimeFormat("en-US", { day: "numeric" }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${month} ${day}, ${time}`;
}
