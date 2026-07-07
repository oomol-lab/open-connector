import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { TinypngActionName } from "./actions.ts";

import {
  base64Bytes,
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const tinypngApiBaseUrl: string = "https://api.tinify.com";
const tinypngShrinkUrl = `${tinypngApiBaseUrl}/shrink`;

type TinypngActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface TinypngImageInfo {
  size?: unknown;
  type?: unknown;
  width?: unknown;
  height?: unknown;
  url?: unknown;
}

export const tinypngActionHandlers: Record<TinypngActionName, TinypngActionHandler> = {
  shrink_image(input, context) {
    return shrinkImage(input, context);
  },
  output_image(input, context) {
    return outputImage(input, context);
  },
};

export async function validateTinypngCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const response = await fetcher(tinypngShrinkUrl, {
    method: "POST",
    headers: tinypngHeaders(apiKey, { contentType: "application/octet-stream" }),
    body: new Uint8Array(),
  });

  if (response.status === 401) {
    const error = await readTinypngError(response);
    throw new ProviderRequestError(400, error.message);
  }
  if (response.status === 429) {
    const error = await readTinypngError(response);
    throw new ProviderRequestError(429, error.message);
  }
  if (!response.ok && response.status !== 400 && response.status !== 415 && response.status !== 422) {
    const error = await readTinypngError(response);
    throw new ProviderRequestError(response.status || 502, error.message);
  }

  return {
    profile: {
      accountId: "tinypng-api-key",
      displayName: "TinyPNG API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/shrink",
      validationProbe: "empty_binary_upload",
      compressionCount: readHeaderInteger(response.headers, "Compression-Count"),
    }),
  };
}

async function shrinkImage(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const sourceUrl = optionalString(input.sourceUrl);
  const contentBase64 = optionalString(input.contentBase64);
  if ((sourceUrl ? 1 : 0) + (contentBase64 ? 1 : 0) !== 1) {
    throw new ProviderRequestError(400, "exactly one of sourceUrl or contentBase64 is required");
  }
  const publicSourceUrl = sourceUrl
    ? assertPublicHttpUrl(sourceUrl, {
        fieldName: "sourceUrl",
        createError: (message) => new ProviderRequestError(400, message),
      }).toString()
    : undefined;

  const response = await context.fetcher(tinypngShrinkUrl, {
    method: "POST",
    headers: tinypngHeaders(context.apiKey, {
      contentType: publicSourceUrl ? "application/json" : "application/octet-stream",
    }),
    body: publicSourceUrl
      ? JSON.stringify({
          source: { url: publicSourceUrl },
        })
      : base64Bytes(contentBase64, "contentBase64", (message) => new ProviderRequestError(400, message)),
    signal: context.signal,
  });

  await assertTinypngResponse(response, "execute");
  const payload = await readTinypngJson<{ input?: TinypngImageInfo; output?: TinypngImageInfo }>(
    response,
    "shrink_image",
  );
  const location = response.headers.get("location") ?? optionalString(payload.output?.url);
  if (!location) {
    throw new ProviderRequestError(502, "tinypng shrink response did not include output URL");
  }

  return compactObject({
    imageId: extractImageId(location),
    outputUrl: location,
    compressionCount: readHeaderInteger(response.headers, "Compression-Count"),
    input: toImageInfo(payload.input),
    output: toImageInfo(payload.output),
  });
}

async function outputImage(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }

  const imageId = extractImageId(requiredString(input.imageId, "imageId"));
  const requestBody = buildTinypngOutputRequest(input);
  const response = await context.fetcher(`${tinypngApiBaseUrl}/output/${encodeURIComponent(imageId)}`, {
    method: requestBody ? "POST" : "GET",
    headers: tinypngHeaders(context.apiKey, requestBody ? { contentType: "application/json" } : {}),
    ...(requestBody ? { body: JSON.stringify(requestBody) } : {}),
    signal: context.signal,
  });

  await assertTinypngResponse(response, "execute");
  const bytes = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type") ?? "image/png";
  const name = buildTinypngTransitFileName(imageId, mimeType);
  const upload = await context.transitFiles.create(new File([bytes], name, { type: mimeType }));

  return compactObject({
    imageId,
    compressionCount: readHeaderInteger(response.headers, "Compression-Count"),
    contentType: mimeType,
    contentLength: readHeaderInteger(response.headers, "content-length") ?? bytes.byteLength,
    imageWidth: readHeaderInteger(response.headers, "Image-Width"),
    imageHeight: readHeaderInteger(response.headers, "Image-Height"),
    image: {
      name,
      mimetype: mimeType,
      downloadUrl: upload.downloadUrl,
      fileId: upload.fileId,
      sizeBytes: upload.sizeBytes,
    },
  });
}

function tinypngHeaders(apiKey: string, input: { contentType?: string } = {}) {
  return {
    authorization: buildTinypngAuthorizationHeader(apiKey),
    "user-agent": providerUserAgent,
    ...(input.contentType ? { "content-type": input.contentType } : {}),
  };
}

export function buildTinypngAuthorizationHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`;
}

function buildTinypngOutputRequest(input: Record<string, unknown>) {
  const resize = buildResizeRequest(input.resize);
  const convert = buildConvertRequest(input.convert);
  const preserve = buildPreserveRequest(input.preserve);
  const transform = buildTransformRequest(input.transform);
  if (!resize && !convert && !preserve && !transform) {
    return undefined;
  }
  return compactObject({ resize, convert, preserve, transform });
}

function buildResizeRequest(value: unknown) {
  const object = optionalRecord(value);
  if (!object) {
    return undefined;
  }
  const method = optionalString(object.method);
  const width = optionalInteger(object.width);
  const height = optionalInteger(object.height);
  if (method === "scale" && width == null && height == null) {
    throw new ProviderRequestError(400, "resize.width or resize.height is required when method=scale");
  }
  if ((method === "fit" || method === "cover" || method === "thumb") && (width == null || height == null)) {
    throw new ProviderRequestError(400, "resize.width and resize.height are required for fit, cover, and thumb");
  }
  return compactObject({ method, width, height });
}

function buildConvertRequest(value: unknown) {
  const object = optionalRecord(value);
  if (!object) {
    return undefined;
  }
  return compactObject({
    type: Array.isArray(object.type) ? object.type.map((item) => String(item)) : optionalString(object.type),
  });
}

function buildPreserveRequest(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

function buildTransformRequest(value: unknown) {
  const object = optionalRecord(value);
  if (!object) {
    return undefined;
  }
  return compactObject({ background: optionalString(object.background) });
}

function toImageInfo(value: TinypngImageInfo | undefined) {
  if (!value) {
    return undefined;
  }
  return compactObject({
    size: optionalInteger(value.size),
    type: optionalString(value.type),
    width: optionalInteger(value.width),
    height: optionalInteger(value.height),
  });
}

function extractImageId(value: string) {
  try {
    const url = new URL(value);
    const imageId = url.pathname.split("/").filter(Boolean).pop();
    if (imageId) {
      return imageId;
    }
  } catch {
    // Fall through to support raw TinyPNG image ids and path fragments.
  }

  const imageId = value.trim().split("/").filter(Boolean).pop();
  if (!imageId) {
    throw new ProviderRequestError(400, "imageId is required");
  }
  return imageId;
}

function readHeaderInteger(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function buildTinypngTransitFileName(imageId: string, mimeType: string) {
  const extension = resolveTinypngExtension(mimeType);
  return extension ? `tinypng-${imageId}.${extension}` : `tinypng-${imageId}`;
}

function resolveTinypngExtension(mimeType: string) {
  const normalizedMimeType = mimeType.split(";")[0]?.trim().toLowerCase();
  switch (normalizedMimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/avif":
      return "avif";
    default:
      if (normalizedMimeType?.startsWith("image/")) {
        return normalizedMimeType.slice("image/".length).replace(/[^A-Za-z0-9]+/g, "") || "png";
      }
      return null;
  }
}

async function assertTinypngResponse(response: Response, mode: "validate" | "execute") {
  if (response.ok) {
    return;
  }

  const error = await readTinypngError(response);
  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message);
  }
  if (mode === "validate" && response.status === 401) {
    throw new ProviderRequestError(400, error.message);
  }
  if (mode === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, error.message);
  }
  if (response.status >= 400 && response.status < 500) {
    throw new ProviderRequestError(response.status, error.message);
  }

  throw new ProviderRequestError(response.status || 502, error.message);
}

async function readTinypngJson<T>(response: Response, actionName: TinypngActionName) {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, `tinypng ${actionName} response contained invalid JSON`);
  }
}

async function readTinypngError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: unknown;
      message?: unknown;
    };
    return {
      error: typeof payload.error === "string" ? payload.error : "provider_error",
      message: typeof payload.message === "string" ? payload.message : `tinypng request failed with ${response.status}`,
    };
  } catch {
    const message = (await response.text().catch(() => "")) || `tinypng request failed with ${response.status}`;
    return {
      error: "provider_error",
      message,
    };
  }
}
