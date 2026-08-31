import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalObjectArray,
  optionalRecord,
  optionalScalarString,
  optionalString,
  optionalStringArray,
  requiredString,
} from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { defaultSeedanceModel, fastSeedanceModel } from "./actions.ts";

export const volcengineArkApiBaseUrl = "https://ark.cn-beijing.volces.com/api/v3";
const seedanceTasksPath = "contents/generations/tasks";

interface SeedanceImageInput {
  url: string;
  role: "first_frame" | "last_frame" | "reference_image";
}

interface SeedanceVideoInput {
  url: string;
  role: "reference_video";
}

interface SeedanceAudioInput {
  url: string;
  role: "reference_audio";
}

interface SeedanceToolInput {
  type: "web_search";
}

export interface SeedanceSubmitInput {
  model: string;
  prompt?: string;
  images: SeedanceImageInput[];
  videos: SeedanceVideoInput[];
  audios: SeedanceAudioInput[];
  returnLastFrame: boolean;
  executionExpiresAfter?: number;
  generateAudio: boolean;
  tools?: SeedanceToolInput[];
  safetyIdentifier?: string;
  resolution: "480p" | "720p" | "1080p";
  ratio: "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9" | "adaptive";
  duration: number;
  seed?: number;
  watermark: boolean;
}

interface SeedanceRequestInput {
  context: ApiKeyProviderContext;
  method: "GET" | "POST" | "DELETE";
  path?: string;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}

export const volcengineArkActionHandlers: ProviderActionHandlers<
  "volcengine_ark",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async submit_seedance_video_generation(input, context): Promise<unknown> {
    const normalized = readSeedanceSubmitInput(input);
    const payload = await requestArkJson({
      context,
      method: "POST",
      body: buildSeedanceSubmitBody(normalized),
    });
    const record = requiredResponseRecord(payload, "submit response");
    return { taskId: requiredString(record.id, "id", providerResponseError) };
  },
  async get_seedance_video_generation(input, context): Promise<unknown> {
    const taskId = requiredInputString(input.taskId, "taskId");
    const payload = await requestArkJson({
      context,
      method: "GET",
      path: `/${encodeURIComponent(taskId)}`,
    });
    return normalizeSeedanceTask(payload, taskId);
  },
  async list_seedance_video_generations(input, context): Promise<unknown> {
    const query = new URLSearchParams();
    setIntegerQuery(query, "page_num", input.pageNumber);
    setIntegerQuery(query, "page_size", input.pageSize);
    setStringQuery(query, "filter.status", input.status);
    setStringQuery(query, "filter.model", input.model);
    setStringQuery(query, "filter.service_tier", input.serviceTier);
    for (const taskId of optionalStringArray(input.taskIds) ?? []) {
      query.append("filter.task_ids", taskId);
    }
    const payload = await requestArkJson({ context, method: "GET", query });
    const record = requiredResponseRecord(payload, "task list response");
    const items = objectArray(record.items, "items", providerResponseError).map((item) =>
      normalizeSeedanceTask(item, requiredString(item.id, "items.id", providerResponseError)),
    );
    return {
      items,
      total: requireArkInteger(record.total, "total"),
    };
  },
  async delete_seedance_video_generation(input, context): Promise<unknown> {
    const taskId = requiredInputString(input.taskId, "taskId");
    await requestArkJson({
      context,
      method: "DELETE",
      path: `/${encodeURIComponent(taskId)}`,
    });
    return { taskId, accepted: true };
  },
};

export async function validateVolcengineArkCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const query = new URLSearchParams({ page_num: "1", page_size: "1" });
  await requestArkJson({
    context: { apiKey, fetcher, signal },
    method: "GET",
    query,
    phase: "validate",
  });
  return {
    profile: {
      accountId: "volcengine_ark:api_key",
      displayName: "Volcengine Ark API Key",
    },
    grantedScopes: [],
    metadata: { apiBaseUrl: volcengineArkApiBaseUrl },
  };
}

export function readSeedanceSubmitInput(input: Record<string, unknown>): SeedanceSubmitInput {
  const images = readImages(input.images);
  const videos = readVideos(input.videos);
  const audios = readAudios(input.audios);
  const prompt = optionalString(input.prompt);
  if (!prompt && images.length === 0 && videos.length === 0 && audios.length === 0) {
    throw new ProviderRequestError(400, "prompt or media input is required");
  }
  if (audios.length > 0 && images.length === 0 && videos.length === 0) {
    throw new ProviderRequestError(400, "audios require at least one image or video");
  }
  validateImageModes(images, videos, audios);

  const model = optionalString(input.model) ?? defaultSeedanceModel;
  const resolution = readEnum(input.resolution, "resolution", ["480p", "720p", "1080p"], "720p");
  if (model === fastSeedanceModel && resolution === "1080p") {
    throw new ProviderRequestError(400, "Seedance 2.0 fast does not support 1080p resolution");
  }

  return {
    model,
    prompt,
    images,
    videos,
    audios,
    returnLastFrame: optionalBoolean(input.returnLastFrame) ?? false,
    executionExpiresAfter: optionalInteger(input.executionExpiresAfter),
    generateAudio: optionalBoolean(input.generateAudio) ?? true,
    tools: readTools(input.tools),
    safetyIdentifier: optionalString(input.safetyIdentifier),
    resolution,
    ratio: readEnum(input.ratio, "ratio", ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"], "adaptive"),
    duration: optionalInteger(input.duration) ?? 5,
    seed: optionalInteger(input.seed),
    watermark: optionalBoolean(input.watermark) ?? false,
  };
}

export function buildSeedanceSubmitBody(input: SeedanceSubmitInput): Record<string, unknown> {
  const content: Array<Record<string, unknown>> = [];
  if (input.prompt) content.push({ type: "text", text: input.prompt });
  for (const image of input.images) {
    content.push({ type: "image_url", image_url: { url: image.url }, role: image.role });
  }
  for (const video of input.videos) {
    content.push({ type: "video_url", video_url: { url: video.url }, role: video.role });
  }
  for (const audio of input.audios) {
    content.push({ type: "audio_url", audio_url: { url: audio.url }, role: audio.role });
  }
  return compactObject({
    model: input.model,
    content,
    return_last_frame: input.returnLastFrame,
    execution_expires_after: input.executionExpiresAfter,
    generate_audio: input.generateAudio,
    tools: input.tools,
    safety_identifier: input.safetyIdentifier,
    resolution: input.resolution,
    ratio: input.ratio,
    duration: input.duration,
    seed: input.seed,
    watermark: input.watermark,
  });
}

export function normalizeSeedanceTask(payload: unknown, fallbackTaskId: string): Record<string, unknown> {
  const record = requiredResponseRecord(payload, "task response");
  const taskId = optionalString(record.id) ?? fallbackTaskId;
  const status = requiredString(record.status, "status", providerResponseError);
  const common = {
    taskId,
    model: optionalString(record.model),
    createdAt: optionalInteger(record.created_at),
    updatedAt: optionalInteger(record.updated_at),
  };
  if (status === "queued" || status === "running") {
    return { ...common, state: "processing", progress: optionalNumber(record.progress) };
  }
  if (status === "succeeded") {
    const content = requiredResponseRecord(record.content, "content");
    return {
      ...common,
      state: "succeeded",
      videoUrl: requiredString(content.video_url, "content.video_url", providerResponseError),
      lastFrameUrl: optionalString(content.last_frame_url),
      seed: optionalInteger(record.seed),
      resolution: optionalString(record.resolution),
      ratio: optionalString(record.ratio),
      duration: optionalNumber(record.duration) ?? numberFromString(record.duration),
      frames: optionalInteger(record.frames),
      framesPerSecond: optionalInteger(record.framespersecond),
      generateAudio: optionalBoolean(record.generate_audio),
      tools: readOutputTools(record.tools),
      safetyIdentifier: optionalString(record.safety_identifier),
      serviceTier: optionalString(record.service_tier),
      executionExpiresAfter: optionalInteger(record.execution_expires_after),
      usage: normalizeUsage(record.usage),
    };
  }
  if (status === "failed" || status === "cancelled" || status === "expired") {
    return { ...common, state: status, error: normalizeError(record.error) };
  }
  throw new ProviderRequestError(502, `Volcengine Ark returned an unknown Seedance task status: ${status}`);
}

async function requestArkJson(input: SeedanceRequestInput): Promise<unknown> {
  input.context.signal?.throwIfAborted();
  const url = new URL(`${seedanceTasksPath}${input.path ?? ""}`, `${volcengineArkApiBaseUrl}/`);
  if (input.query) url.search = input.query.toString();
  return runProviderRequest({ label: "Volcengine Ark", signal: input.context.signal }, async (signal) => {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Volcengine Ark returned an invalid JSON response",
    });
    if (!response.ok) handleArkError(response, payload, input.phase ?? "execute");
    return payload;
  });
}

function handleArkError(response: Response, payload: unknown, phase: "validate" | "execute"): never {
  const record = optionalRecord(payload);
  const nestedError = optionalRecord(record?.error);
  const code = optionalString(record?.code) ?? optionalString(nestedError?.code);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(nestedError?.message) ??
    `Volcengine Ark request failed with HTTP ${response.status}`;
  const details = compactObject({ code, status: response.status });
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(phase === "validate" ? 400 : response.status, message, details);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    throw new ProviderRequestError(response.status === 404 ? 404 : 400, message, details, "invalid_input");
  }
  if (response.status === 429) throw new ProviderRequestError(429, message, details);
  throw new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, details);
}

function readImages(value: unknown): SeedanceImageInput[] {
  return optionalObjectArray(value, "images", providerInputError).map((item) => ({
    url: requiredInputString(item.url, "images.url"),
    role: readEnum(item.role, "images.role", ["first_frame", "last_frame", "reference_image"], "first_frame"),
  }));
}

function readVideos(value: unknown): SeedanceVideoInput[] {
  return optionalObjectArray(value, "videos", providerInputError).map((item) => {
    if (item.role !== undefined && item.role !== "reference_video") {
      throw new ProviderRequestError(400, "videos.role must be reference_video");
    }
    return { url: requiredInputString(item.url, "videos.url"), role: "reference_video" };
  });
}

function readAudios(value: unknown): SeedanceAudioInput[] {
  return optionalObjectArray(value, "audios", providerInputError).map((item) => {
    if (item.role !== undefined && item.role !== "reference_audio") {
      throw new ProviderRequestError(400, "audios.role must be reference_audio");
    }
    return { url: requiredInputString(item.url, "audios.url"), role: "reference_audio" };
  });
}

function readTools(value: unknown): SeedanceToolInput[] | undefined {
  if (value === undefined) return undefined;
  return objectArray(value, "tools", providerInputError).map((item) => {
    if (item.type !== "web_search") throw new ProviderRequestError(400, "tools.type must be web_search");
    return { type: "web_search" };
  });
}

function validateImageModes(
  images: SeedanceImageInput[],
  videos: SeedanceVideoInput[],
  audios: SeedanceAudioInput[],
): void {
  const firstFrames = images.filter((image) => image.role === "first_frame");
  const lastFrames = images.filter((image) => image.role === "last_frame");
  const references = images.filter((image) => image.role === "reference_image");
  const frameMode = firstFrames.length > 0 || lastFrames.length > 0;
  const referenceMode = references.length > 0 || videos.length > 0 || audios.length > 0;
  if (frameMode && referenceMode) {
    throw new ProviderRequestError(400, "frame images cannot be mixed with reference images, videos, or audios");
  }
  if (frameMode && images.length > 2) throw new ProviderRequestError(400, "frame mode supports at most two images");
  if (lastFrames.length > 0 && (images.length !== 2 || firstFrames.length !== 1 || lastFrames.length !== 1)) {
    throw new ProviderRequestError(400, "last frame mode requires one first_frame image and one last_frame image");
  }
  if (!referenceMode && images.length > 1 && lastFrames.length === 0) {
    throw new ProviderRequestError(400, "multiple frame images require first_frame and last_frame roles");
  }
}

function readOutputTools(value: unknown): Array<{ type: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => ({ type: requiredString(item.type, "tools.type", providerResponseError) }));
}

function normalizeUsage(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  const toolUsage = optionalRecord(record.tool_usage);
  return {
    completionTokens: optionalInteger(record.completion_tokens),
    totalTokens: optionalInteger(record.total_tokens),
    toolUsage: toolUsage ? { webSearch: optionalInteger(toolUsage.web_search) } : undefined,
  };
}

function normalizeError(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  return { code: optionalString(record.code), message: optionalString(record.message) };
}

function requireArkInteger(value: unknown, field: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined) throw providerResponseError(`Volcengine Ark ${field} must be an integer`);
  return integer;
}

function readEnum<T extends string>(value: unknown, field: string, values: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value === "string" && values.includes(value as T)) return value as T;
  throw new ProviderRequestError(400, `${field} is invalid`);
}

function setStringQuery(query: URLSearchParams, name: string, value: unknown): void {
  const text = optionalString(value);
  if (text) query.set(name, text);
}

function setIntegerQuery(query: URLSearchParams, name: string, value: unknown): void {
  const integer = optionalInteger(value);
  if (integer !== undefined) query.set(name, String(integer));
}

function numberFromString(value: unknown): number | undefined {
  const text = optionalScalarString(value);
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}
