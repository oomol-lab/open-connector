import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
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
import { defaultImageModel, defaultVideoModel } from "./actions.ts";

export const wanxApiBaseUrl = "https://dashscope.aliyuncs.com/api/v1";
const imagePath = "services/aigc/multimodal-generation/generation";
const videoPath = "services/aigc/video-generation/video-synthesis";

export const wanxActionHandlers: ProviderActionHandlers<"wanx", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async generate_image(input, context): Promise<unknown> {
    const payload = await requestJson(context, "POST", imagePath, buildImageBody(input));
    return normalizeImageResponse(requiredResponseRecord(payload, "image response"));
  },
  async submit_video_generation(input, context): Promise<unknown> {
    const payload = await requestJson(context, "POST", videoPath, buildVideoBody(input), true);
    const output = requiredResponseRecord(requiredResponseRecord(payload, "submit response").output, "output");
    return { taskId: requiredString(output.task_id, "output.task_id", providerResponseError) };
  },
  async get_video_generation(input, context): Promise<unknown> {
    const taskId = requiredInputString(input.taskId, "taskId");
    const payload = await requestJson(context, "GET", `tasks/${encodeURIComponent(taskId)}`);
    return normalizeVideoTask(payload, taskId);
  },
};

export function buildImageBody(input: Record<string, unknown>): Record<string, unknown> {
  const images = optionalStringArray(input.images) ?? [];
  return {
    model: optionalString(input.model) ?? defaultImageModel,
    input: {
      messages: [
        {
          role: "user",
          content: [{ text: requiredInputString(input.prompt, "prompt") }, ...images.map((image) => ({ image }))],
        },
      ],
    },
    parameters: compactObject({
      size: optionalString(input.size) ?? "2K",
      n: optionalInteger(input.imageCount) ?? 1,
      negative_prompt: optionalString(input.negativePrompt),
      prompt_extend: optionalBoolean(input.promptExtend) ?? true,
      watermark: optionalBoolean(input.watermark) ?? false,
      seed: optionalInteger(input.seed),
    }),
  };
}

export function buildVideoBody(input: Record<string, unknown>): Record<string, unknown> {
  const media =
    input.media === undefined
      ? undefined
      : objectArray(input.media, "media", inputError).map((item) => ({
          type: requiredString(item.type, "media.type", inputError),
          url: requiredString(item.url, "media.url", inputError),
        }));
  return {
    model: optionalString(input.model) ?? defaultVideoModel,
    input: compactObject({ prompt: optionalString(input.prompt), media }),
    parameters: compactObject({
      resolution: optionalString(input.resolution) ?? "1080P",
      ratio: optionalString(input.ratio) ?? "adaptive",
      duration: optionalInteger(input.duration) ?? 5,
      audio: optionalBoolean(input.audio) ?? true,
      prompt_extend: optionalBoolean(input.promptExtend) ?? true,
      watermark: optionalBoolean(input.watermark) ?? false,
      seed: optionalInteger(input.seed),
    }),
  };
}

export function normalizeImageResponse(payload: Record<string, unknown>): Record<string, unknown> {
  const output = requiredResponseRecord(payload.output, "output");
  const usage = requiredResponseRecord(payload.usage, "usage");
  const images = objectArray(output.choices, "output.choices", providerResponseError).flatMap((choice) => {
    const message = optionalRecord(choice.message);
    if (!message) return [];
    return objectArray(message.content, "output.choices.message.content", providerResponseError).flatMap((item) => {
      const image = optionalString(item.image);
      return image ? [image] : [];
    });
  });
  if (images.length === 0) throw providerResponseError("Wanx returned no generated images");
  return {
    images,
    imageCount: optionalInteger(usage.image_count) ?? images.length,
    size: optionalString(usage.size),
  };
}

export function normalizeVideoTask(payload: unknown, fallbackTaskId: string): Record<string, unknown> {
  const response = requiredResponseRecord(payload, "task response");
  const output = requiredResponseRecord(response.output, "output");
  const taskId = optionalString(output.task_id) ?? fallbackTaskId;
  const status = requiredString(output.task_status, "output.task_status", providerResponseError);
  if (status === "PENDING" || status === "RUNNING") return { taskId, state: "processing" };
  if (status === "SUCCEEDED") {
    const usage = optionalRecord(response.usage);
    return compactObject({
      taskId,
      state: "succeeded",
      videoUrl: requiredString(output.video_url, "output.video_url", providerResponseError),
      duration: optionalNumber(usage?.duration) ?? optionalNumber(usage?.output_video_duration),
      resolution: optionalScalarString(usage?.SR),
      ratio: optionalString(usage?.ratio),
    });
  }
  if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
    return compactObject({
      taskId,
      state: status === "FAILED" ? "failed" : status === "CANCELED" ? "cancelled" : "expired",
      error: compactObject({ code: optionalString(output.code), message: optionalString(output.message) }),
    });
  }
  throw providerResponseError(`Wanx returned an unknown task status: ${status}`);
}

export async function validateWanxCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  try {
    await requestJson({ apiKey, fetcher, signal }, "GET", "tasks/connector-credential-validation");
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || error.status !== 404) throw error;
  }
  return {
    profile: { accountId: "wanx:api_key", displayName: "Wanx Model Studio API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: wanxApiBaseUrl },
  };
}

async function requestJson(
  context: ApiKeyProviderContext,
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
  asynchronous = false,
): Promise<unknown> {
  context.signal?.throwIfAborted();
  return runProviderRequest({ label: "Wanx", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(new URL(path, `${wanxApiBaseUrl}/`), {
      method,
      headers: compactHeaders({
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": body ? "application/json" : undefined,
        "user-agent": providerUserAgent,
        "x-dashscope-async": asynchronous ? "enable" : undefined,
      }),
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Wanx returned an invalid JSON response",
    });
    if (!response.ok) handleError(response, payload);
    return payload;
  });
}

function handleError(response: Response, payload: unknown): never {
  const record = optionalRecord(payload);
  const output = optionalRecord(record?.output);
  const code = optionalString(record?.code) ?? optionalString(output?.code);
  const message =
    optionalString(record?.message) ??
    optionalString(output?.message) ??
    `Wanx request failed with HTTP ${response.status}`;
  const details = compactObject({ code, status: response.status });
  if (response.status === 400 || response.status === 404 || response.status === 422)
    throw new ProviderRequestError(response.status === 404 ? 404 : 400, message, details, "invalid_input");
  if (response.status === 429) throw new ProviderRequestError(429, message, details);
  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, details);
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message, undefined, "invalid_input");
}

function compactHeaders(input: Record<string, string | undefined>): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(input)) if (value !== undefined) headers.set(key, value);
  return headers;
}
