import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  nullableInteger,
  nullableString,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "retell_ai";
const retellAiApiBaseUrl = "https://api.retellai.com";
const validationPath = "/list-voices";

type RetellAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const retellAiActionHandlers: ProviderActionHandlers<"retell_ai", RetellAiActionHandler> = {
  async list_voices(_input, context) {
    const payload = await requestRetellAiJson({
      path: validationPath,
      context,
      phase: "execute",
    });
    const voices = readArrayPayload(payload, "Retell AI voices response");
    return {
      voices: voices.map(normalizeVoice),
      raw: voices,
    };
  },
  async get_voice(input, context) {
    const payload = await requestRetellAiJson({
      path: `/get-voice/${encodeURIComponent(requiredInputString(input.voiceId, "voiceId"))}`,
      context,
      phase: "execute",
    });
    return { voice: normalizeVoice(payload) };
  },
  async list_voice_agents(input, context) {
    const payload = await requestRetellAiJson({
      path: "/list-agents",
      context,
      query: compactObject({
        limit: optionalInteger(input.limit),
        pagination_key: optionalString(input.paginationKey),
        pagination_key_version: optionalInteger(input.paginationKeyVersion),
        is_latest: optionalBoolean(input.isLatest),
      }),
      phase: "execute",
    });
    const agents = readArrayPayload(payload, "Retell AI voice agents response");
    return {
      agents: agents.map(normalizeAgent),
      raw: agents,
    };
  },
  async get_voice_agent(input, context) {
    const payload = await requestRetellAiJson({
      path: `/get-agent/${encodeURIComponent(requiredInputString(input.agentId, "agentId"))}`,
      context,
      query: compactObject({
        version: optionalString(input.version) ?? optionalInteger(input.version),
      }),
      phase: "execute",
    });
    return { agent: normalizeAgent(payload) };
  },
  async list_phone_numbers(input, context) {
    const payload = await requestRetellAiJson({
      path: "/v2/list-phone-numbers",
      context,
      query: compactObject({
        limit: optionalInteger(input.limit),
        sort_order: optionalString(input.sortOrder),
        pagination_key: optionalString(input.paginationKey),
      }),
      phase: "execute",
    });
    return normalizePaginatedPhoneNumbers(payload);
  },
  async get_phone_number(input, context) {
    const payload = await requestRetellAiJson({
      path: `/get-phone-number/${encodeURIComponent(requiredInputString(input.phoneNumber, "phoneNumber"))}`,
      context,
      phase: "execute",
    });
    return { phoneNumber: normalizePhoneNumber(payload) };
  },
  async list_calls(input, context) {
    const payload = await requestRetellAiJson({
      path: "/v3/list-calls",
      context,
      method: "POST",
      body: compactObject({
        limit: optionalInteger(input.limit),
        skip: optionalInteger(input.skip),
        pagination_key: optionalString(input.paginationKey),
        sort_order: optionalString(input.sortOrder),
        include_total: optionalBoolean(input.includeTotal),
        filter_criteria: buildCallFilterCriteria(input),
      }),
      phase: "execute",
    });
    return normalizePaginatedCalls(payload);
  },
  async get_call(input, context) {
    const payload = await requestRetellAiJson({
      path: `/v2/get-call/${encodeURIComponent(requiredInputString(input.callId, "callId"))}`,
      context,
      phase: "execute",
    });
    return { call: normalizeCall(payload) };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, retellAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
    await requestRetellAiJson({
      path: validationPath,
      context: { apiKey, fetcher, signal },
      phase: "validate",
    });
    return {
      profile: {
        accountId: "retell-ai-api-key",
        displayName: "Retell AI API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: retellAiApiBaseUrl,
        validationEndpoint: validationPath,
      },
    };
  },
};

async function requestRetellAiJson(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: "validate" | "execute";
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const url = new URL(input.path, retellAiApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    appendQueryValue(url, key, value);
  }

  const method = input.method ?? "GET";
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${input.context.apiKey}`,
    "user-agent": providerUserAgent,
  };
  const init: RequestInit = {
    method,
    headers,
    signal: input.context.signal,
  };
  if (method !== "GET" && input.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(input.body);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url.toString(), init);
    payload = await readRetellAiPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Retell AI request failed: ${error.message}` : "Retell AI request failed",
    );
  }

  if (!response.ok) {
    throw createRetellAiError(response, payload, input.phase);
  }
  return payload;
}

async function readRetellAiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Retell AI returned invalid JSON");
  }
}

function createRetellAiError(
  response: Response,
  payload: unknown,
  phase: "validate" | "execute",
): ProviderRequestError {
  const message = extractRetellAiErrorMessage(payload) ?? `Retell AI request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractRetellAiErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return record ? (optionalString(record.message) ?? optionalString(record.error)) : undefined;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value !== undefined && value !== null && value !== "") {
    url.searchParams.set(key, String(value));
  }
}

function readArrayPayload(payload: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, `${label} was not an array`);
  }
  return payload.map((item) => ensureRecord(item, label));
}

function ensureRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} included a non-object item`);
  }
  return record;
}

function normalizeVoice(value: unknown): Record<string, unknown> {
  const record = ensureRecord(value, "Retell AI voice response");
  return {
    voiceId: requireProviderString(record.voice_id, "voice_id"),
    voiceName: requireProviderString(record.voice_name, "voice_name"),
    provider: requireProviderString(record.provider, "provider"),
    gender: requireProviderString(record.gender, "gender"),
    accent: nullableString(record.accent) ?? null,
    age: nullableString(record.age) ?? null,
    previewAudioUrl: nullableString(record.preview_audio_url) ?? null,
    raw: record,
  };
}

function normalizeAgent(value: unknown): Record<string, unknown> {
  const record = ensureRecord(value, "Retell AI voice agent response");
  return {
    agentId: requireProviderString(record.agent_id, "agent_id"),
    version: nullableInteger(record.version) ?? null,
    agentName: nullableString(record.agent_name) ?? null,
    voiceId: nullableString(record.voice_id) ?? null,
    isPublished: optionalBoolean(record.is_published) ?? null,
    lastModificationTimestamp: nullableInteger(record.last_modification_timestamp) ?? null,
    raw: record,
  };
}

function normalizePhoneNumber(value: unknown): Record<string, unknown> {
  const record = ensureRecord(value, "Retell AI phone number response");
  return {
    phoneNumber: requireProviderString(record.phone_number, "phone_number"),
    phoneNumberType: nullableString(record.phone_number_type) ?? null,
    phoneNumberPretty: nullableString(record.phone_number_pretty) ?? null,
    nickname: nullableString(record.nickname) ?? null,
    inboundWebhookUrl: nullableString(record.inbound_webhook_url) ?? null,
    lastModificationTimestamp: nullableInteger(record.last_modification_timestamp) ?? null,
    raw: record,
  };
}

function normalizeCall(value: unknown): Record<string, unknown> {
  const record = ensureRecord(value, "Retell AI call response");
  return {
    callId: requireProviderString(record.call_id, "call_id"),
    callType: nullableString(record.call_type) ?? null,
    agentId: nullableString(record.agent_id) ?? null,
    agentName: nullableString(record.agent_name) ?? null,
    callStatus: nullableString(record.call_status) ?? null,
    direction: nullableString(record.direction) ?? null,
    fromNumber: nullableString(record.from_number) ?? null,
    toNumber: nullableString(record.to_number) ?? null,
    startTimestamp: nullableInteger(record.start_timestamp) ?? null,
    endTimestamp: nullableInteger(record.end_timestamp) ?? null,
    durationMs: nullableInteger(record.duration_ms) ?? null,
    raw: record,
  };
}

function normalizePaginatedPhoneNumbers(payload: unknown): Record<string, unknown> {
  const record = ensureRecord(payload, "Retell AI phone numbers response");
  return {
    paginationKey: nullableString(record.pagination_key) ?? null,
    hasMore: requireProviderBoolean(record.has_more, "has_more"),
    phoneNumbers: readPaginatedItems(record.items, "Retell AI phone numbers response.items").map(normalizePhoneNumber),
    raw: record,
  };
}

function normalizePaginatedCalls(payload: unknown): Record<string, unknown> {
  const record = ensureRecord(payload, "Retell AI calls response");
  return {
    paginationKey: nullableString(record.pagination_key) ?? null,
    hasMore: requireProviderBoolean(record.has_more, "has_more"),
    total: nullableInteger(record.total) ?? null,
    calls: readPaginatedItems(record.items, "Retell AI calls response.items").map(normalizeCall),
    raw: record,
  };
}

function buildCallFilterCriteria(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const filter = compactObject({
    agent: buildAgentFilter(input.agentIds),
    call_id: buildEnumFilter(input.callIds),
    call_status: buildEnumFilter(input.callStatuses),
    call_type: buildEnumFilter(input.callTypes),
    direction: buildEnumFilter(input.directions),
  });
  return Object.keys(filter).length > 0 ? filter : undefined;
}

function buildAgentFilter(value: unknown): Array<Record<string, string>> | undefined {
  return Array.isArray(value) && value.length > 0 ? value.map((agentId) => ({ agent_id: String(agentId) })) : undefined;
}

function buildEnumFilter(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) && value.length > 0
    ? {
        operator: "in",
        value: value.map(String),
      }
    : undefined;
}

function requireProviderString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `Retell AI response did not include ${fieldName}`);
  }
  return parsed;
}

function requireProviderBoolean(value: unknown, fieldName: string): boolean {
  const parsed = optionalBoolean(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `Retell AI response did not include boolean ${fieldName}`);
  }
  return parsed;
}

function readPaginatedItems(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} was not an array`);
  }
  return value;
}
