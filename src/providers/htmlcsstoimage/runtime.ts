import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const htmlCssToImageApiBaseUrl = "https://hcti.io";
export const htmlCssToImageImagePath = "/v1/image";
export const htmlCssToImageBatchImagePath = "/v1/image/batch";
export const htmlCssToImageUsagePath = "/v1/usage";

const htmlCssToImageRequestTimeoutMs = 31_000;
const htmlCssToImageValidationBody = {
  html: '<div style="width:1px;height:1px">.</div>',
  viewport_width: 1,
  viewport_height: 1,
};

type HtmlCssToImageRequestPhase = "validate" | "execute";

export interface HtmlCssToImageCredential {
  userId: string;
  apiKey: string;
}

export interface HtmlCssToImageActionContext {
  credential: HtmlCssToImageCredential;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type HtmlCssToImageActionHandler = (
  input: Record<string, unknown>,
  context: HtmlCssToImageActionContext,
) => Promise<unknown>;

interface HtmlCssToImageRequestInput {
  credential: HtmlCssToImageCredential;
  method?: string;
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: HtmlCssToImageRequestPhase;
}

export const htmlCssToImageActionHandlers: ProviderActionHandlers<"htmlcsstoimage", HtmlCssToImageActionHandler> = {
  create_image(input, context) {
    return createHtmlCssToImage(input, context);
  },
  create_batch_images(input, context) {
    return createHtmlCssToImageBatch(input, context);
  },
  delete_image(input, context) {
    return deleteHtmlCssToImage(input, context);
  },
  delete_batch_images(input, context) {
    return deleteHtmlCssToImageBatch(input, context);
  },
  get_usage(_input, context) {
    return getHtmlCssToImageUsage(context);
  },
};

export async function validateHtmlCssToImageCredential(
  input: { apiKey: string; values: Record<string, string> },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const credential = {
    apiKey: input.apiKey,
    userId: resolveHtmlCssToImageUserId({ values: input.values }),
  };
  await requestHtmlCssToImage({
    path: htmlCssToImageImagePath,
    body: htmlCssToImageValidationBody,
    credential,
    fetcher: options.fetcher,
    signal: options.signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: `htmlcsstoimage:${credential.userId}`,
      displayName: `HTML/CSS to Image ${credential.userId}`,
    },
    grantedScopes: [],
    metadata: {
      userId: credential.userId,
      apiBaseUrl: htmlCssToImageApiBaseUrl,
      validationEndpoint: htmlCssToImageImagePath,
      validationMode: "minimal_html_render",
    },
  };
}

export function resolveHtmlCssToImageUserId(input: {
  values?: Record<string, string>;
  metadata?: Record<string, unknown>;
}): string {
  const userId = optionalString(input.values?.userId) ?? optionalString(input.metadata?.userId);
  if (!userId) {
    throw new ProviderRequestError(400, "userId is required");
  }
  return userId;
}

async function createHtmlCssToImage(
  input: Record<string, unknown>,
  context: HtmlCssToImageActionContext,
): Promise<unknown> {
  const payload = await requestHtmlCssToImage({
    path: htmlCssToImageImagePath,
    body: buildCreateImageBody(input),
    credential: context.credential,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  return normalizeCreatedImage(payload);
}

async function createHtmlCssToImageBatch(
  input: Record<string, unknown>,
  context: HtmlCssToImageActionContext,
): Promise<unknown> {
  const payload = await requestHtmlCssToImage({
    path: htmlCssToImageBatchImagePath,
    body: {
      default_options: optionalRecord(input.default_options) ?? {},
      variations: buildBatchVariations(input.variations),
    },
    credential: context.credential,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requireHtmlCssToImageObject(payload, "HTML/CSS to Image batch response");
  const images = requireProviderArray(record.images, "images");

  return {
    images: images.map((image) => normalizeCreatedImage(image)),
  };
}

async function deleteHtmlCssToImage(
  input: Record<string, unknown>,
  context: HtmlCssToImageActionContext,
): Promise<unknown> {
  const imageId = requireNonEmptyString(input.image_id, "image_id");
  await requestHtmlCssToImage({
    method: "DELETE",
    path: `${htmlCssToImageImagePath}/${encodeURIComponent(imageId)}`,
    credential: context.credential,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    accepted: true,
    image_id: imageId,
  };
}

async function deleteHtmlCssToImageBatch(
  input: Record<string, unknown>,
  context: HtmlCssToImageActionContext,
): Promise<unknown> {
  const ids = Array.isArray(input.ids)
    ? input.ids.map((value, index) => requireNonEmptyString(value, `ids[${index}]`))
    : [];
  await requestHtmlCssToImage({
    method: "DELETE",
    path: htmlCssToImageBatchImagePath,
    body: { ids },
    credential: context.credential,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    accepted: true,
    ids,
  };
}

async function getHtmlCssToImageUsage(context: HtmlCssToImageActionContext): Promise<unknown> {
  const payload = await requestHtmlCssToImage({
    path: htmlCssToImageUsagePath,
    credential: context.credential,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requireHtmlCssToImageObject(payload, "HTML/CSS to Image usage response");
  const data = optionalRecord(record.data) ?? {};

  return {
    data: {
      hour: normalizeUsageBreakdown(data.hour),
      day: normalizeUsageBreakdown(data.day),
      month: normalizeUsageBreakdown(data.month),
    },
    per_billing_period: normalizeBillingPeriodUsage(record.per_billing_period),
  };
}

async function requestHtmlCssToImage(input: HtmlCssToImageRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal, htmlCssToImageRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(buildHtmlCssToImageUrl(input.path, input.query), {
      method: input.method ?? (input.body === undefined ? "GET" : "POST"),
      headers: {
        accept: "application/json",
        authorization: buildHtmlCssToImageAuthorization(input.credential),
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "HTML/CSS to Image request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `HTML/CSS to Image request failed: ${error.message}`
        : "HTML/CSS to Image request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readHtmlCssToImagePayload(response);
  if (!response.ok) {
    throw createHtmlCssToImageError(response, payload, input.phase);
  }
  return payload;
}

function buildCreateImageBody(input: Record<string, unknown>): Record<string, unknown> {
  assertExactlyOneHtmlOrUrl(input);
  return compactObject({
    html: optionalString(input.html),
    url: optionalString(input.url),
    ...buildRenderOptions(input),
  });
}

function buildBatchVariations(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item, index) => {
    const variation = optionalRecord(item) ?? {};
    try {
      return buildCreateImageBody(variation);
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw new ProviderRequestError(error.status, `variations[${index}]: ${error.message}`, error.details);
      }
      throw error;
    }
  });
}

function buildRenderOptions(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    css: optionalString(input.css),
    google_fonts: optionalString(input.google_fonts),
    selector: optionalString(input.selector),
    ms_delay: optionalInteger(input.ms_delay),
    max_wait_ms: optionalInteger(input.max_wait_ms),
    device_scale: optionalNumber(input.device_scale),
    render_when_ready: optionalBoolean(input.render_when_ready),
    full_screen: optionalBoolean(input.full_screen),
    block_consent_banners: optionalBoolean(input.block_consent_banners),
    viewport_width: optionalInteger(input.viewport_width),
    viewport_height: optionalInteger(input.viewport_height),
    viewport_mobile: optionalBoolean(input.viewport_mobile),
    viewport_landscape: optionalBoolean(input.viewport_landscape),
    viewport_touch: optionalBoolean(input.viewport_touch),
    color_scheme: optionalString(input.color_scheme),
    timezone: optionalString(input.timezone),
    disable_twemoji: optionalBoolean(input.disable_twemoji),
    proxy_id: optionalString(input.proxy_id),
  });
}

function assertExactlyOneHtmlOrUrl(input: Record<string, unknown>): void {
  const hasHtml = optionalString(input.html) !== undefined;
  const hasUrl = optionalString(input.url) !== undefined;
  if (hasHtml === hasUrl) {
    throw new ProviderRequestError(400, "Exactly one of html or url is required.");
  }
}

function buildHtmlCssToImageUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, htmlCssToImageApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildHtmlCssToImageAuthorization(credential: HtmlCssToImageCredential): string {
  return `Basic ${Buffer.from(`${credential.userId}:${credential.apiKey}`).toString("base64")}`;
}

async function readHtmlCssToImagePayload(response: Response): Promise<unknown> {
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

function normalizeCreatedImage(payload: unknown): Record<string, string> {
  const record = requireHtmlCssToImageObject(payload, "HTML/CSS to Image image response");
  return {
    id: requireProviderString(record.id, "id"),
    url: requireProviderString(record.url, "url"),
  };
}

function normalizeUsageBreakdown(value: unknown): Record<string, number> {
  const record = optionalRecord(value);
  if (!record) {
    return {};
  }
  const normalized: Record<string, number> = {};
  for (const [key, child] of Object.entries(record)) {
    const count = optionalInteger(child);
    if (count !== undefined) {
      normalized[key] = count;
    }
  }
  return normalized;
}

function normalizeBillingPeriodUsage(value: unknown): Array<{ total_images: number; start: string; end: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = requireHtmlCssToImageObject(item, "HTML/CSS to Image billing usage item");
    return {
      total_images: optionalInteger(record.total_images) ?? 0,
      start: requireProviderString(record.start, "start"),
      end: requireProviderString(record.end, "end"),
    };
  });
}

function createHtmlCssToImageError(
  response: Response,
  payload: unknown,
  phase: HtmlCssToImageRequestPhase,
): ProviderRequestError {
  const message =
    extractHtmlCssToImageMessage(payload) ?? `HTML/CSS to Image request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, payload);
}

function extractHtmlCssToImageMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function requireHtmlCssToImageObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return record;
}

function requireNonEmptyString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function requireProviderString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `HTML/CSS to Image response field ${fieldName} is required`);
  }
  return stringValue;
}

function requireProviderArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `HTML/CSS to Image response field ${fieldName} must be an array`, value);
  }
  return value;
}
