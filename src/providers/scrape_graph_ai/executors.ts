import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ScrapeGraphAiActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "scrape_graph_ai";
const scrapeGraphAiApiBaseUrl = "https://v2-api.scrapegraphai.com";
const scrapeGraphAiDefaultTimeoutMs = 60_000;

type ScrapeGraphAiRequestPhase = "validate" | "execute";
type ScrapeGraphAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ScrapeGraphAiRequestInput {
  apiKey: string;
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: ScrapeGraphAiRequestPhase;
}

export const scrapeGraphAiActionHandlers: Record<ScrapeGraphAiActionName, ScrapeGraphAiActionHandler> = {
  scrape(input, context) {
    return requestScrapeGraphAiJson({
      apiKey: context.apiKey,
      method: "POST",
      path: "/api/scrape",
      body: compactObject({ ...input }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  extract(input, context) {
    validateExtractInput(input);
    return requestScrapeGraphAiJson({
      apiKey: context.apiKey,
      method: "POST",
      path: "/api/extract",
      body: compactObject({ ...input }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  search(input, context) {
    if (input.schema != null && input.prompt == null) {
      throw new ProviderRequestError(400, "schema requires prompt");
    }
    return requestScrapeGraphAiJson({
      apiKey: context.apiKey,
      method: "POST",
      path: "/api/search",
      body: compactObject({ ...input }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  list_history(input, context) {
    return requestScrapeGraphAiJson({
      apiKey: context.apiKey,
      path: "/api/history",
      query: compactObject({
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
        service: optionalString(input.service),
      }),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  get_history(input, context) {
    return requestScrapeGraphAiJson({
      apiKey: context.apiKey,
      path: `/api/history/${encodeURIComponent(String(input.id))}`,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  get_credits(_input, context) {
    return requestScrapeGraphAiJson({
      apiKey: context.apiKey,
      path: "/api/credits",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, scrapeGraphAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const payload = await requestScrapeGraphAiJson({
      apiKey,
      path: "/api/credits",
      fetcher,
      signal,
      phase: "validate",
    });
    const credits = optionalRecord(payload);
    return {
      profile: {
        accountId: "scrapegraphai-api-key",
        displayName: "ScrapeGraphAI API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: scrapeGraphAiApiBaseUrl,
        validationEndpoint: "/api/credits",
        plan: optionalString(credits?.plan),
        remaining: optionalInteger(credits?.remaining),
        used: optionalInteger(credits?.used),
      }),
    };
  },
};

async function requestScrapeGraphAiJson(input: ScrapeGraphAiRequestInput): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), scrapeGraphAiDefaultTimeoutMs);
  const signal = mergeAbortSignals(controller.signal, input.signal);
  try {
    const response = await input.fetcher(buildScrapeGraphAiUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildScrapeGraphAiHeaders(input),
      body: input.method === "POST" ? JSON.stringify(input.body ?? {}) : undefined,
      signal,
    });
    const payload = await readScrapeGraphAiPayload(response);
    if (!response.ok) {
      throw createScrapeGraphAiError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, "ScrapeGraphAI request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ScrapeGraphAI request failed: ${error.message}` : "ScrapeGraphAI request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildScrapeGraphAiHeaders(input: ScrapeGraphAiRequestInput): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "SGAI-APIKEY": input.apiKey,
  };
  if (input.method === "POST") {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function buildScrapeGraphAiUrl(path: string, query?: Record<string, string | number | undefined>): URL {
  const url = new URL(path, scrapeGraphAiApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readScrapeGraphAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ScrapeGraphAI returned invalid JSON");
  }
}

function createScrapeGraphAiError(
  response: Response,
  payload: unknown,
  phase: ScrapeGraphAiRequestPhase,
): ProviderRequestError {
  const upstream = extractScrapeGraphAiError(payload);
  const message = upstream.message ?? `ScrapeGraphAI request failed with status ${response.status}`;
  if (response.status === 429 || upstream.type === "rate_limited") {
    return new ProviderRequestError(429, message, upstream.details);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, upstream.details);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, upstream.details);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status === 402 ? 502 : response.status, message, upstream.details);
  }
  return new ProviderRequestError(502, message, upstream.details);
}

function extractScrapeGraphAiError(payload: unknown): {
  type?: string;
  message?: string;
  details?: unknown;
} {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return {
    type: optionalString(error?.type),
    message: optionalString(error?.message),
    details: error?.details,
  };
}

function validateExtractInput(input: Record<string, unknown>): void {
  const sourceCount = ["url", "html", "markdown"].filter((key) => input[key] != null).length;
  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "exactly one of url, html, or markdown is required");
  }
}

function mergeAbortSignals(timeoutSignal: AbortSignal, contextSignal: AbortSignal | undefined): AbortSignal {
  if (!contextSignal) {
    return timeoutSignal;
  }
  if (contextSignal.aborted) {
    return contextSignal;
  }
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  timeoutSignal.addEventListener("abort", abort, { once: true });
  contextSignal.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://v2-api.scrapegraphai.com",
  auth: { type: "api_key_header", name: "sgai-apikey" },
});
