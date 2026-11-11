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
  withRetryAfterSeconds,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  readProviderErrorBody,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { defaultSeedreamModel } from "./actions.ts";

export const doubaoSeedreamApiBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";
const imagesPath = "images/generations";

export const doubaoSeedreamActionHandlers: ProviderActionHandlers<
  "doubao_seedream",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async generate_image(input, context): Promise<unknown> {
    const payload = await requestArkJson(context, buildSeedreamBody(input));
    return normalizeSeedreamResponse(requiredResponseRecord(payload, "image generation response"));
  },
};

function buildSeedreamBody(input: Record<string, unknown>): Record<string, unknown> {
  const images = optionalStringArray(input.images);
  const model = optionalString(input.model) ?? defaultSeedreamModel;
  const layerDecomposition = optionalBoolean(input.layerDecomposition) ?? false;
  const prompt = optionalString(input.prompt);
  const background = optionalString(input.background);
  const outputFormat = optionalString(input.outputFormat);
  const mode = optionalString(input.optimizePromptMode);
  const size = readSize(input.size, layerDecomposition);
  if (![defaultSeedreamModel, "doubao-seedream-5-0-pro-260628"].includes(model))
    throw new ProviderRequestError(400, "Unsupported Seedream model");
  if (!layerDecomposition && !prompt) throw new ProviderRequestError(400, "Image generation requires a prompt");
  if (layerDecomposition && images?.length !== 1)
    throw new ProviderRequestError(400, "Layer decomposition requires exactly one image");
  if (mode === "fast" && model !== "doubao-seedream-5-0-pro-260628")
    throw new ProviderRequestError(400, "Fast mode requires Seedream Pro");
  if (background === "transparent") {
    const hasJPEGReference = images?.some((image) => image.startsWith("data:image/jpeg;"));
    const invalidReference = images?.length !== 1 || hasJPEGReference;
    if (invalidReference || outputFormat === "jpeg")
      throw new ProviderRequestError(400, "Transparent output requires one image with an alpha channel and PNG output");
  }
  return compactObject({
    model,
    prompt,
    image: images,
    size,
    layer_decomposition: layerDecomposition,
    background,
    output_format: outputFormat,
    optimize_prompt_options: mode === undefined ? undefined : { mode },
    response_format: "url",
    watermark: optionalBoolean(input.watermark) ?? true,
  });
}

function readSize(value: unknown, layerDecomposition: boolean): string {
  if (value === undefined) return layerDecomposition ? "auto" : "2K";
  const preset = optionalScalarString(value);
  if (preset) {
    if (["1K", "1.5K", "2K"].includes(preset) || (layerDecomposition && preset === "auto")) return preset;
    throw new ProviderRequestError(400, "Unsupported Seedream resolution");
  }
  if (layerDecomposition) throw new ProviderRequestError(400, "Layer decomposition requires a resolution preset");
  const size = optionalRecord(value);
  if (!size) throw new ProviderRequestError(400, "size must be a preset or dimensions object");
  const width = optionalInteger(size.width);
  const height = optionalInteger(size.height);
  if (width === undefined || width <= 0 || height === undefined || height <= 0) {
    throw new ProviderRequestError(400, "size width and height must be positive integers");
  }
  const pixels = width * height;
  const ratio = width / height;
  if (pixels < 921_600 || pixels > 4_624_220 || ratio < 1 / 16 || ratio > 16)
    throw new ProviderRequestError(400, "Unsupported Seedream dimensions");
  return `${width}x${height}`;
}

function normalizeSeedreamResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const usage = requiredResponseRecord(payload.usage, "response usage");
  return {
    model: requiredString(payload.model, "model", providerResponseError),
    createdAt: requireInteger(payload.created, "created"),
    images: objectArray(payload.data, "data", providerResponseError).map((image) => ({
      url: requiredString(image.url, "data.url", providerResponseError),
      size: requiredString(image.size, "data.size", providerResponseError),
      outputFormat: image.output_format,
      background: image.background,
      zIndex: image.z_index,
      boundingBox: image.bounding_box,
      name: image.name,
      description: image.description,
    })),
    usage: {
      generatedImages: requireInteger(usage.generated_images, "usage.generated_images"),
      inputImages: optionalInteger(usage.input_images),
      outputTokens: optionalInteger(usage.output_tokens),
      totalTokens: optionalInteger(usage.total_tokens),
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
    metadata: { apiBaseUrl: doubaoSeedreamApiBaseUrl },
  };
}

async function requestArkJson(context: ApiKeyProviderContext, body: Record<string, unknown>): Promise<unknown> {
  context.signal?.throwIfAborted();
  return runProviderRequest(
    { label: "Doubao Seedream", timeoutMs: 125_000, signal: context.signal },
    async (signal) => {
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
      const payload = response.ok
        ? await readProviderJsonBody(response, {
            emptyBody: {},
            invalidJsonMessage: "Doubao Seedream returned an invalid JSON response",
          })
        : await readProviderErrorBody(response, "Doubao Seedream", signal);
      if (!response.ok) handleArkError(response, payload);
      return payload;
    },
  );
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
  const details = withRetryAfterSeconds(response, compactObject({ code, status: response.status }));
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
