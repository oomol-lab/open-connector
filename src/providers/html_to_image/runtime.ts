import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const htmlToImageApiBaseUrl = "https://app.html2img.com";
export const htmlToImageHtmlPath = "/api/html";
export const htmlToImageScreenshotPath = "/api/screenshot";

const htmlToImageRequestTimeoutMs = 31_000;
const htmlToImageValidationBody = {
  html: '<div style="width:1px;height:1px">.</div>',
  width: 1,
  height: 1,
  dpi: 1,
};

type HtmlToImageRequestPhase = "validate" | "execute";
type HtmlToImageActionContext = ApiKeyProviderContext;
type HtmlToImageActionHandler = (input: Record<string, unknown>, context: HtmlToImageActionContext) => Promise<unknown>;

export const htmlToImageActionHandlers: ProviderActionHandlers<"html_to_image", HtmlToImageActionHandler> = {
  convert_html_to_image(input, context) {
    return executeHtmlToImageRender(htmlToImageHtmlPath, buildConvertHtmlRequestBody(input), context);
  },
  capture_website_screenshot(input, context) {
    return executeHtmlToImageRender(htmlToImageScreenshotPath, buildScreenshotRequestBody(input), context);
  },
};

export async function validateHtmlToImageCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const payload = await postHtmlToImageJson({
    path: htmlToImageHtmlPath,
    body: htmlToImageValidationBody,
    apiKey: input.apiKey,
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });
  const output = normalizeSynchronousImagePayload(payload);

  return {
    profile: {
      accountId: "api_key",
      displayName: "HTML to Image API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: htmlToImageApiBaseUrl,
      validationEndpoint: htmlToImageHtmlPath,
      validationMode: "minimal_html_render",
      creditsRemaining: output.credits_remaining,
    }),
  };
}

async function executeHtmlToImageRender(
  path: string,
  body: Record<string, unknown>,
  context: HtmlToImageActionContext,
): Promise<unknown> {
  const payload = await postHtmlToImageJson({
    path,
    body,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return normalizeSynchronousImagePayload(payload);
}

function buildConvertHtmlRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    html: optionalString(input.html),
    ...buildSharedRequestBody(input),
  };
}

function buildScreenshotRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: optionalString(input.url),
    selector: optionalString(input.selector),
    ...buildSharedRequestBody(input),
  });
}

function buildSharedRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  const fullpage = optionalBoolean(input.fullpage);
  return compactObject({
    css: optionalString(input.css),
    width: optionalInteger(input.width),
    height: optionalInteger(input.height),
    fullpage,
    dpi: fullpage ? 1 : optionalInteger(input.dpi),
    wait_for_selector: optionalString(input.wait_for_selector),
    ms_delay: optionalInteger(input.ms_delay),
  });
}

async function postHtmlToImageJson(input: {
  path: string;
  body: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: HtmlToImageRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, htmlToImageRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(new URL(input.path, htmlToImageApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "HTML to Image request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `HTML to Image request failed: ${error.message}` : "HTML to Image request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readHtmlToImagePayload(response);
  if (!response.ok) {
    throw createHtmlToImageError(response, payload, input.phase);
  }
  return payload;
}

async function readHtmlToImagePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeSynchronousImagePayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "HTML to Image returned an empty response", payload);
  }
  const success = optionalBoolean(record.success);
  if (success !== true) {
    throw new ProviderRequestError(
      502,
      extractHtmlToImageMessage(payload) ?? "HTML to Image did not return a successful response",
      payload,
    );
  }
  const id = optionalString(record.id);
  const url = optionalString(record.url);
  if (!id || !url) {
    throw new ProviderRequestError(502, "HTML to Image response did not include both id and url", payload);
  }

  return compactObject({
    success,
    credits_remaining: optionalInteger(record.credits_remaining),
    id,
    url,
  });
}

function createHtmlToImageError(
  response: Response,
  payload: unknown,
  phase: HtmlToImageRequestPhase,
): ProviderRequestError {
  const message = extractHtmlToImageMessage(payload) ?? `HTML to Image request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractHtmlToImageMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const baseMessage =
    optionalString(record.error) ??
    optionalString(record.message) ??
    optionalString(record.detail) ??
    optionalString(record.title) ??
    optionalString(record.code);
  const detailMessage = extractHtmlToImageDetailMessage(record.details);
  if (baseMessage && detailMessage && !baseMessage.includes(detailMessage)) {
    return `${baseMessage}: ${detailMessage}`;
  }
  return baseMessage ?? detailMessage;
}

function extractHtmlToImageDetailMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string" && entry.trim()) {
      return `${key} ${entry}`.trim();
    }
    if (!Array.isArray(entry) || entry.length === 0) {
      continue;
    }
    const firstItem = entry[0];
    if (typeof firstItem === "string" && firstItem.trim()) {
      return `${key} ${firstItem}`.trim();
    }
  }
  return undefined;
}
