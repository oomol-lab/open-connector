import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  TransitFileWriter,
} from "../../core/types.ts";
import type { KrakenIoActionName } from "./actions.ts";

import { extname } from "node:path";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "kraken_io";
const krakenApiBaseUrl = "https://api.kraken.io";
const krakenOptimizeUrl = `${krakenApiBaseUrl}/v1/url`;
const krakenUploadUrl = `${krakenApiBaseUrl}/v1/upload`;
const krakenUserStatusUrl = `${krakenApiBaseUrl}/user_status`;

type KrakenRequestPhase = "validate" | "execute";
type KrakenIoActionHandler = (input: Record<string, unknown>, context: KrakenIoActionContext) => Promise<unknown>;

interface KrakenIoActionContext {
  apiKey: string;
  apiSecret: string;
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

export const krakenIoActionHandlers: Record<KrakenIoActionName, KrakenIoActionHandler> = {
  get_user_status(_input, context) {
    return fetchKrakenUserStatus(context.apiKey, context.apiSecret, context.fetcher, context.signal, "execute");
  },
  optimize_image(input, context) {
    return optimizeKrakenImage(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<KrakenIoActionContext>({
  service,
  handlers: krakenIoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KrakenIoActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const providerContext: KrakenIoActionContext = {
      apiKey: credential.apiKey,
      apiSecret: requireKrakenApiSecret(credential.values.apiSecret ?? credential.metadata.apiSecret),
      fetcher,
      signal: context.signal,
    };
    if (context.transitFiles) {
      providerContext.transitFiles = context.transitFiles;
    }
    return providerContext;
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKrakenIoCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateKrakenIoCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiSecret = requireKrakenApiSecret(values.apiSecret);
  const status = await fetchKrakenUserStatus(apiKey, apiSecret, fetcher, signal, "validate");

  return {
    profile: {
      accountId: "kraken_io",
      displayName: status.planName || "Kraken.io API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: krakenApiBaseUrl,
      validationEndpoint: "/user_status",
      active: status.active,
      planName: status.planName,
      quotaTotal: status.quotaTotal,
      quotaUsed: status.quotaUsed,
      quotaRemaining: status.quotaRemaining,
    }),
  };
}

async function fetchKrakenUserStatus(
  apiKey: string,
  apiSecret: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  phase: KrakenRequestPhase,
): Promise<{ active: boolean; planName: string; quotaTotal: number; quotaUsed: number; quotaRemaining: number }> {
  const payload = await requestKrakenJson<Record<string, unknown>>(
    {
      url: krakenUserStatusUrl,
      method: "POST",
      headers: krakenJsonHeaders(),
      body: JSON.stringify({
        auth: buildKrakenAuth(apiKey, apiSecret),
      }),
      signal,
    },
    fetcher,
    phase,
  );

  return {
    active: Boolean(payload.success && payload.active),
    planName: readRequiredResponseString(payload.plan_name, "plan_name"),
    quotaTotal: readRequiredResponseInteger(payload.quota_total, "quota_total"),
    quotaUsed: readRequiredResponseInteger(payload.quota_used, "quota_used"),
    quotaRemaining: readRequiredResponseInteger(payload.quota_remaining, "quota_remaining"),
  };
}

async function optimizeKrakenImage(input: Record<string, unknown>, context: KrakenIoActionContext): Promise<unknown> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }

  validateKrakenOptimizeSource(input);
  validateResizeInput(optionalRecord(input.resize));

  const payload = await requestKrakenOptimization(input, context);
  const krakedUrl = readRequiredResponseString(payload.kraked_url, "kraked_url");
  const fileName = resolveKrakenFileName(payload, krakedUrl);
  const download = await downloadKrakenFile(krakedUrl, fileName, context);
  const upload = await context.transitFiles.create(
    new File([Uint8Array.from(download.bytes)], fileName, { type: download.contentType }),
  );

  return compactObject({
    fileName,
    originalSize: readRequiredResponseInteger(payload.original_size, "original_size"),
    optimizedSize: readRequiredResponseInteger(payload.kraked_size, "kraked_size"),
    savedBytes: readRequiredResponseInteger(payload.saved_bytes, "saved_bytes"),
    originalWidth: optionalInteger(payload.original_width),
    originalHeight: optionalInteger(payload.original_height),
    krakedUrl,
    contentType: download.contentType,
    contentLength: download.bytes.byteLength,
    file: {
      name: fileName,
      mimetype: download.contentType,
      fileId: upload.fileId,
      downloadUrl: upload.downloadUrl,
      sizeBytes: upload.sizeBytes,
      mimeType: download.contentType,
    },
  });
}

async function requestKrakenOptimization(
  input: Record<string, unknown>,
  context: KrakenIoActionContext,
): Promise<Record<string, unknown>> {
  const sourceUrl = optionalString(input.sourceUrl);
  const contentBase64 = optionalString(input.contentBase64);
  const payload = buildKrakenOptimizationPayload(input, context.apiKey, context.apiSecret);

  if (sourceUrl) {
    return requestKrakenJson<Record<string, unknown>>(
      {
        url: krakenOptimizeUrl,
        method: "POST",
        headers: krakenJsonHeaders(),
        body: JSON.stringify({
          ...payload,
          url: sourceUrl,
        }),
        signal: context.signal,
      },
      context.fetcher,
      "execute",
    );
  }

  if (!contentBase64) {
    throw new ProviderRequestError(400, "contentBase64 is required");
  }

  const formData = new FormData();
  formData.set("data", JSON.stringify(payload));
  formData.set("file", new File([Buffer.from(contentBase64, "base64")], resolveUploadFileName(input.fileName)));

  return requestKrakenJson<Record<string, unknown>>(
    {
      url: krakenUploadUrl,
      method: "POST",
      headers: krakenMultipartHeaders(),
      body: formData,
      signal: context.signal,
    },
    context.fetcher,
    "execute",
  );
}

function buildKrakenOptimizationPayload(
  input: Record<string, unknown>,
  apiKey: string,
  apiSecret: string,
): Record<string, unknown> {
  return compactObject({
    auth: buildKrakenAuth(apiKey, apiSecret),
    wait: true,
    lossy: optionalBoolean(input.lossy),
    quality: optionalInteger(input.quality),
    dev: optionalBoolean(input.dev),
    auto_orient: optionalBoolean(input.autoOrient),
    preserve_meta: readOptionalStringArray(input.preserveMeta),
    chroma_subsampling: optionalString(input.chromaSubsampling),
    resize: buildResizePayload(optionalRecord(input.resize)),
    convert: buildConvertPayload(optionalRecord(input.convert)),
  });
}

function buildResizePayload(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }

  return compactObject({
    strategy: optionalString(input.strategy),
    width: optionalInteger(input.width),
    height: optionalInteger(input.height),
    size: optionalInteger(input.size),
    x: optionalInteger(input.x),
    y: optionalInteger(input.y),
    scale: optionalInteger(input.scale),
    crop_mode: optionalString(input.cropMode),
    background: optionalString(input.background),
    enhance: optionalBoolean(input.enhance),
  });
}

function buildConvertPayload(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }

  return compactObject({
    format: optionalString(input.format),
    background: optionalString(input.background),
    keep_extension: optionalBoolean(input.keepExtension),
  });
}

async function requestKrakenJson<T>(
  request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: BodyInit | null;
    signal?: AbortSignal;
  },
  fetcher: typeof fetch,
  phase: KrakenRequestPhase,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Kraken.io request failed: ${error.message}` : "Kraken.io request failed",
    );
  }

  const payload = await readKrakenPayload(response);
  const payloadRecord = optionalRecord(payload);
  const success = payloadRecord && typeof payloadRecord.success === "boolean" ? payloadRecord.success : undefined;

  if (!response.ok || success === false) {
    throw createKrakenError(payload, response.status, phase);
  }

  if (!payloadRecord) {
    throw new ProviderRequestError(502, "Kraken.io response must be a JSON object", payload);
  }

  return payloadRecord as T;
}

async function readKrakenPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createKrakenError(payload: unknown, status: number, phase: KrakenRequestPhase): ProviderRequestError {
  const message =
    extractKrakenMessage(payload) ??
    (status === 401 || status === 403 ? "Kraken.io rejected the supplied credentials" : "Kraken.io request failed");

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractKrakenMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail))
    : undefined;
}

async function downloadKrakenFile(
  krakedUrl: string,
  fileName: string,
  context: Pick<KrakenIoActionContext, "fetcher" | "signal" | "transitFiles">,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }

  let response: Response;
  try {
    response = await context.fetcher(krakedUrl, {
      method: "GET",
      headers: {
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Kraken.io optimized file download failed: ${error.message}`
        : "Kraken.io optimized file download failed",
    );
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : response.status,
      `Kraken.io optimized file download failed with status ${response.status}`,
    );
  }

  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "Kraken.io optimized file download",
    createError: (message) => new ProviderRequestError(413, message),
  });
  if (bytes.byteLength === 0) {
    throw new ProviderRequestError(502, "Kraken.io optimized file download was empty");
  }

  return {
    bytes,
    contentType: normalizeContentType(response.headers.get("content-type"), fileName),
  };
}

function normalizeContentType(contentType: string | null, fileName: string): string {
  const normalized = contentType?.split(";")[0]?.trim();
  if (normalized) {
    return normalized;
  }

  switch (extname(fileName).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

function resolveKrakenFileName(payload: Record<string, unknown>, krakedUrl: string): string {
  const fileName = optionalString(payload.file_name);
  if (fileName) {
    return fileName;
  }

  try {
    const candidate = new URL(krakedUrl).pathname.split("/").at(-1)?.trim();
    if (candidate) {
      return candidate;
    }
  } catch {}

  return "kraken-output.bin";
}

function resolveUploadFileName(value: unknown): string {
  return optionalString(value) ?? "upload.bin";
}

function buildKrakenAuth(apiKey: string, apiSecret: string): { api_key: string; api_secret: string } {
  return {
    api_key: apiKey,
    api_secret: apiSecret,
  };
}

function krakenJsonHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

function krakenMultipartHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

function requireKrakenApiSecret(value: unknown): string {
  return requiredString(value, "apiSecret", (message) => new ProviderRequestError(400, message));
}

function readRequiredResponseString(value: unknown, fieldName: string): string {
  return requiredString(
    value,
    fieldName,
    () => new ProviderRequestError(502, `Kraken.io response did not include ${fieldName}`),
  );
}

function readRequiredResponseInteger(value: unknown, fieldName: string): number {
  const integerValue = optionalInteger(value);
  if (integerValue == null) {
    throw new ProviderRequestError(502, `Kraken.io response did not include ${fieldName}`);
  }
  return integerValue;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const result = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return result.length > 0 ? result : undefined;
}

function validateKrakenOptimizeSource(input: Record<string, unknown>): void {
  const sourceCount = [optionalString(input.sourceUrl), optionalString(input.contentBase64)].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "exactly one of sourceUrl or contentBase64 is required");
  }
}

function validateResizeInput(resize: Record<string, unknown> | undefined): void {
  if (!resize) {
    return;
  }

  const strategy = optionalString(resize.strategy);
  const width = optionalInteger(resize.width);
  const height = optionalInteger(resize.height);
  const size = optionalInteger(resize.size);

  if (requiresResizeDimensions(strategy) && (!width || !height)) {
    throw new ProviderRequestError(400, "resize.width and resize.height are required for exact, fit, fill, and crop");
  }
  if (strategy === "portrait" && !height) {
    throw new ProviderRequestError(400, "resize.height is required for portrait");
  }
  if (strategy === "landscape" && !width) {
    throw new ProviderRequestError(400, "resize.width is required for landscape");
  }
  if (strategy === "auto" && !width && !height) {
    throw new ProviderRequestError(400, "resize.width or resize.height is required for auto");
  }
  if (strategy === "square" && !size) {
    throw new ProviderRequestError(400, "resize.size is required for square");
  }
}

function requiresResizeDimensions(strategy: string | undefined): boolean {
  return strategy === "exact" || strategy === "fit" || strategy === "fill" || strategy === "crop";
}
