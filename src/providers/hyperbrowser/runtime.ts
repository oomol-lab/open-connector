import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const hyperbrowserApiBaseUrl = "https://api.hyperbrowser.ai";

const hyperbrowserDefaultRequestTimeoutMs = 60_000;
const hyperbrowserValidationUrl = "https://example.com";

type HyperbrowserRequestPhase = "validate" | "execute";
type HyperbrowserActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface HyperbrowserRequestInput {
  method: "GET" | "POST";
  path: string;
  apiKey: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: HyperbrowserRequestPhase;
}

export const hyperbrowserActionHandlers: ProviderActionHandlers<"hyperbrowser", HyperbrowserActionHandler> = {
  fetch_page: postAction("/api/web/fetch", buildDirectBody),
  search_web: postAction("/api/web/search", buildDirectBody),
  start_web_crawl: postAction("/api/web/crawl", buildDirectBody),
  get_web_crawl_status: getAction((input) => `/api/web/crawl/${encodeURIComponent(String(input.id))}/status`),
  get_web_crawl_results: getAction(
    (input) => `/api/web/crawl/${encodeURIComponent(String(input.id))}`,
    (input) =>
      compactObject({
        page: typeof input.page === "number" ? input.page : undefined,
        batchSize: typeof input.batchSize === "number" ? input.batchSize : undefined,
      }),
  ),
};

export async function validateHyperbrowserCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  await requestHyperbrowserJson({
    method: "POST",
    path: "/api/web/fetch",
    apiKey: input.apiKey,
    body: {
      url: hyperbrowserValidationUrl,
      outputs: {
        formats: ["markdown"],
      },
    },
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "hyperbrowser:api-key",
      displayName: "Hyperbrowser API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: hyperbrowserApiBaseUrl,
      validationEndpoint: "/api/web/fetch",
      validationUrl: hyperbrowserValidationUrl,
    },
  };
}

function postAction(
  path: string,
  buildBody: (input: Record<string, unknown>) => Record<string, unknown>,
): HyperbrowserActionHandler {
  return (input, context) =>
    requestHyperbrowserJson({
      method: "POST",
      path,
      body: buildBody(input),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
}

function getAction(
  buildPath: (input: Record<string, unknown>) => string,
  buildQuery?: (input: Record<string, unknown>) => Record<string, string | number | undefined>,
): HyperbrowserActionHandler {
  return (input, context) =>
    requestHyperbrowserJson({
      method: "GET",
      path: buildPath(input),
      query: buildQuery?.(input),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
}

function buildDirectBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({ ...input });
}

async function requestHyperbrowserJson(input: HyperbrowserRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, hyperbrowserDefaultRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(buildHyperbrowserUrl(input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Hyperbrowser request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Hyperbrowser request failed: ${error.message}` : "Hyperbrowser request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readHyperbrowserPayload(response);
  if (!response.ok) {
    throw createHyperbrowserError(response, payload, input.phase);
  }

  return payload;
}

function buildHyperbrowserUrl(path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(path, hyperbrowserApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readHyperbrowserPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Hyperbrowser returned invalid JSON");
  }
}

function createHyperbrowserError(
  response: Response,
  payload: unknown,
  phase: HyperbrowserRequestPhase,
): ProviderRequestError {
  const message =
    extractHyperbrowserErrorMessage(payload) ?? `Hyperbrowser request failed with status ${response.status}`;

  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status, message, payload);
}

function extractHyperbrowserErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const message = optionalString(record.message) ?? optionalString(record.error);
  if (message) {
    return message;
  }

  const details = optionalRecord(record.details);
  return optionalString(details?.message);
}
