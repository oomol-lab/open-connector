import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderTransitFile } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  base64Bytes,
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
  readTransitFileInput,
} from "../provider-runtime.ts";

export const pixellabApiBaseUrl = "https://api.pixellab.ai/v2";

type PixellabActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface PixellabBase64Image {
  type: "base64";
  base64: string;
  format: "png" | "jpeg";
}

interface DecodedPixellabImage {
  bytes: Uint8Array<ArrayBuffer>;
  mimeType: "image/png" | "image/jpeg";
  extension: "png" | "jpg";
}

export interface NormalizedPixellabUsage {
  type: "usd" | "generations";
  usd?: number;
  generations?: number;
}

const pixellabValidationPath = "/characters?limit=1&offset=0";
const maxAnimationFrames = 64;

export const pixellabActionHandlers: Record<string, PixellabActionHandler> = {
  async start_text_animation(input, context) {
    const frameCount = optionalInteger(input.frameCount);
    if (frameCount !== undefined && frameCount % 2 !== 0) {
      throw new ProviderRequestError(400, "frameCount must be even.");
    }

    const firstFrame = await encodeTransitImage(input.firstFrame, "firstFrame", context);
    const lastFrame =
      input.lastFrame === undefined ? undefined : await encodeTransitImage(input.lastFrame, "lastFrame", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/animate-with-text-v3",
      compactObject({
        first_frame: firstFrame,
        last_frame: lastFrame,
        action: readRequiredString(input.action, "action"),
        frame_count: frameCount,
        seed: optionalInteger(input.seed),
        no_background: optionalBoolean(input.noBackground),
        enhance_prompt: optionalBoolean(input.enhancePrompt),
      }),
      context,
    );
    return normalizeStartedJob(payload);
  },

  async get_background_job(input, context) {
    const jobId = readRequiredString(input.jobId, "jobId");
    const payload = await pixellabRequestJson(
      "GET",
      `/background-jobs/${encodeURIComponent(jobId)}`,
      undefined,
      context,
    );
    return normalizeBackgroundJob(payload, context);
  },

  async estimate_skeleton(input, context) {
    const image = await encodeTransitImage(input.image, "image", context);
    const payload = await pixellabRequestJson("POST", "/estimate-skeleton", { image }, context);
    return normalizeEstimatedSkeleton(payload);
  },

  async animate_with_skeleton(input, context) {
    const referenceImage = await encodeTransitImage(input.referenceImage, "referenceImage", context);
    const payload = await pixellabRequestJson(
      "POST",
      "/animate-with-skeleton",
      compactObject({
        image_size: requiredRecord(input.imageSize, "imageSize", invalidInputError),
        reference_image: referenceImage,
        skeleton_keypoints: normalizeSkeletonFrames(input.skeletonKeypoints),
        guidance_scale: optionalNumber(input.guidanceScale),
        view: optionalString(input.view),
        direction: optionalString(input.direction),
        isometric: optionalBoolean(input.isometric),
        oblique_projection: optionalBoolean(input.obliqueProjection),
        seed: optionalInteger(input.seed),
      }),
      context,
    );
    const record = requireResponseRecord(payload, "animate-with-skeleton");
    const frames = await storePixellabImages(record.images, "pixellab-skeleton-frame", context);
    return compactObject({
      frames,
      frameCount: frames.length,
      usage: normalizeUsage(record.usage),
    });
  },
};

export async function validatePixellabCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await pixellabRequestJson("GET", pixellabValidationPath, undefined, { apiKey, fetcher, signal });
  return {
    grantedScopes: [],
    metadata: {
      apiBaseUrl: pixellabApiBaseUrl,
      validationEndpoint: pixellabValidationPath,
    },
  };
}

export async function pixellabRequestJson(
  method: "DELETE" | "GET" | "PATCH" | "POST",
  path: string,
  body: Record<string, unknown> | undefined,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(pixellabUrl(path), {
      method,
      headers: pixellabHeaders(context.apiKey, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "PixelLab returned invalid JSON.",
      invalidJsonFallback: (text) => text,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PixelLab request failed: ${error.message}` : "PixelLab request failed.",
    );
  }

  if (!response.ok) {
    throw createPixellabError(response, payload);
  }
  return payload;
}

export async function downloadPixellabFile(
  path: string,
  name: string,
  context: ApiKeyProviderContext,
): Promise<ProviderTransitFile> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "PixelLab file download requires local transit file storage.");
  }
  let response: Response;
  try {
    response = await context.fetcher(pixellabUrl(path), {
      headers: pixellabHeaders(context.apiKey, false),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `PixelLab download failed: ${error.message}` : "PixelLab download failed.",
    );
  }
  if (!response.ok) {
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "PixelLab returned an invalid download error response.",
      invalidJsonFallback: (text) => text,
    });
    throw createPixellabError(response, payload);
  }
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: name,
    createError: (message) => new ProviderRequestError(413, message),
  });
  const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
  const stored = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: mimeType }));
  return {
    fileId: stored.fileId,
    downloadUrl: stored.downloadUrl,
    sizeBytes: stored.sizeBytes,
    name: stored.name,
    mimeType: stored.mimeType,
  };
}

function pixellabUrl(path: string): string {
  if (path.startsWith("/")) {
    return `${pixellabApiBaseUrl}${path}`;
  }
  return `${pixellabApiBaseUrl}/${path}`;
}

function pixellabHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

export async function encodeTransitImage(
  value: unknown,
  fieldName: string,
  context: ApiKeyProviderContext,
): Promise<PixellabBase64Image> {
  const source = await readTransitFileInput(value, context);
  if (context.transitFiles && source.sizeBytes > context.transitFiles.maxBytes) {
    throw new ProviderRequestError(413, `${fieldName} exceeds the local transit file size limit.`);
  }
  const bytes = new Uint8Array(await source.file.arrayBuffer());
  const imageType = detectImageType(bytes, fieldName, invalidInputError);
  return {
    type: "base64",
    base64: `data:${imageType.mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
    format: imageType.format,
  };
}

function detectImageType(
  bytes: Uint8Array,
  fieldName: string,
  createError: (message: string) => ProviderRequestError,
): { mimeType: "image/png" | "image/jpeg"; format: "png" | "jpeg" } {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mimeType: "image/png", format: "png" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mimeType: "image/jpeg", format: "jpeg" };
  }
  throw createError(`${fieldName} must contain a PNG or JPEG image.`);
}

export function normalizeStartedJob(payload: unknown): Record<string, unknown> {
  const record = requireResponseRecord(payload, "background job start");
  return compactObject({
    jobId: requiredString(record.background_job_id, "PixelLab background_job_id", invalidResponseError),
    status: normalizeJobStatus(record.status ?? "processing"),
    enhancedPrompt: optionalString(record.enhanced_prompt),
    usage: normalizeUsage(record.usage),
    enhanceUsage: normalizeUsage(record.enhance_usage),
  });
}

async function normalizeBackgroundJob(
  payload: unknown,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const record = requireResponseRecord(payload, "background job");
  const status = normalizeJobStatus(record.status);
  const lastResponse = optionalRecord(record.last_response);
  const images = await storePixellabImages(readBackgroundJobImages(lastResponse), "pixellab-image", context);
  return compactObject({
    jobId: requiredString(record.id, "PixelLab job id", invalidResponseError),
    status,
    createdAt: requiredString(record.created_at, "PixelLab created_at", invalidResponseError),
    images,
    imageCount: images.length > 0 ? images.length : undefined,
    result: sanitizeBackgroundJobResult(lastResponse),
    error: status === "failed" ? extractPixellabErrorMessage(lastResponse) : undefined,
    usage: normalizeUsage(record.usage),
  });
}

function sanitizeBackgroundJobResult(
  lastResponse: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!lastResponse) {
    return undefined;
  }
  const result = { ...lastResponse };
  delete result.image;
  delete result.images;
  return Object.keys(result).length > 0 ? result : undefined;
}

function readBackgroundJobImages(lastResponse: Record<string, unknown> | undefined): unknown[] {
  if (Array.isArray(lastResponse?.images)) {
    return lastResponse.images;
  }
  if (lastResponse?.image !== undefined) {
    return [lastResponse.image];
  }
  return [];
}

function normalizeEstimatedSkeleton(payload: unknown): Record<string, unknown> {
  const record = requireResponseRecord(payload, "estimate-skeleton");
  const keypoints = optionalObjectArray(record.keypoints, "PixelLab keypoint", invalidResponseError).map(
    (keypoint) => ({
      x: requireFiniteNumber(keypoint.x, "PixelLab keypoint x"),
      y: requireFiniteNumber(keypoint.y, "PixelLab keypoint y"),
      label: requiredString(keypoint.label, "PixelLab keypoint label", invalidResponseError),
      zIndex: requireFiniteNumber(keypoint.z_index, "PixelLab keypoint z_index"),
    }),
  );
  if (!Array.isArray(record.keypoints)) {
    throw invalidResponseError("PixelLab estimate-skeleton response is missing keypoints.");
  }
  return compactObject({ keypoints, usage: normalizeUsage(record.usage) });
}

function normalizeSkeletonFrames(value: unknown): Array<Array<Record<string, unknown>>> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "skeletonKeypoints must contain at least one frame.");
  }
  if (value.length > maxAnimationFrames) {
    throw new ProviderRequestError(400, `skeletonKeypoints cannot contain more than ${maxAnimationFrames} frames.`);
  }
  return value.map((frame, frameIndex) => {
    if (!Array.isArray(frame) || frame.length === 0) {
      throw new ProviderRequestError(400, `skeletonKeypoints[${frameIndex}] must contain at least one point.`);
    }
    return frame.map((point, pointIndex) => {
      const record = requiredRecord(point, `skeletonKeypoints[${frameIndex}][${pointIndex}]`, invalidInputError);
      return compactObject({
        x: requireInputNumber(record.x, `skeletonKeypoints[${frameIndex}][${pointIndex}].x`),
        y: requireInputNumber(record.y, `skeletonKeypoints[${frameIndex}][${pointIndex}].y`),
        label: readRequiredString(record.label, `skeletonKeypoints[${frameIndex}][${pointIndex}].label`),
        z_index: optionalNumber(record.zIndex),
      });
    });
  });
}

export async function storePixellabImages(
  value: unknown,
  namePrefix: string,
  context: ApiKeyProviderContext,
): Promise<ProviderTransitFile[]> {
  if (!Array.isArray(value)) {
    throw invalidResponseError("PixelLab response images must be an array.");
  }
  if (value.length === 0) {
    return [];
  }
  if (value.length > maxAnimationFrames) {
    throw invalidResponseError(`PixelLab returned more than ${maxAnimationFrames} animation frames.`);
  }
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "PixelLab image output requires local transit file storage.");
  }

  const decoded = value.map((image, index) => decodePixellabImage(image, `PixelLab image ${index + 1}`));
  const totalBytes = decoded.reduce((sum, image) => sum + image.bytes.byteLength, 0);
  const transitFiles = context.transitFiles;
  if (decoded.some((image) => image.bytes.byteLength > transitFiles.maxBytes)) {
    throw new ProviderRequestError(413, "A PixelLab image exceeds the local transit file size limit.");
  }
  if (totalBytes > transitFiles.maxBytes) {
    throw new ProviderRequestError(413, "PixelLab animation frames exceed the local transit file size limit.");
  }

  return Promise.all(
    decoded.map(async (image, index) => {
      const name = `${namePrefix}-${String(index + 1).padStart(3, "0")}.${image.extension}`;
      const stored = await transitFiles.create(new File([image.bytes], name, { type: image.mimeType }));
      return {
        fileId: stored.fileId,
        downloadUrl: stored.downloadUrl,
        sizeBytes: stored.sizeBytes,
        name: stored.name,
        mimeType: stored.mimeType,
      };
    }),
  );
}

function decodePixellabImage(value: unknown, fieldName: string): DecodedPixellabImage {
  const record = requiredRecord(value, fieldName, invalidResponseError);
  const encoded = requiredString(record.base64, `${fieldName}.base64`, invalidResponseError);
  const dataUri = /^data:([^;,]+);base64,(.+)$/isu.exec(encoded);
  const content = dataUri?.[2] ?? encoded;
  const declaredMimeType = dataUri?.[1]?.toLowerCase();
  const format = optionalString(record.format)?.toLowerCase();
  const mimeType = resolveOutputMimeType(declaredMimeType, format, fieldName);
  const bytes = base64Bytes(content, `${fieldName}.base64`, invalidResponseError);
  const detected = detectImageType(bytes, fieldName, invalidResponseError);
  if (detected.mimeType !== mimeType) {
    throw invalidResponseError(`${fieldName} content does not match its declared image format.`);
  }
  return {
    bytes,
    mimeType,
    extension: mimeType === "image/png" ? "png" : "jpg",
  };
}

function resolveOutputMimeType(
  declaredMimeType: string | undefined,
  format: string | undefined,
  fieldName: string,
): "image/png" | "image/jpeg" {
  const normalized = declaredMimeType ?? (format === "jpg" ? "image/jpeg" : format ? `image/${format}` : "image/png");
  if (normalized === "image/png") {
    return "image/png";
  }
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return "image/jpeg";
  }
  throw invalidResponseError(`${fieldName} has an unsupported image format.`);
}

export function normalizeUsage(value: unknown): NormalizedPixellabUsage | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  const usd = optionalNumber(record.usd);
  const generations = optionalNumber(record.generations);
  const declaredType = optionalString(record.type);
  if (declaredType !== undefined && declaredType !== "usd" && declaredType !== "generations") {
    throw invalidResponseError(`PixelLab returned unsupported usage type: ${declaredType}`);
  }
  const type = declaredType === "generations" || (!declaredType && generations !== undefined) ? "generations" : "usd";
  const usage: NormalizedPixellabUsage = { type };
  if (usd !== undefined) {
    usage.usd = usd;
  }
  if (generations !== undefined) {
    usage.generations = generations;
  }
  return usage;
}

function normalizeJobStatus(value: unknown): "queued" | "processing" | "completed" | "failed" {
  const status = requiredString(value, "PixelLab job status", invalidResponseError);
  if (status === "queued" || status === "processing" || status === "completed" || status === "failed") {
    return status;
  }
  throw invalidResponseError(`PixelLab returned unsupported job status: ${status}`);
}

export function requireResponseRecord(value: unknown, operation: string): Record<string, unknown> {
  return requiredRecord(value, `PixelLab ${operation} response`, invalidResponseError);
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  const number = optionalNumber(value);
  if (number === undefined) {
    throw invalidResponseError(`${fieldName} must be a finite number.`);
  }
  return number;
}

function requireInputNumber(value: unknown, fieldName: string): number {
  const number = optionalNumber(value);
  if (number === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be a finite number.`);
  }
  return number;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, invalidInputError);
}

function createPixellabError(response: Response, payload: unknown): ProviderRequestError {
  const message =
    extractPixellabErrorMessage(payload) ??
    optionalString(response.statusText) ??
    `PixelLab request failed with status ${response.status}`;
  const status = mapPixellabStatus(response.status);
  return new ProviderRequestError(status, message, payload);
}

function mapPixellabStatus(status: number): number {
  if (status === 422) {
    return 400;
  }
  if (status === 529) {
    return 429;
  }
  if (status >= 500) {
    return 502;
  }
  return status || 502;
}

function extractPixellabErrorMessage(value: unknown): string | undefined {
  if (typeof value === "string") {
    return optionalString(value);
  }
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  const detail = record.detail;
  if (typeof detail === "string") {
    return optionalString(detail);
  }
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => optionalString(optionalRecord(entry)?.msg))
      .filter((message): message is string => message !== undefined);
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }
  return optionalString(record.error) ?? optionalString(record.message);
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function invalidResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
