import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { GladiaActionName } from "./actions.ts";

import { basename, extname } from "node:path";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, readTransitFileInput } from "../provider-runtime.ts";

export const gladiaApiBaseUrl = "https://api.gladia.io";
const gladiaPreRecordedPath = "/v2/pre-recorded";
const gladiaUploadPath = "/v2/upload";
const maxGladiaUploadSourceBytes = 100 * 1024 * 1024;
const defaultUploadMimeType = "application/octet-stream";

type GladiaRequestPhase = "validate" | "execute";
type GladiaActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const gladiaActionHandlers: Record<GladiaActionName, GladiaActionHandler> = {
  upload_file(input, context) {
    return uploadFile(input, context);
  },
  start_transcription(input, context) {
    return startTranscription(input, context);
  },
  get_transcription(input, context) {
    return getTranscription(input, context);
  },
  list_transcriptions(input, context) {
    return listTranscriptions(input, context);
  },
  download_transcription_audio(input, context) {
    return downloadTranscriptionAudio(input, context);
  },
  delete_transcription(input, context) {
    return deleteTranscription(input, context);
  },
};

export async function validateGladiaCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestGladiaJson({
    path: gladiaPreRecordedPath,
    query: {
      limit: "1",
      offset: "0",
    },
    apiKey: input.apiKey,
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "gladia",
      displayName: "Gladia API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: gladiaApiBaseUrl,
      validationEndpoint: gladiaPreRecordedPath,
    },
  };
}

async function uploadFile(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const source = await resolveUploadSource(input, context);
  const formData = new FormData();
  formData.append("audio", source.file);

  const payload = await requestGladiaJson({
    path: gladiaUploadPath,
    method: "POST",
    body: formData,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const payloadObject = requireObject(payload, "gladia upload_file response");

  return {
    audioUrl: requireProviderString(payloadObject.audio_url, "gladia upload_file.audio_url"),
    metadata: optionalRecord(payloadObject.audio_metadata) ?? {},
  };
}

async function startTranscription(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestGladiaJson({
    path: gladiaPreRecordedPath,
    method: "POST",
    body: buildStartTranscriptionBody(input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const payloadObject = requireObject(payload, "gladia start_transcription response");

  return {
    id: requireProviderString(payloadObject.id, "gladia start_transcription.id"),
    resultUrl: requireProviderString(payloadObject.result_url, "gladia start_transcription.result_url"),
  };
}

async function getTranscription(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestGladiaJson({
    path: `${gladiaPreRecordedPath}/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    job: normalizeTranscriptionJob(requireObject(payload, "gladia get_transcription response")),
  };
}

async function listTranscriptions(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestGladiaJson({
    path: gladiaPreRecordedPath,
    query: buildListTranscriptionsQuery(input),
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const payloadObject = requireObject(payload, "gladia list_transcriptions response");
  const items = Array.isArray(payloadObject.items) ? payloadObject.items : [];

  return compactObject({
    first: optionalString(payloadObject.first),
    current: optionalString(payloadObject.current),
    next: payloadObject.next === null ? null : optionalString(payloadObject.next),
    items: items.map((item) => normalizeTranscriptionJob(requireObject(item, "gladia list_transcriptions item"))),
  });
}

async function downloadTranscriptionAudio(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "Transit file storage is not enabled.");
  }

  const id = requiredInputString(input.id, "id");
  const response = await requestGladiaResponse({
    path: `${gladiaPreRecordedPath}/${encodeURIComponent(id)}/file`,
    accept: "*/*",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  if (!response.ok) {
    throw createGladiaError(response, await readMaybeJsonPayload(response), "execute");
  }

  const mimeType =
    optionalString(input.mimeType) ??
    response.headers.get("content-type")?.split(";")[0]?.trim() ??
    defaultUploadMimeType;
  const name =
    optionalString(input.fileName) ??
    readContentDispositionFileName(response.headers.get("content-disposition")) ??
    `gladia-${id}${extensionFromMimeType(mimeType)}`;
  const body = await response.arrayBuffer();
  const upload = await context.transitFiles.create(new File([body], name, { type: mimeType }));

  return {
    id,
    name,
    mimeType,
    sizeBytes: parseContentLength(response.headers.get("content-length")),
    fileId: upload.fileId,
    downloadUrl: upload.downloadUrl,
  };
}

async function deleteTranscription(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const response = await requestGladiaResponse({
    path: `${gladiaPreRecordedPath}/${encodeURIComponent(requiredInputString(input.id, "id"))}`,
    method: "DELETE",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const text = await response.text().catch(() => "");
  const payload = text.trim() ? parseGladiaJson(text) : null;
  if (!response.ok) {
    throw createGladiaError(response, payload, "execute");
  }
  const payloadObject = optionalRecord(payload);

  return compactObject({
    statusCode: response.status,
    message: optionalString(payloadObject?.message),
  });
}

function buildStartTranscriptionBody(input: Record<string, unknown>): Record<string, unknown> {
  const callbackConfig = buildCallbackConfig(optionalRecord(input.callbackConfig));
  const customVocabulary = buildFeatureConfig(input.customVocabulary, "vocabulary");
  const customSpelling = buildFeatureConfig(input.customSpelling, "spelling_dictionary");
  const moderation = buildFeatureConfig(input.moderation);
  const structuredDataExtraction = buildFeatureConfig(input.structuredDataExtraction);
  const audioToLlm = buildFeatureConfig(input.audioToLlm);
  const piiRedaction = buildFeatureConfig(input.piiRedaction);

  return compactObject({
    audio_url: requiredInputString(input.audioUrl, "audioUrl"),
    model: optionalString(input.model),
    sentences: optionalBoolean(input.sentences),
    subtitles: optionalBoolean(input.subtitles),
    diarization: optionalBoolean(input.diarization),
    translation: optionalBoolean(input.translation),
    summarization: optionalBoolean(input.summarization),
    punctuation_enhanced: optionalBoolean(input.punctuationEnhanced),
    callback: optionalBoolean(input.callback) ?? (callbackConfig ? true : undefined),
    callback_config: callbackConfig,
    custom_vocabulary: customVocabulary.enabled,
    custom_vocabulary_config: customVocabulary.config,
    custom_spelling: customSpelling.enabled,
    custom_spelling_config: customSpelling.config,
    moderation: moderation.enabled,
    moderation_config: moderation.config,
    named_entity_recognition: optionalBoolean(input.namedEntityRecognition),
    chapterization: optionalBoolean(input.chapterization),
    name_consistency: optionalBoolean(input.nameConsistency),
    structured_data_extraction: structuredDataExtraction.enabled,
    structured_data_extraction_config: structuredDataExtraction.config,
    sentiment_analysis: optionalBoolean(input.sentimentAnalysis),
    audio_to_llm: audioToLlm.enabled,
    audio_to_llm_config: audioToLlm.config,
    display_mode: optionalString(input.displayMode),
    pii_redaction: piiRedaction.enabled,
    pii_redaction_config: piiRedaction.config,
    custom_metadata: optionalRecord(input.customMetadata),
    language_config: buildLanguageConfig(optionalRecord(input.languageConfig)),
    subtitles_config: buildSubtitlesConfig(optionalRecord(input.subtitlesConfig)),
    diarization_config: buildDiarizationConfig(optionalRecord(input.diarizationConfig)),
    translation_config: buildTranslationConfig(optionalRecord(input.translationConfig)),
    summarization_config: buildSummarizationConfig(optionalRecord(input.summarizationConfig)),
  });
}

function buildFeatureConfig(
  value: unknown,
  arrayKey?: string,
): { enabled?: boolean; config?: Record<string, unknown> } {
  if (value === undefined) {
    return {};
  }
  if (typeof value === "boolean") {
    return {
      enabled: value,
    };
  }
  if (Array.isArray(value)) {
    return {
      enabled: true,
      config: arrayKey ? { [arrayKey]: value } : { values: value },
    };
  }
  return {
    enabled: true,
    config: optionalRecord(value),
  };
}

interface UploadSource {
  file: File;
}

async function resolveUploadSource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<UploadSource> {
  const sourceCount =
    Number(input.file != null) + Number(input.contentBase64 != null) + Number(input.sourceUrl != null);
  if (sourceCount !== 1) {
    throw new ProviderRequestError(400, "exactly one of file, contentBase64, or sourceUrl is required");
  }

  const mimeTypeOverride = optionalString(input.mimeType);
  const fileNameOverride = optionalString(input.fileName);

  if (input.file != null) {
    const transitFile = await readTransitFileInput(input.file, context);
    const name = fileNameOverride ?? transitFile.name;
    const mimeType = mimeTypeOverride ?? transitFile.mimeType ?? mimeTypeFromFileName(name) ?? defaultUploadMimeType;
    const file =
      name === transitFile.file.name && mimeType === transitFile.file.type
        ? transitFile.file
        : new File([await transitFile.file.arrayBuffer()], name, { type: mimeType });
    assertUploadSourceSize(transitFile.sizeBytes);
    return { file };
  }

  const contentBase64 = optionalString(input.contentBase64);
  if (contentBase64) {
    const name = fileNameOverride ?? "gladia-upload.bin";
    const mimeType = mimeTypeOverride ?? mimeTypeFromFileName(name) ?? defaultUploadMimeType;
    const bytes = decodeBase64Content(contentBase64, "contentBase64");
    assertUploadSourceSize(bytes.byteLength);
    return {
      file: new File([Buffer.from(bytes)], name, { type: mimeType }),
    };
  }

  const sourceUrl = optionalString(input.sourceUrl);
  if (sourceUrl) {
    const downloaded = await downloadSourceBytes(sourceUrl, context.fetcher, context.signal, "sourceUrl");
    const sourcePathName = basename(new URL(sourceUrl).pathname);
    const name = (fileNameOverride ?? downloaded.name ?? sourcePathName) || "gladia-upload.bin";
    const mimeType = mimeTypeOverride ?? downloaded.mimeType ?? mimeTypeFromFileName(name) ?? defaultUploadMimeType;
    return {
      file: new File([Buffer.from(downloaded.bytes)], name, { type: mimeType }),
    };
  }

  throw new ProviderRequestError(400, "exactly one of file, contentBase64, or sourceUrl is required");
}

async function downloadSourceBytes(
  sourceUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  fieldName: string,
): Promise<{ bytes: Uint8Array; mimeType?: string; name?: string }> {
  const url = assertPublicHttpUrl(sourceUrl, {
    fieldName,
    createError: (message) => new ProviderRequestError(400, message),
  });
  const response = await fetcher(url, {
    method: "GET",
    // Workers has no "error" redirect mode; "manual" never follows either, and
    // the !response.ok check below rejects any 3xx.
    redirect: "manual",
    signal,
  });
  if (!response.ok) {
    throw new ProviderRequestError(
      response.status >= 500 ? 502 : 400,
      `failed to download ${fieldName}: ${response.status} ${response.statusText}`.trim(),
    );
  }
  const contentLength = parseContentLength(response.headers.get("content-length"));
  if (contentLength != null) {
    assertUploadSourceSize(contentLength);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertUploadSourceSize(bytes.byteLength);

  return {
    bytes,
    mimeType: response.headers.get("content-type")?.split(";")[0]?.trim() || undefined,
    name: readContentDispositionFileName(response.headers.get("content-disposition")),
  };
}

function assertUploadSourceSize(byteLength: number): void {
  if (byteLength > maxGladiaUploadSourceBytes) {
    throw new ProviderRequestError(400, `gladia upload source exceeds ${maxGladiaUploadSourceBytes} bytes`);
  }
}

function buildCallbackConfig(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  return compactObject({
    url: requiredInputString(input.url, "callbackConfig.url"),
    method: optionalString(input.method),
  });
}

function buildLanguageConfig(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  return {
    languages: input.languages,
    code_switching: input.codeSwitching,
  };
}

function buildSubtitlesConfig(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  return compactObject({
    style: optionalString(input.style),
    formats: input.formats,
    maximum_duration: optionalNumber(input.maximumDuration),
    minimum_duration: optionalNumber(input.minimumDuration),
    maximum_rows_per_caption: optionalInteger(input.maximumRowsPerCaption),
    maximum_characters_per_row: optionalInteger(input.maximumCharactersPerRow),
  });
}

function buildDiarizationConfig(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  return compactObject({
    enhanced: optionalBoolean(input.enhanced),
    min_speakers: optionalInteger(input.minSpeakers),
    max_speakers: optionalInteger(input.maxSpeakers),
    number_of_speakers: optionalInteger(input.numberOfSpeakers),
  });
}

function buildTranslationConfig(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  return compactObject({
    model: optionalString(input.model),
    context: optionalString(input.context),
    target_languages: input.targetLanguages,
    context_adaptation: optionalBoolean(input.contextAdaptation),
    match_original_utterances: optionalBoolean(input.matchOriginalUtterances),
    informal: optionalBoolean(input.informal),
    lipsync: optionalBoolean(input.lipsync),
  });
}

function buildSummarizationConfig(input: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!input) {
    return undefined;
  }
  return compactObject({
    type: optionalString(input.type),
  });
}

function buildListTranscriptionsQuery(input: Record<string, unknown>): Record<string, string | string[] | undefined> {
  const query: Record<string, string | string[] | undefined> = {
    limit: stringFromNumber(input.limit),
    offset: stringFromNumber(input.offset),
    date: optionalString(input.date),
    after_date: optionalString(input.afterDate),
    before_date: optionalString(input.beforeDate),
    status: Array.isArray(input.status) ? input.status.map((status) => String(status)) : undefined,
  };
  const customMetadata = optionalRecord(input.customMetadata);
  if (customMetadata) {
    query.custom_metadata = JSON.stringify(customMetadata);
  }
  return query;
}

interface GladiaRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: GladiaRequestPhase;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown> | FormData;
  accept?: string;
}

async function requestGladiaJson(input: GladiaRequestInput): Promise<unknown> {
  const response = await requestGladiaResponse(input);
  const text = await response.text().catch(() => "");
  const payload = text.trim() ? parseGladiaJson(text) : null;
  if (!response.ok) {
    throw createGladiaError(response, payload, input.phase);
  }
  return payload;
}

async function requestGladiaResponse(input: GladiaRequestInput): Promise<Response> {
  try {
    const headers: Record<string, string> = {
      accept: input.accept ?? "application/json",
      "user-agent": providerUserAgent,
      "x-gladia-key": input.apiKey,
    };
    if (input.body && !(input.body instanceof FormData)) {
      headers["content-type"] = "application/json";
    }

    return await input.fetcher(buildGladiaUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers,
      body: input.body ? (input.body instanceof FormData ? input.body : JSON.stringify(input.body)) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Gladia request failed: ${error.message}` : "Gladia request failed",
    );
  }
}

function buildGladiaUrl(path: string, query?: Record<string, string | string[] | undefined>): URL {
  const url = new URL(path, gladiaApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        url.searchParams.append(key, child);
      }
      continue;
    }
    url.searchParams.set(key, value);
  }
  return url;
}

function normalizeTranscriptionJob(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    id: requireProviderString(payload.id, "gladia job.id"),
    requestId: optionalString(payload.request_id),
    version: optionalInteger(payload.version),
    status: requireProviderString(payload.status, "gladia job.status"),
    createdAt: optionalString(payload.created_at),
    completedAt: optionalString(payload.completed_at),
    kind: optionalString(payload.kind),
    errorCode: optionalInteger(payload.error_code),
    file: normalizeFileInfo(optionalRecord(payload.file)),
    result: optionalRecord(payload.result),
    requestParams: optionalRecord(payload.request_params),
    customMetadata: optionalRecord(payload.custom_metadata),
    postSessionMetadata: optionalRecord(payload.post_session_metadata),
  });
}

function normalizeFileInfo(payload: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!payload) {
    return undefined;
  }
  return compactObject({
    id: optionalString(payload.id),
    source: optionalString(payload.source),
    filename: optionalString(payload.filename),
    audioDuration: optionalNumber(payload.audio_duration),
    numberOfChannels: optionalInteger(payload.number_of_channels),
  });
}

function parseGladiaJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Gladia returned invalid JSON");
  }
}

async function readMaybeJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function createGladiaError(response: Response, payload: unknown, phase: GladiaRequestPhase): ProviderRequestError {
  const message = extractGladiaErrorMessage(payload) ?? `Gladia request failed with ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractGladiaErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  return optionalString(object.message) ?? optionalString(object.error) ?? optionalString(object.detail);
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return object;
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireProviderString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `${fieldName} is required`);
  }
  return value;
}

function decodeBase64Content(value: string, fieldName: string): Uint8Array {
  const normalized = value.trim();
  try {
    const bytes = Buffer.from(normalized, "base64");
    if (stripBase64Padding(bytes.toString("base64")) !== stripBase64Padding(normalized)) {
      throw new Error("invalid base64");
    }
    return Uint8Array.from(bytes);
  } catch {
    throw new ProviderRequestError(400, `${fieldName} must be valid base64`);
  }
}

function stripBase64Padding(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "=") {
    end -= 1;
  }
  return value.slice(0, end);
}

function readContentDispositionFileName(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value.split(";");
  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    const key = part.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (key === "filename*") {
      const encodedIndex = rawValue.indexOf("''");
      const encodedValue = encodedIndex >= 0 ? rawValue.slice(encodedIndex + 2) : rawValue;
      try {
        return decodeURIComponent(stripWrappingQuotes(encodedValue));
      } catch {
        return stripWrappingQuotes(encodedValue);
      }
    }
    if (key === "filename") {
      return stripWrappingQuotes(rawValue);
    }
  }
  return undefined;
}

function stripWrappingQuotes(value: string): string {
  if (value.length >= 2 && value[0] === '"' && value[value.length - 1] === '"') {
    return value.slice(1, -1);
  }
  return value;
}

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function mimeTypeFromFileName(value: string): string | undefined {
  switch (extname(value).toLowerCase()) {
    case ".aac":
      return "audio/aac";
    case ".flac":
      return "audio/flac";
    case ".m4a":
      return "audio/mp4";
    case ".mov":
      return "video/quicktime";
    case ".mp3":
      return "audio/mpeg";
    case ".mp4":
      return "video/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".wav":
      return "audio/wav";
    case ".webm":
      return "video/webm";
    default:
      return undefined;
  }
}

function extensionFromMimeType(value: string): string {
  switch (value) {
    case "audio/aac":
      return ".aac";
    case "audio/flac":
      return ".flac";
    case "audio/mp4":
      return ".m4a";
    case "audio/mpeg":
      return ".mp3";
    case "audio/ogg":
      return ".ogg";
    case "audio/wav":
      return ".wav";
    case "video/mp4":
      return ".mp4";
    case "video/quicktime":
      return ".mov";
    case "video/webm":
      return ".webm";
    default:
      return ".bin";
  }
}

function stringFromNumber(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  return String(value);
}
