import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ScrapingantActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "scrapingant";
const scrapingantApiOrigin = "https://api.scrapingant.com";
const scrapingantApiBaseUrl = `${scrapingantApiOrigin}/v2`;
const scrapingantDefaultTimeoutMs = 30_000;

type ScrapingantPhase = "validate" | "execute";
type ScrapingantActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface ScrapingantRequestInput {
  path: string;
  method: string;
  query: Record<string, string | string[] | undefined>;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: ScrapingantPhase;
}

export const scrapingantActionHandlers: Record<ScrapingantActionName, ScrapingantActionHandler> = {
  scrape_with_extended_json_output(input, context) {
    return requestScrapingantExtended(input, context);
  },
  extract_content_as_markdown(input, context) {
    return requestScrapingantMarkdown(input, context);
  },
  extract_data_with_ai(input, context) {
    return requestScrapingantAiExtraction(input, context);
  },
  get_api_credits_usage(_input, context) {
    return requestScrapingantUsage(context.apiKey, context.fetcher, context.signal, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, scrapingantActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: scrapingantApiBaseUrl,
  auth: { type: "api_key_query", name: "x-api-key" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    const usage = await requestScrapingantUsage(apiKey, fetcher, signal, "validate");
    return {
      profile: {
        accountId: "scrapingant",
        displayName: "ScrapingAnt API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: scrapingantApiBaseUrl,
        validationEndpoint: "/usage",
        planName: usage.plan_name,
        startDate: usage.start_date,
        endDate: usage.end_date,
        planTotalCredits: usage.plan_total_credits,
        remainedCredits: usage.remained_credits,
      }),
    };
  },
};

async function requestScrapingantExtended(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  validateCommonRequestInput(input);
  const payload = await requestScrapingantJson({
    path: "/extended",
    method: resolveScrapingantMethod(input),
    query: buildScrapingantQuery(input, context.apiKey),
    headers: buildScrapingantForwardedHeaders(input),
    body: buildScrapingantBody(input),
    timeoutMs: buildConnectorTimeoutMs(input),
    context,
    phase: "execute",
  });
  return parseScrapingantExtendedPayload(payload);
}

async function requestScrapingantMarkdown(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  validateCommonRequestInput(input);
  const payload = await requestScrapingantJson({
    path: "/markdown",
    method: resolveScrapingantMethod(input),
    query: buildScrapingantQuery(input, context.apiKey),
    headers: buildScrapingantForwardedHeaders(input),
    body: buildScrapingantBody(input),
    timeoutMs: buildConnectorTimeoutMs(input),
    context,
    phase: "execute",
  });
  return parseScrapingantMarkdownPayload(payload);
}

async function requestScrapingantAiExtraction(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  validateCommonRequestInput(input);
  const query = {
    ...buildScrapingantQuery(input, context.apiKey),
    extract_properties: requiredInputString(input.extractProperties, "extractProperties"),
  };
  const payload = await requestScrapingantJson({
    path: "/extract",
    method: resolveScrapingantMethod(input),
    query,
    headers: buildScrapingantForwardedHeaders(input),
    body: buildScrapingantBody(input),
    timeoutMs: buildConnectorTimeoutMs(input),
    context,
    phase: "execute",
  });
  return parseScrapingantLooseObject(payload, "AI extraction");
}

async function requestScrapingantUsage(
  apiKey: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: ScrapingantPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestScrapingantJson({
    path: "/usage",
    method: "GET",
    query: { "x-api-key": apiKey },
    context: { fetcher, signal },
    phase,
  });
  return parseScrapingantUsagePayload(payload);
}

function buildScrapingantQuery(
  input: Record<string, unknown>,
  apiKey: string,
): Record<string, string | string[] | undefined> {
  return compactObject({
    "x-api-key": apiKey,
    url: optionalString(input.url),
    browser: stringifyOptionalBoolean(optionalBoolean(input.browser)),
    timeout: stringifyOptionalInteger(optionalInteger(input.timeout)),
    return_page_source: stringifyOptionalBoolean(optionalBoolean(input.returnPageSource)),
    cookies: optionalString(input.cookies),
    js_snippet: encodeOptionalBase64(optionalRawInputString(input.jsSnippet)),
    proxy_type: optionalString(input.proxyType),
    proxy_country: normalizeProxyCountry(input.proxyCountry),
    wait_for_selector: optionalString(input.waitForSelector),
    block_resource: readOptionalStringArray(input.blockResource),
  });
}

function buildScrapingantForwardedHeaders(input: Record<string, unknown>): Record<string, string> | undefined {
  const forwardedHeaders = optionalRecord(input.customHeaders);
  const entries = Object.entries(forwardedHeaders ?? {}).flatMap(([key, value]) => {
    const headerValue = optionalString(value);
    const headerName = key.trim();
    return headerName && headerValue ? ([[`ant-${headerName}`, headerValue]] as Array<[string, string]>) : [];
  });
  if (input.bodyJson !== undefined && !entries.some(([key]) => key.toLowerCase() === "ant-content-type")) {
    entries.push(["ant-Content-Type", "application/json"]);
  }
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function buildScrapingantBody(input: Record<string, unknown>): string | undefined {
  if (input.bodyJson !== undefined) {
    return JSON.stringify(input.bodyJson);
  }
  return optionalRawInputString(input.bodyText);
}

function buildConnectorTimeoutMs(input: Record<string, unknown>): number {
  const timeoutSeconds = optionalInteger(input.timeout);
  return timeoutSeconds === undefined
    ? scrapingantDefaultTimeoutMs
    : Math.max(scrapingantDefaultTimeoutMs, timeoutSeconds * 1000 + 10_000);
}

function resolveScrapingantMethod(input: Record<string, unknown>): string {
  return optionalString(input.method) ?? "GET";
}

async function requestScrapingantJson(input: ScrapingantRequestInput): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? scrapingantDefaultTimeoutMs);
  const signal = mergeAbortSignals(controller.signal, input.context.signal);
  try {
    const response = await input.context.fetcher(buildScrapingantUrl(input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...(input.headers ?? {}),
      },
      body: input.body,
      signal,
    });
    const payload = await readScrapingantPayload(response);
    if (!response.ok) {
      throw createScrapingantError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, "ScrapingAnt request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ScrapingAnt request failed: ${error.message}` : "ScrapingAnt request failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

function buildScrapingantUrl(path: string, query: Record<string, string | string[] | undefined>): string {
  const url = new URL(`/v2${path}`, scrapingantApiOrigin);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function readScrapingantPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "ScrapingAnt returned invalid JSON");
  }
}

function parseScrapingantUsagePayload(payload: unknown): Record<string, unknown> {
  const record = parseScrapingantLooseObject(payload, "usage");
  return {
    plan_name: readRequiredString(record.plan_name, "plan_name"),
    start_date: readRequiredString(record.start_date, "start_date"),
    end_date: readRequiredString(record.end_date, "end_date"),
    plan_total_credits: readRequiredInteger(record.plan_total_credits, "plan_total_credits"),
    remained_credits: readRequiredInteger(record.remained_credits, "remained_credits"),
  };
}

function parseScrapingantExtendedPayload(payload: unknown): Record<string, unknown> {
  const record = parseScrapingantLooseObject(payload, "extended response");
  return {
    html: readRequiredString(record.html, "html"),
    text: readRequiredString(record.text, "text"),
    cookies: readRequiredString(record.cookies, "cookies"),
    status_code: readRequiredInteger(record.status_code, "status_code"),
    headers: readHeaderItems(record.headers),
    xhrs: readXhrItems(record.xhrs),
    iframes: readIframeItems(record.iframes),
  };
}

function parseScrapingantMarkdownPayload(payload: unknown): Record<string, unknown> {
  const record = parseScrapingantLooseObject(payload, "Markdown response");
  return {
    url: readRequiredString(record.url, "url"),
    markdown: readRequiredString(record.markdown, "markdown"),
  };
}

function parseScrapingantLooseObject(payload: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `ScrapingAnt ${label} payload must be an object`);
  }
  return record;
}

function readHeaderItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "ScrapingAnt response headers must be an array");
  }
  return value.map((item) => {
    const record = parseScrapingantLooseObject(item, "header");
    return {
      name: readRequiredString(record.name, "headers[].name"),
      value: readRequiredString(record.value, "headers[].value"),
    };
  });
}

function readXhrItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "ScrapingAnt response xhrs must be an array");
  }
  return value.map((item) => {
    const record = parseScrapingantLooseObject(item, "xhr");
    return compactObject({
      url: readRequiredString(record.url, "xhrs[].url"),
      status: readRequiredInteger(record.status, "xhrs[].status"),
      method: readRequiredString(record.method, "xhrs[].method"),
      headers: readHeaderItems(record.headers),
      body: optionalString(record.body),
      request_body: optionalString(record.request_body),
    });
  });
}

function readIframeItems(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "ScrapingAnt response iframes must be an array");
  }
  return value.map((item) => {
    const record = parseScrapingantLooseObject(item, "iframe");
    return {
      src: readRequiredString(record.src, "iframes[].src"),
      html: readRequiredString(record.html, "iframes[].html"),
    };
  });
}

function createScrapingantError(status: number, payload: unknown, phase: ScrapingantPhase): ProviderRequestError {
  const detail = optionalRecord(payload);
  const message =
    optionalString(detail?.detail) ??
    optionalString(detail?.message) ??
    `ScrapingAnt request failed with status ${status}`;
  if (status === 409) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 403) {
    return new ProviderRequestError(409, message);
  }
  if (phase === "execute" && (status === 400 || status === 404 || status === 405 || status === 422)) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function validateCommonRequestInput(input: Record<string, unknown>): void {
  const browser = input.browser;
  const method = optionalString(input.method) ?? "GET";
  const hasBodyText = input.bodyText !== undefined;
  const hasBodyJson = input.bodyJson !== undefined;
  if (browser === false) {
    for (const key of ["returnPageSource", "jsSnippet", "waitForSelector", "blockResource"]) {
      if (input[key] !== undefined) {
        throw new ProviderRequestError(400, `${key} requires browser=true`);
      }
    }
  }
  if (hasBodyText && hasBodyJson) {
    throw new ProviderRequestError(400, "bodyText and bodyJson cannot be used together");
  }
  if ((hasBodyText || hasBodyJson) && method === "GET") {
    throw new ProviderRequestError(400, "GET requests cannot include bodyText or bodyJson");
  }
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `ScrapingAnt response is missing ${fieldName}`);
  }
  return parsed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `ScrapingAnt response is missing ${fieldName}`);
  }
  return parsed;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return items.length > 0 ? items : undefined;
}

function normalizeProxyCountry(value: unknown): string | undefined {
  const parsed = optionalString(value);
  return parsed ? parsed.toUpperCase() : undefined;
}

function encodeOptionalBase64(value: string | undefined): string | undefined {
  return value ? Buffer.from(value, "utf8").toString("base64") : undefined;
}

function stringifyOptionalBoolean(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function stringifyOptionalInteger(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function optionalRawInputString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
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
