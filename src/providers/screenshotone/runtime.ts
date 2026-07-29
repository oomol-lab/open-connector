import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";
import type { ScreenshotoneActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const screenshotoneApiBaseUrl = "https://api.screenshotone.com";
const screenshotoneUsagePath = "/usage";
const screenshotoneDevicesPath = "/devices";
const screenshotoneBulkPath = "/bulk";
const screenshotoneTakePath = "/take";
const screenshotoneAnimatePath = "/animate";

type ScreenshotoneActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const screenshotoneActionHandlers: Record<ScreenshotoneActionName, ScreenshotoneActionHandler> = {
  take_screenshot(input, context) {
    return takeScreenshotoneScreenshot(input, context);
  },
  take_animated_screenshot(input, context) {
    return takeScreenshotoneAnimatedScreenshot(input, context);
  },
  take_bulk_screenshots(input, context) {
    return takeScreenshotoneBulkScreenshots(input, context);
  },
  list_devices(_input, context) {
    return listScreenshotoneDevices(context);
  },
  get_usage(_input, context) {
    return getScreenshotoneUsage(context);
  },
};

export async function validateScreenshotoneApiKey(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const usage = await requestScreenshotoneUsage({
    apiKey,
    fetcher,
    signal,
  });

  return {
    profile: {
      displayName: "ScreenshotOne API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: screenshotoneUsagePath,
      apiBaseUrl: screenshotoneApiBaseUrl,
      usageTotal: usage.total,
      usageAvailable: usage.available,
      usageUsed: usage.used,
      concurrencyLimit: usage.concurrency.limit,
      concurrencyRemaining: usage.concurrency.remaining,
      concurrencyReset: usage.concurrency.reset,
    }),
  };
}

async function getScreenshotoneUsage(context: ApiKeyProviderContext): Promise<unknown> {
  return requestScreenshotoneUsage(context);
}

async function requestScreenshotoneUsage(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<{
  total: number;
  available: number;
  used: number;
  concurrency: { limit: number; remaining: number; reset: number };
}> {
  const response = await context.fetcher(buildScreenshotoneUrl(screenshotoneUsagePath, context.apiKey), {
    headers: screenshotoneHeaders(),
    signal: context.signal,
  });
  const payload = await readScreenshotonePayload(response);
  if (!response.ok) {
    throw createScreenshotoneError(response, payload);
  }
  return parseScreenshotoneUsagePayload(payload);
}

async function listScreenshotoneDevices(context: ApiKeyProviderContext): Promise<unknown> {
  const response = await context.fetcher(buildScreenshotoneUrl(screenshotoneDevicesPath, context.apiKey), {
    headers: screenshotoneHeaders(),
    signal: context.signal,
  });
  const payload = await readScreenshotonePayload(response);
  if (!response.ok) {
    throw createScreenshotoneError(response, payload);
  }

  return {
    devices: parseScreenshotoneDevicesPayload(payload),
  };
}

async function takeScreenshotoneBulkScreenshots(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  validateBulkScreenshotInput(input);
  const response = await context.fetcher(new URL(screenshotoneBulkPath, screenshotoneApiBaseUrl), {
    method: "POST",
    headers: screenshotoneJsonHeaders(),
    body: JSON.stringify({
      access_key: context.apiKey,
      ...input,
    }),
    signal: context.signal,
  });
  const payload = await readScreenshotonePayload(response);
  if (!response.ok) {
    throw createScreenshotoneError(response, payload);
  }

  return parseScreenshotoneBulkPayload(payload);
}

async function takeScreenshotoneScreenshot(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  validateScreenshotInput(input);
  const responseType = optionalString(input.response_type) ?? "by_format";
  if (responseType === "empty") {
    throw new ProviderRequestError(400, "response_type=empty is not supported");
  }
  if (responseType === "json") {
    if (input.cache !== true) {
      throw new ProviderRequestError(400, "response_type=json requires cache=true");
    }
    const response = await postScreenshotoneJson(screenshotoneTakePath, input, context);
    const payload = await readScreenshotonePayload(response);
    if (!response.ok) {
      throw createScreenshotoneError(response, payload);
    }

    const record = readObject(payload, "screenshotone screenshot response");
    const cacheUrl = optionalString(record.cache_url);
    if (!cacheUrl) {
      throw new ProviderRequestError(502, "screenshotone screenshot response did not include cache_url");
    }
    return { cache_url: cacheUrl };
  }

  requireTransitFiles(context, "take_screenshot");
  const response = await postScreenshotoneJson(screenshotoneTakePath, input, context);
  if (!response.ok) {
    const payload = await readScreenshotonePayload(response);
    throw createScreenshotoneError(response, payload);
  }

  return uploadScreenshotoneResponse(response, context, "screenshot");
}

async function takeScreenshotoneAnimatedScreenshot(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  validateAnimatedScreenshotInput(input);
  requireTransitFiles(context, "take_animated_screenshot");
  const response = await postScreenshotoneJson(screenshotoneAnimatePath, input, context);
  if (!response.ok) {
    const payload = await readScreenshotonePayload(response);
    throw createScreenshotoneError(response, payload);
  }

  return uploadScreenshotoneResponse(response, context, "animation");
}

async function postScreenshotoneJson(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Response> {
  return context.fetcher(new URL(path, screenshotoneApiBaseUrl), {
    method: "POST",
    headers: screenshotoneJsonHeaders(),
    body: JSON.stringify({
      access_key: context.apiKey,
      ...input,
    }),
    signal: context.signal,
  });
}

async function uploadScreenshotoneResponse(
  response: Response,
  context: ApiKeyProviderContext,
  kind: "animation" | "screenshot",
): Promise<Record<string, unknown>> {
  const transitFiles = requireTransitFiles(
    context,
    kind === "animation" ? "take_animated_screenshot" : "take_screenshot",
  );
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: transitFiles.maxBytes,
    fieldName: `ScreenshotOne ${kind} output`,
    createError: (message) => new ProviderRequestError(413, message),
  });
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const name = buildScreenshotoneTransitFileName(kind, mimeType);
  const upload = await transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));

  return {
    file: {
      name,
      mimetype: mimeType,
      fileId: upload.fileId,
      downloadUrl: upload.downloadUrl,
      sizeBytes: upload.sizeBytes,
      mimeType,
    },
    content_type: mimeType,
  };
}

async function readScreenshotonePayload(response: Response): Promise<unknown> {
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

function parseScreenshotoneUsagePayload(payload: unknown): {
  total: number;
  available: number;
  used: number;
  concurrency: { limit: number; remaining: number; reset: number };
} {
  const record = readObject(payload, "screenshotone usage response");
  const concurrency = optionalRecord(record.concurrency);
  if (!concurrency) {
    throw new ProviderRequestError(502, "screenshotone usage response is missing concurrency");
  }

  return {
    total: readInteger(record.total, "total"),
    available: readInteger(record.available, "available"),
    used: readInteger(record.used, "used"),
    concurrency: {
      limit: readInteger(concurrency.limit, "concurrency.limit"),
      remaining: readInteger(concurrency.remaining, "concurrency.remaining"),
      reset: readInteger(concurrency.reset, "concurrency.reset"),
    },
  };
}

function parseScreenshotoneDevicesPayload(payload: unknown): Array<Record<string, unknown>> {
  const devices = Array.isArray(payload)
    ? readObjectArray(payload, "devices")
    : readObjectArray(readObject(payload, "devices").devices, "devices");

  return devices.map((device) => {
    const viewport = optionalRecord(device.viewport);
    if (!viewport) {
      throw new ProviderRequestError(502, "screenshotone device response is missing viewport");
    }

    return {
      id: requireString(device.id, "device.id"),
      name: requireString(device.name, "device.name"),
      userAgent: requireString(device.userAgent, "device.userAgent"),
      viewport: {
        width: readInteger(viewport.width, "device.viewport.width"),
        height: readInteger(viewport.height, "device.viewport.height"),
        deviceScaleFactor: requireNumber(viewport.deviceScaleFactor, "device.viewport.deviceScaleFactor"),
        isMobile: requireBoolean(viewport.isMobile, "device.viewport.isMobile"),
        hasTouch: requireBoolean(viewport.hasTouch, "device.viewport.hasTouch"),
        isLandscape: requireBoolean(viewport.isLandscape, "device.viewport.isLandscape"),
      },
    };
  });
}

function parseScreenshotoneBulkPayload(payload: unknown): Record<string, unknown> {
  const record = readObject(payload, "screenshotone bulk response");
  const responses = readObjectArray(record.responses, "responses");

  return {
    responses: responses.map((item) => {
      const execution = optionalRecord(item.response);
      return compactObject({
        url: requireString(item.url, "responses.url"),
        response: execution
          ? {
              is_successful: requireBoolean(execution.is_successful, "responses.response.is_successful"),
              status: readInteger(execution.status, "responses.response.status"),
              statusText: requireString(execution.statusText, "responses.response.statusText"),
              body: parseBulkResponseBody(execution.body),
            }
          : undefined,
      });
    }),
  };
}

function parseBulkResponseBody(value: unknown): Record<string, string> | undefined {
  const body = optionalRecord(value);
  if (!body) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(body).map(([key, child]) => [key, String(child)]));
}

function createScreenshotoneError(response: Response, payload: unknown): ProviderRequestError {
  return new ProviderRequestError(response.status || 502, extractScreenshotoneMessage(payload));
}

function extractScreenshotoneMessage(payload: unknown): string {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return "ScreenshotOne request failed";
  }

  return (
    optionalString(record.error_message) ??
    optionalString(record.message) ??
    optionalString(record.error) ??
    "ScreenshotOne request failed"
  );
}

function requireTransitFiles(context: ApiKeyProviderContext, actionName: string) {
  if (!context.transitFiles) {
    throw new ProviderRequestError(500, `${actionName} requires transit file storage`);
  }
  return context.transitFiles;
}

function buildScreenshotoneUrl(path: string, apiKey: string): URL {
  const url = new URL(path, screenshotoneApiBaseUrl);
  url.searchParams.set("access_key", apiKey);
  return url;
}

function screenshotoneHeaders(): Record<string, string> {
  return {
    "user-agent": providerUserAgent,
  };
}

function screenshotoneJsonHeaders(): Record<string, string> {
  return {
    ...screenshotoneHeaders(),
    "content-type": "application/json",
  };
}

function buildScreenshotoneTransitFileName(kind: "animation" | "screenshot", mimeType: string): string {
  const extension = resolveScreenshotoneExtension(mimeType);
  return extension ? `screenshotone-${kind}.${extension}` : `screenshotone-${kind}`;
}

function resolveScreenshotoneExtension(mimeType: string): string | null {
  const normalizedMimeType = mimeType.split(";")[0]?.trim().toLowerCase();
  switch (normalizedMimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "application/pdf":
      return "pdf";
    case "text/html":
      return "html";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    case "video/x-msvideo":
      return "avi";
    case "video/webm":
      return "webm";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

function validateScreenshotInput(input: Record<string, unknown>): void {
  const sourceCount = ["url", "html", "markdown"].filter((key) => input[key] != null).length;
  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "exactly one of url, html, or markdown is required");
  }
}

function validateAnimatedScreenshotInput(input: Record<string, unknown>): void {
  const hasWidth = input.width != null;
  const hasHeight = input.height != null;
  if (hasWidth !== hasHeight) {
    throw new ProviderRequestError(400, "width and height must be provided together");
  }

  const hasClip = input.clip_x != null || input.clip_y != null || input.clip_width != null || input.clip_height != null;
  if (hasClip && input.format !== "gif") {
    throw new ProviderRequestError(400, "clip parameters require format=gif");
  }

  if (input.omit_background && input.format !== "mov") {
    throw new ProviderRequestError(400, "omit_background requires format=mov");
  }
}

function validateBulkScreenshotInput(input: Record<string, unknown>): void {
  if (input.optimize && input.execute !== true) {
    throw new ProviderRequestError(400, "optimize=true requires execute=true");
  }
  if (!Array.isArray(input.requests) || input.requests.length === 0) {
    throw new ProviderRequestError(400, "requests is required");
  }
  if (input.requests.length > 20) {
    throw new ProviderRequestError(400, "requests must contain at most 20 items");
  }
  const options = optionalRecord(input.options) ?? {};
  for (const [index, requestValue] of input.requests.entries()) {
    const request = optionalRecord(requestValue);
    if (!request) {
      throw new ProviderRequestError(400, `requests.${index} must be an object`);
    }
    const sourceCount = ["url", "html", "markdown"].filter((key) => request[key] ?? options[key]).length;
    if (sourceCount !== 1) {
      throw new ProviderRequestError(400, "each bulk request must resolve to exactly one of url, html, or markdown");
    }
  }
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} is invalid`);
  }
  return record;
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `screenshotone response is missing ${fieldName}`);
  }
  return value.map((item) => readObject(item, fieldName));
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `screenshotone response is missing ${fieldName}`);
  }
  return parsed;
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `screenshotone response is missing ${fieldName}`);
  }
  return value;
}

function requireNumber(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ProviderRequestError(502, `screenshotone response is missing ${fieldName}`);
  }
  return parsed;
}

function readInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `screenshotone response is missing ${fieldName}`);
  }
  return value;
}
