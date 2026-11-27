import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { KlingSubmitInput, KlingMediaInput, KlingMediaRole, KlingMultiShotInput } from "./contract.ts";

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
  withRetryAfterSeconds,
  providerResponseError,
  providerUserAgent,
  readProviderJsonBody,
  readProviderErrorBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { collectKlingSubmitInputIssues, serializeKlingCustomShots } from "./contract.ts";
import { defaultKlingModel, klingModels, klingModelDefinitions } from "./models.ts";

export const klingApiBaseUrl: string = "https://api-beijing.klingai.com";
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
    metadata: { apiBaseUrl: klingApiBaseUrl },
  };
}

function readKlingSubmitInput(input: Record<string, unknown>): KlingSubmitInput {
  const model = readEnum(input.model, "model", klingModels, defaultKlingModel);
  const { defaults } = klingModelDefinitions[model];
  const media = readKlingMedia(input.media);
  const prompt = optionalString(input.prompt);
  const resolution = readEnum(input.resolution, "resolution", ["720p", "1080p", "4k"], defaults.resolution);
  const aspectRatio = readEnum(
    input.aspectRatio,
    "aspectRatio",
    ["16:9", "9:16", "1:1", "21:9", "4:3", "3:4", "adaptive"],
    defaults.aspectRatio,
  );
  const duration = optionalInteger(input.duration) ?? defaults.duration;
  const multiShot = readKlingMultiShot(input.multiShot);
  const audioMode = readEnum(input.audioMode, "audioMode", ["off", "native", "original"], defaults.audioMode);
  const watermark = optionalBoolean(input.watermark) ?? false;

  const normalized = {
    model,
    prompt,
    media,
    resolution,
    aspectRatio,
    duration,
    audioMode,
    multiShot,
    watermark,
    dynamicRange:
      input.dynamicRange === undefined
        ? undefined
        : readEnum(input.dynamicRange, "dynamicRange", ["sdr", "hdr"], undefined),
    elements:
      input.elements === undefined
        ? undefined
        : objectArray(input.elements, "elements", providerInputError).map((item) => ({
            elementId: requiredInputString(item.elementId, "elementId"),
            referenceId: requiredInputString(item.referenceId, "referenceId"),
          })),
    voices:
      input.voices === undefined
        ? undefined
        : objectArray(input.voices, "voices", providerInputError).map((item) => ({
            voiceId: requiredInputString(item.voiceId, "voiceId"),
            referenceId: requiredInputString(item.referenceId, "referenceId"),
          })),
  };
  const issue = collectKlingSubmitInputIssues(normalized)[0];
  if (issue) throw providerInputError(issue.message);
  return normalized;
}

function selectKlingSubmitPath(input: KlingSubmitInput): string {
  if (
    (input.elements?.length ?? 0) + (input.voices?.length ?? 0) > 0 ||
    input.media.some((item) => ["reference_image", "reference_video", "source_video"].includes(item.role))
  )
    return `/omni-video/${input.model}`;
  if (input.model === "kling-3.0-omni") return "/omni-video/kling-3.0-omni";
  return input.media.length === 0 ? `/text-to-video/${input.model}` : `/image-to-video/${input.model}`;
}

function buildKlingSubmitBody(input: KlingSubmitInput): Record<string, unknown> {
  const prompt = promptForKling(input);
  const hasFirstFrame = input.media.some((item) => item.role === "first_frame");
  const hasSourceVideo = input.media.some((item) => item.role === "source_video");
  const { settings: settingsContract } = klingModelDefinitions[input.model];
  const endpoint = selectKlingSubmitPath(input);
  const omni = endpoint.startsWith("/omni-video/");
  const settings = compactObject({
    resolution: input.resolution,
    aspect_ratio:
      endpoint.startsWith("/image-to-video/") ||
      (settingsContract.inheritMediaSettings && (hasFirstFrame || hasSourceVideo))
        ? undefined
        : input.aspectRatio,
    duration: settingsContract.inheritMediaSettings && hasSourceVideo ? undefined : input.duration,
    audio: settingsContract.audio === "omni" && !omni ? undefined : input.audioMode,
    dynamic_range: input.dynamicRange,
    multi_shot: settingsContract.multiShot ? input.multiShot !== undefined : undefined,
  });
  const options = { watermark_info: { enabled: input.watermark } };
  if (input.media.length === 0 && !omni) return { prompt, settings, options };

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
  contents.push(
    ...(input.elements ?? []).map((item) => ({
      type: "element",
      element_id: item.elementId,
      id: item.referenceId,
    })),
  );
  contents.push(
    ...(input.voices ?? []).map((item) => ({
      type: "voice",
      voice_id: item.voiceId,
      id: item.referenceId,
    })),
  );
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
    const role = readEnum(
      roleValue,
      "media.role",
      ["first_frame", "middle_frame", "last_frame", "reference_image", "reference_video", "source_video"],
      undefined,
    );
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

function promptForKling(input: KlingSubmitInput): string {
  if (input.multiShot?.mode !== "custom") return input.prompt!;
  return serializeKlingCustomShots(input.multiShot.shots!);
}

function klingMediaType(role: KlingMediaRole): string {
  switch (role) {
    case "middle_frame":
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
      "accept": "application/json",
      "authorization": `Bearer ${options.context.apiKey}`,
      "user-agent": providerUserAgent,
    });
    if (options.body) headers.set("content-type", "application/json");
    const response = await options.context.fetcher(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal,
    });
    const payload = response.ok
      ? await readProviderJsonBody(response, {
          emptyBody: {},
          invalidJsonMessage: "Kling AI returned an invalid JSON response",
        })
      : await readProviderErrorBody(response, "Kling AI", signal);
    const record = optionalRecord(payload);
    const businessCode = readBusinessCode(record?.code);
    if (!response.ok || (businessCode !== undefined && businessCode !== 0)) {
      handleKlingError(response, record, options.phase);
    }
    if (!record) throw providerResponseError("Kling AI response must be an object");
    if (businessCode === undefined) {
      throw providerResponseError("Kling AI response must include a valid business code");
    }
    return record;
  });
}

function handleKlingError(
  response: Response,
  payload: Record<string, unknown> | undefined,
  phase: KlingRequestPhase,
): never {
  const httpStatus = response.status;
  const businessCode = readBusinessCode(payload?.code);
  const details = withRetryAfterSeconds(response, compactObject({ businessCode, status: httpStatus }));
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

function readBusinessCode(value: unknown): number | undefined {
  const integer = optionalInteger(value);
  if (integer !== undefined) return integer;
  const text = optionalString(value);
  if (!text) return undefined;
  const number = Number(text);
  return Number.isInteger(number) ? number : undefined;
}

function readEnum<const TValue extends string>(
  value: unknown,
  fieldName: string,
  values: readonly TValue[],
  defaultValue: TValue | undefined,
): TValue {
  const normalized = optionalString(value);
  if (normalized === undefined && defaultValue !== undefined) return defaultValue;
  const matched = values.find((item) => item === normalized);
  if (!matched) throw providerInputError(`${fieldName} must be one of: ${values.join(", ")}`);
  return matched;
}
