import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  integer,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalNumberLike,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
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
import { defaultKlingModel, klingModels, klingPromptMaxLength } from "./actions.ts";

export const klingApiBaseUrl: string = "https://api-beijing.klingai.com";
const klingResolutions = ["720p", "1080p", "4k"] as const;
const klingAspectRatios = ["16:9", "9:16", "1:1"] as const;
const klingAudioModes = ["off", "native", "original"] as const;
const klingMediaRoles = ["first_frame", "last_frame", "reference_image", "reference_video", "source_video"] as const;

type KlingModel = (typeof klingModels)[number];
type KlingResolution = "720p" | "1080p" | "4k";
type KlingAudioMode = "off" | "native" | "original";
type KlingMediaRole = "first_frame" | "last_frame" | "reference_image" | "reference_video" | "source_video";

interface KlingMediaInput {
  role: KlingMediaRole;
  url: string;
  referenceId?: string;
}

interface KlingShotInput {
  prompt: string;
  duration: number;
}

interface KlingMultiShotInput {
  mode: "intelligent" | "custom";
  shots?: KlingShotInput[];
}

interface KlingSubmitInput {
  model: KlingModel;
  prompt?: string;
  media: KlingMediaInput[];
  resolution: KlingResolution;
  aspectRatio: "16:9" | "9:16" | "1:1";
  duration: number;
  audioMode: KlingAudioMode;
  multiShot?: KlingMultiShotInput;
  watermark: boolean;
}

type KlingRequestPhase = "validate" | "submit" | "get";

interface KlingRequestOptions {
  context: ApiKeyProviderContext;
  method: "GET" | "POST";
  path: string;
  phase: KlingRequestPhase;
  query?: URLSearchParams;
  body?: Record<string, unknown>;
}

export const klingActionHandlers: ProviderActionHandlers<"kling", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async submit_video_generation(input, context): Promise<unknown> {
    const normalized = readKlingSubmitInput(input);
    const payload = await requestKlingJson({
      context,
      method: "POST",
      path: selectKlingSubmitPath(normalized),
      phase: "submit",
      body: buildKlingSubmitBody(normalized),
    });
    const data = requiredResponseRecord(requiredResponseRecord(payload, "submit response").data, "data");
    return { taskId: requiredString(data.id, "data.id", providerResponseError) };
  },
  async get_video_generation(input, context): Promise<unknown> {
    const taskId = requiredInputString(input.taskId, "taskId");
    const payload = await requestKlingJson({
      context,
      method: "GET",
      path: "/tasks",
      phase: "get",
      query: new URLSearchParams({ task_ids: taskId }),
    });
    return normalizeKlingTask(payload, taskId);
  },
};

export async function validateKlingCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const endTime = Date.now();
  const payload = await requestKlingJson({
    context: { apiKey, fetcher, signal },
    method: "GET",
    path: "/account/costs",
    phase: "validate",
    query: new URLSearchParams({ start_time: String(endTime - 60_000), end_time: String(endTime) }),
  });
  requiredResponseRecord(requiredResponseRecord(payload, "account costs response").data, "account costs response data");
  return {
    profile: { accountId: "kling:api_key", displayName: "Kling AI API Key" },
    grantedScopes: [],
    metadata: { apiBaseUrl: klingApiBaseUrl },
  };
}

function readKlingSubmitInput(input: Record<string, unknown>): KlingSubmitInput {
  const modelValue = optionalString(input.model) ?? defaultKlingModel;
  if (!klingModels.includes(modelValue as KlingModel)) {
    throw providerInputError(`model must be one of: ${klingModels.join(", ")}`);
  }
  const model = modelValue as KlingModel;
  const media = readKlingMedia(input.media);
  const prompt = optionalString(input.prompt);
  const resolutionValue = optionalString(input.resolution) ?? "720p";
  if (!klingResolutions.includes(resolutionValue as KlingResolution)) {
    throw providerInputError(`resolution must be one of: ${klingResolutions.join(", ")}`);
  }
  const resolution = resolutionValue as KlingResolution;
  const aspectRatioValue = optionalString(input.aspectRatio) ?? "16:9";
  if (!klingAspectRatios.includes(aspectRatioValue as KlingSubmitInput["aspectRatio"])) {
    throw providerInputError(`aspectRatio must be one of: ${klingAspectRatios.join(", ")}`);
  }
  const aspectRatio = aspectRatioValue as KlingSubmitInput["aspectRatio"];
  const duration = optionalInteger(input.duration) ?? 5;
  const multiShot = readKlingMultiShot(input.multiShot);
  const audioMode = readAudioMode(input.audioMode, model);
  const watermark = optionalBoolean(input.watermark) ?? false;

  if (duration < 3 || duration > 15) throw providerInputError("duration must be an integer from 3 through 15");
  if (model === "kling-3.0-turbo" && resolution === "4k") {
    throw providerInputError("kling-3.0-turbo does not support 4k resolution");
  }

  validatePromptAndMultiShot(prompt, multiShot, duration);
  validateKlingMediaCombination(model, media, multiShot, audioMode, duration);

  return { model, prompt, media, resolution, aspectRatio, duration, audioMode, multiShot, watermark };
}

function selectKlingSubmitPath(input: KlingSubmitInput): string {
  if (input.model === "kling-3.0-omni") return "/omni-video/kling-3.0-omni";
  return input.media.length === 0 ? `/text-to-video/${input.model}` : `/image-to-video/${input.model}`;
}

function buildKlingSubmitBody(input: KlingSubmitInput): Record<string, unknown> {
  const prompt = promptForKling(input);
  const hasFirstFrame = input.media.some((item) => item.role === "first_frame");
  const hasSourceVideo = input.media.some((item) => item.role === "source_video");
  const settings = compactObject({
    resolution: input.resolution,
    aspect_ratio: hasFirstFrame || hasSourceVideo ? undefined : input.aspectRatio,
    duration: hasSourceVideo ? undefined : input.duration,
    audio: input.audioMode,
    multi_shot: input.multiShot !== undefined,
  });
  const options = { watermark_info: { enabled: input.watermark } };

  if (input.media.length === 0 && input.model !== "kling-3.0-omni") {
    return { prompt, settings, options };
  }

  const contents: Array<Record<string, unknown>> = [{ type: "prompt", text: prompt }];
  for (const item of input.media) {
    contents.push(
      compactObject({
        type: klingMediaType(item.role),
        url: item.url,
        id: item.referenceId,
      }),
    );
  }
  return { contents, settings, options };
}

function normalizeKlingTask(payload: unknown, fallbackTaskId: string): Record<string, unknown> {
  const response = requiredResponseRecord(payload, "task response");
  const tasks = objectArray(response.data, "data", providerResponseError);
  const task = tasks.find((item) => optionalString(item.id) === fallbackTaskId);
  if (!task) {
    throw new ProviderRequestError(404, "Kling AI task was not found", { businessCode: 1203 }, "invalid_input");
  }

  const taskId = optionalString(task.id) ?? fallbackTaskId;
  const status = requiredString(task.status, "data.status", providerResponseError);
  const common = compactObject({
    taskId,
    createdAt: optionalInteger(task.create_time),
    updatedAt: optionalInteger(task.update_time),
  });
  if (status === "submitted" || status === "processing") return { ...common, state: "processing" };
  if (status === "failed") {
    return compactObject({
      ...common,
      state: "failed",
      error: compactObject({
        code: optionalString(task.code),
        message: optionalString(task.message),
      }),
    });
  }
  if (status !== "succeeded") throw providerResponseError(`Kling AI returned an unknown task status: ${status}`);

  const outputs = objectArray(task.outputs, "data.outputs", providerResponseError);
  const video = outputs.find((item) => item.type === "video");
  if (!video) throw providerResponseError("Kling AI returned no video output");
  return compactObject({
    ...common,
    state: "succeeded",
    videoUrl: requiredString(video.url, "data.outputs.url", providerResponseError),
    watermarkVideoUrl: optionalString(video.watermark_url),
    duration: optionalNumberLike(video.duration),
  });
}

function readKlingMedia(value: unknown): KlingMediaInput[] {
  if (value === undefined) return [];
  const referenceIds = new Set<string>();
  return objectArray(value, "media", providerInputError).map((item) => {
    const roleValue = requiredString(item.role, "media.role", providerInputError);
    if (!klingMediaRoles.includes(roleValue as KlingMediaRole)) {
      throw providerInputError(`media.role must be one of: ${klingMediaRoles.join(", ")}`);
    }
    const role = roleValue as KlingMediaRole;
    const urlValue = requiredString(item.url, "media.url", providerInputError);
    assertPublicHttpUrl(urlValue, {
      fieldName: "media.url",
      createError: providerInputError,
    });
    const referenceId = optionalString(item.referenceId);
    if (referenceId && referenceIds.has(referenceId)) {
      throw providerInputError(`media.referenceId must be unique: ${referenceId}`);
    }
    if (referenceId) referenceIds.add(referenceId);
    return { role, url: urlValue, referenceId };
  });
}

function readKlingMultiShot(value: unknown): KlingMultiShotInput | undefined {
  if (value === undefined) return undefined;
  const record = optionalRecord(value);
  if (!record) throw providerInputError("multiShot must be an object");
  const modeValue = requiredString(record.mode, "multiShot.mode", providerInputError);
  if (modeValue !== "intelligent" && modeValue !== "custom") {
    throw providerInputError("multiShot.mode must be one of: intelligent, custom");
  }
  const mode = modeValue;
  const shots =
    record.shots === undefined
      ? undefined
      : objectArray(record.shots, "multiShot.shots", providerInputError).map((shot) => ({
          prompt: requiredString(shot.prompt, "multiShot.shots.prompt", providerInputError),
          duration: integer(shot.duration, "multiShot.shots.duration", providerInputError),
        }));
  return { mode, shots };
}

function validatePromptAndMultiShot(
  prompt: string | undefined,
  multiShot: KlingMultiShotInput | undefined,
  duration: number,
): void {
  if (!multiShot) {
    if (!prompt) throw providerInputError("prompt is required when multiShot is omitted");
    return;
  }
  if (multiShot.mode === "intelligent") {
    if (!prompt) throw providerInputError("prompt is required for intelligent multiShot mode");
    if (multiShot.shots !== undefined) throw providerInputError("multiShot.shots is only supported in custom mode");
    return;
  }
  if (prompt) throw providerInputError("prompt must be omitted in custom multiShot mode");
  if (!multiShot.shots || multiShot.shots.length < 1 || multiShot.shots.length > 6) {
    throw providerInputError("custom multiShot mode requires from 1 through 6 shots");
  }
  let totalDuration = 0;
  for (const shot of multiShot.shots) {
    if (shot.duration < 1 || shot.duration > duration) {
      throw providerInputError("multiShot.shots.duration must be from 1 through the total duration");
    }
    totalDuration += shot.duration;
  }
  if (totalDuration !== duration) throw providerInputError("custom shot durations must add up to duration");
  if (Array.from(serializeKlingCustomShots(multiShot.shots)).length > klingPromptMaxLength) {
    throw providerInputError(`serialized custom shot prompt must not exceed ${klingPromptMaxLength} characters`);
  }
}

function validateKlingMediaCombination(
  model: KlingModel,
  media: KlingMediaInput[],
  multiShot: KlingMultiShotInput | undefined,
  audioMode: KlingAudioMode,
  duration: number,
): void {
  if (media.length > 9) throw providerInputError("media supports at most 9 items");
  const firstFrames = byRole(media, "first_frame");
  const lastFrames = byRole(media, "last_frame");
  const referenceImages = byRole(media, "reference_image");
  const referenceVideos = byRole(media, "reference_video");
  const sourceVideos = byRole(media, "source_video");
  if (firstFrames.length > 1 || lastFrames.length > 1) {
    throw providerInputError("media supports at most one first_frame and one last_frame");
  }
  if (lastFrames.length > 0 && firstFrames.length !== 1) {
    throw providerInputError("last_frame requires exactly one first_frame");
  }
  if (referenceVideos.length + sourceVideos.length > 1) {
    throw providerInputError("media supports at most one reference_video or source_video");
  }

  if (model === "kling-3.0-turbo") {
    if (media.some((item) => item.role !== "first_frame") || firstFrames.length > 1) {
      throw providerInputError("kling-3.0-turbo only supports text or one first_frame");
    }
  } else if (model === "kling-3.0") {
    if (referenceImages.length > 0 || referenceVideos.length > 0 || sourceVideos.length > 0) {
      throw providerInputError("kling-3.0 only supports text, first_frame, or first_frame with last_frame");
    }
  } else {
    if (sourceVideos.length > 0 && (firstFrames.length > 0 || lastFrames.length > 0 || referenceVideos.length > 0)) {
      throw providerInputError("source_video cannot be combined with frame images or reference_video");
    }
    if (referenceVideos.length > 0 && lastFrames.length > 0) {
      throw providerInputError("reference_video cannot be combined with last_frame");
    }
    if (referenceVideos.length > 0 && firstFrames.length > 0 && referenceImages.length > 0) {
      throw providerInputError("reference_video cannot combine first_frame with reference_image");
    }
    if (sourceVideos.length > 0 && multiShot) throw providerInputError("source_video does not support multiShot");
    if (referenceVideos.length > 0 && multiShot?.mode === "custom") {
      throw providerInputError("reference_video does not support custom multiShot mode");
    }
    if (referenceVideos.length > 0 && duration > 10) {
      throw providerInputError("reference_video duration must be from 3 through 10 seconds");
    }
    const maximumReferenceImages = referenceVideos.length > 0 ? 4 : 7;
    if (referenceImages.length > maximumReferenceImages) {
      throw providerInputError(`this media mode supports at most ${maximumReferenceImages} reference_image items`);
    }
  }

  const hasVideoInput = referenceVideos.length > 0 || sourceVideos.length > 0;
  if (hasVideoInput && audioMode === "native") {
    throw providerInputError("reference_video and source_video do not support native audio");
  }
  if (audioMode === "original" && (model !== "kling-3.0-omni" || !hasVideoInput)) {
    throw providerInputError("original audio requires kling-3.0-omni with reference_video or source_video");
  }
}

function promptForKling(input: KlingSubmitInput): string {
  if (input.multiShot?.mode !== "custom") return input.prompt!;
  return serializeKlingCustomShots(input.multiShot.shots!);
}

function serializeKlingCustomShots(shots: KlingShotInput[]): string {
  return shots.map((shot, index) => `镜头 ${index + 1}, ${shot.duration}, ${shot.prompt};`).join(" ");
}

function klingMediaType(role: KlingMediaRole): string {
  switch (role) {
    case "first_frame":
    case "last_frame":
      return role;
    case "reference_image":
      return "refer_image";
    case "reference_video":
      return "feature_video";
    case "source_video":
      return "base_video";
  }
}

async function requestKlingJson(options: KlingRequestOptions): Promise<unknown> {
  options.context.signal?.throwIfAborted();
  return runProviderRequest({ label: "Kling AI", signal: options.context.signal }, async (signal) => {
    const url = new URL(options.path, klingApiBaseUrl);
    if (options.query) url.search = options.query.toString();
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${options.context.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (options.body) headers.set("content-type", "application/json");
    const response = await options.context.fetcher(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Kling AI returned an invalid JSON response",
    });
    const record = optionalRecord(payload);
    const businessCode = readBusinessCode(record?.code);
    if (!response.ok || (businessCode !== undefined && businessCode !== 0)) {
      handleKlingError(response.status, record, options.phase);
    }
    if (!record) throw providerResponseError("Kling AI response must be an object");
    if (businessCode === undefined) {
      throw providerResponseError("Kling AI response must include a valid business code");
    }
    return record;
  });
}

function handleKlingError(
  httpStatus: number,
  payload: Record<string, unknown> | undefined,
  phase: KlingRequestPhase,
): never {
  const businessCode = readBusinessCode(payload?.code);
  const details = compactObject({ businessCode, status: httpStatus });
  if (businessCode !== undefined && businessCode >= 1000 && businessCode <= 1004) {
    if (phase === "validate") {
      throw new ProviderRequestError(400, "Kling AI API key is invalid or expired", details, "invalid_input");
    }
    throw new ProviderRequestError(403, "Kling AI credential is invalid or expired", details, "authorization_failed");
  }
  if (businessCode === 1200 || businessCode === 1201 || businessCode === 1300 || businessCode === 1301) {
    throw new ProviderRequestError(
      400,
      `Kling AI rejected the request with code ${businessCode}`,
      details,
      "invalid_input",
    );
  }
  if (businessCode === 1203 && phase === "get") {
    throw new ProviderRequestError(404, "Kling AI task was not found", details, "invalid_input");
  }
  if (businessCode === 1302 || businessCode === 1303 || (businessCode === undefined && httpStatus === 429)) {
    throw new ProviderRequestError(429, "Kling AI rate limit exceeded", details, "rate_limited");
  }
  if (businessCode === undefined && (httpStatus === 400 || httpStatus === 404 || httpStatus === 422)) {
    throw new ProviderRequestError(
      httpStatus === 404 ? 404 : 400,
      `Kling AI rejected the request with HTTP ${httpStatus}`,
      details,
      "invalid_input",
    );
  }
  throw new ProviderRequestError(
    502,
    businessCode === undefined
      ? `Kling AI request failed with HTTP ${httpStatus}`
      : `Kling AI request failed with code ${businessCode}`,
    details,
    "provider_error",
  );
}

function readAudioMode(value: unknown, model: KlingModel): KlingAudioMode {
  const defaultValue = model === "kling-3.0-turbo" ? "native" : "off";
  const modeValue = optionalString(value) ?? defaultValue;
  if (!klingAudioModes.includes(modeValue as KlingAudioMode)) {
    throw providerInputError(`audioMode must be one of: ${klingAudioModes.join(", ")}`);
  }
  const mode = modeValue as KlingAudioMode;
  if (model === "kling-3.0-turbo" && mode !== "native") {
    throw providerInputError("kling-3.0-turbo only supports native audio");
  }
  return mode;
}

function byRole(media: KlingMediaInput[], role: KlingMediaRole): KlingMediaInput[] {
  return media.filter((item) => item.role === role);
}

function readBusinessCode(value: unknown): number | undefined {
  const integer = optionalInteger(value);
  if (integer !== undefined) return integer;
  const text = optionalString(value);
  if (!text) return undefined;
  const number = Number(text);
  return Number.isInteger(number) ? number : undefined;
}
