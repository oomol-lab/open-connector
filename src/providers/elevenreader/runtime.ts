import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  booleanString,
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  stringRecord,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { providerInputError, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const elevenreaderApiBaseUrl = "https://api.elevenlabs.io/v1";

type ElevenreaderRequestPhase = "validate" | "execute";
type ElevenreaderActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface NormalizedElevenreaderSubscription extends Record<string, unknown> {
  tier: string;
  status: string;
}

interface NormalizedElevenreaderUser extends Record<string, unknown> {
  userId: string;
  firstName?: string;
  subscription: NormalizedElevenreaderSubscription;
}

export const elevenreaderActionHandlers: ProviderActionHandlers<"elevenreader", ElevenreaderActionHandler> = {
  get_user_info(_input, context) {
    return getElevenreaderUserInfo(context);
  },
  get_models(_input, context) {
    return getElevenreaderModels(context);
  },
  search_voices(input, context) {
    return searchElevenreaderVoices(input, context);
  },
  get_voice(input, context) {
    return getElevenreaderVoice(input, context);
  },
  read_text(input, context) {
    return readElevenreaderText(input, context);
  },
};

export async function validateElevenreaderCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = await requestElevenreaderJson<Record<string, unknown>>({
    path: "/user",
    phase: "validate",
    apiKey,
    fetcher,
    signal,
  });

  const normalizedUser = normalizeUserInfo(user);
  return {
    profile: {
      accountId: normalizedUser.userId,
      displayName: normalizedUser.firstName ? normalizedUser.firstName : `ElevenReader ${normalizedUser.userId}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/user",
      userId: normalizedUser.userId,
      tier: normalizedUser.subscription.tier,
      status: normalizedUser.subscription.status,
    }),
  };
}

async function getElevenreaderUserInfo(context: ApiKeyProviderContext): Promise<{ user: Record<string, unknown> }> {
  const payload = await requestElevenreaderJson<Record<string, unknown>>({
    path: "/user",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    user: normalizeUserInfo(payload),
  };
}

async function getElevenreaderModels(context: ApiKeyProviderContext): Promise<{ models: Record<string, unknown>[] }> {
  const payload = await requestElevenreaderJson<unknown>({
    path: "/models",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  const payloadObject = Array.isArray(payload) ? undefined : optionalRecord(payload);
  const models = Array.isArray(payload)
    ? payload
    : Array.isArray(payloadObject?.models)
      ? (payloadObject.models as unknown[])
      : [];

  return {
    models: models.map((item) => normalizeModel(requireObject(item, "elevenreader model"))),
  };
}

async function searchElevenreaderVoices(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestElevenreaderJson<Record<string, unknown>>({
    path: "/voices/search",
    query: compactObject({
      search: optionalString(input.search),
      category: optionalString(input.category),
      voice_type: optionalString(input.voiceType),
      sort: optionalString(input.sort),
      sort_direction: optionalString(input.sortDirection),
      page_size: integerQueryValue(input.pageSize),
      next_page_token: optionalString(input.nextPageToken),
      include_total_count: booleanString(input.includeTotalCount),
    }) as Record<string, string | undefined>,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  const voices = Array.isArray(payload.voices) ? payload.voices : [];
  return compactObject({
    voices: voices.map((item) => normalizeVoice(requireObject(item, "elevenreader voice"))),
    hasMore: Boolean(payload.has_more),
    nextPageToken: optionalString(payload.next_page_token),
    totalCount: optionalInteger(payload.total_count),
  });
}

async function getElevenreaderVoice(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<{ voice: Record<string, unknown> }> {
  const voiceId = requiredString(input.voiceId, "voiceId", providerInputError);
  const payload = await requestElevenreaderJson<Record<string, unknown>>({
    path: `/voices/${encodeURIComponent(voiceId)}`,
    query: compactObject({
      with_settings: booleanString(input.withSettings),
    }) as Record<string, string | undefined>,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    voice: normalizeVoice(payload),
  };
}

async function readElevenreaderText(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  if (!context.transitFiles) {
    throw new ProviderRequestError(400, "ElevenReader read_text requires local transit file storage.");
  }

  const voiceId = requiredString(input.voiceId, "voiceId", providerInputError);
  const text = requiredString(input.text, "text", providerInputError);
  const outputFormat = optionalString(input.outputFormat) ?? "mp3_44100_128";
  const modelId = optionalString(input.modelId);
  const response = await context.fetcher(
    buildElevenreaderUrl(
      `/text-to-speech/${encodeURIComponent(voiceId)}`,
      compactObject({
        output_format: outputFormat,
        optimize_streaming_latency: integerQueryValue(input.optimizeStreamingLatency),
      }) as Record<string, string | undefined>,
    ),
    {
      method: "POST",
      headers: elevenreaderBinaryJsonHeaders(context.apiKey),
      body: JSON.stringify(
        compactObject({
          text,
          model_id: modelId,
          voice_settings: optionalRecord(input.voiceSettings),
        }),
      ),
      signal: context.signal,
    },
  );

  if (!response.ok) {
    throw await createElevenreaderError(response, "execute");
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: context.transitFiles.maxBytes,
    fieldName: "ElevenReader audio",
    createError: (message) => new ProviderRequestError(413, message),
  });
  const extension = inferElevenreaderAudioExtension(contentType, outputFormat);
  const name = `elevenreader-${voiceId}.${extension}`;
  const upload = await context.transitFiles.create(new File([Uint8Array.from(bytes)], name, { type: contentType }));

  return compactObject({
    file: {
      fileId: upload.fileId,
      downloadUrl: upload.downloadUrl,
      sizeBytes: upload.sizeBytes,
      name: upload.name,
      mimeType: upload.mimeType,
    },
    voiceId,
    modelId,
    outputFormat,
    contentType,
  });
}

async function requestElevenreaderJson<T>(input: {
  path: string;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  phase: ElevenreaderRequestPhase;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<T> {
  const hasBody = input.body !== undefined;
  const response = await input.fetcher(buildElevenreaderUrl(input.path, input.query), {
    method: hasBody ? "POST" : "GET",
    headers: hasBody ? elevenreaderJsonHeaders(input.apiKey) : elevenreaderHeaders(input.apiKey),
    body: hasBody ? JSON.stringify(input.body) : undefined,
    signal: input.signal,
  });

  if (!response.ok) {
    throw await createElevenreaderError(response, input.phase);
  }

  return readElevenreaderJson<T>(response);
}

function buildElevenreaderUrl(path: string, query?: Record<string, string | undefined>): URL {
  const url = new URL(`${elevenreaderApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function elevenreaderHeaders(apiKey: string): Record<string, string> {
  return {
    "xi-api-key": apiKey,
    "user-agent": providerUserAgent,
  };
}

function elevenreaderBinaryHeaders(apiKey: string): Record<string, string> {
  return {
    "xi-api-key": apiKey,
    accept: "audio/mpeg",
    "user-agent": providerUserAgent,
  };
}

function elevenreaderJsonHeaders(apiKey: string): Record<string, string> {
  return {
    ...elevenreaderHeaders(apiKey),
    accept: "application/json",
    "content-type": "application/json",
  };
}

function elevenreaderBinaryJsonHeaders(apiKey: string): Record<string, string> {
  return {
    ...elevenreaderBinaryHeaders(apiKey),
    "content-type": "application/json",
  };
}

async function readElevenreaderJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "ElevenReader returned invalid JSON");
  }
}

async function createElevenreaderError(
  response: Response,
  phase: ElevenreaderRequestPhase,
): Promise<ProviderRequestError> {
  const message = await readElevenreaderErrorMessage(response);
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(response.status >= 400 && response.status < 600 ? response.status : 502, message);
}

async function readElevenreaderErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return `ElevenReader request failed with ${response.status}`;
  }

  try {
    const payload = JSON.parse(text) as unknown;
    const detail = optionalRecord(payload)?.detail;
    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }
    const detailObject = optionalRecord(detail);
    const message = optionalString(detailObject?.message);
    if (message) {
      return message;
    }
    const error = optionalString(optionalRecord(payload)?.error);
    if (error) {
      return error;
    }
  } catch {
    return text;
  }

  return text;
}

function normalizeUserInfo(payload: Record<string, unknown>): NormalizedElevenreaderUser {
  const subscription = requireObject(payload.subscription, "elevenreader user.subscription");
  return compactObject({
    userId: requireResponseString(payload.user_id, "elevenreader user.user_id"),
    createdAt: requireResponseInteger(payload.created_at, "elevenreader user.created_at"),
    firstName: optionalString(payload.first_name),
    isNewUser: requireResponseBoolean(payload.is_new_user, "elevenreader user.is_new_user"),
    isOnboardingCompleted: requireResponseBoolean(
      payload.is_onboarding_completed,
      "elevenreader user.is_onboarding_completed",
    ),
    subscription: normalizeUserSubscription(subscription),
  }) as NormalizedElevenreaderUser;
}

function normalizeUserSubscription(payload: Record<string, unknown>): NormalizedElevenreaderSubscription {
  return compactObject({
    tier: requireResponseString(payload.tier, "elevenreader subscription.tier"),
    status: requireResponseString(payload.status, "elevenreader subscription.status"),
    characterCount: requireResponseInteger(payload.character_count, "elevenreader subscription.character_count"),
    characterLimit: requireResponseInteger(payload.character_limit, "elevenreader subscription.character_limit"),
    canExtendCharacterLimit: requireResponseBoolean(
      payload.can_extend_character_limit,
      "elevenreader subscription.can_extend_character_limit",
    ),
    allowedToExtendCharacterLimit: requireResponseBoolean(
      payload.allowed_to_extend_character_limit,
      "elevenreader subscription.allowed_to_extend_character_limit",
    ),
    nextCharacterCountResetUnix: optionalInteger(payload.next_character_count_reset_unix),
    voiceLimit: optionalInteger(payload.voice_limit),
    canUseInstantVoiceCloning: optionalBoolean(payload.can_use_instant_voice_cloning),
    canUseProfessionalVoiceCloning: optionalBoolean(payload.can_use_professional_voice_cloning),
  }) as NormalizedElevenreaderSubscription;
}

function normalizeModel(payload: Record<string, unknown>): Record<string, unknown> {
  const languages = Array.isArray(payload.languages)
    ? payload.languages.map((language) =>
        normalizeModelLanguage(requireObject(language, "elevenreader model language")),
      )
    : undefined;

  return compactObject({
    modelId: requireResponseString(payload.model_id, "elevenreader model.model_id"),
    name: optionalString(payload.name),
    description: optionalString(payload.description),
    languages,
    canDoTextToSpeech: optionalBoolean(payload.can_do_text_to_speech),
    canUseStyle: optionalBoolean(payload.can_use_style),
    canUseSpeakerBoost: optionalBoolean(payload.can_use_speaker_boost),
    maximumTextLengthPerRequest: optionalInteger(payload.maximum_text_length_per_request),
    modelRates: optionalRecord(payload.model_rates),
  });
}

function normalizeModelLanguage(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    languageId: requireResponseString(payload.language_id, "elevenreader model language.language_id"),
    name: requireResponseString(payload.name, "elevenreader model language.name"),
  };
}

function normalizeVoice(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    voiceId: requireResponseString(payload.voice_id, "elevenreader voice.voice_id"),
    name: requireResponseString(payload.name, "elevenreader voice.name"),
    category: requireResponseString(payload.category, "elevenreader voice.category"),
    description: optionalString(payload.description),
    previewUrl: optionalString(payload.preview_url),
    labels: normalizeStringRecord(payload.labels),
    settings: optionalRecord(payload.settings),
    availableForTiers: normalizeStringArray(payload.available_for_tiers),
    highQualityBaseModelIds: normalizeStringArray(payload.high_quality_base_model_ids),
    verifiedLanguages: normalizeObjectArray(payload.verified_languages),
    sharing: optionalRecord(payload.sharing),
    fineTuning: optionalRecord(payload.fine_tuning),
    permissionOnResource: optionalString(payload.permission_on_resource),
    isOwner: optionalBoolean(payload.is_owner),
    isLegacy: optionalBoolean(payload.is_legacy),
  });
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  const record = optionalRecord(value);
  return record ? stringRecord(record) : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((child): child is string => typeof child === "string") : undefined;
}

function normalizeObjectArray(value: unknown): Record<string, unknown>[] | undefined {
  return Array.isArray(value) ? value.map((item) => requireObject(item, "elevenreader object array item")) : undefined;
}

function integerQueryValue(value: unknown): string | undefined {
  return Number.isInteger(value) ? String(value) : undefined;
}

function inferElevenreaderAudioExtension(contentType: string, outputFormat: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }
  if (normalized.includes("wav")) {
    return "wav";
  }
  if (normalized.includes("ogg")) {
    return "ogg";
  }
  if (normalized.includes("pcm")) {
    return "pcm";
  }
  if (outputFormat.startsWith("pcm_")) {
    return "pcm";
  }
  if (outputFormat.startsWith("ulaw_")) {
    return "ulaw";
  }
  if (outputFormat.startsWith("alaw_")) {
    return "alaw";
  }
  return "bin";
}

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `ElevenReader response is missing ${fieldName}`);
  }
  return record;
}

function requireResponseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `ElevenReader response is missing ${fieldName}`);
  }
  return value;
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `ElevenReader response is missing ${fieldName}`);
  }
  return value as number;
}

function requireResponseBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `ElevenReader response is missing ${fieldName}`);
  }
  return value;
}
