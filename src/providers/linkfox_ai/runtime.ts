import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-executors.ts";

import {
  compactObject,
  optionalRawString,
  optionalString,
  optionalNumber,
  optionalNumberLike,
  optionalRecord,
  optionalBoolean,
  looseArray,
  pickOptionalString,
  requiredString,
  requiredNumber,
  integer,
  objectArray,
} from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  providerUserAgent,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export const apiBaseUrl = "https://ai-api.linkfox.com";
const planPath = "/v1/userPlan/info";
const inputErrorKeys = new Set(["ERR_FILED_VALIDATE", "ERR_VALIDATE_FAIL", "ERR_VIDEO_IMAGE_DIMENSION_INVALID"]);

function responseError(response: Response, payload: Record<string, unknown> | undefined, validating: boolean) {
  const code = payload?.code;
  const msgKey = optionalRawString(payload?.msgKey);
  const msg = optionalRawString(payload?.msg);
  const traceId = optionalRawString(payload?.traceId);
  const details = compactObject({
    upstreamErrorCode: msgKey || (code == null ? undefined : String(code)),
    code,
    msgKey,
    msg,
    traceId,
  });
  const message = `LinkFox AI HTTP ${response.status}: ${
    Object.entries(compactObject({ code, msgKey, msg, traceId }))
      .map(([k, v]) => `${k}=${v}`)
      .join(", ") || "Invalid response envelope"
  }`;
  if (response.status === 429)
    return new ProviderRequestError(429, message, withRetryAfterSeconds(response, details), "rate_limited");
  if (msgKey === "ERR_AUTHENTICATION_FAIL" || String(code) === "30009")
    return new ProviderRequestError(
      validating ? 400 : 401,
      message,
      details,
      validating ? "invalid_input" : "authorization_failed",
    );
  if (msgKey && inputErrorKeys.has(msgKey)) return new ProviderRequestError(400, message, details, "invalid_input");
  return new ProviderRequestError(
    response.ok ? 502 : response.status,
    message,
    details,
    response.ok || response.status === 401 || response.status === 403 ? "provider_error" : undefined,
  );
}

// Validate header characters before fetch so invalid input does not become a transport failure.
function assertAsciiApiKey(apiKey: string) {
  let valid = apiKey.length > 0;
  for (let i = 0; valid && i < apiKey.length; i++) {
    const code = apiKey.charCodeAt(i);
    if (code < 0x21 || code > 0x7e) valid = false;
  }
  if (!valid) {
    throw providerInputError("LinkFox AI API key must contain only printable ASCII characters without whitespace");
  }
}

function request(
  apiKey: string,
  fetcher: typeof fetch,
  path: string,
  body?: Record<string, unknown>,
  validating = false,
  parentSignal?: AbortSignal,
) {
  assertAsciiApiKey(apiKey);
  return runProviderRequest({ label: "LinkFox AI", signal: parentSignal }, async (signal) => {
    const response = await fetcher(apiBaseUrl + path, {
      method: body === undefined ? "GET" : "POST",
      signal,
      headers: {
        "authorization": `Bearer ${apiKey}`,
        "content-type": "application/json",
        "accept": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    let payload: Record<string, unknown> | undefined;
    try {
      payload = optionalRecord(
        JSON.parse(raw, (key: string, value: unknown, context?: { source?: string }) => {
          // Preserve every decimal digit of task and result IDs from the JSON source.
          if ((key === "id" || key === "outputGroupId") && typeof value === "number") {
            if (context?.source) return context.source;
            if (Number.isSafeInteger(value)) return String(value);
            throw new Error("LinkFox AI ID source is unavailable");
          }
          return value;
        }),
      );
    } catch {
      throw responseError(response, undefined, validating);
    }
    if (!response.ok || !payload || String(payload.code) !== "200") throw responseError(response, payload, validating);
    return { data: payload.data, traceId: optionalRawString(payload.traceId) };
  });
}

export async function validateLinkfoxAiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const response = await request(apiKey, fetcher, planPath, {}, true, signal);
  const data = requiredResponseRecord(response.data, "LinkFox AI plan");
  return {
    profile: { displayName: "LinkFox AI Account" },
    metadata: compactObject({
      apiBaseUrl,
      validationEndpoint: planPath,
      planTotal: optionalNumber(data.total),
      planUsage: optionalNumber(data.usage),
      planExpireTime: optionalNumber(data.expireTime),
    }),
  };
}

function normalizeModel(item: Record<string, unknown>) {
  const offPeak = optionalRecord(item.offPeak);
  const modes = optionalRecord(item.extraConfig)?.supportModes;
  return compactObject({
    apiCode: requiredString(
      pickOptionalString(item, "apiCode", "code"),
      "LinkFox AI model code",
      providerResponseError,
    ),
    code: optionalRawString(item.code),
    name: requiredString(item.name, "LinkFox AI model name", providerResponseError),
    isMaintenance: optionalBoolean(item.isMaintenance),
    resolutions: looseArray(item.supportedResolutions).map(String),
    durations: looseArray(item.supportedDurations).map(String),
    ratios: looseArray(item.supportedRatios).map(String),
    referenceImageLimit: optionalNumber(item.refImageCount),
    supportsVoice: optionalBoolean(item.supportVoice),
    supportsLastFrame: optionalBoolean(item.supportLastFrame),
    modes: Array.isArray(modes) ? modes.map(String) : undefined,
    offPeak:
      offPeak &&
      compactObject({
        supported: optionalBoolean(offPeak.supported),
        discount: optionalNumber(offPeak.discount),
        maxWaitHours: optionalNumber(offPeak.maxWaitHours),
      }),
    pricing: optionalRecord(item.pricing),
  });
}

function normalizeResult(item: Record<string, unknown>) {
  return compactObject({
    id: optionalRawString(item.id),
    status: optionalNumberLike(item.status),
    url: pickOptionalString(item, "url"),
    width: optionalNumber(item.width),
    height: optionalNumber(item.height),
    format: optionalRawString(item.format),
    size: optionalNumber(item.size),
    errorCode: pickOptionalString(item, "errorCode"),
    errorMsg: pickOptionalString(item, "errorMsg"),
  });
}

function normalizeTask(data: Record<string, unknown>, requestedId: string, traceId?: string) {
  const rawStatus = integer(data.status, "LinkFox AI task status", providerResponseError);
  const results =
    data.resultList == null
      ? undefined
      : objectArray(data.resultList, "LinkFox AI results", providerResponseError).map(normalizeResult);
  const videoUrl = rawStatus === 3 ? results?.find((item) => item.status === 1 && item.url)?.url : undefined;
  let state: "processing" | "succeeded" | "failed";
  switch (rawStatus) {
    case 1:
    case 2:
      state = "processing";
      break;
    case 3:
      state = videoUrl ? "succeeded" : "failed";
      break;
    case 4:
      state = "failed";
      break;
    default:
      throw providerResponseError(`Unknown LinkFox AI task status: ${rawStatus}`);
  }
  const failed = results?.find((item) => item.status === 2 && (item.errorMsg || item.errorCode));
  const error =
    state === "failed"
      ? compactObject({
          code: pickOptionalString(data, "errorCode") ?? failed?.errorCode,
          message:
            pickOptionalString(data, "errorMsg") ??
            failed?.errorMsg ??
            (rawStatus === 3 ? "Task completed with no available video result" : "Video task failed"),
        })
      : undefined;
  return compactObject({
    taskId: optionalRawString(data.id) ?? requestedId,
    state,
    rawStatus,
    videoUrl,
    results,
    pointsConsumed: optionalNumber(data.count),
    error,
    traceId,
  });
}

async function submit(context: ApiKeyProviderContext, path: string, body: Record<string, unknown>) {
  const { data, traceId } = await request(
    context.apiKey,
    context.fetcher,
    path,
    compactObject(body),
    false,
    context.signal,
  );
  return compactObject({
    taskId: requiredString(
      requiredResponseRecord(data, "LinkFox AI submission").id,
      "LinkFox AI task ID",
      providerResponseError,
    ),
    traceId,
  });
}

function generationBody(input: Record<string, unknown>) {
  return {
    videoType: requiredInputString(input.model, "model"),
    prompt: input.prompt,
    videoTime: input.duration,
    resolution: input.resolution,
    aspectRatio: input.aspectRatio,
    imageUrl: input.firstFrameImageUrl,
    imageList: input.referenceImageUrls,
    lastFrameImageUrl: input.lastFrameImageUrl,
    video: input.referenceVideoUrls,
    audio: input.referenceAudioUrls,
    voice: input.voice,
    promptOptimizer: input.promptOptimizer,
    useAssetWhitelist: input.useAssetWhitelist,
  };
}

export const linkfoxAiHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_plan_info(_input, context) {
    const response = await request(context.apiKey, context.fetcher, planPath, {}, false, context.signal);
    const plan = requiredResponseRecord(response.data, "LinkFox AI plan");
    const total = requiredNumber(plan.total, "LinkFox AI plan total", providerResponseError);
    const usage = requiredNumber(plan.usage, "LinkFox AI plan usage", providerResponseError);
    return compactObject({
      total,
      usage,
      remaining: Math.max(0, total - usage),
      startTime: optionalNumber(plan.startTime),
      expireTime: optionalNumber(plan.expireTime),
      traceId: response.traceId,
    });
  },
  async list_video_models(input, context) {
    const bizType = input.bizType ?? 94;
    const { data } = await request(
      context.apiKey,
      context.fetcher,
      `/image/video/model/config/list?bizType=${bizType}`,
      undefined,
      false,
      context.signal,
    );
    return { bizType, models: objectArray(data, "LinkFox AI models", providerResponseError).map(normalizeModel) };
  },
  submit_video_generation(input, context) {
    return submit(context, "/image/v3/make/aiVideoGen", generationBody(input));
  },
  submit_image_to_video(input, context) {
    const mode = input.generationMode ?? "normal";
    const hasTemplate = !!optionalString(input.templateKey);
    const hasAudio = Array.isArray(input.referenceAudioUrls) && input.referenceAudioUrls.length > 0;
    if (mode === "normal" && !optionalString(input.prompt) && !hasTemplate)
      throw providerInputError("Normal generationMode requires at least one of prompt or templateKey.");
    if (mode === "advanced" && hasTemplate)
      throw providerInputError("templateKey cannot be combined with generationMode='advanced'.");
    if (hasAudio && (hasTemplate || optionalString(input.lastFrameImageUrl)))
      throw providerInputError("referenceAudioUrls cannot be combined with templateKey or lastFrameImageUrl.");
    return submit(context, "/image/v3/make/imageToVideo", {
      ...generationBody(input),
      generationMode: input.generationMode,
      templateKey: input.templateKey,
      productInfo: input.productInfo,
      language: input.language,
      saleCountry: input.saleCountry,
    });
  },
  submit_video_editing(input, context) {
    const model = requiredInputString(input.model, "model");
    return submit(context, "/image/v3/make/videoEditing", {
      videoType: model.toLowerCase() === "wan3" ? "WAN3" : model,
      sourceVideoUrl: input.sourceVideoUrl,
      prompt: input.prompt,
      videoTime: input.duration,
      refImageList: input.referenceImageUrls,
      useAssetWhitelist: input.useAssetWhitelist,
    });
  },
  async get_video_task(input, context) {
    const taskId = requiredInputString(input.taskId, "taskId");
    const { data, traceId } = await request(
      context.apiKey,
      context.fetcher,
      "/image/v2/make/info",
      compactObject({ id: taskId, containsSyntheticPerformer: input.containsSyntheticPerformer }),
      false,
      context.signal,
    );
    return normalizeTask(requiredResponseRecord(data, "LinkFox AI task"), taskId, traceId);
  },
};
