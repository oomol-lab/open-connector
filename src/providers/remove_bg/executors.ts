import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";

const service = "remove_bg";
const removeBgApiBaseUrl = "https://api.remove.bg/v1.0";
const removeBgAccountPath = "/account";
const removeBgImprovePath = "/improve";
const removeBgRemovePath = "/removebg";
const removeBgSupportedResultMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "application/zip"]);

type RemoveBgActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const removeBgActionHandlers: Record<string, RemoveBgActionHandler> = {
  remove_background(input, context) {
    return removeBgRemoveBackground(input, context);
  },
  get_account(_input, context) {
    return fetchRemoveBgAccount(context);
  },
  submit_improvement(input, context) {
    return submitRemoveBgImprovement(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, removeBgActionHandlers);

export const credentialValidators = {
  async apiKey(
    input: { apiKey: string; values: Record<string, string> },
    options: { fetcher: typeof fetch; signal?: AbortSignal },
  ): Promise<CredentialValidationResult> {
    const account = await fetchRemoveBgAccount({
      apiKey: input.apiKey,
      fetcher: options.fetcher,
      signal: options.signal,
    });
    return {
      profile: {
        accountId: "remove-bg-api-key",
        displayName: "remove.bg API Key",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: removeBgAccountPath,
        apiBaseUrl: removeBgApiBaseUrl,
        account,
      },
    };
  },
};

async function fetchRemoveBgAccount(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const response = await context.fetcher(`${removeBgApiBaseUrl}${removeBgAccountPath}`, {
    headers: removeBgHeaders(context.apiKey, { acceptJson: true }),
    signal: context.signal,
  });
  const payload = await readRemoveBgPayload(response);
  if (!response.ok) {
    throw createRemoveBgError(response, payload);
  }
  return parseRemoveBgAccountPayload(payload);
}

async function submitRemoveBgImprovement(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  validateSourceChoice(input);
  const formData = buildRemoveBgSourceFormData(input);
  appendOptionalFormField(formData, "image_filename", pickNonEmptyString(input, "fileName"));
  appendOptionalFormField(formData, "tag", optionalString(input.tag));
  const response = await context.fetcher(`${removeBgApiBaseUrl}${removeBgImprovePath}`, {
    method: "POST",
    headers: removeBgHeaders(context.apiKey, { acceptJson: true }),
    body: formData,
    signal: context.signal,
  });
  const payload = await readRemoveBgPayload(response);
  if (!response.ok) {
    throw createRemoveBgError(response, payload);
  }
  const record = optionalRecord(payload);
  const id = optionalString(record?.id);
  if (!id) {
    throw new ProviderRequestError(502, "remove.bg improvement response did not include submission id");
  }
  return { id };
}

async function removeBgRemoveBackground(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }
  validateSourceChoice(input);
  validateBackgroundChoice(input);
  const formData = buildRemoveBgRemoveBackgroundFormData(input);
  const response = await context.fetcher(`${removeBgApiBaseUrl}${removeBgRemovePath}`, {
    method: "POST",
    headers: removeBgHeaders(context.apiKey),
    body: formData,
    signal: context.signal,
  });
  if (!response.ok) {
    const payload = await readRemoveBgPayload(response);
    throw createRemoveBgError(response, payload);
  }
  const normalizedContentType = normalizeMimeType(response.headers.get("content-type"));
  let payload: unknown;
  let bytes: Uint8Array;
  if (normalizedContentType === "application/json") {
    const jsonBytes = await readBoundedResponseBytes(response, {
      maxBytes: Math.ceil((context.transitFiles.maxBytes * 4) / 3) + 1024 * 1024,
      fieldName: "remove.bg JSON result",
      createError: (message) => new ProviderRequestError(413, message),
    });
    payload = JSON.parse(new TextDecoder().decode(jsonBytes)) as unknown;
    bytes = Buffer.from(extractRemoveBgResultBase64(payload), "base64");
  } else {
    bytes = await readBoundedResponseBytes(response, {
      maxBytes: context.transitFiles.maxBytes,
      fieldName: "remove.bg result",
      createError: (message) => new ProviderRequestError(413, message),
    });
  }
  if (bytes.byteLength > context.transitFiles.maxBytes) {
    throw new ProviderRequestError(413, `remove.bg result exceeds ${context.transitFiles.maxBytes} bytes`);
  }
  if (bytes.byteLength === 0) {
    throw new ProviderRequestError(502, "remove.bg response did not include result bytes");
  }
  const resolvedMimeType = resolveRemoveBgResultMimeType(bytes, normalizedContentType);
  const name = buildRemoveBgResultFileName(resolvedMimeType);
  const file = await context.transitFiles.create(
    new File([arrayBufferFromBytes(bytes)], name, { type: resolvedMimeType }),
  );
  return compactObject({
    file,
    contentType: resolvedMimeType,
    contentLength: bytes.byteLength,
    ...readRemoveBgResultMetadata(response.headers, payload),
  });
}

function validateSourceChoice(input: Record<string, unknown>): void {
  const sourceCount = [
    pickNonEmptyString(input, "imageUrl") !== undefined,
    pickNonEmptyString(input, "contentBase64") !== undefined,
  ].filter(Boolean).length;
  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "exactly one of imageUrl or contentBase64 is required");
  }
}

function validateBackgroundChoice(input: Record<string, unknown>): void {
  const backgroundCount = [
    pickNonEmptyString(input, "backgroundColor") !== undefined,
    pickNonEmptyString(input, "backgroundImageUrl") !== undefined,
    pickNonEmptyString(input, "backgroundContentBase64") !== undefined,
  ].filter(Boolean).length;
  if (backgroundCount > 1) {
    throw new ProviderRequestError(
      400,
      "only one of backgroundColor, backgroundImageUrl, or backgroundContentBase64 may be provided",
    );
  }
  if (input.backgroundFileName != null && input.backgroundContentBase64 == null) {
    throw new ProviderRequestError(400, "backgroundFileName requires backgroundContentBase64");
  }
}

function buildRemoveBgSourceFormData(input: Record<string, unknown>): FormData {
  const formData = new FormData();
  const imageUrl = pickNonEmptyString(input, "imageUrl");
  const contentBase64 = pickNonEmptyString(input, "contentBase64");
  if (imageUrl) {
    formData.set("image_url", imageUrl);
    return formData;
  }
  if (contentBase64) {
    formData.set("image_file_b64", contentBase64);
    return formData;
  }
  throw new ProviderRequestError(400, "image source is required");
}

function buildRemoveBgRemoveBackgroundFormData(input: Record<string, unknown>): FormData {
  const formData = buildRemoveBgSourceFormData(input);
  appendOptionalFormField(formData, "size", optionalString(input.size));
  appendOptionalFormField(formData, "type", optionalString(input.type));
  appendOptionalFormField(formData, "type_level", pickNonEmptyString(input, "typeLevel"));
  appendOptionalFormField(formData, "format", optionalString(input.format));
  appendOptionalFormField(formData, "roi", optionalString(input.roi));
  appendOptionalBooleanField(formData, "crop", optionalBoolean(input.crop));
  appendOptionalFormField(formData, "crop_margin", pickNonEmptyString(input, "cropMargin"));
  appendOptionalFormField(formData, "scale", optionalString(input.scale));
  appendOptionalFormField(formData, "position", optionalString(input.position));
  appendOptionalFormField(formData, "channels", optionalString(input.channels));
  appendOptionalFormField(formData, "shadow_type", pickNonEmptyString(input, "shadowType"));
  appendOptionalFormField(formData, "shadow_opacity", pickNonEmptyString(input, "shadowOpacity"));
  appendOptionalBooleanField(formData, "semitransparency", optionalBoolean(input.semitransparency));
  appendOptionalFormField(formData, "bg_color", pickNonEmptyString(input, "backgroundColor"));
  appendOptionalFormField(formData, "bg_image_url", pickNonEmptyString(input, "backgroundImageUrl"));
  const backgroundContentBase64 = optionalString(input.backgroundContentBase64);
  if (backgroundContentBase64) {
    const backgroundBytes = Buffer.from(backgroundContentBase64, "base64");
    const backgroundMimeType = detectRemoveBgMimeTypeFromBytes(backgroundBytes) ?? "application/octet-stream";
    const backgroundFileName =
      optionalString(input.backgroundFileName) ?? buildRemoveBgBackgroundFileName(backgroundMimeType);
    formData.set(
      "bg_image_file",
      new File([arrayBufferFromBytes(backgroundBytes)], backgroundFileName, { type: backgroundMimeType }),
    );
  }
  return formData;
}

function appendOptionalFormField(formData: FormData, key: string, value: string | undefined): void {
  if (value) {
    formData.set(key, value);
  }
}

function appendOptionalBooleanField(formData: FormData, key: string, value: boolean | undefined): void {
  if (value !== undefined) {
    formData.set(key, String(value));
  }
}

function parseRemoveBgAccountPayload(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  const attributes = optionalRecord(data?.attributes);
  if (!attributes) {
    throw new ProviderRequestError(502, "remove.bg account response did not include data.attributes");
  }
  const credits = optionalRecord(attributes.credits);
  const api = optionalRecord(attributes.api);
  return {
    credits: compactObject({
      total: optionalNumber(credits?.total),
      subscription: optionalNumber(credits?.subscription),
      payg: optionalNumber(credits?.payg),
      enterprise: optionalNumber(credits?.enterprise),
    }),
    api: compactObject({
      freeCalls: optionalInteger(api?.free_calls),
      sizes: optionalString(api?.sizes),
    }),
  };
}

async function readRemoveBgPayload(response: Response): Promise<unknown> {
  const contentType = normalizeMimeType(response.headers.get("content-type"));
  if (contentType === "application/json") {
    return response.json();
  }
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createRemoveBgError(response: Response, payload: unknown): ProviderRequestError {
  const message = extractRemoveBgErrorMessage(payload) ?? `remove.bg request failed with status ${response.status}`;
  if (response.status === 403 || response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 402) {
    return new ProviderRequestError(402, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function extractRemoveBgErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const record = optionalRecord(payload);
  const errors = record?.errors;
  if (!Array.isArray(errors) || errors.length === 0) {
    return undefined;
  }
  const firstError = optionalRecord(errors[0]);
  const title = optionalString(firstError?.title);
  const detail = optionalString(firstError?.detail);
  if (title && detail) {
    return `${title}: ${detail}`;
  }
  return title ?? detail ?? optionalString(firstError?.code);
}

function extractRemoveBgResultBase64(payload: unknown): string {
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  const resultBase64 = optionalString(data?.result_b64);
  if (!resultBase64) {
    throw new ProviderRequestError(502, "remove.bg JSON response did not include data.result_b64");
  }
  return resultBase64;
}

function readRemoveBgResultMetadata(headers: Headers, payload?: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  return compactObject({
    width: readHeaderInteger(headers, "X-Width"),
    height: readHeaderInteger(headers, "X-Height"),
    foregroundType: headers.get("X-Type") ?? undefined,
    creditsCharged: readHeaderNumber(headers, "X-Credits-Charged"),
    foregroundTop: readHeaderInteger(headers, "X-Foreground-Top") ?? optionalInteger(data?.foreground_top),
    foregroundLeft: readHeaderInteger(headers, "X-Foreground-Left") ?? optionalInteger(data?.foreground_left),
    foregroundWidth: readHeaderInteger(headers, "X-Foreground-Width") ?? optionalInteger(data?.foreground_width),
    foregroundHeight: readHeaderInteger(headers, "X-Foreground-Height") ?? optionalInteger(data?.foreground_height),
  });
}

function removeBgHeaders(apiKey: string, input: { acceptJson?: boolean } = {}): Headers {
  const headers = new Headers({ "X-Api-Key": apiKey });
  if (input.acceptJson) {
    headers.set("accept", "application/json");
  }
  return headers;
}

function normalizeMimeType(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.split(";")[0]?.trim().toLowerCase() || undefined;
}

function resolveRemoveBgResultMimeType(bytes: Uint8Array, contentType?: string): string {
  if (contentType && removeBgSupportedResultMimeTypes.has(contentType)) {
    return contentType;
  }
  const detectedMimeType = detectRemoveBgMimeTypeFromBytes(bytes);
  if (detectedMimeType) {
    return detectedMimeType;
  }
  throw new ProviderRequestError(502, "remove.bg response did not include a supported result file type");
}

function detectRemoveBgMimeTypeFromBytes(bytes: Uint8Array): string | undefined {
  if (isPng(bytes)) return "image/png";
  if (isJpeg(bytes)) return "image/jpeg";
  if (isWebp(bytes)) return "image/webp";
  if (isZip(bytes)) return "application/zip";
  return undefined;
}

function buildRemoveBgResultFileName(mimeType: string): string {
  const extension = resolveRemoveBgExtension(mimeType);
  return extension ? `remove-bg-result.${extension}` : "remove-bg-result";
}

function buildRemoveBgBackgroundFileName(mimeType: string): string {
  const extension = resolveRemoveBgExtension(mimeType);
  return extension ? `background.${extension}` : "background";
}

function resolveRemoveBgExtension(mimeType: string): string | undefined {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "application/zip":
      return "zip";
    default:
      return undefined;
  }
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function readHeaderInteger(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readHeaderNumber(headers: Headers, name: string): number | undefined {
  const value = headers.get(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function pickNonEmptyString(input: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}
