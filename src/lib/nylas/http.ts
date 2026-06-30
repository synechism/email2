import { env, requireNylasEnv } from "@/lib/env";
import type { NylasGrantProfile, NylasListMessagesResult, NylasSelectedMessage } from "@/lib/nylas/types";

type QueryValue = string | number | boolean | null | undefined;

const MESSAGE_SELECT = [
  "id",
  "thread_id",
  "subject",
  "date",
  "from",
  "to",
  "cc",
  "bcc",
  "reply_to",
  "snippet",
  "unread",
  "starred",
  "folders",
  "attachments",
].join(",");

class NylasRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = "NylasRequestError";
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
  const { apiUri } = requireNylasEnv();
  const url = new URL(`${apiUri}${path}`);

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

async function nylasRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    query?: Record<string, QueryValue>;
    body?: Record<string, unknown>;
  } = {},
) {
  const { apiKey } = requireNylasEnv();
  const method = options.method ?? "GET";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(buildUrl(path, options.query), {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) {
      await wait(retryDelayMs(response, attempt));
      continue;
    }

    const payload = await parseJson(response);

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload && "error" in payload
          ? JSON.stringify((payload as { error: unknown }).error)
          : `Nylas request failed with status ${response.status}`;
      throw new NylasRequestError(message, response.status, payload);
    }

    return {
      payload: payload as T,
      headers: response.headers,
    };
  }

  throw new NylasRequestError("Nylas request exceeded retry attempts.", 429, null);
}

function responseData<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }

  return payload as T;
}

function providerRequestCount(headers: Headers) {
  const raw = headers.get("nylas-provider-request-count");
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildHostedOAuthUrl(state: string, provider?: string | null) {
  const { apiUri, clientId, redirectUri } = requireNylasEnv();
  const url = new URL(`${apiUri}/v3/connect/auth`);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  if (provider) {
    url.searchParams.set("provider", provider);
  }

  if (env.NYLAS_OAUTH_SCOPES) {
    url.searchParams.set("scope", env.NYLAS_OAUTH_SCOPES);
  }

  return url.toString();
}

export async function exchangeCodeForGrant(code: string) {
  const { apiKey, clientId, redirectUri } = requireNylasEnv();
  const { payload } = await nylasRequest<Record<string, unknown>>("/v3/connect/token", {
    method: "POST",
    body: {
      client_id: clientId,
      client_secret: apiKey,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    },
  });

  return normalizeGrantProfile(responseData<Record<string, unknown>>(payload));
}

export async function getGrantProfile(grantId: string) {
  const { payload } = await nylasRequest<Record<string, unknown>>(`/v3/grants/${encodeURIComponent(grantId)}`);
  return normalizeGrantProfile({
    ...responseData<Record<string, unknown>>(payload),
    grant_id: grantId,
  });
}

export async function listGrantMessages(grantId: string, cursor: string | null) {
  const { payload, headers } = await nylasRequest<{
    data?: NylasSelectedMessage[];
    next_cursor?: string;
    nextCursor?: string;
    request_id?: string;
    requestId?: string;
  }>(`/v3/grants/${encodeURIComponent(grantId)}/messages`, {
    query: {
      limit: env.NYLAS_SCRAPE_PAGE_SIZE,
      page_token: cursor,
      select: MESSAGE_SELECT,
      fields: "standard",
    },
  });

  const data = responseData<NylasSelectedMessage[] | { items?: NylasSelectedMessage[]; next_cursor?: string; nextCursor?: string }>(
    payload,
  );

  const messages = Array.isArray(data) ? data : data.items ?? [];
  const nextCursor =
    (Array.isArray(data) ? payload.next_cursor ?? payload.nextCursor : data.next_cursor ?? data.nextCursor) ?? null;

  return {
    messages,
    nextCursor,
    requestId: payload.request_id ?? payload.requestId,
    providerRequestCount: providerRequestCount(headers),
  } satisfies NylasListMessagesResult;
}

function normalizeGrantProfile(payload: Record<string, unknown>): NylasGrantProfile {
  const grantId = String(payload.grant_id ?? payload.grantId ?? payload.id ?? "");

  if (!grantId) {
    throw new NylasRequestError("Nylas response did not include a grant ID.", 502, payload);
  }

  return {
    grantId,
    email: typeof payload.email === "string" ? payload.email : undefined,
    provider: typeof payload.provider === "string" ? payload.provider : undefined,
  };
}
