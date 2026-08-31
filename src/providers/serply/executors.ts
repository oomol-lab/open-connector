import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalNumber, optionalRawString, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "serply";
const serplyBaseUrl = "https://api.serply.io";

type SerplyPhase = "validate" | "execute";

interface SerplyActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type SerplyActionHandler = (input: Record<string, unknown>, context: SerplyActionContext) => Promise<unknown>;

export const serplyActionHandlers: ProviderActionHandlers<"serply", SerplyActionHandler> = {
  async google_search(input, context): Promise<unknown> {
    const payload = await requestSerplyJson(
      "/v1/search",
      readRequiredQuery(input.query),
      buildSerplyHeaderOverrides(input),
      context,
      "execute",
    );
    return normalizeSearchLikePayload(payload);
  },
  async google_news_search(input, context): Promise<unknown> {
    const payload = requiredRecord(
      await requestSerplyJson(
        "/v1/news",
        readRequiredQuery(input.query),
        buildSerplyHeaderOverrides(input),
        context,
        "execute",
      ),
      "Serply news response",
      (message) => new ProviderRequestError(502, message),
    );

    return compactDefined({
      feed: requiredRecord(payload.feed, "Serply news feed", (message) => new ProviderRequestError(502, message)),
      entities: asOptionalArrayOfObjects(payload.entities),
    });
  },
  async google_video_search(input, context): Promise<unknown> {
    const payload = await requestSerplyJson(
      "/v1/video",
      readRequiredQuery(input.query),
      buildSerplyHeaderOverrides(input),
      context,
      "execute",
    );
    return normalizeSearchLikePayload(payload);
  },
  async google_scholar_search(input, context): Promise<unknown> {
    const payload = await requestSerplyJson(
      "/v1/scholar",
      readRequiredQuery(input.query),
      buildSerplyHeaderOverrides(input),
      context,
      "execute",
    );
    return normalizeSearchLikePayload(payload);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<SerplyActionContext>({
  service,
  handlers: serplyActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<SerplyActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: SerplyActionContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await requestSerplyJson("/v1/search", "q=serply", {}, context, "validate");
    const record = requiredRecord(
      payload,
      "Serply validation response",
      (message) => new ProviderRequestError(502, message),
    );

    return {
      profile: {
        accountId: "serply",
        displayName: "Serply API Key",
      },
      grantedScopes: [],
      metadata: compactDefined({
        validationEndpoint: "/v1/search/{query}",
        validationQuery: "q=serply",
        apiBaseUrl: serplyBaseUrl,
        total: optionalNumber(record.total),
        resultCount: Array.isArray(record.results) ? record.results.length : undefined,
      }),
    };
  },
};

async function requestSerplyJson(
  path: string,
  query: string,
  headerOverrides: Record<string, string>,
  context: SerplyActionContext,
  phase: SerplyPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  const timeout = createProviderTimeout(context.signal);

  try {
    response = await context.fetcher(buildSerplyUrl(path, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": context.apiKey,
        ...headerOverrides,
      },
      signal: timeout.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Serply request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Serply request failed: ${error.message}` : "Serply request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createSerplyError(response.status, payload, phase);
  }

  return payload;
}

function buildSerplyUrl(path: string, query: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedQuery = query.replace(/^\/+/, "").trim();
  return `${serplyBaseUrl}${normalizedPath}/${normalizedQuery}`;
}

function buildSerplyHeaderOverrides(input: Record<string, unknown>): Record<string, string> {
  const headers: Record<string, string> = {};
  const proxyLocation = optionalString(input.proxyLocation);
  if (proxyLocation) {
    headers["x-proxy-location"] = proxyLocation;
  }
  const userAgent = optionalString(input.userAgent);
  if (userAgent) {
    headers["x-user-agent"] = userAgent;
  }
  return headers;
}

function normalizeSearchLikePayload(payload: unknown): Record<string, unknown> {
  const record = requiredRecord(payload, "Serply search response", (message) => new ProviderRequestError(502, message));
  const answer = readNullableStringArray(record.answer) ?? readNullableStringArray(record.answers) ?? undefined;

  return compactDefined({
    results: asArrayOfObjects(record.results),
    total: readRequiredNumber(record.total, "total"),
    answer,
    ts: optionalNumber(record.ts),
    device_region: optionalRawString(record.device_region),
    device_type: optionalRawString(record.device_type),
  });
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Serply returned invalid JSON");
  }
}

function createSerplyError(status: number, payload: unknown, phase: SerplyPhase): ProviderRequestError {
  const message = extractSerplyMessage(payload) ?? `Serply request failed with ${status || 500}`;

  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, { status });
  }

  if (status === 401 && phase === "validate") {
    return new ProviderRequestError(400, message, { status });
  }

  if (status === 401) {
    return new ProviderRequestError(401, message, { status });
  }

  if (status === 403 || status === 429) {
    return new ProviderRequestError(429, message, { status });
  }

  return new ProviderRequestError(status || 500, message, { status });
}

function extractSerplyMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  const nestedError = optionalRecord(record?.error);
  return (
    optionalString(nestedError?.message) ??
    optionalString(nestedError?.code) ??
    optionalString(record?.message) ??
    optionalString(record?.detail)
  );
}

function readRequiredQuery(value: unknown): string {
  const query = optionalString(value);
  if (!query) {
    throw new ProviderRequestError(400, "query is required");
  }
  return query;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Serply response missing ${fieldName}`);
  }
  return value;
}

function asArrayOfObjects(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Serply response missing results");
  }

  return value.map((item) =>
    requiredRecord(item, "Serply result item", (message) => new ProviderRequestError(502, message)),
  );
}

function asOptionalArrayOfObjects(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) =>
    requiredRecord(item, "Serply entity item", (message) => new ProviderRequestError(502, message)),
  );
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function readNullableStringArray(value: unknown): string[] | null | undefined {
  if (value === null) {
    return null;
  }

  return readOptionalStringArray(value);
}

function compactDefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}
