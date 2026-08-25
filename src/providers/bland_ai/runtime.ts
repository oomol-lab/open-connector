import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const blandAiApiBaseUrl = "https://api.bland.ai";

const blandAiValidationPath = "/v1/me";

type BlandAiRequestPhase = "validate" | "execute";
type BlandAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface BlandAiRequestOptions {
  path: string;
  apiKey: string;
  fetcher: ProviderFetch;
  query?: Record<string, unknown>;
  phase: BlandAiRequestPhase;
  signal?: AbortSignal;
}

export const blandAiActionHandlers: ProviderActionHandlers<"bland_ai", BlandAiActionHandler> = {
  async get_account(_input, context) {
    const payload = await requestBlandAiJson({
      ...context,
      path: blandAiValidationPath,
      phase: "execute",
    });

    return normalizeAccount(payload);
  },
  async list_calls(input, context) {
    const payload = await requestBlandAiJson({
      ...context,
      path: "/v1/calls",
      query: {
        from_number: optionalString(input.fromNumber),
        to_number: optionalString(input.toNumber),
        from: optionalInteger(input.from),
        to: optionalInteger(input.to),
        limit: optionalInteger(input.limit),
        ascending: optionalBoolean(input.ascending),
        sort_by: optionalString(input.sortBy),
        start_date: optionalString(input.startDate),
        end_date: optionalString(input.endDate),
        created_at: optionalString(input.createdAt),
        timezone: optionalString(input.timezone),
        update_start_date: optionalString(input.updateStartDate),
        update_end_date: optionalString(input.updateEndDate),
        completed: optionalBoolean(input.completed),
        batch_id: optionalString(input.batchId),
        answered_by: optionalString(input.answeredBy),
        inbound: optionalBoolean(input.inbound),
        duration_gt: optionalNumber(input.durationGt),
        duration_lt: optionalNumber(input.durationLt),
        campaign_id: optionalString(input.campaignId),
      },
      phase: "execute",
    });

    return normalizeCallList(payload);
  },
  async get_call(input, context) {
    const payload = await requestBlandAiJson({
      ...context,
      path: `/v1/calls/${encodePathSegment(requireString(input.callId, "callId"))}`,
      phase: "execute",
    });

    const record = ensureRecord(payload, "Bland AI call details response");
    return {
      call: normalizeCall(record),
      transcripts: readArray(record.transcripts, "Bland AI call transcripts").map(normalizeTranscript),
      concatenatedTranscript: readNullableString(record.concatenated_transcript),
    };
  },
  async list_voices(_input, context) {
    const payload = await requestBlandAiJson({
      ...context,
      path: "/v1/voices",
      phase: "execute",
    });

    const record = ensureRecord(payload, "Bland AI voices response");
    return {
      voices: readArray(record.voices, "Bland AI voices").map(normalizeVoice),
      raw: record,
    };
  },
  async get_voice(input, context) {
    const payload = await requestBlandAiJson({
      ...context,
      path: `/v1/voices/${encodePathSegment(requireString(input.voiceId, "voiceId"))}`,
      phase: "execute",
    });

    const record = ensureRecord(payload, "Bland AI voice response");
    return {
      voice: normalizeVoice(record.voice ?? record),
    };
  },
};

export async function validateBlandAiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBlandAiJson({
    path: blandAiValidationPath,
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const account = normalizeAccount(payload);

  return {
    profile: {
      accountId: "api_key",
      displayName: `Bland AI ${account.status}`,
      grantedScopes: [],
    },
    metadata: {
      apiBaseUrl: blandAiApiBaseUrl,
      validationEndpoint: blandAiValidationPath,
      status: account.status,
      totalCalls: account.totalCalls,
    },
  };
}

async function requestBlandAiJson(options: BlandAiRequestOptions): Promise<unknown> {
  const url = new URL(options.path, blandAiApiBaseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  try {
    const response = await options.fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: options.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: options.signal,
    });
    const payload = await readBlandAiPayload(response);
    if (!response.ok) {
      throw createBlandAiError(response, payload, options.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Bland AI request failed: ${error.message}` : "Bland AI request failed",
    );
  }
}

async function readBlandAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }

    throw new ProviderRequestError(502, "Bland AI returned invalid JSON");
  }
}

function createBlandAiError(response: Response, payload: unknown, phase: BlandAiRequestPhase): ProviderRequestError {
  const message = extractBlandAiErrorMessage(payload) ?? `Bland AI request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractBlandAiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null || value === "") {
    return;
  }

  url.searchParams.set(key, String(value));
}

function normalizeAccount(payload: unknown) {
  const record = ensureRecord(payload, "Bland AI account response");
  const billing = ensureRecord(record.billing, "Bland AI account billing");
  return {
    status: requireProviderString(record.status, "status"),
    billing,
    currentBalance: readNullableNumber(billing.current_balance),
    refillTo: readNullableNumber(billing.refill_to),
    totalCalls: asNullableInteger(record.total_calls),
    raw: record,
  };
}

function normalizeCallList(payload: unknown) {
  const record = ensureRecord(payload, "Bland AI calls response");
  return {
    totalCount: asNullableInteger(record.total_count),
    count: asNullableInteger(record.count),
    calls: readArray(record.calls, "Bland AI calls").map(normalizeCall),
    raw: record,
  };
}

function normalizeCall(value: unknown) {
  const record = ensureRecord(value, "Bland AI call response");
  return {
    callId: requireProviderString(record.call_id, "call_id"),
    createdAt: readNullableString(record.created_at),
    startedAt: readNullableString(record.started_at),
    endedAt: readNullableString(record.end_at),
    callLength: readNullableNumber(record.call_length),
    fromNumber: readNullableString(record.from),
    toNumber: readNullableString(record.to),
    completed: asNullableBoolean(record.completed),
    inbound: asNullableBoolean(record.inbound),
    queueStatus: readNullableString(record.queue_status),
    status: readNullableString(record.status),
    answeredBy: readNullableString(record.answered_by),
    errorMessage: readNullableString(record.error_message),
    batchId: readNullableString(record.batch_id),
    recordingUrl: readNullableString(record.recording_url),
    summary: readNullableString(record.summary),
    raw: record,
  };
}

function normalizeTranscript(value: unknown) {
  const record = ensureRecord(value, "Bland AI transcript response");
  return {
    id: readNullableString(record.id),
    createdAt: readNullableString(record.created_at),
    text: requireProviderString(record.text, "text"),
    user: readNullableString(record.user),
    raw: record,
  };
}

function normalizeVoice(value: unknown) {
  const record = ensureRecord(value, "Bland AI voice response");
  return {
    id: requireProviderString(record.id, "id"),
    name: requireProviderString(record.name, "name"),
    description: readNullableString(record.description),
    isPublic: asNullableBoolean(record.public),
    tags: readStringArray(record.tags),
    userId: readNullableString(record.user_id),
    voiceId: readNullableString(record.voice_id),
    service: readNullableString(record.service),
    finetuned: asNullableBoolean(record.finetuned),
    isCreatorVoice: asNullableBoolean(record.is_creator_voice),
    ratings: asNullableInteger(record.ratings),
    averageRating: readNullableNumber(record.average_rating),
    myRating: readNullableNumber(record.my_rating),
    creatorDisplayName: readNullableString(record.creator_display_name),
    raw: record,
  };
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} was not an array`);
  }
  return value;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === "string");
}

function ensureRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} was not an object`);
  }
  return record;
}

function requireString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function requireProviderString(value: unknown, fieldName: string): string {
  if (typeof value === "number") {
    return String(value);
  }

  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Bland AI response did not include ${fieldName}`);
  }
  return parsed;
}

function asNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return optionalInteger(value) ?? null;
}

function asNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  return optionalBoolean(value) ?? null;
}

function readNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : (optionalString(value) ?? null);
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalNumber(value) ?? null;
}
