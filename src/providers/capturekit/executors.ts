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
import { objectPayload, requestJson } from "../http-json-runtime.ts";
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

const service = "capturekit";
const apiBaseUrl = "https://api.capturekit.dev";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RequestContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

const capturekitActionHandlers: ProviderActionHandlers<"capturekit", Handler> = {
  screenshot(input, context) {
    return takeCaptureKitScreenshot(input, context);
  },
  async extract_content(input, context) {
    return objectPayload(
      await capturekitRequest("/v1/content", context, {
        url: requiredInputString(input.url, "url"),
        include_markdown: optionalBoolean(input.includeMarkdown),
        remove_cookie_banners: optionalBoolean(input.removeCookieBanners),
        remove_ads: optionalBoolean(input.removeAds),
      }),
      "CaptureKit extract_content",
    );
  },
  async fetch_html(input, context) {
    const html = optionalRawString(
      await capturekitRequest("/v1/website/crawler", context, { query: requiredInputString(input.url, "url") }),
    );
    if (html === undefined) {
      throw providerResponseError("CaptureKit fetch_html returned no HTML");
    }
    return { html };
  },
  async analyze_website(input, context) {
    return objectPayload(
      await capturekitRequest("/v1/analyze", context, {
        url: requiredInputString(input.url, "url"),
        custom_prompt: optionalString(input.customPrompt),
      }),
      "CaptureKit analyze_website",
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, capturekitActionHandlers, {
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
      await capturekitRequest("/v1/usage", { apiKey: input.apiKey, fetcher, signal }, {}, "validate"),
      "CaptureKit usage",
    );
    const account = optionalRecord(usage.account);
    const slug = optionalString(account?.slug);
    return {
      profile: {
        accountId: slug ? `capturekit:account:${slug}` : "capturekit-api-key",
        displayName: optionalString(account?.name) ?? "CaptureKit API Key",
      },
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/v1/usage",
        remaining: optionalNumber(usage.remaining),
      },
    };
  },
};

async function takeCaptureKitScreenshot(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const transitFiles = context.transitFiles;
  if (!transitFiles) {
    throw providerInputError("CaptureKit screenshots require local transit file storage.");
  }
  const url = new URL("/v1/capture", apiBaseUrl);
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
  return runProviderRequest({ signal: context.signal, label: "CaptureKit screenshot" }, async (signal) => {
    const response = await context.fetcher(url.toString(), {
      headers: { accept: "*/*", "user-agent": providerUserAgent, "x-api-key": context.apiKey },
      signal,
    });
    if (!response.ok) {
      const message = await readProviderErrorTextBody(response, "CaptureKit screenshot error", signal);
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : response.status,
        message || `CaptureKit screenshot failed with HTTP ${response.status}`,
      );
    }
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    const extension = mimeType === "image/jpeg" ? "jpg" : (mimeType.split("/")[1] ?? "png");
    const stored = await storeResponseInTransit(response, transitFiles, {
      name: `capturekit-screenshot.${extension}`,
      mimeType,
      fieldName: "CaptureKit screenshot",
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

async function capturekitRequest(
  path: string,
  context: RequestContext,
  query: Record<string, QueryValue> = {},
  phase: ProviderRequestPhase = "execute",
  body?: unknown,
): Promise<unknown> {
  try {
    return await requestJson({
      providerName: "CaptureKit",
      baseUrl: apiBaseUrl,
      path,
      fetcher: context.fetcher,
      signal: context.signal,
      query,
      phase,
      body,
      headers: { "x-api-key": context.apiKey },
    });
  } catch (error) {
    // CaptureKit answers an exceeded rate limit with 401, which would otherwise read as a rejected key.
    if (error instanceof ProviderRequestError && error.status === 401 && /rate limit/i.test(error.message)) {
      throw new ProviderRequestError(429, error.message, error.details);
    }
    throw error;
  }
}
