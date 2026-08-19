import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "scrape_do";
const scrapeDoApiBaseUrl = "https://api.scrape.do";
const scrapeDoInfoUrl = `${scrapeDoApiBaseUrl}/info`;
const scrapeDoDefaultTimeoutMs = 130_000;

type ScrapeDoPhase = "validate" | "execute";
type ScrapeDoQueryValue = string | number | boolean | undefined;
type ScrapeDoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const scrapeDoActionHandlers: ProviderActionHandlers<"scrape_do", ScrapeDoActionHandler> = {
  fetch_html(input, context) {
    return requestScrapeDoContent(input, context, {
      returnJSON: undefined,
      screenShot: undefined,
      fullScreenShot: undefined,
    });
  },
  fetch_json(input, context) {
    return requestScrapeDoJson(input, context);
  },
  take_screenshot(input, context) {
    return requestScrapeDoScreenshot(input, context);
  },
  async get_account_info(_input, context) {
    return {
      account: await requestScrapeDoAccount(context.apiKey, context.fetcher, context.signal, "execute"),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, scrapeDoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const account = await requestScrapeDoAccount(apiKey, fetcher, signal, "validate");
    return {
      profile: {
        accountId: "scrape_do",
        displayName: "Scrape.do API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: scrapeDoApiBaseUrl,
        validationEndpoint: "/info",
        isActive: account.is_active,
        concurrentRequest: account.concurrent_request,
        maxMonthlyRequest: account.max_monthly_request,
        remainingConcurrentRequest: account.remaining_concurrent_request,
        remainingMonthlyRequest: account.remaining_monthly_request,
      }),
    };
  },
};

async function requestScrapeDoContent(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  forcedQuery: Record<string, ScrapeDoQueryValue>,
): Promise<Record<string, unknown>> {
  const response = await requestScrapeDoRaw(
    buildScrapeDoUrl({
      apiKey: context.apiKey,
      query: {
        ...buildCommonScrapeDoQuery(input),
        ...forcedQuery,
      },
    }),
    input,
    context,
    "execute",
  );
  return {
    content: await response.text(),
    statusCode: response.status,
    headers: responseHeadersToObject(response.headers),
    metadata: buildResponseMetadata(response),
  };
}

async function requestScrapeDoJson(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const response = await requestScrapeDoRaw(
    buildScrapeDoUrl({
      apiKey: context.apiKey,
      query: {
        ...buildCommonScrapeDoQuery(input),
        returnJSON: true,
        showFrames: optionalBoolean(input.showFrames),
        showWebsocketRequests: optionalBoolean(input.showWebsocketRequests),
      },
    }),
    input,
    context,
    "execute",
  );
  return {
    data: await readJsonPayload(response, "Scrape.do returnJSON response"),
    statusCode: response.status,
    headers: responseHeadersToObject(response.headers),
    metadata: buildResponseMetadata(response),
  };
}

async function requestScrapeDoScreenshot(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const fullPage = optionalBoolean(input.fullPage) === true;
  const response = await requestScrapeDoRaw(
    buildScrapeDoUrl({
      apiKey: context.apiKey,
      query: {
        ...buildCommonScrapeDoQuery(input),
        render: input.render === undefined ? true : optionalBoolean(input.render),
        screenShot: fullPage ? undefined : true,
        fullScreenShot: fullPage ? true : undefined,
        particularScreenShot: optionalString(input.selector),
      },
    }),
    input,
    context,
    "execute",
  );
  return {
    imageBase64: Buffer.from(await response.arrayBuffer()).toString("base64"),
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    statusCode: response.status,
    headers: responseHeadersToObject(response.headers),
    metadata: buildResponseMetadata(response),
  };
}

async function requestScrapeDoAccount(
  apiKey: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: ScrapeDoPhase,
): Promise<
  Record<string, unknown> & {
    is_active: boolean;
    concurrent_request: number;
    max_monthly_request: number;
    remaining_concurrent_request: number;
    remaining_monthly_request: number;
  }
> {
  const response = await requestScrapeDoRaw(
    buildScrapeDoUrl({ apiKey, baseUrl: scrapeDoInfoUrl, query: {} }),
    {},
    { fetcher, signal },
    phase,
  );
  const account = optionalRecord(await readJsonPayload(response, "Scrape.do account response"));
  if (!account) {
    throw new ProviderRequestError(502, "Scrape.do account response must be an object");
  }
  return {
    ...account,
    is_active: readBoolean(account.is_active, "is_active"),
    concurrent_request: readInteger(account.concurrent_request, "concurrent_request"),
    max_monthly_request: readInteger(account.max_monthly_request, "max_monthly_request"),
    remaining_concurrent_request: readInteger(account.remaining_concurrent_request, "remaining_concurrent_request"),
    remaining_monthly_request: readInteger(account.remaining_monthly_request, "remaining_monthly_request"),
  };
}

async function requestScrapeDoRaw(
  url: string,
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
  phase: ScrapeDoPhase,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), buildConnectorTimeoutMs(input));
  const signal = mergeAbortSignals(controller.signal, context.signal);
  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "*/*",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      throw createScrapeDoError(response.status, await response.text(), phase);
    }
    return response;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, "Scrape.do request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Scrape.do request failed: ${error.message}` : "Scrape.do request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildScrapeDoUrl(input: {
  apiKey: string;
  query: Record<string, ScrapeDoQueryValue>;
  baseUrl?: string;
}): string {
  const url = new URL(input.baseUrl ?? scrapeDoApiBaseUrl);
  url.searchParams.set("token", input.apiKey);
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildCommonScrapeDoQuery(input: Record<string, unknown>): Record<string, ScrapeDoQueryValue> {
  return compactObject({
    url: optionalString(input.url),
    super: optionalBoolean(input.super),
    geoCode: optionalString(input.geoCode),
    regionalGeoCode: optionalString(input.regionalGeoCode),
    sessionId: optionalInteger(input.sessionId),
    customHeaders: optionalBoolean(input.customHeaders),
    forwardHeaders: optionalBoolean(input.forwardHeaders),
    setCookies: optionalString(input.setCookies),
    disableRedirection: optionalBoolean(input.disableRedirection),
    timeout: optionalInteger(input.timeout),
    retryTimeout: optionalInteger(input.retryTimeout),
    disableRetry: optionalBoolean(input.disableRetry),
    render: optionalBoolean(input.render),
    device: optionalString(input.device),
    width: optionalInteger(input.width),
    height: optionalInteger(input.height),
    blockResources: optionalBoolean(input.blockResources),
    output: optionalString(input.output),
  });
}

function buildConnectorTimeoutMs(input: Record<string, unknown>): number {
  const timeout = optionalInteger(input.timeout);
  return timeout === undefined ? scrapeDoDefaultTimeoutMs : Math.max(scrapeDoDefaultTimeoutMs, timeout + 10_000);
}

function buildResponseMetadata(response: Response): Record<string, unknown> {
  return {
    statusCode: response.status,
    requestCost: readOptionalHeaderInteger(response.headers, "scrape.do-request-cost"),
    remainingCredits: readOptionalHeaderInteger(response.headers, "scrape.do-remaining-credits"),
    contentType: response.headers.get("content-type"),
    finalUrl: response.url || null,
  };
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

async function readJsonPayload(response: Response, label: string): Promise<unknown> {
  const body = await response.text();
  if (!body.trim()) {
    throw new ProviderRequestError(502, `${label} returned an empty body`);
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ProviderRequestError(502, `${label} returned invalid JSON`);
  }
}

function createScrapeDoError(status: number, body: string, phase: ScrapeDoPhase): ProviderRequestError {
  const message = extractScrapeDoErrorMessage(body) ?? `Scrape.do request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractScrapeDoErrorMessage(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const record = optionalRecord(JSON.parse(trimmed) as unknown);
    return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.description);
  } catch {
    return trimmed.slice(0, 300);
  }
}

function readOptionalHeaderInteger(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function readInteger(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `Scrape.do ${fieldName} must be an integer`);
  }
  return parsed;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Scrape.do ${fieldName} must be a boolean`);
  }
  return value;
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
