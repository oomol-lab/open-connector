import type { CredentialValidationResult, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const browserlessApiBaseUrl = "https://production-sfo.browserless.io";
const browserlessRequestTimeoutMs = 60_000;
const browserlessValidationUrl = "https://example.com";

type BrowserlessRequestPhase = "validate" | "execute";
type BrowserlessBinaryActionName = "generate_pdf" | "take_screenshot";
type BrowserlessActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal" | "transitFiles">;
type BrowserlessActionHandler = (input: Record<string, unknown>, context: BrowserlessActionContext) => Promise<unknown>;
type BrowserlessRequestInput = {
  path: string;
  apiKey: string;
  body: Record<string, unknown>;
  fetcher: ProviderFetch;
  phase: BrowserlessRequestPhase;
  signal?: AbortSignal;
} & (
  | {
      responseType: "binary";
      maxBytes: number;
      fieldName: string;
    }
  | {
      responseType: "text";
    }
);

interface BrowserlessBinaryResponse {
  bytes: Uint8Array;
  contentType: string;
}

export const browserlessActionHandlers: ProviderActionHandlers<"browserless", BrowserlessActionHandler> = {
  fetch_content(input, context) {
    return fetchBrowserlessContent(input, context);
  },
  take_screenshot(input, context) {
    return fetchBrowserlessBinary("take_screenshot", "/screenshot", input, context);
  },
  generate_pdf(input, context) {
    return fetchBrowserlessBinary("generate_pdf", "/pdf", input, context);
  },
};

export async function validateBrowserlessCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const trimmedApiKey = optionalString(apiKey);
  if (!trimmedApiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }

  await requestBrowserless({
    path: "/content",
    apiKey: trimmedApiKey,
    body: {
      url: browserlessValidationUrl,
    },
    fetcher,
    signal,
    phase: "validate",
    responseType: "text",
  });

  return {
    profile: {
      accountId: "api_token",
      displayName: "Browserless API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: browserlessApiBaseUrl,
      validationEndpoint: "/content",
      validationUrl: browserlessValidationUrl,
    },
  };
}

async function fetchBrowserlessContent(
  input: Record<string, unknown>,
  context: BrowserlessActionContext,
): Promise<{ html: string }> {
  const html = await requestBrowserless({
    path: "/content",
    apiKey: context.apiKey,
    body: buildBrowserlessRequestBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    responseType: "text",
  });

  return { html };
}

async function fetchBrowserlessBinary(
  actionName: BrowserlessBinaryActionName,
  path: string,
  input: Record<string, unknown>,
  context: BrowserlessActionContext,
): Promise<Record<string, unknown>> {
  const transitFiles = requireBrowserlessTransitFiles(context, actionName);
  const response = await requestBrowserless({
    path,
    apiKey: context.apiKey,
    body: buildBrowserlessRequestBody(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    responseType: "binary",
    maxBytes: transitFiles.maxBytes,
    fieldName: actionName,
  });
  const name = buildBrowserlessFileName(actionName, response.contentType);
  const upload = await transitFiles.create(
    new File([Uint8Array.from(response.bytes)], name, { type: response.contentType }),
  );

  return {
    file: {
      fileId: upload.fileId,
      downloadUrl: upload.downloadUrl,
      sizeBytes: upload.sizeBytes,
      name: upload.name,
      mimeType: upload.mimeType,
    },
  };
}

function buildBrowserlessRequestBody(input: Record<string, unknown>): Record<string, unknown> {
  const body = compactObject({
    url: optionalString(input.url),
    html: optionalString(input.html),
    bestAttempt: optionalBoolean(input.bestAttempt),
    gotoOptions: readNestedObject(input.gotoOptions),
    waitForEvent: readNestedObject(input.waitForEvent),
    waitForTimeout: optionalInteger(input.waitForTimeout),
    waitForSelector: readNestedObject(input.waitForSelector),
    rejectResourceTypes: readStringArray(input.rejectResourceTypes),
    rejectRequestPattern: readStringArray(input.rejectRequestPattern),
    addScriptTag: readTagArray(input.addScriptTag),
    addStyleTag: readTagArray(input.addStyleTag),
    options: readNestedObject(input.options),
  });

  if (body.url && body.html) {
    throw new ProviderRequestError(400, "url and html cannot be provided together");
  }
  if (!body.url && !body.html) {
    throw new ProviderRequestError(400, "url or html is required");
  }

  return body;
}

async function requestBrowserless(
  input: BrowserlessRequestInput & { responseType: "binary" },
): Promise<BrowserlessBinaryResponse>;
async function requestBrowserless(input: BrowserlessRequestInput & { responseType: "text" }): Promise<string>;
async function requestBrowserless(input: BrowserlessRequestInput): Promise<BrowserlessBinaryResponse | string> {
  const timeout = createProviderTimeout(input.signal, browserlessRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildBrowserlessUrl(input.path, input.apiKey), {
      method: "POST",
      headers: {
        accept: input.responseType === "binary" ? "*/*" : "text/html",
        "cache-control": "no-cache",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal: timeout.signal,
    });

    if (!response.ok) {
      const payload = await readBrowserlessErrorPayload(response);
      throw createBrowserlessError(response, payload, input.phase);
    }

    if (input.responseType === "text") {
      return await response.text();
    }

    return {
      bytes: await readBoundedResponseBytes(response, {
        maxBytes: input.maxBytes,
        fieldName: input.fieldName,
        createError: (message) => new ProviderRequestError(413, message),
      }),
      contentType: normalizeContentType(response.headers.get("content-type")) ?? "application/octet-stream",
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Browserless request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Browserless request failed: ${error.message}` : "Browserless request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function requireBrowserlessTransitFiles(
  context: Pick<BrowserlessActionContext, "transitFiles">,
  actionName: BrowserlessBinaryActionName,
): TransitFileWriter {
  if (!context.transitFiles) {
    throw new ProviderRequestError(500, `${actionName} requires transit file storage`);
  }
  return context.transitFiles;
}

function buildBrowserlessUrl(path: string, apiKey: string): string {
  const url = new URL(path, browserlessApiBaseUrl);
  url.searchParams.set("token", apiKey);
  return url.toString();
}

async function readBrowserlessErrorPayload(response: Response): Promise<unknown> {
  const contentType = normalizeContentType(response.headers.get("content-type"));
  if (contentType === "application/json") {
    try {
      return (await response.json()) as unknown;
    } catch {
      return null;
    }
  }

  const text = await response.text().catch(() => "");
  return text.trim() === "" ? null : text;
}

function createBrowserlessError(
  response: Response,
  payload: unknown,
  phase: BrowserlessRequestPhase,
): ProviderRequestError {
  const message =
    extractBrowserlessErrorMessage(payload) ?? `Browserless request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if ((response.status === 401 || response.status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractBrowserlessErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.details);
}

function readNestedObject(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(record));
}

function readTagArray(value: unknown): Array<Record<string, string>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value
    .map((entry) => {
      const record = optionalRecord(entry);
      if (!record) {
        return undefined;
      }

      const tag = compactObject({
        url: optionalString(record.url),
        content: optionalString(record.content),
      });

      return Object.keys(tag).length > 0 ? tag : undefined;
    })
    .filter((entry): entry is Record<string, string> => entry !== undefined);

  return result.length > 0 ? result : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value
    .map((entry) => optionalString(entry))
    .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  return result.length > 0 ? result : undefined;
}

function normalizeContentType(value: string | null): string | undefined {
  return value?.split(";")[0]?.trim().toLowerCase() || undefined;
}

function buildBrowserlessFileName(actionName: BrowserlessBinaryActionName, contentType: string): string {
  const extension = resolveBrowserlessExtension(contentType);
  const baseName = actionName === "generate_pdf" ? "browserless-document" : "browserless-screenshot";
  return `${baseName}.${extension}`;
}

function resolveBrowserlessExtension(contentType: string): string {
  switch (contentType) {
    case "application/pdf":
      return "pdf";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/png":
    default:
      return "png";
  }
}
