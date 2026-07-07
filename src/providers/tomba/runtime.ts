import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { TombaActionName } from "./actions.ts";

import { compactObject, optionalIntegerLike, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const tombaApiBaseUrl: string = "https://api.tomba.io/v1";
const tombaDefaultRequestTimeoutMs = 30_000;

type TombaMode = "validate" | "execute";

interface TombaCredential {
  apiKey: string;
  apiSecret: string;
}

interface TombaActionContext {
  credential: TombaCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface TombaRequestInput {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  mode: TombaMode;
}

export const tombaActionHandlers: Record<TombaActionName, ProviderRuntimeHandler<TombaActionContext>> = {
  async get_account(_input, context) {
    const payload = await requestTombaJson({ method: "GET", path: "/me", mode: "execute" }, context);
    return normalizeAccount(payload);
  },
  domain_search(input, context) {
    return requestTombaRaw(
      {
        method: "GET",
        path: "/domain-search",
        query: { domain: input.domain, page: input.page, limit: input.limit },
        mode: "execute",
      },
      context,
    );
  },
  email_finder(input, context) {
    return requestTombaRaw(
      {
        method: "GET",
        path: "/email-finder",
        query: { domain: input.domain, first_name: input.firstName, last_name: input.lastName },
        mode: "execute",
      },
      context,
    );
  },
  email_verifier(input, context) {
    return requestTombaRaw(
      { method: "GET", path: "/email-verifier", query: { email: input.email }, mode: "execute" },
      context,
    );
  },
  email_sources(input, context) {
    return requestTombaRaw(
      { method: "GET", path: "/email-sources", query: { email: input.email }, mode: "execute" },
      context,
    );
  },
  email_count(input, context) {
    return requestTombaRaw(
      { method: "GET", path: "/email-count", query: { domain: input.domain }, mode: "execute" },
      context,
    );
  },
  technology(input, context) {
    return requestTombaRaw(
      { method: "GET", path: "/technology", query: { domain: input.domain }, mode: "execute" },
      context,
    );
  },
  linkedin(input, context) {
    return requestTombaRaw({ method: "GET", path: "/linkedin", query: { url: input.url }, mode: "execute" }, context);
  },
  enrich(input, context) {
    return requestTombaRaw({ method: "GET", path: "/enrich", query: { email: input.email }, mode: "execute" }, context);
  },
  search_companies(input, context) {
    if (!hasNonEmptyString(input.query) && !hasNonEmptyObject(input.filters)) {
      throw new ProviderRequestError(400, "query or non-empty filters must be provided");
    }
    return requestTombaRaw(
      {
        method: "POST",
        path: "/reveal/search",
        body: compactObject({
          query: readNonEmptyString(input.query),
          filters: optionalRecord(input.filters),
          page: input.page,
        }),
        mode: "execute",
      },
      context,
    );
  },
};

export async function validateTombaCredential(
  credential: { apiKey: string; apiSecret?: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const resolved = readTombaCredential(credential);
  const payload = await requestTombaJson(
    { method: "GET", path: "/me", mode: "validate" },
    { credential: resolved, fetcher, signal },
  );
  const account = normalizeAccount(payload);
  return {
    profile: {
      accountId: account.email ?? String(account.userId ?? "tomba_api_key"),
      displayName: account.email ?? "Tomba API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/me",
      apiBaseUrl: tombaApiBaseUrl,
      email: account.email ?? undefined,
      userId: account.userId ?? undefined,
      planName: account.planName ?? undefined,
    }),
  };
}

async function requestTombaRaw(
  input: TombaRequestInput,
  context: TombaActionContext,
): Promise<{ raw: Record<string, unknown> }> {
  return { raw: await requestTombaJson(input, context) };
}

async function requestTombaJson(
  input: TombaRequestInput,
  context: TombaActionContext,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, tombaDefaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildTombaUrl(input), {
      method: input.method,
      headers: buildTombaHeaders(context.credential, Boolean(input.body)),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readTombaPayload(response);
    if (!response.ok) {
      throw createTombaError(response.status, payload, input.mode);
    }
    const payloadObject = optionalRecord(payload);
    if (!payloadObject) {
      throw new ProviderRequestError(502, "Tomba returned an invalid payload");
    }
    return payloadObject;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Tomba request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tomba request failed: ${error.message}` : "Tomba request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildTombaUrl(input: TombaRequestInput): URL {
  const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, `${tombaApiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }
  return url;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue(url, key, item);
    return;
  }
  url.searchParams.append(key, String(value));
}

function buildTombaHeaders(credential: TombaCredential, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-tomba-key": credential.apiKey,
    "x-tomba-secret": credential.apiSecret,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

async function readTombaPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTombaError(status: number, payload: unknown, mode: TombaMode): ProviderRequestError {
  const message = extractTombaErrorMessage(payload) ?? `Tomba request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (mode === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (mode === "execute" && (status === 401 || status === 403))
    return new ProviderRequestError(status, message, payload);
  if (mode === "execute" && (status === 400 || status === 404 || status === 422))
    return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractTombaErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const errors = optionalRecord(record.errors);
  return readNonEmptyString(errors?.message) ?? readNonEmptyString(record.message) ?? readNonEmptyString(record.error);
}

function normalizeAccount(payload: Record<string, unknown>): {
  email: string | null;
  userId: number | null;
  planName: string | null;
  raw: Record<string, unknown>;
} {
  const data = optionalRecord(payload.data) ?? {};
  return {
    email: readNullableString(data.email),
    userId: readOptionalInteger(data.user_id),
    planName: readNullableString(optionalRecord(data.pricing)?.name),
    raw: payload,
  };
}

function readTombaCredential(input: { apiKey?: string; apiSecret?: string }): TombaCredential {
  const apiKey = readNonEmptyString(input.apiKey);
  const apiSecret = readNonEmptyString(input.apiSecret);
  if (!apiKey) throw new ProviderRequestError(400, "apiKey is required");
  if (!apiSecret) throw new ProviderRequestError(400, "apiSecret is required");
  return { apiKey, apiSecret };
}

function readOptionalInteger(value: unknown): number | null {
  const parsed = optionalIntegerLike(value, "integer", () => new ProviderRequestError(400, "integer is invalid"));
  return parsed ?? null;
}

function readNonEmptyString(value: unknown): string | undefined {
  const resolved = optionalString(value);
  return resolved && resolved.trim() !== "" ? resolved.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  if (value === null) return null;
  return readNonEmptyString(value) ?? null;
}

function hasNonEmptyString(value: unknown): boolean {
  return readNonEmptyString(value) !== undefined;
}

function hasNonEmptyObject(value: unknown): boolean {
  const object = optionalRecord(value);
  return object !== undefined && Object.keys(object).length > 0;
}
