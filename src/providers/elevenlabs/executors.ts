import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { ElevenlabsActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const elevenlabsApiOrigin = "https://api.elevenlabs.io";
const elevenlabsApiBaseUrl = `${elevenlabsApiOrigin}/v1`;
const elevenlabsApiV2BaseUrl = `${elevenlabsApiOrigin}/v2`;
const elevenlabsUserAgent = providerUserAgent;

type ElevenlabsRuntimeContext = ApiKeyProviderContext;

type ElevenlabsActionHandler = (input: Record<string, unknown>, context: ElevenlabsRuntimeContext) => Promise<unknown>;

export const elevenlabsActionHandlers: Record<ElevenlabsActionName, ElevenlabsActionHandler> = {
  get_user_info(_input, context) {
    return getElevenlabsUserInfo(context);
  },
  get_user_subscription_info(_input, context) {
    return getElevenlabsUserSubscriptionInfo(context);
  },
  get_models(_input, context) {
    return getElevenlabsModels(context);
  },
  get_voices(_input, context) {
    return getElevenlabsVoices(context);
  },
  get_voice(input, context) {
    return getElevenlabsVoice(input, context);
  },
  search_voices(input, context) {
    return searchElevenlabsVoices(input, context);
  },
  get_voice_settings(input, context) {
    return getElevenlabsVoiceSettings(input, context);
  },
  get_generated_items(input, context) {
    return getElevenlabsGeneratedItems(input, context);
  },
  get_history_item_by_id(input, context) {
    return getElevenlabsHistoryItemById(input, context);
  },
  text_to_speech(input, context) {
    return elevenlabsTextToSpeech(input, context);
  },
  text_to_speech_with_timestamps(input, context) {
    return elevenlabsTextToSpeechWithTimestamps(input, context);
  },
  create_sound_effect(input, context) {
    return createElevenlabsSoundEffect(input, context);
  },
  get_audio_from_history_item(input, context) {
    return getElevenlabsAudioFromHistoryItem(input, context);
  },
  delete_history_item(input, context) {
    return deleteElevenlabsHistoryItem(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("elevenlabs", elevenlabsActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "elevenlabs",
  baseUrl: elevenlabsApiOrigin,
  auth: { type: "api_key_header", name: "xi-api-key" },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateElevenlabsApiKey(input.apiKey, fetcher, signal);
  },
};

export async function validateElevenlabsApiKey(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const user = await requestElevenlabsJson<Record<string, unknown>>(
    {
      path: "/user",
      mode: "validate",
    },
    apiKey,
    fetcher,
    signal,
  );

  const normalizedUser = normalizeUserInfo(user);
  return {
    profile: {
      accountId: normalizedUser.userId,
      displayName:
        normalizedUser.firstName && normalizedUser.firstName.length > 0
          ? normalizedUser.firstName
          : `ElevenLabs ${normalizedUser.userId}`,
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

async function getElevenlabsUserInfo(context: ElevenlabsRuntimeContext) {
  const payload = await requestElevenlabsJson<Record<string, unknown>>(
    {
      path: "/user",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    user: normalizeUserInfo(payload),
  };
}

async function getElevenlabsUserSubscriptionInfo(context: ElevenlabsRuntimeContext) {
  const payload = await requestElevenlabsJson<Record<string, unknown>>(
    {
      path: "/user/subscription",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    subscription: normalizeSubscription(payload),
  };
}

async function getElevenlabsModels(context: ElevenlabsRuntimeContext) {
  const payload = await requestElevenlabsJson<unknown>(
    {
      path: "/models",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  const payloadObject = Array.isArray(payload) ? null : optionalRecord(payload);
  const models = Array.isArray(payload)
    ? payload
    : Array.isArray(payloadObject?.models)
      ? (payloadObject.models as unknown[])
      : [];

  return {
    models: models.map((item) => normalizeModel(asObject(item))),
  };
}

async function getElevenlabsVoices(context: ElevenlabsRuntimeContext) {
  const payload = await requestElevenlabsJson<Record<string, unknown>>(
    {
      path: "/voices",
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  const voices = Array.isArray(payload.voices) ? payload.voices : [];
  return {
    voices: voices.map((item) => normalizeVoice(asObject(item))),
  };
}

async function getElevenlabsVoice(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const payload = await requestElevenlabsJson<Record<string, unknown>>(
    {
      path: `/voices/${encodeURIComponent(String(input.voiceId))}`,
      query: compactObject({
        with_settings: input.withSettings === true ? "true" : undefined,
      }),
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    voice: normalizeVoice(payload),
  };
}

async function searchElevenlabsVoices(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const payload = await requestElevenlabsJson<Record<string, unknown>>(
    {
      baseUrl: elevenlabsApiV2BaseUrl,
      path: "/voices",
      query: compactObject({
        search: stringQueryValue(input.search),
        category: stringQueryValue(input.category),
        voice_type: stringQueryValue(input.voiceType),
        sort: stringQueryValue(input.sort),
        sort_direction: stringQueryValue(input.sortDirection),
        fine_tuning_state: stringQueryValue(input.fineTuningState),
        collection_id: stringQueryValue(input.collectionId),
        voice_ids: arrayQueryValue(input.voiceIds),
        page_size: numberQueryValue(input.pageSize),
        next_page_token: stringQueryValue(input.nextPageToken),
        include_total_count: booleanQueryValue(input.includeTotalCount),
      }),
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  const voices = Array.isArray(payload.voices) ? payload.voices : [];
  return compactObject({
    voices: voices.map((item) => normalizeVoice(asObject(item))),
    hasMore: payload.has_more === true,
    nextPageToken: optionalString(payload.next_page_token),
    totalCount: optionalInteger(payload.total_count),
  });
}

async function getElevenlabsVoiceSettings(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const payload = await requestElevenlabsJson<Record<string, unknown>>(
    {
      path: `/voices/${encodeURIComponent(String(input.voiceId))}/settings`,
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    settings: normalizeVoiceSettingsResponse(payload),
  };
}

async function getElevenlabsGeneratedItems(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const payload = await requestElevenlabsJson<Record<string, unknown>>(
    {
      path: "/history",
      query: compactObject({
        page_size: numberQueryValue(input.pageSize),
        voice_id: stringQueryValue(input.voiceId),
        start_after_history_item_id: stringQueryValue(input.startAfterHistoryItemId),
      }),
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  const history = Array.isArray(payload.history) ? payload.history : [];
  return {
    history: history.map((item) => normalizeHistoryItem(asObject(item))),
    hasMore: payload.has_more === true,
    lastHistoryItemId: optionalString(payload.last_history_item_id) ?? null,
    scannedUntil: optionalInteger(payload.scanned_until),
  };
}

async function getElevenlabsHistoryItemById(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const payload = await requestElevenlabsJson<Record<string, unknown>>(
    {
      path: `/history/${encodeURIComponent(String(input.historyItemId))}`,
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  return {
    historyItem: normalizeHistoryItem(payload),
  };
}

async function deleteElevenlabsHistoryItem(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const response = await context.fetcher(
    buildElevenlabsUrl(`/history/${encodeURIComponent(String(input.historyItemId))}`),
    {
      method: "DELETE",
      headers: elevenlabsHeaders(context.apiKey),
      signal: context.signal,
    },
  );

  if (!response.ok) {
    throw await createElevenlabsError(response, "execute");
  }

  const payload = await readOptionalElevenlabsJson<Record<string, unknown>>(response);

  return {
    status: optionalString(payload?.status) ?? "ok",
  };
}

async function elevenlabsTextToSpeech(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const requestPayload = buildTextToSpeechBody(input);
  const outputFormat = optionalString(input.outputFormat) ?? "mp3_44100_128";
  const modelId = optionalString(input.modelId);

  const response = await context.fetcher(
    buildElevenlabsUrl(`/text-to-speech/${encodeURIComponent(String(input.voiceId))}`, {
      output_format: outputFormat,
      optimize_streaming_latency: numberQueryValue(input.optimizeStreamingLatency),
    }),
    {
      method: "POST",
      headers: elevenlabsBinaryJsonHeaders(context.apiKey),
      body: JSON.stringify(requestPayload),
      signal: context.signal,
    },
  );

  if (!response.ok) {
    throw await createElevenlabsError(response, "execute");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const extension = inferElevenlabsAudioExtension(contentType, outputFormat);
  const name = `elevenlabs-tts-${String(input.voiceId)}.${extension}`;

  return {
    file: await storeElevenlabsFile(context, name, contentType, bytes, "text_to_speech"),
    voiceId: String(input.voiceId),
    modelId,
    outputFormat,
    contentType,
  };
}

async function elevenlabsTextToSpeechWithTimestamps(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const requestPayload = buildTextToSpeechBody(input);
  const outputFormat = optionalString(input.outputFormat) ?? "mp3_44100_128";
  const modelId = optionalString(input.modelId);

  const payload = await requestElevenlabsJson<Record<string, unknown>>(
    {
      method: "POST",
      path: `/text-to-speech/${encodeURIComponent(String(input.voiceId))}/with-timestamps`,
      query: compactObject({
        output_format: outputFormat,
        optimize_streaming_latency: numberQueryValue(input.optimizeStreamingLatency),
      }),
      body: requestPayload,
    },
    context.apiKey,
    context.fetcher,
    context.signal,
  );

  const contentType = inferElevenlabsContentType(outputFormat);
  const extension = inferElevenlabsAudioExtension(contentType, outputFormat);
  const name = `elevenlabs-tts-timestamps-${String(input.voiceId)}.${extension}`;

  return compactObject({
    file: await storeElevenlabsFile(
      context,
      name,
      contentType,
      decodeRequiredBase64(payload.audio_base64, "audio_base64"),
      "text_to_speech_with_timestamps",
    ),
    alignment: normalizeCharacterAlignment(payload.alignment),
    normalizedAlignment: normalizeCharacterAlignment(payload.normalized_alignment),
    voiceId: String(input.voiceId),
    modelId,
    outputFormat,
    contentType,
  });
}

async function createElevenlabsSoundEffect(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const outputFormat = optionalString(input.outputFormat) ?? "mp3_44100_128";
  const response = await context.fetcher(
    buildElevenlabsUrl("/sound-generation", {
      output_format: outputFormat,
    }),
    {
      method: "POST",
      headers: elevenlabsBinaryJsonHeaders(context.apiKey),
      body: JSON.stringify(buildSoundEffectBody(input)),
      signal: context.signal,
    },
  );

  if (!response.ok) {
    throw await createElevenlabsError(response, "execute");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? inferElevenlabsContentType(outputFormat);
  const extension = inferElevenlabsAudioExtension(contentType, outputFormat);
  const name = `elevenlabs-sound-effect.${extension}`;

  return {
    file: await storeElevenlabsFile(context, name, contentType, bytes, "create_sound_effect"),
    outputFormat,
    contentType,
  };
}

async function getElevenlabsAudioFromHistoryItem(input: Record<string, unknown>, context: ElevenlabsRuntimeContext) {
  const historyItemId = String(input.historyItemId);
  const response = await context.fetcher(buildElevenlabsUrl(`/history/${encodeURIComponent(historyItemId)}/audio`), {
    method: "GET",
    headers: elevenlabsBinaryHeaders(context.apiKey),
    signal: context.signal,
  });

  if (!response.ok) {
    throw await createElevenlabsError(response, "execute");
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  const extension = inferElevenlabsAudioExtension(contentType, "mp3_44100_128");
  const name = `elevenlabs-history-${historyItemId}.${extension}`;

  return {
    file: await storeElevenlabsFile(context, name, contentType, bytes, "get_audio_from_history_item"),
    historyItemId,
    contentType,
  };
}

function buildTextToSpeechBody(input: Record<string, unknown>) {
  return compactObject({
    text: String(input.text),
    model_id: optionalString(input.modelId),
    seed: optionalInteger(input.seed),
    voice_settings: normalizeVoiceSettingsForRequest(optionalRecord(input.voiceSettings)),
    pronunciation_dictionary_locators: normalizePronunciationLocatorsForRequest(input.pronunciationDictionaryLocators),
  });
}

function buildSoundEffectBody(input: Record<string, unknown>) {
  return compactObject({
    text: String(input.text),
    loop: booleanOrUndefined(input.loop),
    duration_seconds: numberOrUndefined(input.durationSeconds),
    prompt_influence: numberOrUndefined(input.promptInfluence),
    model_id: optionalString(input.modelId),
  });
}

function normalizeVoiceSettingsResponse(value: Record<string, unknown>) {
  return compactObject({
    stability: nullableNumber(value.stability),
    similarityBoost: nullableNumber(value.similarity_boost),
    style: nullableNumber(value.style),
    useSpeakerBoost: nullableBoolean(value.use_speaker_boost),
    speed: nullableNumber(value.speed),
  });
}

function normalizeVoiceSettingsForRequest(value: Record<string, unknown> | undefined) {
  if (!value) {
    return undefined;
  }

  return compactObject({
    stability: numberOrUndefined(value.stability),
    similarity_boost: numberOrUndefined(value.similarityBoost),
    style: numberOrUndefined(value.style),
    use_speaker_boost: booleanOrUndefined(value.useSpeakerBoost),
  });
}

function normalizePronunciationLocatorsForRequest(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => {
    const record = asObject(item);
    return compactObject({
      pronunciation_dictionary_id: pickFirstString(record, "pronunciationDictionaryId"),
      version_id: pickFirstString(record, "versionId"),
    });
  });
}

type ElevenlabsRequestInput = {
  method?: "DELETE" | "GET" | "POST";
  baseUrl?: string;
  path: string;
  query?: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  mode?: "validate" | "execute";
};

async function requestElevenlabsJson<T>(
  input: ElevenlabsRequestInput,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
) {
  const response = await fetcher(buildElevenlabsUrl(input.path, input.query, input.baseUrl), {
    method: input.method ?? "GET",
    headers: input.body !== undefined ? elevenlabsJsonHeaders(apiKey) : elevenlabsHeaders(apiKey),
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    signal,
  });

  if (!response.ok) {
    throw await createElevenlabsError(response, input.mode ?? "execute");
  }

  return readElevenlabsJson<T>(response);
}

function buildElevenlabsUrl(
  path: string,
  query?: Record<string, string | string[] | undefined>,
  baseUrl = elevenlabsApiBaseUrl,
) {
  const url = new URL(`${baseUrl}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          url.searchParams.append(key, child);
        }
      } else if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url;
}

function elevenlabsHeaders(apiKey: string) {
  return {
    "xi-api-key": apiKey,
    accept: "application/json",
    "user-agent": elevenlabsUserAgent,
  };
}

function elevenlabsBinaryHeaders(apiKey: string) {
  return {
    "xi-api-key": apiKey,
    accept: "*/*",
    "user-agent": elevenlabsUserAgent,
  };
}

function elevenlabsJsonHeaders(apiKey: string) {
  return {
    ...elevenlabsHeaders(apiKey),
    "content-type": "application/json",
  };
}

function elevenlabsBinaryJsonHeaders(apiKey: string) {
  return {
    ...elevenlabsBinaryHeaders(apiKey),
    "content-type": "application/json",
  };
}

async function readElevenlabsJson<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "elevenlabs returned invalid JSON");
  }
}

async function readOptionalElevenlabsJson<T>(response: Response) {
  const rawText = await response.text().catch(() => "");
  if (response.status === 204 || rawText.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch {
    throw new ProviderRequestError(502, "elevenlabs returned invalid JSON");
  }
}

async function createElevenlabsError(response: Response, mode: "validate" | "execute") {
  const message = await readElevenlabsErrorMessage(response);

  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message);
}

async function readElevenlabsErrorMessage(response: Response) {
  const rawText = await response.text().catch(() => "");
  if (rawText.length === 0) {
    return `elevenlabs request failed with ${response.status}`;
  }

  try {
    const payload = JSON.parse(rawText) as {
      detail?: unknown;
      message?: unknown;
      error?: unknown;
    };
    if (typeof payload.detail === "string" && payload.detail.length > 0) {
      return payload.detail;
    }
    if (payload.detail && typeof payload.detail === "object") {
      const detailMessage = optionalString((payload.detail as Record<string, unknown>).message);
      if (detailMessage) {
        return detailMessage;
      }
    }
    if (typeof payload.message === "string" && payload.message.length > 0) {
      return payload.message;
    }
    if (typeof payload.error === "string" && payload.error.length > 0) {
      return payload.error;
    }
  } catch {}

  return rawText;
}

function normalizeUserInfo(payload: Record<string, unknown>) {
  return {
    userId: requireString(payload.user_id, "elevenlabs user.user_id"),
    createdAt: requireInteger(payload.created_at, "elevenlabs user.created_at"),
    firstName: optionalString(payload.first_name),
    isNewUser: requireBoolean(payload.is_new_user, "elevenlabs user.is_new_user"),
    canUseDelayedPaymentMethods: requireBoolean(
      payload.can_use_delayed_payment_methods,
      "elevenlabs user.can_use_delayed_payment_methods",
    ),
    isOnboardingCompleted: requireBoolean(payload.is_onboarding_completed, "elevenlabs user.is_onboarding_completed"),
    isOnboardingChecklistCompleted: requireBoolean(
      payload.is_onboarding_checklist_completed,
      "elevenlabs user.is_onboarding_checklist_completed",
    ),
    isApiKeyHashed: requireBoolean(payload.is_api_key_hashed, "elevenlabs user.is_api_key_hashed"),
    subscription: normalizeUserSubscription(asObject(payload.subscription)),
  };
}

function normalizeSubscriptionSummary(payload: Record<string, unknown>) {
  return {
    tier: requireString(payload.tier, "elevenlabs subscription.tier"),
    status: requireString(payload.status, "elevenlabs subscription.status"),
    currency: optionalString(payload.currency),
    billingPeriod: optionalString(payload.billing_period),
    characterCount: requireInteger(payload.character_count, "elevenlabs subscription.character_count"),
    characterLimit: requireInteger(payload.character_limit, "elevenlabs subscription.character_limit"),
    canExtendCharacterLimit: requireBoolean(
      payload.can_extend_character_limit,
      "elevenlabs subscription.can_extend_character_limit",
    ),
    allowedToExtendCharacterLimit: requireBoolean(
      payload.allowed_to_extend_character_limit,
      "elevenlabs subscription.allowed_to_extend_character_limit",
    ),
    nextCharacterCountResetUnix: optionalInteger(payload.next_character_count_reset_unix),
    voiceLimit: requireInteger(payload.voice_limit, "elevenlabs subscription.voice_limit"),
    maxVoiceAddEdits: requireInteger(payload.max_voice_add_edits, "elevenlabs subscription.max_voice_add_edits"),
    voiceAddEditCounter: requireInteger(
      payload.voice_add_edit_counter,
      "elevenlabs subscription.voice_add_edit_counter",
    ),
    professionalVoiceLimit: requireInteger(
      payload.professional_voice_limit,
      "elevenlabs subscription.professional_voice_limit",
    ),
    canExtendVoiceLimit: requireBoolean(
      payload.can_extend_voice_limit,
      "elevenlabs subscription.can_extend_voice_limit",
    ),
    canUseInstantVoiceCloning: requireBoolean(
      payload.can_use_instant_voice_cloning,
      "elevenlabs subscription.can_use_instant_voice_cloning",
    ),
    canUseProfessionalVoiceCloning: requireBoolean(
      payload.can_use_professional_voice_cloning,
      "elevenlabs subscription.can_use_professional_voice_cloning",
    ),
    characterRefreshPeriod: optionalString(payload.character_refresh_period),
    canUseDelayedPaymentMethods: booleanOrUndefined(payload.can_use_delayed_payment_methods),
  };
}

function normalizeUserSubscription(payload: Record<string, unknown>) {
  return normalizeSubscriptionSummary(payload);
}

function normalizeSubscription(payload: Record<string, unknown>) {
  const pendingChangePayload =
    "pending_change" in payload
      ? optionalRecord(payload.pending_change)
      : optionalRecord(payload.pending_subscription_change);

  return {
    ...normalizeSubscriptionSummary(payload),
    hasOpenInvoices: requireBoolean(payload.has_open_invoices, "elevenlabs subscription.has_open_invoices"),
    openInvoices: normalizeInvoiceArray(payload.open_invoices),
    nextInvoice: normalizeOptionalInvoice(payload.next_invoice),
    pendingSubscriptionChange: normalizePendingSubscriptionChange(pendingChangePayload),
  };
}

function normalizeModel(payload: Record<string, unknown>) {
  return compactObject({
    modelId: requireString(payload.model_id, "elevenlabs model.model_id"),
    name: optionalString(payload.name),
    description: optionalString(payload.description),
    languages: normalizeModelLanguages(payload.languages),
    canBeFinetuned: booleanOrUndefined(payload.can_be_finetuned),
    canDoTextToSpeech: booleanOrUndefined(payload.can_do_text_to_speech),
    canDoVoiceConversion: booleanOrUndefined(payload.can_do_voice_conversion),
    canUseStyle: booleanOrUndefined(payload.can_use_style),
    canUseSpeakerBoost: booleanOrUndefined(payload.can_use_speaker_boost),
    servesProVoices: booleanOrUndefined(payload.serves_pro_voices),
    tokenCostFactor: numberOrUndefined(payload.token_cost_factor),
    concurrencyGroup: optionalString(payload.concurrency_group),
    maxCharactersRequestFreeUser: optionalInteger(payload.max_characters_request_free_user),
    maxCharactersRequestSubscribedUser: optionalInteger(payload.max_characters_request_subscribed_user),
    maximumTextLengthPerRequest: optionalInteger(payload.maximum_text_length_per_request),
    requiresAlphaAccess: booleanOrUndefined(payload.requires_alpha_access),
    modelRates: optionalRecord(payload.model_rates),
  });
}

function normalizeVoice(payload: Record<string, unknown>) {
  return compactObject({
    voiceId: requireString(payload.voice_id, "elevenlabs voice.voice_id"),
    name: requireString(payload.name, "elevenlabs voice.name"),
    category: requireString(payload.category, "elevenlabs voice.category"),
    description: optionalString(payload.description),
    previewUrl: optionalString(payload.preview_url),
    labels: normalizeStringRecord(payload.labels),
    settings: optionalRecord(payload.settings),
    availableForTiers: normalizeStringArray(payload.available_for_tiers),
    verifiedLanguages: normalizeVerifiedLanguages(payload.verified_languages),
    sharing: optionalRecord(payload.sharing),
    fineTuning: optionalRecord(payload.fine_tuning),
    permissionOnResource: optionalString(payload.permission_on_resource),
    isOwner: booleanOrUndefined(payload.is_owner),
    isLegacy: booleanOrUndefined(payload.is_legacy),
  });
}

function normalizeHistoryItem(payload: Record<string, unknown>) {
  return compactObject({
    historyItemId: requireString(payload.history_item_id, "elevenlabs history.history_item_id"),
    requestId: optionalString(payload.request_id),
    voiceId: optionalString(payload.voice_id),
    modelId: optionalString(payload.model_id),
    voiceName: optionalString(payload.voice_name),
    voiceCategory: optionalString(payload.voice_category),
    text: optionalString(payload.text),
    dateUnix: requireInteger(payload.date_unix, "elevenlabs history.date_unix"),
    characterCountChangeFrom: optionalInteger(payload.character_count_change_from),
    characterCountChangeTo: optionalInteger(payload.character_count_change_to),
    contentType: optionalString(payload.content_type),
    state: requireString(payload.state, "elevenlabs history.state"),
    source: optionalString(payload.source),
    settings: optionalRecord(payload.settings),
    feedback: normalizeHistoryFeedback(optionalRecord(payload.feedback)),
    shareLinkId: payload.share_link_id === null ? null : optionalString(payload.share_link_id),
  });
}

function normalizeHistoryFeedback(value: Record<string, unknown> | undefined) {
  if (!value) {
    return undefined;
  }

  return compactObject({
    thumbsUp: booleanOrUndefined(value.thumbs_up),
    feedback: optionalString(value.feedback),
    emotions: booleanOrUndefined(value.emotions),
    inaccurateClone: booleanOrUndefined(value.inaccurate_clone),
    glitches: booleanOrUndefined(value.glitches),
    audioQuality: booleanOrUndefined(value.audio_quality),
    other: booleanOrUndefined(value.other),
    reviewStatus: optionalString(value.review_status),
  });
}

function normalizeCharacterAlignment(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const rawCharacters = record.characters;
  const rawCharacterStartTimesSeconds = record.character_start_times_seconds;
  const rawCharacterEndTimesSeconds = record.character_end_times_seconds;
  if (
    !Array.isArray(rawCharacters) ||
    !Array.isArray(rawCharacterStartTimesSeconds) ||
    !Array.isArray(rawCharacterEndTimesSeconds)
  ) {
    return undefined;
  }

  const characters = normalizeStringArray(rawCharacters);
  const characterStartTimesSeconds = normalizeNumberArray(rawCharacterStartTimesSeconds);
  const characterEndTimesSeconds = normalizeNumberArray(rawCharacterEndTimesSeconds);
  if (
    !characters ||
    !characterStartTimesSeconds ||
    !characterEndTimesSeconds ||
    characters.length !== rawCharacters.length ||
    characterStartTimesSeconds.length !== rawCharacterStartTimesSeconds.length ||
    characterEndTimesSeconds.length !== rawCharacterEndTimesSeconds.length ||
    characters.length !== characterStartTimesSeconds.length ||
    characters.length !== characterEndTimesSeconds.length
  ) {
    return undefined;
  }

  return {
    characters,
    characterStartTimesSeconds,
    characterEndTimesSeconds,
  };
}

function normalizeModelLanguages(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => {
    const record = asObject(item);
    return {
      languageId: requireString(record.language_id, "elevenlabs model language.language_id"),
      name: requireString(record.name, "elevenlabs model language.name"),
    };
  });
}

function normalizeVerifiedLanguages(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => {
    const record = asObject(item);
    return compactObject({
      language: pickFirstString(record, "language", "name"),
      modelId: pickFirstString(record, "modelId", "model_id"),
      accent: pickFirstString(record, "accent"),
      locale: pickFirstString(record, "locale"),
    });
  });
}

function normalizeInvoiceArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeInvoice(asObject(item)));
}

function normalizeOptionalInvoice(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return null;
  }
  return normalizeInvoice(record);
}

function normalizeInvoice(payload: Record<string, unknown>) {
  return {
    amountDueCents: requireInteger(payload.amount_due_cents, "elevenlabs invoice.amount_due_cents"),
    nextPaymentAttemptUnix: requireInteger(
      payload.next_payment_attempt_unix,
      "elevenlabs invoice.next_payment_attempt_unix",
    ),
    discounts: Array.isArray(payload.discounts)
      ? payload.discounts.map((item) => normalizeInvoiceDiscount(asObject(item)))
      : [],
    subtotalCents: optionalInteger(payload.subtotal_cents),
    taxCents: optionalInteger(payload.tax_cents),
    paymentIntentStatus: optionalString(payload.payment_intent_status),
    discountAmountOff: numberOrUndefined(payload.discount_amount_off),
    discountPercentOff: numberOrUndefined(payload.discount_percent_off),
  };
}

function normalizeInvoiceDiscount(payload: Record<string, unknown>) {
  return compactObject({
    discountAmountOff: numberOrUndefined(payload.discount_amount_off),
    discountPercentOff: numberOrUndefined(payload.discount_percent_off),
  });
}

function normalizePendingSubscriptionChange(value: Record<string, unknown> | undefined) {
  if (!value) {
    return null;
  }

  return compactObject({
    kind: pickFirstString(value, "kind"),
    nextTier: pickFirstString(value, "nextTier", "next_tier"),
    nextBillingPeriod: pickFirstString(value, "nextBillingPeriod", "next_billing_period"),
    timestampSeconds: optionalInteger(value.timestamp_seconds),
  });
}

function normalizeStringRecord(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const normalized: Record<string, string> = {};
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === "string") {
      normalized[key] = child;
    }
  }
  return normalized;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is number => typeof item === "number");
}

function decodeRequiredBase64(value: unknown, fieldName: string) {
  const raw = optionalString(value);
  if (!raw) {
    throw new ProviderRequestError(502, `elevenlabs response is missing ${fieldName}`);
  }
  return Buffer.from(raw, "base64");
}

function inferElevenlabsContentType(outputFormat: string) {
  if (outputFormat.startsWith("wav_")) {
    return "audio/wav";
  }
  if (outputFormat.startsWith("opus_")) {
    return "audio/ogg";
  }
  if (outputFormat.startsWith("pcm_") || outputFormat.startsWith("ulaw_") || outputFormat.startsWith("alaw_")) {
    return "application/octet-stream";
  }
  return "audio/mpeg";
}

function inferElevenlabsAudioExtension(contentType: string, outputFormat: string) {
  if (contentType === "audio/mpeg") {
    return "mp3";
  }
  if (contentType === "audio/wav" || contentType === "audio/x-wav") {
    return "wav";
  }
  if (contentType === "audio/ogg") {
    return "ogg";
  }
  if (contentType === "audio/webm") {
    return "webm";
  }
  if (contentType === "audio/flac") {
    return "flac";
  }
  if (outputFormat.startsWith("mp3_")) {
    return "mp3";
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

async function storeElevenlabsFile(
  context: ElevenlabsRuntimeContext,
  name: string,
  mimeType: string,
  bytes: Uint8Array,
  actionName: string,
) {
  if (!context.transitFiles) {
    throw new ProviderRequestError(500, `${actionName} requires transit file storage`);
  }

  const fileBytes = Uint8Array.from(bytes);
  const file = new File([fileBytes.buffer], name, { type: mimeType });
  const upload = await context.transitFiles.create(file);
  return {
    fileId: upload.fileId,
    name: upload.name,
    mimeType: upload.mimeType,
    downloadUrl: upload.downloadUrl,
    sizeBytes: upload.sizeBytes,
  };
}

function asObject(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "elevenlabs object", (message) => new ProviderRequestError(502, message));
}

function pickFirstString(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = optionalString(input[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function stringQueryValue(value: unknown) {
  const parsed = optionalString(value);
  return parsed && parsed.length > 0 ? parsed : undefined;
}

function numberQueryValue(value: unknown) {
  const parsed = optionalInteger(value);
  return parsed === undefined ? undefined : String(parsed);
}

function booleanQueryValue(value: unknown) {
  return typeof value === "boolean" ? String(value) : undefined;
}

function arrayQueryValue(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return items.length === 0 ? undefined : items;
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function nullableNumber(value: unknown) {
  return value === null ? null : optionalNumber(value);
}

function booleanOrUndefined(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function nullableBoolean(value: unknown) {
  return value === null ? null : booleanOrUndefined(value);
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, `elevenlabs response is missing ${fieldName}`);
  }
  return value;
}

function requireInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `elevenlabs response is missing ${fieldName}`);
  }
  return value;
}

function requireBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `elevenlabs response is missing ${fieldName}`);
  }
  return value;
}
