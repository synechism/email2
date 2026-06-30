import { env, requireUnipileEnv } from "@/lib/env";
import type { UnipileAccountProfile, UnipileEmail, UnipileListEmailsResult } from "@/lib/unipile/types";

type QueryValue = string | number | boolean | null | undefined;

class UnipileRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = "UnipileRequestError";
  }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds)) {
      return Math.max(seconds * 1000, 250);
    }
  }

  return Math.min(8_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const { baseUrl } = requireUnipileEnv();
  const url = new URL(`${baseUrl}${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function parseJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

async function unipileRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, QueryValue>;
    body?: Record<string, unknown>;
  } = {},
) {
  const { accessToken } = requireUnipileEnv();
  const method = options.method ?? "GET";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(buildUrl(path, options.query), {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": accessToken,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) {
      await wait(retryDelayMs(response, attempt));
      continue;
    }

    const payload = await parseJson(response);

    if (!response.ok) {
      throw new UnipileRequestError(`Unipile request failed with status ${response.status}`, response.status, payload);
    }

    return payload as T;
  }

  throw new UnipileRequestError("Unipile request exceeded retry attempts.", 429, null);
}

export async function createHostedAuthLink(state: string) {
  const { baseUrl } = requireUnipileEnv();
  const successRedirectUrl = withState(env.UNIPILE_AUTH_SUCCESS_REDIRECT_URI, state);
  const failureRedirectUrl = withState(env.UNIPILE_AUTH_FAILURE_REDIRECT_URI, state);
  const notifyUrl = withState(env.UNIPILE_AUTH_NOTIFY_URI, state);
  const body: Record<string, unknown> = {
    type: "create",
    providers: hostedAuthProviders(),
    api_url: baseUrl,
    expiresOn: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    success_redirect_url: successRedirectUrl,
    failure_redirect_url: failureRedirectUrl,
    notify_url: notifyUrl,
    name: state,
    bypass_success_screen: true,
  };

  if (env.UNIPILE_GOOGLE_SCOPES) {
    body.google_scopes = env.UNIPILE_GOOGLE_SCOPES;
  }

  if (env.UNIPILE_MICROSOFT_SCOPES) {
    body.microsoft_scopes = env.UNIPILE_MICROSOFT_SCOPES;
  }

  const payload = await unipileRequest<{ object?: string; url?: string }>("/api/v1/hosted/accounts/link", {
    method: "POST",
    body,
  });

  if (!payload.url) {
    throw new UnipileRequestError("Unipile hosted auth response did not include a URL.", 502, payload);
  }

  return payload.url;
}

export async function getUnipileAccount(accountId: string) {
  const payload = await unipileRequest<Record<string, unknown>>(`/api/v1/accounts/${encodeURIComponent(accountId)}`);
  return normalizeAccountProfile(payload);
}

export async function listUnipileAccounts() {
  const accounts: UnipileAccountProfile[] = [];
  let cursor: string | null = null;

  while (true) {
    type AccountListResponse = { items?: Record<string, unknown>[]; cursor?: string | null };
    const response: AccountListResponse = await unipileRequest<AccountListResponse>("/api/v1/accounts", {
      query: {
        limit: 250,
        cursor: cursor ?? undefined,
      },
    });

    accounts.push(...(response.items ?? []).map(normalizeAccountProfile));
    cursor = response.cursor ?? null;

    if (!cursor) {
      break;
    }
  }

  return accounts;
}

export async function listUnipileEmails(accountId: string, cursor: string | null): Promise<UnipileListEmailsResult> {
  const payload = await unipileRequest<{ items?: UnipileEmail[]; cursor?: string | null }>("/api/v1/emails", {
    query: {
      account_id: accountId,
      limit: env.UNIPILE_SCRAPE_PAGE_SIZE,
      cursor,
      meta_only: false,
    },
  });

  return {
    emails: payload.items ?? [],
    nextCursor: payload.cursor ?? null,
  };
}

function normalizeAccountProfile(account: Record<string, unknown>): UnipileAccountProfile {
  const accountId = String(account.id ?? "");

  if (!accountId) {
    throw new UnipileRequestError("Unipile account response did not include an account ID.", 502, account);
  }

  return {
    accountId,
    email: findAccountEmail(account),
    provider: findAccountProvider(account),
    rawAccount: account,
    createdAt: parseDate(typeof account.created_at === "string" ? account.created_at : null),
  };
}

function hostedAuthProviders() {
  const value = env.UNIPILE_HOSTED_AUTH_PROVIDERS.trim();

  if (value.includes(",")) {
    return value
      .split(",")
      .map((provider) => provider.trim())
      .filter(Boolean);
  }

  return value;
}

function withState(rawUrl: string, state: string) {
  const url = new URL(rawUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

function findAccountEmail(account: Record<string, unknown>) {
  for (const key of ["email", "mail", "username", "name"]) {
    const value = account[key];

    if (typeof value === "string" && value.includes("@")) {
      return value;
    }
  }

  const connectionParams = asRecord(account.connection_params);
  const candidates = [
    connectionParams.email,
    connectionParams.username,
    asRecord(connectionParams.mail).email,
    asRecord(connectionParams.mail).username,
    asRecord(connectionParams.imap).email,
    asRecord(connectionParams.imap).username,
  ];

  return candidates.find((value): value is string => typeof value === "string" && value.includes("@"));
}

function findAccountProvider(account: Record<string, unknown>) {
  if (typeof account.type === "string") {
    return account.type.toLowerCase();
  }

  const sources = account.sources;

  if (Array.isArray(sources)) {
    const mailingSource = sources.find((source) => {
      const item = asRecord(source);
      return String(item.id ?? item.type ?? "").toLowerCase().includes("mail");
    });

    const source = asRecord(mailingSource);
    const value = source.type ?? source.id;

    if (typeof value === "string") {
      return value.toLowerCase();
    }
  }

  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
