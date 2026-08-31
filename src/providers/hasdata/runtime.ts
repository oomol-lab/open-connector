import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredRecord, stringArray } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortSignalError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

type HasdataActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const hasdataApiBaseUrl = "https://api.hasdata.com";

const hasdataWebScrapePath = "/scrape/web";
const hasdataGoogleSerpPath = "/scrape/google/serp";
const hasdataDefaultRequestTimeoutMs = 300_000;
const maxNonJsonErrorMessageLength = 300;

export const hasdataActionHandlers: ProviderActionHandlers<"hasdata", HasdataActionHandler> = {
  async scrape_web(input, context) {
    return {
      payload: await requestHasdataJson({
        path: hasdataWebScrapePath,
        init: {
          method: "POST",
          body: JSON.stringify(buildWebScrapeBody(input)),
        },
        context,
      }),
    };
  },
  async search_google_serp(input, context) {
    return {
      payload: await requestHasdataJson({
        path: buildGoogleSerpPath(input),
        init: { method: "GET" },
        context,
      }),
    };
  },
};

async function requestHasdataJson(input: {
  path: string;
  init: RequestInit;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
}): Promise<Record<string, unknown>> {
  input.context.signal?.throwIfAborted();
  const timeout = createProviderTimeout(input.context.signal, hasdataDefaultRequestTimeoutMs);

  try {
    const response = await input.context.fetcher(new URL(input.path, hasdataApiBaseUrl), {
      ...input.init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
        ...input.init.headers,
      },
      signal: timeout.signal,
    });
    const payload = await readJsonResponse(response, "HasData response");
    if (!response.ok) {
      throw createHasdataError(response.status, payload);
    }
    return requireRecordPayload(payload, "HasData response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "HasData request timed out", error);
    }
    if (isAbortSignalError(input.context.signal, error)) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `HasData request failed: ${error.message}` : "HasData request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildWebScrapeBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: readRequiredString(input.url, "url"),
    outputFormat: normalizeWebScrapeOutputFormat(input.outputFormat),
    proxyType: optionalString(input.proxyType),
    proxyCountry: optionalString(input.proxyCountry),
    extractRules: readOptionalStringRecord(input.extractRules, "extractRules"),
    aiExtractRules: readOptionalJsonRecord(input.aiExtractRules, "aiExtractRules"),
    screenshot: readOptionalBoolean(input.screenshot),
    extractEmails: readOptionalBoolean(input.extractEmails),
    extractLinks: readOptionalBoolean(input.extractLinks),
    wait: readOptionalNumber(input.wait),
    waitFor: optionalString(input.waitFor),
    blockResources: readOptionalBoolean(input.blockResources),
    blockAds: readOptionalBoolean(input.blockAds),
    blockUrls: readOptionalStringArray(input.blockUrls, "blockUrls"),
    jsRendering: readOptionalBoolean(input.jsRendering),
    jsScenario: readOptionalJsonArray(input.jsScenario, "jsScenario"),
    headers: readOptionalStringRecord(input.headers, "headers"),
  });
}

function buildGoogleSerpPath(input: Record<string, unknown>): string {
  const url = new URL(hasdataGoogleSerpPath, hasdataApiBaseUrl);
  const tbm = optionalString(input.tbm);
  const start = readOptionalNumber(input.start);
  if (tbm === "lcl" && start !== undefined && start % 20 !== 0) {
    throw new ProviderRequestError(400, "start must be a multiple of 20 when tbm is lcl");
  }

  const query = compactObject({
    q: readRequiredString(input.q, "q"),
    location: optionalString(input.location),
    uule: optionalString(input.uule),
    domain: optionalString(input.domain),
    gl: optionalString(input.gl),
    hl: optionalString(input.hl),
    lr: optionalString(input.lr),
    tbs: optionalString(input.tbs),
    safe: optionalString(input.safe),
    filter: readOptionalNumber(input.filter),
    nfpr: readOptionalNumber(input.nfpr),
    start,
    num: readOptionalNumber(input.num),
    tbm,
    deviceType: optionalString(input.deviceType),
    ludocid: optionalString(input.ludocid),
    lsig: optionalString(input.lsig),
    kgmid: optionalString(input.kgmid),
    si: optionalString(input.si),
  });

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

function normalizeWebScrapeOutputFormat(value: unknown): string[] {
  const outputFormat = readOptionalStringArray(value, "outputFormat");
  if (outputFormat === undefined) {
    return ["json"];
  }
  return outputFormat.includes("json") ? outputFormat : ["json", ...outputFormat];
}

async function readJsonResponse(response: Response, label: string): Promise<unknown> {
  const payload = await readProviderJsonBody(response, {
    emptyBody: undefined,
    invalidJsonMessage: `${label} returned invalid JSON`,
  });
  if (payload === undefined) {
    throw new ProviderRequestError(502, `${label} returned an empty body`);
  }
  return payload;
}

function requireRecordPayload(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be a JSON object`, payload);
  }
  return record;
}

function createHasdataError(status: number, payload: unknown): ProviderRequestError {
  const message = extractHasdataErrorMessage(payload) ?? `HasData request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 400) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractHasdataErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
  if (message) {
    return message;
  }

  const serialized = JSON.stringify(payload);
  if (serialized && serialized.length <= maxNonJsonErrorMessageLength) {
    return serialized;
  }
  return serialized ? `${serialized.slice(0, maxNonJsonErrorMessageLength)}...` : undefined;
}

function readRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return stringArray(value, fieldName, providerInputError);
}

function readOptionalStringRecord(value: unknown, fieldName: string): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = requiredRecord(value, fieldName, providerInputError);
  const output: Record<string, string> = {};
  for (const [key, child] of Object.entries(record)) {
    output[key] = String(child);
  }
  return output;
}

function readOptionalJsonRecord(value: unknown, fieldName: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function readOptionalJsonArray(value: unknown, fieldName: string): unknown[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value;
}
