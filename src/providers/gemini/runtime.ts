import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { jsonObject, readBoundedResponseBytes } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const geminiApiBaseUrl = "https://generativelanguage.googleapis.com/v1beta";
export const geminiDefaultTextModel = "gemini-2.5-flash";
export const geminiDefaultEmbeddingModel = "text-embedding-004";
export const geminiDefaultTokenCountModel = "gemini-2.0-flash";
export const geminiDefaultImageModel = "gemini-3-pro-image-preview";
export const geminiDefaultVideoModel = "veo-3.0-generate-001";
export const geminiDefaultVideoPollIntervalMs = 10_000;
export const geminiDefaultVideoMaxWaitMs: number = 12 * 60_000;
export const geminiDefaultRequestTimeoutMs = 10_000;
export const geminiDefaultLongRunningRequestTimeoutMs = 30_000;

type GeminiErrorMode = "validate" | "execute";

interface GeminiInlineDataPart {
  mimeType: string;
  data: string;
}

interface GeminiFileDataPart {
  mimeType?: string;
  fileUri: string;
}

interface GeminiModelSummary {
  name: string;
  version: string;
  topK?: number;
  topP?: number;
  thinking?: boolean;
  baseModelId?: string;
  description?: string;
  displayName?: string;
  temperature?: number;
  maxTemperature?: number;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
}

interface GeminiRaiFiltering {
  filterReasons: string[];
  filteredCount: number;
}

interface GeminiDownloadedMedia {
  bytes: Uint8Array;
  mimeType?: string;
}

export interface GeminiRuntimeContext extends Pick<
  ApiKeyProviderContext,
  "apiKey" | "fetcher" | "signal" | "transitFiles"
> {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  pollIntervalMs: number;
  maxWaitMs: number;
}

export function geminiHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "user-agent": providerUserAgent,
    "x-goog-api-key": apiKey,
  };
}

export function resolveGeminiModel(value: unknown, fallback: string): string {
  const model = optionalString(value);
  return model || fallback;
}

export function buildModelResource(model: string): string {
  const trimmed = model.trim();
  return trimmed.startsWith("models/") ? trimmed : `models/${trimmed}`;
}

export function buildOperationResource(operationName: string, defaultModel: string = geminiDefaultVideoModel): string {
  const trimmed = operationName.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "operation_name is required");
  }
  return trimmed.startsWith("models/") ? trimmed : `models/${defaultModel}/operations/${trimmed}`;
}

export async function fetchGeminiModelsWithMode(
  context: Pick<GeminiRuntimeContext, "apiKey" | "fetcher" | "signal">,
  mode: GeminiErrorMode,
): Promise<{ models: GeminiModelSummary[]; nextPageToken?: string }> {
  const models: GeminiModelSummary[] = [];
  let nextPageToken: string | undefined;
  let pageCount = 0;

  do {
    const pageTokenParam = nextPageToken ? `&pageToken=${encodeURIComponent(nextPageToken)}` : "";
    const response = await fetchGemini(
      `${geminiApiBaseUrl}/models?pageSize=1000${pageTokenParam}`,
      {
        headers: geminiHeaders(context.apiKey),
      },
      context,
      "list_models",
      geminiDefaultRequestTimeoutMs,
    );

    await assertGeminiResponse(response, mode, "list_models");
    const payload = await readGeminiJson(response, "list_models");
    const pageModels = asRecordArray(payload.models) ?? [];
    models.push(...pageModels.map(normalizeModelSummary).filter((model): model is GeminiModelSummary => model != null));
    nextPageToken = optionalString(payload.nextPageToken);
    pageCount += 1;
  } while (nextPageToken && pageCount < 20);

  return { models, nextPageToken };
}

export async function listGeminiModels(
  input: Record<string, unknown>,
  context: Pick<GeminiRuntimeContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const filterPrefix = optionalString(input.filter_prefix);
  const { models, nextPageToken } = await fetchGeminiModelsWithMode(context, "execute");
  const filteredModels = filterPrefix ? models.filter((model) => model.name.startsWith(filterPrefix)) : models;

  return {
    raw: compactObject({
      models,
      nextPageToken,
    }),
    models: filteredModels,
  };
}

export async function generateGeminiContent(
  input: Record<string, unknown>,
  context: Pick<GeminiRuntimeContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const model = resolveGeminiModel(input.model, geminiDefaultTextModel);
  const voiceName = optionalString(input.voice_name);
  const response = await fetchGemini(
    `${geminiApiBaseUrl}/${buildModelResource(model)}:generateContent`,
    {
      method: "POST",
      headers: geminiHeaders(context.apiKey),
      body: JSON.stringify(
        jsonObject({
          contents: buildGeminiPrompt(String(input.prompt)),
          generationConfig: jsonObject({
            ...buildGeminiGenerationConfig(input),
            responseModalities: voiceName ? ["AUDIO"] : undefined,
            speechConfig: voiceName
              ? {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName,
                    },
                  },
                }
              : undefined,
          }),
          safetySettings: asSafetySettings(input.safety_settings),
          systemInstruction: buildGeminiSystemInstruction(input.system_instruction),
        }),
      ),
    },
    context,
    "generate_content",
    geminiDefaultRequestTimeoutMs,
  );

  await assertGeminiResponse(response, "execute", "generate_content");
  const payload = await readGeminiJson(response, "generate_content");
  const audio = extractInlineDataPart(payload, "audio/");
  const text = extractTextFromResponse(payload);

  return compactObject({
    raw: payload,
    text,
    mime_type: audio?.mimeType,
    audio_data: audio?.data,
    candidates: asRecordArray(payload.candidates),
    usage_metadata: optionalRecord(payload.usageMetadata) ?? optionalRecord(payload.usage_metadata),
    message: audio && !text ? "Gemini returned audio content in audio_data." : undefined,
  });
}

export async function embedGeminiContent(
  input: Record<string, unknown>,
  context: Pick<GeminiRuntimeContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const model = resolveGeminiModel(input.model, geminiDefaultEmbeddingModel);
  const response = await fetchGemini(
    `${geminiApiBaseUrl}/${buildModelResource(model)}:embedContent`,
    {
      method: "POST",
      headers: geminiHeaders(context.apiKey),
      body: JSON.stringify(
        jsonObject({
          content: {
            parts: [{ text: String(input.text) }],
          },
          taskType: optionalString(input.task_type),
          title: optionalString(input.title),
          outputDimensionality: optionalInteger(input.output_dimensionality),
        }),
      ),
    },
    context,
    "embed_content",
    geminiDefaultRequestTimeoutMs,
  );

  await assertGeminiResponse(response, "execute", "embed_content");
  const payload = await readGeminiJson(response, "embed_content");
  const embedding =
    readNumberArray(optionalRecord(payload.embedding)?.values) ??
    readNumberArray(optionalRecord(payload.embedding)?.embedding) ??
    readNumberArray(asRecordArray(payload.embeddings)?.[0]?.values);

  if (!embedding) {
    throw new ProviderRequestError(502, "gemini response did not include embedding values", payload);
  }

  return {
    embedding,
    dimensions: embedding.length,
  };
}

export async function countGeminiTokens(
  input: Record<string, unknown>,
  context: Pick<GeminiRuntimeContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const model = resolveGeminiModel(input.model, geminiDefaultTokenCountModel);
  const response = await fetchGemini(
    `${geminiApiBaseUrl}/${buildModelResource(model)}:countTokens`,
    {
      method: "POST",
      headers: geminiHeaders(context.apiKey),
      body: JSON.stringify({
        contents: buildGeminiPrompt(String(input.text)),
      }),
    },
    context,
    "count_tokens",
    geminiDefaultRequestTimeoutMs,
  );

  await assertGeminiResponse(response, "execute", "count_tokens");
  const payload = await readGeminiJson(response, "count_tokens");
  const totalTokens = optionalInteger(payload.totalTokens) ?? optionalInteger(payload.total_tokens);
  if (totalTokens === undefined) {
    throw new ProviderRequestError(502, "gemini response did not include total token count", payload);
  }

  const rawTokenDetails =
    asRecordArray(payload.promptTokensDetails) ??
    asRecordArray(payload.prompt_tokens_details) ??
    asRecordArray(payload.tokenDetails) ??
    asRecordArray(payload.token_details);

  return compactObject({
    total_tokens: totalTokens,
    token_details: rawTokenDetails?.map((detail) => ({
      modality:
        optionalString(detail.modality) ??
        optionalString(detail.modalityType) ??
        optionalString(detail.modality_type) ??
        "UNKNOWN",
      token_count: optionalInteger(detail.tokenCount) ?? optionalInteger(detail.token_count) ?? 0,
    })),
  });
}

export async function generateGeminiImage(
  input: Record<string, unknown>,
  context: GeminiRuntimeContext,
): Promise<unknown> {
  const model = resolveGeminiModel(input.model, geminiDefaultImageModel);
  const response = await fetchGemini(
    `${geminiApiBaseUrl}/${buildModelResource(model)}:generateContent`,
    {
      method: "POST",
      headers: geminiHeaders(context.apiKey),
      body: JSON.stringify(
        jsonObject({
          contents: buildGeminiPrompt(String(input.prompt)),
          generationConfig: jsonObject({
            ...buildGeminiGenerationConfig(input),
            imageConfig: jsonObject({
              aspectRatio: optionalString(input.aspect_ratio),
              imageSize: optionalString(input.image_size),
            }),
          }),
          safetySettings: asSafetySettings(input.safety_settings),
          systemInstruction: buildGeminiSystemInstruction(input.system_instruction),
        }),
      ),
    },
    context,
    "generate_image",
    resolveGeminiTimeoutMs(input.timeout, geminiDefaultLongRunningRequestTimeoutMs),
  );

  await assertGeminiResponse(response, "execute", "generate_image");
  const payload = await readGeminiJson(response, "generate_image");
  const inlineImage = extractInlineDataPart(payload, "image/");
  const fileImage = extractFileDataPart(payload, "image/");

  let bytes: Uint8Array | undefined;
  let mimeType: string | undefined;

  if (inlineImage) {
    bytes = decodeBase64Bytes(inlineImage.data);
    mimeType = inlineImage.mimeType;
  } else if (fileImage) {
    const downloaded = await downloadMediaBytes(fileImage.fileUri, context);
    bytes = downloaded.bytes;
    mimeType = fileImage.mimeType ?? downloaded.mimeType ?? "image/png";
  }

  if (!bytes || !mimeType) {
    throw new ProviderRequestError(502, "gemini response did not include a usable image file", payload);
  }

  return {
    image: await createTransitDownloadableFile(context, "gemini-image", mimeType, bytes),
  };
}

export async function generateGeminiVideos(
  input: Record<string, unknown>,
  context: Pick<GeminiRuntimeContext, "apiKey" | "fetcher" | "signal">,
): Promise<unknown> {
  const model = resolveGeminiModel(input.model, geminiDefaultVideoModel);
  const response = await fetchGemini(
    `${geminiApiBaseUrl}/${buildModelResource(model)}:predictLongRunning`,
    {
      method: "POST",
      headers: geminiHeaders(context.apiKey),
      body: JSON.stringify(
        jsonObject({
          instances: [{ prompt: String(input.prompt) }],
          parameters: jsonObject({
            aspectRatio: optionalString(input.aspect_ratio),
            durationSeconds: optionalInteger(input.duration_seconds),
            negativePrompt: optionalString(input.negative_prompt),
            personGeneration: optionalString(input.person_generation),
            resolution: optionalString(input.resolution),
            seed: optionalInteger(input.seed),
          }),
        }),
      ),
    },
    context,
    "generate_videos",
    geminiDefaultLongRunningRequestTimeoutMs,
  );

  await assertGeminiResponse(response, "execute", "generate_videos");
  const payload = await readGeminiJson(response, "generate_videos");
  const operationName = optionalString(payload.name);
  if (!operationName) {
    throw new ProviderRequestError(502, "gemini response did not include operation name", payload);
  }

  return {
    operation_name: operationName,
    raw: payload,
  };
}

export async function getGeminiVideosOperation(
  input: Record<string, unknown>,
  context: GeminiRuntimeContext,
): Promise<unknown> {
  const payload = await fetchGeminiVideoOperation(input, context);
  const done = payload.done === true;

  return compactObject({
    done,
    error: normalizeOperationError(payload),
    response: optionalRecord(payload.response),
    video_urls: extractVideoUrls(payload),
  });
}

export async function waitForGeminiVideo(
  input: Record<string, unknown>,
  context: GeminiRuntimeContext,
): Promise<unknown> {
  const start = context.now();

  for (;;) {
    const payload = await fetchGeminiVideoOperation(input, context);
    const done = payload.done === true;
    const operationError = normalizeOperationError(payload);
    const videoUrls = extractVideoUrls(payload);

    if (operationError) {
      throw new ProviderRequestError(502, operationError.message, operationError);
    }

    if (done && videoUrls.length > 0) {
      const downloaded = await downloadMediaBytes(videoUrls[0]!, context);
      const mimeType = downloaded.mimeType ?? "video/mp4";
      return {
        success: true,
        video_file: await createTransitDownloadableFile(context, "gemini-video", mimeType, downloaded.bytes),
      };
    }

    if (done) {
      const filtering = extractRaiFiltering(payload);
      if (filtering) {
        return {
          success: false,
          rai_filtering: {
            filtered: true,
            filtered_count: filtering.filteredCount,
            filter_reasons: filtering.filterReasons,
            message:
              filtering.filterReasons.length > 0
                ? `Gemini blocked video generation: ${filtering.filterReasons.join(", ")}`
                : "Gemini blocked video generation due to RAI filtering.",
          },
        };
      }

      throw new ProviderRequestError(502, "gemini response did not include a usable video file", payload);
    }

    if (context.now() - start >= context.maxWaitMs) {
      throw new ProviderRequestError(
        502,
        `timed out waiting for gemini video after ${Math.max(1, Math.ceil(context.maxWaitMs / 1000))} seconds`,
      );
    }

    await context.sleep(context.pollIntervalMs);
  }
}

async function fetchGeminiVideoOperation(
  input: Record<string, unknown>,
  context: Pick<GeminiRuntimeContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const operationName = buildOperationResource(
    optionalString(input.operation_name) ?? "",
    resolveGeminiModel(input.model, geminiDefaultVideoModel),
  );
  const response = await fetchGemini(
    `${geminiApiBaseUrl}/${operationName}`,
    {
      headers: geminiHeaders(context.apiKey),
    },
    context,
    "get_videos_operation",
    geminiDefaultLongRunningRequestTimeoutMs,
  );

  await assertGeminiResponse(response, "execute", "get_videos_operation");
  return readGeminiJson(response, "get_videos_operation");
}

async function assertGeminiResponse(response: Response, mode: GeminiErrorMode, context: string): Promise<void> {
  if (response.ok) {
    return;
  }

  const error = await readGeminiError(response);

  if (response.status === 429) {
    throw new ProviderRequestError(429, error.message, error.details);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, error.message, error.details);
  }
  if (mode === "execute" && response.status === 401) {
    throw new ProviderRequestError(401, error.message, error.details);
  }
  if (mode === "execute" && response.status === 403) {
    throw new ProviderRequestError(502, error.message, { status: response.status, details: error.details });
  }
  if (response.status === 400 || response.status === 422) {
    throw new ProviderRequestError(400, error.message, error.details);
  }

  throw new ProviderRequestError(502, error.message || `gemini ${context} request failed`, {
    status: response.status,
    details: error.details,
  });
}

function buildGeminiPrompt(prompt: string): Array<Record<string, unknown>> {
  return [
    {
      role: "user",
      parts: [{ text: prompt }],
    },
  ];
}

function buildGeminiSystemInstruction(value: unknown): Record<string, unknown> | undefined {
  const text = optionalString(value);
  if (!text) {
    return undefined;
  }

  return {
    parts: [{ text }],
  };
}

function buildGeminiGenerationConfig(input: Record<string, unknown>): Record<string, unknown> {
  return jsonObject({
    topK: optionalInteger(input.top_k),
    topP: optionalNumber(input.top_p),
    temperature: optionalNumber(input.temperature),
    stopSequences: asStringArrayOrUndefined(input.stop_sequences),
    maxOutputTokens: optionalInteger(input.max_output_tokens),
  });
}

function resolveGeminiTimeoutMs(timeoutSeconds: unknown, fallbackMs: number): number {
  const timeout = optionalNumber(timeoutSeconds);
  if (!timeout || timeout <= 0) {
    return fallbackMs;
  }

  return timeout * 1000;
}

function asStringArrayOrUndefined(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is string => typeof item === "string");
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => item != null);
}

function extractTextFromResponse(payload: Record<string, unknown>): string | undefined {
  const texts = extractCandidateParts(payload)
    .map((part) => optionalString(part.text))
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  return texts.length > 0 ? texts.join("\n") : undefined;
}

function extractInlineDataPart(payload: Record<string, unknown>, mimePrefix?: string): GeminiInlineDataPart | null {
  for (const part of extractCandidateParts(payload)) {
    const inlineData = optionalRecord(part.inlineData) ?? optionalRecord(part.inline_data);
    const mimeType = optionalString(inlineData?.mimeType) ?? optionalString(inlineData?.mime_type);
    const data = optionalString(inlineData?.data);
    if (!mimeType || !data) {
      continue;
    }
    if (mimePrefix && !mimeType.startsWith(mimePrefix)) {
      continue;
    }
    return { mimeType, data };
  }

  return null;
}

function extractFileDataPart(payload: Record<string, unknown>, mimePrefix?: string): GeminiFileDataPart | null {
  for (const part of extractCandidateParts(payload)) {
    const fileData = optionalRecord(part.fileData) ?? optionalRecord(part.file_data);
    const fileUri = optionalString(fileData?.fileUri) ?? optionalString(fileData?.uri);
    const mimeType = optionalString(fileData?.mimeType) ?? optionalString(fileData?.mime_type);
    if (!fileUri) {
      continue;
    }
    if (mimePrefix && mimeType && !mimeType.startsWith(mimePrefix)) {
      continue;
    }
    return { fileUri, mimeType: mimeType ?? undefined };
  }

  return null;
}

function decodeBase64Bytes(data: string): Uint8Array {
  return new Uint8Array(Buffer.from(data, "base64"));
}

async function fetchGemini(
  url: string,
  init: RequestInit,
  context: Pick<GeminiRuntimeContext, "fetcher" | "signal">,
  requestName: string,
  timeoutMs = geminiDefaultRequestTimeoutMs,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signals = [timeoutSignal];
  if (context.signal) {
    signals.push(context.signal);
  }
  if (init.signal) {
    signals.push(init.signal);
  }
  const signal = signals.length > 1 ? AbortSignal.any(signals) : timeoutSignal;

  try {
    return await context.fetcher(url, {
      ...init,
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && !context.signal?.aborted && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        504,
        `gemini ${requestName} request timed out after ${Math.max(1, Math.ceil(timeoutMs / 1000))} seconds`,
        error,
      );
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `gemini ${requestName} request failed: ${error.message}`
        : `gemini ${requestName} request failed`,
      error,
    );
  }
}

async function downloadMediaBytes(
  url: string,
  context: Pick<GeminiRuntimeContext, "apiKey" | "fetcher" | "signal" | "transitFiles">,
): Promise<GeminiDownloadedMedia> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(502, "gemini media actions require server-side file transit");
  }

  const headers: Record<string, string> = {
    "user-agent": providerUserAgent,
  };
  if (shouldSendGeminiApiKey(url)) {
    headers["x-goog-api-key"] = context.apiKey;
  }

  const response = await fetchGemini(
    url,
    {
      headers,
    },
    context,
    "media download",
    geminiDefaultLongRunningRequestTimeoutMs,
  );

  if (!response.ok) {
    const message = (await response.text().catch(() => "")) || `gemini media download failed with ${response.status}`;
    throw new ProviderRequestError(502, message, { status: response.status });
  }

  return {
    bytes: await readBoundedResponseBytes(response, {
      maxBytes: context.transitFiles.maxBytes,
      fieldName: "Gemini media download",
      createError: (message) => new ProviderRequestError(413, message),
    }),
    mimeType: response.headers.get("content-type") ?? undefined,
  };
}

function shouldSendGeminiApiKey(url: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  if (parsedUrl.protocol !== "https:") {
    return false;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  return hostname === "generativelanguage.googleapis.com" || isGoogleHost(hostname);
}

function isGoogleHost(hostname: string): boolean {
  return hostname === "googleapis.com" || hostname.endsWith(".googleapis.com");
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

async function createTransitDownloadableFile(
  context: Pick<GeminiRuntimeContext, "transitFiles">,
  prefix: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<{ name: string; mimetype: string; downloadUrl: string }> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(502, "gemini media actions require server-side file transit");
  }

  const name = buildTransitFileName(prefix, mimeType);
  const upload = await context.transitFiles.create(new File([Buffer.from(bytes)], name, { type: mimeType }));
  return {
    name,
    mimetype: mimeType,
    downloadUrl: upload.downloadUrl,
  };
}

function resolveMimeTypeExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "audio/wav":
      return "wav";
    case "audio/pcm":
      return "pcm";
    default:
      if (mimeType.startsWith("image/")) {
        return mimeType.slice("image/".length).replace(/[^A-Za-z0-9]+/g, "") || "png";
      }
      if (mimeType.startsWith("video/")) {
        return mimeType.slice("video/".length).replace(/[^A-Za-z0-9]+/g, "") || "mp4";
      }
      if (mimeType.startsWith("audio/")) {
        return mimeType.slice("audio/".length).replace(/[^A-Za-z0-9]+/g, "") || "bin";
      }
      return "bin";
  }
}

function buildTransitFileName(prefix: string, mimeType: string): string {
  return `${prefix}.${resolveMimeTypeExtension(mimeType)}`;
}

function normalizeOperationError(payload: Record<string, unknown>): { code: number; message: string } | undefined {
  const error = optionalRecord(payload.error);
  const code = error?.code;
  const message = error?.message;
  if (!Number.isInteger(code) || typeof message !== "string") {
    return undefined;
  }

  return {
    code: Number(code),
    message,
  };
}

function extractVideoUrls(payload: Record<string, unknown>): string[] {
  const response = optionalRecord(payload.response);
  if (!response) {
    return [];
  }

  const candidateArrays = [
    response.generatedVideos,
    response.generated_videos,
    optionalRecord(response.generateVideoResponse)?.generatedSamples,
    optionalRecord(response.generate_video_response)?.generated_samples,
  ];

  const urls = new Set<string>();
  for (const candidateArray of candidateArrays) {
    const samples = asRecordArray(candidateArray);
    if (!samples) {
      continue;
    }

    for (const sample of samples) {
      const video = optionalRecord(sample.video);
      const uri = optionalString(video?.uri) ?? optionalString(video?.fileUri) ?? optionalString(video?.downloadUri);
      if (uri) {
        urls.add(uri);
      }
    }
  }

  return [...urls];
}

function extractRaiFiltering(payload: Record<string, unknown>): GeminiRaiFiltering | null {
  const metadata = optionalRecord(payload.metadata);
  const response = optionalRecord(payload.response);
  const responseDetails =
    optionalRecord(response?.generateVideoResponse) ?? optionalRecord(response?.generate_video_response);

  const filterReasons =
    asStringArrayOrUndefined(metadata?.raiMediaFilteredReasons) ??
    asStringArrayOrUndefined(metadata?.rai_media_filtered_reasons) ??
    asStringArrayOrUndefined(responseDetails?.raiMediaFilteredReasons) ??
    asStringArrayOrUndefined(responseDetails?.rai_media_filtered_reasons) ??
    [];

  const filteredCount =
    optionalInteger(metadata?.filteredCount) ??
    optionalInteger(metadata?.filtered_count) ??
    optionalInteger(metadata?.raiMediaFilteredCount) ??
    optionalInteger(metadata?.rai_media_filtered_count) ??
    filterReasons.length;

  if (filterReasons.length === 0 && filteredCount === undefined) {
    return null;
  }

  return {
    filterReasons,
    filteredCount: filteredCount ?? filterReasons.length,
  };
}

async function readGeminiJson(response: Response, context: string): Promise<Record<string, unknown>> {
  const payload = (await response.json().catch(() => null)) as unknown;
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `gemini ${context} response is not a JSON object`, payload);
  }
  return record;
}

async function readGeminiError(response: Response): Promise<{ message: string; details?: unknown }> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return {
      message: `gemini request failed with ${response.status}`,
    };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const record = optionalRecord(parsed);
    const nestedError = optionalRecord(record?.error);
    const message =
      optionalString(nestedError?.message) ??
      optionalString(record?.message) ??
      optionalString(record?.error_description) ??
      text;
    return { message, details: parsed };
  } catch {
    return { message: text, details: text };
  }
}

function extractCandidateParts(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = asRecordArray(payload.candidates) ?? [];
  const parts: Array<Record<string, unknown>> = [];

  for (const candidate of candidates) {
    const content = optionalRecord(candidate.content);
    const contentParts = asRecordArray(content?.parts) ?? [];
    parts.push(...contentParts);
  }

  return parts;
}

function normalizeModelSummary(value: Record<string, unknown>): GeminiModelSummary | null {
  const name = optionalString(value.name);
  const version = optionalString(value.version);
  if (!name || !version) {
    return null;
  }

  const output: GeminiModelSummary = { name, version };
  setDefined(output, "topK", optionalInteger(value.topK));
  setDefined(output, "topP", optionalNumber(value.topP));
  setDefined(
    output,
    "thinking",
    typeof value.thinking === "boolean"
      ? value.thinking
      : typeof value.supportsThinking === "boolean"
        ? value.supportsThinking
        : undefined,
  );
  setDefined(output, "baseModelId", optionalString(value.baseModelId));
  setDefined(output, "description", optionalString(value.description));
  setDefined(output, "displayName", optionalString(value.displayName));
  setDefined(output, "temperature", optionalNumber(value.temperature));
  setDefined(output, "maxTemperature", optionalNumber(value.maxTemperature));
  setDefined(output, "inputTokenLimit", optionalInteger(value.inputTokenLimit));
  setDefined(output, "outputTokenLimit", optionalInteger(value.outputTokenLimit));
  setDefined(
    output,
    "supportedGenerationMethods",
    asStringArrayOrUndefined(value.supportedGenerationMethods) ??
      asStringArrayOrUndefined(value.supported_generation_methods),
  );
  return output;
}

function setDefined<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function asSafetySettings(value: unknown): Array<Record<string, unknown>> | undefined {
  return asRecordArray(value)?.map((setting) =>
    jsonObject({
      category: optionalString(setting.category),
      threshold: optionalString(setting.threshold),
    }),
  );
}

function readNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "number")) {
    return undefined;
  }
  return value;
}
