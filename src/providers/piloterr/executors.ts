import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderRequestPhase } from "../http-json-runtime.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderTransitFile } from "../provider-files.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { queryParams, storeResponseInTransit } from "../../core/request.ts";
import { arrayPayload, objectPayload, requestJson } from "../http-json-runtime.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderErrorTextBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "piloterr";
const apiBaseUrl = "https://api.piloterr.com";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

const piloterrActionHandlers: ProviderActionHandlers<"piloterr", Handler> = {
  async fetch_html(input, context) {
    const html = optionalRawString(
      await piloterrRequest("/v2/website/crawler", context, { query: requiredInputString(input.url, "url") }),
    );
    if (html === undefined) {
      throw providerResponseError("Piloterr fetch_html returned no HTML");
    }
    return { html };
  },
  async render_html(input, context) {
    const html = optionalRawString(
      await piloterrRequest("/v2/website/rendering", context, {
        query: requiredInputString(input.url, "url"),
        wait_in_seconds: optionalNumber(input.waitInSeconds),
        block_ads: optionalBoolean(input.blockAds),
      }),
    );
    if (html === undefined) {
      throw providerResponseError("Piloterr render_html returned no HTML");
    }
    return { html };
  },
  screenshot(input, context) {
    return takePiloterrScreenshot(input, context);
  },
  async detect_technologies(input, context) {
    return objectPayload(
      await piloterrRequest("/v2/website/technology", context, { query: requiredInputString(input.url, "url") }),
      "Piloterr detect_technologies",
    );
  },
  async google_search(input, context) {
    return objectPayload(
      await piloterrRequest("/v2/google/search", context, {
        query: requiredInputString(input.query, "query"),
        gl: optionalString(input.country),
        hl: optionalString(input.language),
        location: optionalString(input.location),
        page: optionalInteger(input.page),
        num: optionalInteger(input.numResults),
      }),
      "Piloterr google_search",
    );
  },
  async amazon_search(input, context) {
    return {
      products: arrayPayload(
        await piloterrRequest("/v2/amazon/search", context, {
          query: requiredInputString(input.query, "query"),
          domain: optionalString(input.marketplace),
          page: optionalInteger(input.page),
        }),
        "Piloterr amazon_search",
      ),
    };
  },
  async ebay_get_listing(input, context) {
    return objectPayload(
      await piloterrRequest("/v2/ebay/product", context, { query: requiredInputString(input.item, "item") }),
      "Piloterr ebay_get_listing",
    );
  },
  async ebay_search(input, context) {
    return objectPayload(
      await piloterrRequest("/v2/ebay/search", context, {
        query: requiredInputString(input.query, "query"),
        page: optionalInteger(input.page),
      }),
      "Piloterr ebay_search",
    );
  },
  async linkedin_company(input, context) {
    return objectPayload(
      await piloterrRequest("/v2/linkedin/company/info", context, {
        query: optionalString(input.query),
        domain: optionalString(input.domain),
      }),
      "Piloterr linkedin_company",
    );
  },
  async crunchbase_company(input, context) {
    return objectPayload(
      await piloterrRequest("/v2/crunchbase/company/info", context, {
        query: optionalString(input.query),
        domain: optionalString(input.domain),
      }),
      "Piloterr crunchbase_company",
    );
  },
  async zillow_property(input, context) {
    return objectPayload(
      await piloterrRequest("/v2/zillow/property", context, { query: requiredInputString(input.url, "url") }),
      "Piloterr zillow_property",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, piloterrActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const usage = objectPayload(
      await piloterrRequest("/v2/usage", { apiKey: input.apiKey, fetcher, signal }, {}, "validate"),
      "Piloterr usage",
    );
    const account = optionalRecord(usage.account);
    const slug = optionalString(account?.slug);
    return {
      profile: {
        accountId: slug ? `piloterr:account:${slug}` : "piloterr-api-key",
        displayName: optionalString(account?.name) ?? "Piloterr API Key",
      },
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/v2/usage",
        remaining: optionalNumber(usage.remaining),
      },
    };
  },
};

async function takePiloterrScreenshot(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const transitFiles = context.transitFiles;
  if (!transitFiles) {
    throw providerInputError("Piloterr screenshots require local transit file storage.");
  }
  const url = new URL("/v2/website/screenshot", apiBaseUrl);
  for (const [key, value] of Object.entries(
    queryParams({
      url: requiredInputString(input.url, "url"),
      format: optionalString(input.format),
      full_page: optionalBoolean(input.fullPage),
      device: optionalString(input.device),
      selector: optionalString(input.selector),
      viewport_width: optionalInteger(input.viewportWidth),
      viewport_height: optionalInteger(input.viewportHeight),
      delay: optionalNumber(input.delay),
      remove_cookie_banners: optionalBoolean(input.removeCookieBanners),
      remove_ads: optionalBoolean(input.removeAds),
    }),
  )) {
    url.searchParams.set(key, value);
  }
  return runProviderRequest({ signal: context.signal, label: "Piloterr screenshot" }, async (signal) => {
    const response = await context.fetcher(url.toString(), {
      headers: { accept: "*/*", "user-agent": providerUserAgent, "x-api-key": context.apiKey },
      signal,
    });
    if (!response.ok) {
      const message = await readProviderErrorTextBody(response, "Piloterr screenshot error", signal);
      throw piloterrRequestError(
        response.status >= 500 ? 502 : response.status,
        message || `Piloterr screenshot failed with HTTP ${response.status}`,
      );
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const extension = mimeType === "image/jpeg" ? "jpg" : (mimeType.split("/")[1] ?? "png");
    const stored = await storeResponseInTransit(response, transitFiles, {
      name: `piloterr-screenshot.${extension}`,
      mimeType,
      fieldName: "Piloterr screenshot",
      createError: (message) => new ProviderRequestError(413, message),
      signal,
    });
    const file: ProviderTransitFile = {
      fileId: stored.fileId,
      downloadUrl: stored.downloadUrl,
      sizeBytes: stored.sizeBytes,
      name: stored.name,
      mimeType: stored.mimeType,
    };
    return { file };
  });
}

async function piloterrRequest(
  path: string,
  context: RequestContext,
  query: Record<string, QueryValue> = {},
  phase: ProviderRequestPhase = "execute",
  body?: unknown,
): Promise<unknown> {
  try {
    return await requestJson({
      providerName: "Piloterr",
      baseUrl: apiBaseUrl,
      path,
      fetcher: context.fetcher,
      signal: context.signal,
      query,
      body,
      headers: { "x-api-key": context.apiKey },
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw piloterrRequestError(error.status, error.message, error.details, phase);
    }
    throw error;
  }
}

function piloterrRequestError(
  status: number,
  message: string,
  details?: unknown,
  phase: ProviderRequestPhase = "execute",
): ProviderRequestError {
  // Piloterr answers an exceeded rate limit with 401, which would otherwise read as a rejected key.
  if (status === 401 && /rate limit/i.test(message)) {
    return new ProviderRequestError(429, message, details);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, details);
  }
  return new ProviderRequestError(status, message, details);
}
