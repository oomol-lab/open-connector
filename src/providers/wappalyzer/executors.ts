import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { WappalyzerActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "wappalyzer";
const wappalyzerApiBaseUrl = "https://api.wappalyzer.com/v2/";
const wappalyzerDefaultTimeoutMs = 30_000;

interface WappalyzerJsonResponse {
  payload: unknown;
  creditHeaders: {
    spent: number | null;
    remaining: number | null;
  };
}

export const wappalyzerActionHandlers: Record<WappalyzerActionName, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  get_credits_balance(_input, context) {
    return getCreditsBalance(context);
  },
  lookup_technologies(input, context) {
    return lookupTechnologies(input, context);
  },
  find_subdomains(input, context) {
    return findSubdomains(input, context);
  },
  verify_email(input, context) {
    return verifyEmail(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, wappalyzerActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const response = await requestWappalyzerJson({
      apiKey: input.apiKey,
      path: "credits/balance",
      fetcher,
      signal,
      phase: "validate",
    });
    const payload = readProviderObject(response.payload, "credits balance response");
    const credits = readRequiredInteger(payload.credits, "credits");
    return {
      profile: {
        accountId: "wappalyzer:api-key",
        displayName: "Wappalyzer API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/credits/balance",
        credits,
        creditsRemaining: response.creditHeaders.remaining,
      },
    };
  },
};

async function getCreditsBalance(context: ApiKeyProviderContext): Promise<unknown> {
  const response = await requestWappalyzerJson({
    apiKey: context.apiKey,
    path: "credits/balance",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    credits: readRequiredInteger(readProviderObject(response.payload, "credits balance response").credits, "credits"),
    creditHeaders: response.creditHeaders,
  };
}

async function lookupTechnologies(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const response = await requestWappalyzerJson({
    apiKey: context.apiKey,
    path: "lookup",
    query: compactObject({
      urls: stringifyStringArray(input.urls),
      recursive: "false",
      live: stringifyOptionalBoolean(optionalBoolean(input.live)),
      sets: stringifyOptionalStringArray(input.sets),
      denoise: stringifyOptionalBoolean(optionalBoolean(input.denoise)),
      min_age: stringifyOptionalNumber(optionalInteger(input.minAge)),
      max_age: stringifyOptionalNumber(optionalInteger(input.maxAge)),
      squash: stringifyOptionalBoolean(optionalBoolean(input.squash)),
    }) as Record<string, string | undefined>,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    results: readObjectArray(response.payload, "lookup response").map(normalizeLookupItem),
    creditHeaders: response.creditHeaders,
  };
}

async function findSubdomains(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const limit = optionalInteger(input.limit);
  if (limit !== undefined && limit % 10 !== 0) {
    throw new ProviderRequestError(400, "limit must be a multiple of 10");
  }

  const response = await requestWappalyzerJson({
    apiKey: context.apiKey,
    path: "subdomains",
    query: compactObject({
      domains: stringifyStringArray(input.domains),
      limit: stringifyOptionalNumber(limit),
      after: optionalString(input.after),
    }) as Record<string, string | undefined>,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    results: readObjectArray(response.payload, "subdomains response").map(normalizeSubdomainResult),
    creditHeaders: response.creditHeaders,
  };
}

async function verifyEmail(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const response = await requestWappalyzerJson({
    apiKey: context.apiKey,
    path: "verify",
    query: {
      email: optionalString(input.email),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return {
    result: readProviderObject(response.payload, "verify response"),
    creditHeaders: response.creditHeaders,
  };
}

async function requestWappalyzerJson(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
}): Promise<WappalyzerJsonResponse> {
  const timeout = createProviderTimeout(input.signal, wappalyzerDefaultTimeoutMs);
  try {
    const response = await input.fetcher(buildWappalyzerUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readWappalyzerPayload(response);
    if (!response.ok) {
      throw createWappalyzerError(response, payload, input.phase);
    }
    return {
      payload,
      creditHeaders: readCreditHeaders(response.headers),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Wappalyzer request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Wappalyzer request failed: ${error.message}` : "Wappalyzer request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildWappalyzerUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, wappalyzerApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readWappalyzerPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Wappalyzer returned invalid JSON");
  }
}

function createWappalyzerError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? (response.statusText || "Wappalyzer request failed");
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "error", "detail"]) {
    const value = optionalString(record[key]);
    if (value?.trim()) {
      return value;
    }
  }
  const errors = record.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim());
    return first as string | undefined;
  }
  return undefined;
}

function readCreditHeaders(headers: Headers): WappalyzerJsonResponse["creditHeaders"] {
  return {
    spent: readNullableIntegerHeader(headers, "wappalyzer-credits-spent"),
    remaining: readNullableIntegerHeader(headers, "wappalyzer-credits-remaining"),
  };
}

function readNullableIntegerHeader(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function normalizeLookupItem(value: Record<string, unknown>): Record<string, unknown> {
  if (value.crawl === true) {
    throw new ProviderRequestError(
      502,
      "Wappalyzer returned a pending asynchronous crawl result; use cached or non-recursive lookup inputs",
    );
  }
  return compactObject({
    url: readRequiredString(value.url, "url"),
    technologies: Array.isArray(value.technologies)
      ? value.technologies.map((item) => readProviderObject(item, "technology item"))
      : [],
    technologySpend: optionalString(value.technologySpend),
    trafficLevel: optionalString(value.trafficLevel),
    errors: Array.isArray(value.errors) ? value.errors.map((item) => String(item)) : undefined,
  });
}

function normalizeSubdomainResult(value: Record<string, unknown>): Record<string, unknown> {
  return {
    domain: readRequiredString(value.domain, "domain"),
    subdomains: readProviderObject(value.subdomains, "subdomains map"),
    moreAfter: optionalString(value.moreAfter) ?? null,
  };
}

function readObjectArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Wappalyzer ${label} was not an array`);
  }
  return value.map((item) => readProviderObject(item, `${label} item`));
}

function readProviderObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Wappalyzer ${label} was not an object`);
  }
  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, field: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `Wappalyzer response did not include ${field}`);
  }
  return stringValue;
}

function readRequiredInteger(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `Wappalyzer response did not include integer ${field}`);
  }
  return parsed;
}

function stringifyStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .join(",");
}

function stringifyOptionalStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map((item) => String(item).trim()).filter(Boolean);
  return items.length > 0 ? items.join(",") : undefined;
}

function stringifyOptionalBoolean(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function stringifyOptionalNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
