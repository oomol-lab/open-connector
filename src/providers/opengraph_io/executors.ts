import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "opengraph_io";
const opengraphIoApiBaseUrl = "https://opengraph.io";
const opengraphIoValidationTargetUrl = "https://example.com";

type OpenGraphIoRequestPhase = "validate" | "execute";
type OpenGraphIoQueryValue = string | number | boolean | undefined;
type OpenGraphIoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface OpenGraphIoRequestInfo {
  host?: string;
  redirects?: number;
  responseCode?: number;
  responseContentType?: string;
}

interface OpenGraphIoSiteResult {
  hybridGraph?: Record<string, unknown>;
  openGraph?: Record<string, unknown>;
  twitterCard?: Record<string, unknown>;
  htmlInferred?: Record<string, unknown>;
  oEmbed?: Record<string, unknown>;
  requestUrl?: string;
  requestInfo?: OpenGraphIoRequestInfo;
  cached?: boolean;
  createdAt?: string | null;
  retryInfo?: Record<string, unknown>;
  aiSafety?: Record<string, unknown>;
  domain?: string;
  tags?: Record<string, unknown>[];
}

export const opengraphIoActionHandlers: ProviderActionHandlers<"opengraph_io", OpenGraphIoActionHandler> = {
  extract_site(input, context) {
    return opengraphIoExtractSite(input, context);
  },
  scrape_site(input, context) {
    return opengraphIoExtractSite(input, context);
  },
  scrape_url(input, context) {
    return opengraphIoScrapeUrl(input, context);
  },
  capture_screenshot(input, context) {
    return opengraphIoCaptureScreenshot(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, opengraphIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const validationPath = buildPath("site", opengraphIoValidationTargetUrl);
    const payload = await opengraphIoRequest({
      path: validationPath,
      query: { cache_ok: true },
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const site = normalizeSiteResult(payload);

    return {
      profile: {
        displayName: "OpenGraph.io App ID",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: opengraphIoApiBaseUrl,
        validationEndpoint: `${validationPath}?app_id=***`,
        requestUrl: site.requestUrl,
        host: site.requestInfo?.host,
        responseCode: site.requestInfo?.responseCode,
        cached: site.cached,
      }),
    };
  },
};

async function opengraphIoExtractSite(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await opengraphIoRequest({
    path: buildPath("site", requireTargetUrl(input, "site")),
    query: buildSiteQuery(input),
    context,
    phase: "execute",
  });

  return normalizeSiteResult(payload);
}

async function opengraphIoScrapeUrl(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await opengraphIoRequest({
    path: buildPath("scrape", requireTargetUrl(input, "url")),
    query: buildScrapeQuery(input),
    context,
    phase: "execute",
  });

  return normalizeScrapeResult(payload);
}

async function opengraphIoCaptureScreenshot(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await opengraphIoRequest({
    path: buildPath("screenshot", requireTargetUrl(input, "url")),
    query: buildScreenshotQuery(input),
    context,
    phase: "execute",
  });

  return normalizeScreenshotResult(payload);
}

function buildSiteQuery(input: Record<string, unknown>): Record<string, OpenGraphIoQueryValue> {
  return compactObject({
    cache_ok: optionalBoolean(input.cacheOk),
    full_render: optionalBoolean(input.fullRender),
    use_proxy: optionalBoolean(input.useProxy),
    use_premium: optionalBoolean(input.usePremium),
    use_superior: optionalBoolean(input.useSuperior),
    use_ai: optionalBoolean(input.useAi),
    max_cache_age: optionalInteger(input.maxCacheAge),
    accept_lang: optionalString(input.acceptLang),
    auto_proxy: optionalBoolean(input.autoProxy),
    auto_render: optionalBoolean(input.autoRender),
    retry: optionalBoolean(input.retry),
    max_retries: optionalInteger(input.maxRetries),
    retry_escalate: optionalBoolean(input.retryEscalate),
    proxy_country: optionalString(input.proxyCountry),
  });
}

function buildScrapeQuery(input: Record<string, unknown>): Record<string, OpenGraphIoQueryValue> {
  return compactObject({
    cache_ok: optionalBoolean(input.cacheOk),
    full_render: optionalBoolean(input.fullRender),
    use_proxy: optionalBoolean(input.useProxy),
    use_premium: optionalBoolean(input.usePremium),
    use_superior: optionalBoolean(input.useSuperior),
    accept_lang: optionalString(input.acceptLang),
    auto_proxy: optionalBoolean(input.autoProxy),
    auto_render: optionalBoolean(input.autoRender),
    retry: optionalBoolean(input.retry),
  });
}

function buildScreenshotQuery(input: Record<string, unknown>): Record<string, OpenGraphIoQueryValue> {
  return compactObject({
    format: optionalString(input.format),
    quality: optionalInteger(input.quality),
    cache_ok: optionalBoolean(input.cacheOk),
    selector: optionalString(input.selector),
    dark_mode: optionalBoolean(input.darkMode),
    full_page: optionalBoolean(input.fullPage),
    use_proxy: optionalBoolean(input.useProxy),
    dimensions: optionalString(input.dimensions),
    capture_delay: optionalInteger(input.captureDelay),
    exclude_selectors: optionalString(input.excludeSelectors),
    navigation_timeout: optionalInteger(input.navigationTimeout),
    block_cookie_banner: optionalBoolean(input.blockCookieBanner),
  });
}

async function opengraphIoRequest(input: {
  path: string;
  query: Record<string, OpenGraphIoQueryValue>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: OpenGraphIoRequestPhase;
}): Promise<unknown> {
  const url = new URL(input.path, opengraphIoApiBaseUrl);
  url.searchParams.set("app_id", input.context.apiKey);
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readOpenGraphIoPayload(response);
    if (!response.ok) {
      throw createOpenGraphIoError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `OpenGraph.io ${input.path} request timed out after 30 seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `OpenGraph.io request failed: ${error.message}` : "OpenGraph.io request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readOpenGraphIoPayload(response: Response): Promise<unknown> {
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

function createOpenGraphIoError(
  status: number,
  payload: unknown,
  phase: OpenGraphIoRequestPhase,
): ProviderRequestError {
  const message = extractOpenGraphIoErrorMessage(payload);
  if (phase === "validate" && status === 401) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}

function extractOpenGraphIoErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return "OpenGraph.io request failed";
  }

  return (
    optionalString(record.error_description) ??
    optionalString(record.error_message) ??
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.detail) ??
    "OpenGraph.io request failed"
  );
}

function normalizeSiteResult(payload: unknown): OpenGraphIoSiteResult {
  const record = requirePayloadObject(payload, "site");

  return compactObject({
    hybridGraph: optionalRecord(record.hybridGraph ?? record.hybrid_graph),
    openGraph: optionalRecord(record.openGraph ?? record.open_graph),
    twitterCard: optionalRecord(record.twitterCard ?? record.twitter_card),
    htmlInferred: optionalRecord(record.htmlInferred ?? record.html_inferred),
    oEmbed: optionalRecord(record.oEmbed ?? record.oembed),
    requestUrl: optionalString(record.requestUrl ?? record.request_url),
    requestInfo: normalizeRequestInfo(record.requestInfo ?? record.request_info),
    cached: optionalBoolean(record.cached),
    createdAt: nullableString(record.createdAt ?? record.created_at),
    retryInfo: optionalRecord(record.retryInfo ?? record.retry_info),
    aiSafety: optionalRecord(record.aiSafety ?? record.ai_safety ?? record.AI_SAFETY),
    domain: optionalString(record.domain),
    tags: normalizeTagList(record.tags),
  });
}

function normalizeScrapeResult(payload: unknown): Record<string, unknown> {
  const unwrapped = unwrapEnvelopeLikePayload(payload);
  if (typeof unwrapped === "string") {
    return {
      htmlContent: unwrapped,
    };
  }

  const record = requirePayloadObject(unwrapped, "scrape");
  const htmlContent = optionalString(record.htmlContent ?? record.html_content ?? record.html);
  if (!htmlContent) {
    throw new ProviderRequestError(502, "OpenGraph.io scrape response did not include html content");
  }

  return compactObject({
    htmlContent,
    requestInfo: normalizeRequestInfo(record.requestInfo ?? record.request_info),
    retryInfo: optionalRecord(record.retryInfo ?? record.retry_info),
  });
}

function normalizeScreenshotResult(payload: unknown): Record<string, unknown> {
  const record = requirePayloadObject(payload, "screenshot");
  const screenshotUrl = optionalString(record.screenshotUrl ?? record.screenshot_url);
  if (!screenshotUrl) {
    throw new ProviderRequestError(502, "OpenGraph.io screenshot response did not include screenshotUrl");
  }

  const dimensionsRecord = optionalRecord(record.dimensions);
  const width = optionalInteger(dimensionsRecord?.width);
  const height = optionalInteger(dimensionsRecord?.height);
  if (width === undefined || height === undefined) {
    throw new ProviderRequestError(502, "OpenGraph.io screenshot response did not include dimensions");
  }

  return compactObject({
    screenshotUrl,
    dimensions: {
      width,
      height,
    },
    requestInfo: normalizeRequestInfo(record.requestInfo ?? record.request_info),
  });
}

function normalizeRequestInfo(payload: unknown): OpenGraphIoRequestInfo | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const normalized = compactObject({
    host: optionalString(record.host),
    redirects: optionalInteger(record.redirects),
    responseCode: optionalInteger(record.responseCode ?? record.response_code),
    responseContentType: optionalString(record.responseContentType ?? record.response_content_type),
  });

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeTagList(payload: unknown): Record<string, unknown>[] | undefined {
  if (!Array.isArray(payload)) {
    return undefined;
  }

  const tags = payload.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => !!item);
  return tags.length > 0 ? tags : undefined;
}

function requirePayloadObject(payload: unknown, context: string): Record<string, unknown> {
  const unwrapped = unwrapEnvelopeLikePayload(payload);
  const record = optionalRecord(unwrapped);
  if (!record) {
    throw new ProviderRequestError(502, `OpenGraph.io ${context} response was not a JSON object`);
  }
  return record;
}

function unwrapEnvelopeLikePayload(payload: unknown): unknown {
  const record = optionalRecord(payload);
  if (!record) {
    return payload;
  }
  if (typeof record.successful === "boolean" && record.data !== undefined) {
    return record.data;
  }
  return payload;
}

function buildPath(family: "site" | "scrape" | "screenshot", targetUrl: string): string {
  return `/api/1.1/${family}/${encodeURIComponent(targetUrl)}`;
}

function requireTargetUrl(input: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value) {
      return assertPublicHttpUrl(value, {
        fieldName: key,
        createError: (message) => new ProviderRequestError(400, message),
      }).toString();
    }
  }
  throw new ProviderRequestError(400, `${keys.join(" or ")} is required`);
}

function nullableString(value: unknown): string | null | undefined {
  return value === null ? null : optionalString(value);
}
