import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "imgbb";
const imgbbApiBaseUrl = "https://api.imgbb.com";
const imgbbUploadPath = "/1/upload";
const imgbbValidationProbeImageBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

type ImgbbRequestPhase = "validate" | "execute";
type ImgbbActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ImgbbActionHandler = (input: Record<string, unknown>, context: ImgbbActionContext) => Promise<unknown>;

interface ImgbbHostedVariant {
  filename: string;
  name: string;
  mimeType: string;
  extension: string;
  url: string;
}

export const imgbbActionHandlers: ProviderActionHandlers<"imgbb", ImgbbActionHandler> = {
  async upload_image(input, context) {
    const payload = await requestImgbbUpload(buildImgbbUploadFormData(input), context, "execute");
    return {
      upload: normalizeImgbbUpload(payload),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, imgbbActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestImgbbUpload(
      buildImgbbUploadFormData({
        contentBase64: imgbbValidationProbeImageBase64,
        expiration: 60,
      }),
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "api_key",
        displayName: "ImgBB API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: imgbbApiBaseUrl,
        validationEndpoint: imgbbUploadPath,
        validationProbe: "base64_upload",
      },
    };
  },
};

async function requestImgbbUpload(
  body: FormData,
  context: ImgbbActionContext,
  phase: ImgbbRequestPhase,
): Promise<unknown> {
  const url = new URL(imgbbUploadPath, imgbbApiBaseUrl);
  url.searchParams.set("key", context.apiKey);

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "POST",
      headers: imgbbHeaders(),
      body,
      signal: context.signal,
    });
    payload = await readImgbbPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ImgBB request failed: ${error.message}` : "ImgBB request failed",
      error,
    );
  }

  const record = optionalRecord(payload);
  const payloadStatus = optionalInteger(record?.status);
  const payloadSuccess = typeof record?.success === "boolean" ? record.success : undefined;
  const effectiveStatus = payloadStatus ?? response.status;

  if (
    !response.ok ||
    payloadSuccess === false ||
    (payloadStatus !== undefined && (payloadStatus < 200 || payloadStatus >= 300))
  ) {
    throw createImgbbError({
      phase,
      status: effectiveStatus,
      payload,
      fallbackMessage: response.statusText || "ImgBB request failed",
    });
  }

  return payload;
}

function buildImgbbUploadFormData(input: Record<string, unknown>): FormData {
  const formData = new FormData();
  const imageUrl = optionalString(input.imageUrl);
  const contentBase64 = optionalString(input.contentBase64);
  const name = optionalString(input.name);
  const expiration = optionalInteger(input.expiration);

  if (imageUrl) {
    formData.append("image", imageUrl);
  } else if (contentBase64) {
    formData.append("image", contentBase64);
  } else {
    throw new ProviderRequestError(400, "exactly one of imageUrl or contentBase64 is required");
  }

  if (name) {
    formData.append("name", name);
  }

  if (expiration !== undefined) {
    formData.append("expiration", String(expiration));
  }

  return formData;
}

function normalizeImgbbUpload(payload: unknown): Record<string, unknown> {
  const record = requireRecord(payload, "ImgBB upload response");
  const data = requireRecord(record.data, "ImgBB upload response.data");
  const image = normalizeImgbbVariant(data.image, "image");
  const imageUrl = readRequiredString(data.url, "data.url");

  return compactObject({
    id: readRequiredString(data.id, "data.id"),
    title: optionalString(data.title) ?? image.name,
    viewerUrl: readRequiredString(data.url_viewer, "data.url_viewer"),
    imageUrl,
    displayUrl: optionalString(data.display_url) ?? imageUrl,
    width: readRequiredInteger(data.width, "data.width"),
    height: readRequiredInteger(data.height, "data.height"),
    sizeBytes: readRequiredInteger(data.size, "data.size"),
    uploadedAtUnix: readRequiredInteger(data.time, "data.time"),
    expirationSeconds: optionalInteger(data.expiration) ?? 0,
    image,
    thumb: normalizeOptionalImgbbVariant(data.thumb, "thumb"),
    medium: normalizeOptionalImgbbVariant(data.medium, "medium"),
    deleteUrl: readRequiredString(data.delete_url, "data.delete_url"),
  });
}

function normalizeOptionalImgbbVariant(value: unknown, fieldName: string): ImgbbHostedVariant | null {
  if (value == null) {
    return null;
  }
  return normalizeImgbbVariant(value, fieldName);
}

function normalizeImgbbVariant(value: unknown, fieldName: string): ImgbbHostedVariant {
  const record = requireRecord(value, fieldName);
  return {
    filename: readRequiredString(record.filename, `${fieldName}.filename`),
    name: readRequiredString(record.name, `${fieldName}.name`),
    mimeType: readRequiredString(record.mime, `${fieldName}.mime`),
    extension: readRequiredString(record.extension, `${fieldName}.extension`),
    url: readRequiredString(record.url, `${fieldName}.url`),
  };
}

function imgbbHeaders(): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readImgbbPayload(response: Response): Promise<unknown> {
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

function createImgbbError(input: {
  phase: ImgbbRequestPhase;
  status: number;
  payload: unknown;
  fallbackMessage: string;
}): ProviderRequestError {
  const message = extractImgbbErrorMessage(input.payload) ?? input.fallbackMessage;

  if (input.status === 429) {
    return new ProviderRequestError(429, message, input.payload);
  }

  if (input.phase === "validate" && (input.status === 400 || input.status === 401 || input.status === 403)) {
    return new ProviderRequestError(400, message, input.payload);
  }

  if (input.phase === "execute" && (input.status === 401 || input.status === 403)) {
    return new ProviderRequestError(401, message, input.payload);
  }

  if (input.phase === "execute" && input.status === 400) {
    return new ProviderRequestError(400, message, input.payload);
  }

  return new ProviderRequestError(input.status >= 500 ? input.status : 502, message, input.payload);
}

function extractImgbbErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const data = optionalRecord(record.data);
  const topError = record.error;
  const topErrorRecord = optionalRecord(topError);
  const dataErrorRecord = optionalRecord(data?.error);

  return (
    optionalString(record.message) ??
    optionalString(topError) ??
    optionalString(topErrorRecord?.message) ??
    optionalString(data?.message) ??
    optionalString(dataErrorRecord?.message) ??
    optionalString(record.status_txt)
  );
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} did not include an object`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `${fieldName} did not include a string`);
  }
  return stringValue;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const integerValue = optionalInteger(value);
  if (integerValue === undefined) {
    throw new ProviderRequestError(502, `${fieldName} did not include an integer`);
  }
  return integerValue;
}
