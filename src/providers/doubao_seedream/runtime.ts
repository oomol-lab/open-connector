import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalScalarString,
  optionalString,
  optionalStringArray,
  requiredString,
} from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { defaultSeedreamModel } from "./actions.ts";

export const doubaoSeedreamApiBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";
const imagesPath = "images/generations";
const minimumCustomImagePixels = 3_686_400;

export const doubaoSeedreamActionHandlers: ProviderActionHandlers<
  "doubao_seedream",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async generate_image(input, context): Promise<unknown> {
    const payload = await requestArkJson(context, buildSeedreamBody(input));
    return normalizeSeedreamResponse(requiredResponseRecord(payload, "image generation response"));
  },
};

export function buildSeedreamBody(input: Record<string, unknown>): Record<string, unknown> {
  const images = optionalStringArray(input.images);
  const maxImages = Math.min(optionalInteger(input.maxImages) ?? 1, 15 - (images?.length ?? 0));
  const model = optionalString(input.model) ?? defaultSeedreamModel;
  const supportsSequentialGeneration = model !== "doubao-seedream-5-0-pro-260628";
  if (!supportsSequentialGeneration && maxImages > 1)
    throw new ProviderRequestError(400, "The selected model does not support multiple image generation");
  return compactObject({
    model,
    prompt: requiredInputString(input.prompt, "prompt"),
    image: images,
    size: readSize(input.size),
    sequential_image_generation: supportsSequentialGeneration ? (maxImages > 1 ? "auto" : "disabled") : undefined,
    sequential_image_generation_options:
      supportsSequentialGeneration && maxImages > 1 ? { max_images: maxImages } : undefined,
    stream: supportsSequentialGeneration ? false : undefined,
    response_format: "url",
    watermark: optionalBoolean(input.watermark) ?? true,
  });
}

function readSize(value: unknown): string {
  if (value === undefined) return "2K";
  const preset = optionalScalarString(value);
  if (preset) return preset;
  const size = optionalRecord(value);
  if (!size) throw new ProviderRequestError(400, "size must be a preset or dimensions object");
  const width = optionalInteger(size.width);
  const height = optionalInteger(size.height);
  if (width === undefined || width <= 0 || height === undefined || height <= 0) {
    throw new ProviderRequestError(400, "size width and height must be positive integers");
  }
  if (width * height < minimumCustomImagePixels) {
    throw new ProviderRequestError(
      400,
      `Custom image dimensions must contain at least ${minimumCustomImagePixels} pixels.`,
    );
  }
  return `${width}x${height}`;
}

export function normalizeSeedreamResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const usage = requiredResponseRecord(payload.usage, "response usage");
  return {
    model: requiredString(payload.model, "model", providerResponseError),
    createdAt: requireInteger(payload.created, "created"),
    images: objectArray(payload.data, "data", providerResponseError).map((image) => ({
      url: requiredString(image.url, "data.url", providerResponseError),
      size: requiredString(image.size, "data.size", providerResponseError),
    })),
    usage: {
      generatedImages: requireInteger(usage.generated_images, "usage.generated_images"),
      outputTokens: requireInteger(usage.output_tokens, "usage.output_tokens"),
      totalTokens: requireInteger(usage.total_tokens, "usage.total_tokens"),
    },
  };
}

export async function validateDoubaoSeedreamCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestArkJson({ apiKey, fetcher, signal }, {});
  return {
    profile: { accountId: "doubao_seedream:api_key", displayName: "Doubao Seedream API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: doubaoSeedreamApiBaseUrl },
  };
}

async function requestArkJson(context: ApiKeyProviderContext, body: Record<string, unknown>): Promise<unknown> {
  context.signal?.throwIfAborted();
  return runProviderRequest({ label: "Doubao Seedream", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(new URL(imagesPath, `${doubaoSeedreamApiBaseUrl}/`), {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Doubao Seedream returned an invalid JSON response",
    });
    if (!response.ok) handleArkError(response, payload);
    return payload;
  });
}

function handleArkError(response: Response, payload: unknown): never {
  const record = optionalRecord(payload);
  const nestedError = optionalRecord(record?.error);
  const code = optionalString(record?.code) ?? optionalString(nestedError?.code);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(nestedError?.message) ??
    `Doubao Seedream request failed with HTTP ${response.status}`;
  const details = compactObject({ code, status: response.status });
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(response.status === 404 ? 404 : 400, message, details, "invalid_input");
  }
  if (response.status === 429) throw new ProviderRequestError(429, message, details);
  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, details);
}

function requireInteger(value: unknown, field: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined) throw providerResponseError(`Doubao Seedream ${field} must be an integer`);
  return integer;
}
