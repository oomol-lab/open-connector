import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { LeexiActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalBooleanOrNull,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
} from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  createProviderTimeout,
  defineProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "leexi";
const leexiApiBaseUrl = "https://public-api.leexi.ai/v1";
const leexiRequestBaseUrl = "https://public-api.leexi.ai/v1/";
const leexiValidationPath = "/users";
const leexiDefaultTimeoutMs = 30_000;
const leexiFetch = createProviderFetch({ skipDnsValidation: true });

type LeexiRequestPhase = "validate" | "execute";
type LeexiActionHandler = (input: Record<string, unknown>, context: LeexiActionContext) => Promise<unknown>;

interface LeexiActionContext {
  keyId: string;
  keySecret: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const leexiActionHandlers: Record<LeexiActionName, LeexiActionHandler> = {
  list_users(input, context) {
    return executeListUsers(input, context);
  },
  list_teams(input, context) {
    return executeListTeams(input, context);
  },
  list_calls(input, context) {
    return executeListCalls(input, context);
  },
  get_call(input, context) {
    return executeGetCall(input, context);
  },
  list_call_notes(input, context) {
    return executeListCallNotes(input, context);
  },
  get_call_note(input, context) {
    return executeGetCallNote(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<LeexiActionContext>({
  service,
  handlers: leexiActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<LeexiActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      keyId: requireLeexiKeyId(credential.values.keyId ?? credential.metadata.keyId),
      keySecret: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const keyId = requireLeexiKeyId(credential.values.keyId ?? credential.metadata.keyId);
    const url = createProviderProxyUrl(leexiApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", buildBasicAuthorizationHeader(keyId, credential.apiKey));
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await leexiFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Leexi request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Leexi request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLeexiCredential({
      keyId: requireLeexiKeyId(input.values.keyId),
      keySecret: input.apiKey,
      fetcher,
      signal,
    });
  },
};

async function validateLeexiCredential(context: LeexiActionContext): Promise<CredentialValidationResult> {
  const payload = await requestLeexiJson({
    method: "GET",
    path: leexiValidationPath,
    query: {
      page: "1",
      items: "1",
    },
    phase: "validate",
    context,
  });

  const record = requireRecord(payload, "Leexi users response");
  const users = requireArray(record.data, "Leexi users response data");
  const firstUser = optionalRecord(users[0]);
  const firstUserUuid = optionalString(firstUser?.uuid) ?? "leexi";
  const firstUserName = optionalString(firstUser?.name);

  return {
    profile: {
      accountId: firstUserUuid,
      displayName: firstUserName ?? "Leexi API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: leexiApiBaseUrl,
      validationEndpoint: leexiValidationPath,
      keyId: context.keyId,
      firstUserUuid,
      firstUserName,
      firstUserEmail: optionalString(firstUser?.email),
    }),
  };
}

async function executeListUsers(input: Record<string, unknown>, context: LeexiActionContext): Promise<unknown> {
  const payload = await requestLeexiJsonForAction({
    context,
    path: "/users",
    query: buildPaginationQuery(input),
  });
  const record = requireRecord(payload, "Leexi users response");
  return {
    users: requireArray(record.data, "Leexi users response data").map((value) => normalizeUser(value)),
    pagination: normalizePagination(record.pagination),
  };
}

async function executeListTeams(input: Record<string, unknown>, context: LeexiActionContext): Promise<unknown> {
  const payload = await requestLeexiJsonForAction({
    context,
    path: "/teams",
    query: buildPaginationQuery(input),
  });
  const record = requireRecord(payload, "Leexi teams response");
  return {
    teams: requireArray(record.data, "Leexi teams response data").map((value) => normalizeTeam(value)),
    pagination: normalizePagination(record.pagination),
  };
}

async function executeListCalls(input: Record<string, unknown>, context: LeexiActionContext): Promise<unknown> {
  const payload = await requestLeexiJsonForAction({
    context,
    path: "/calls",
    query: compactObject({
      ...buildPaginationQuery(input),
      order: optionalString(input.order),
      date_filter: optionalString(input.dateFilter),
      from: optionalString(input.from),
      to: optionalString(input.to),
      source: optionalString(input.source),
      with_simple_transcript: readOptionalBooleanString(input.withSimpleTranscript),
    }),
    arrayQuery: [
      ["source_id", readStringArray(input.sourceIds)],
      ["owner_uuid", readStringArray(input.ownerUuids)],
      ["participating_user_uuid", readStringArray(input.participatingUserUuids)],
      ["customer_phone_number", readStringArray(input.customerPhoneNumbers)],
      ["customer_email_address", readStringArray(input.customerEmailAddresses)],
    ],
  });
  const record = requireRecord(payload, "Leexi calls response");
  return {
    calls: requireArray(record.data, "Leexi calls response data").map((value) => normalizeCall(value)),
    pagination: normalizePagination(record.pagination),
  };
}

async function executeGetCall(input: Record<string, unknown>, context: LeexiActionContext): Promise<unknown> {
  const uuid = requireUuidString(input.uuid, "uuid");
  const payload = await requestLeexiJsonForAction({
    context,
    path: `/calls/${encodeURIComponent(uuid)}`,
  });
  const record = requireRecord(payload, "Leexi call response");
  return {
    call: normalizeCall(record.data),
  };
}

async function executeListCallNotes(input: Record<string, unknown>, context: LeexiActionContext): Promise<unknown> {
  const payload = await requestLeexiJsonForAction({
    context,
    path: "/call_notes",
    query: compactObject({
      ...buildPaginationQuery(input),
      call_uuid: requireUuidString(input.callUuid, "callUuid"),
      prompt_uuid: optionalUuidString(input.promptUuid),
    }),
  });
  const record = requireRecord(payload, "Leexi call notes response");
  return {
    callNotes: requireArray(record.data, "Leexi call notes response data").map((value) => normalizeCallNote(value)),
    pagination: normalizePagination(record.pagination),
  };
}

async function executeGetCallNote(input: Record<string, unknown>, context: LeexiActionContext): Promise<unknown> {
  const uuid = requireUuidString(input.uuid, "uuid");
  const payload = await requestLeexiJsonForAction({
    context,
    path: `/call_notes/${encodeURIComponent(uuid)}`,
  });
  const record = requireRecord(payload, "Leexi call note response");
  return {
    callNote: normalizeCallNote(record.data),
  };
}

async function requestLeexiJsonForAction(input: {
  context: LeexiActionContext;
  path: string;
  query?: Record<string, string | undefined>;
  arrayQuery?: ReadonlyArray<readonly [string, readonly string[] | undefined]>;
}): Promise<unknown> {
  return requestLeexiJson({
    method: "GET",
    path: input.path,
    query: input.query,
    arrayQuery: input.arrayQuery,
    phase: "execute",
    context: input.context,
  });
}

async function requestLeexiJson(input: {
  method: "GET";
  path: string;
  query?: Record<string, string | undefined>;
  arrayQuery?: ReadonlyArray<readonly [string, readonly string[] | undefined]>;
  phase: LeexiRequestPhase;
  context: LeexiActionContext;
}): Promise<unknown> {
  const url = new URL(input.path.replace(/^\//, ""), leexiRequestBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  for (const [key, values] of input.arrayQuery ?? []) {
    for (const value of values ?? []) {
      url.searchParams.append(key, value);
    }
  }

  const timeout = createProviderTimeout(input.context.signal, leexiDefaultTimeoutMs);
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: buildBasicAuthorizationHeader(input.context.keyId, input.context.keySecret),
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Leexi request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Leexi request failed: ${error.message}` : "Leexi request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readLeexiPayload(response);
  if (!response.ok) {
    throw createLeexiError(response.status, payload, input.phase);
  }

  return payload;
}

function buildPaginationQuery(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    page: stringifyInteger(optionalInteger(input.page)),
    items: stringifyInteger(optionalInteger(input.items)),
  });
}

function normalizePagination(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Leexi pagination");
  return {
    page: readRequiredInteger(record.page, "pagination.page"),
    items: readRequiredInteger(record.items, "pagination.items"),
    count: readRequiredInteger(record.count, "pagination.count"),
  };
}

function normalizeTeam(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Leexi team");
  return {
    uuid: readRequiredString(record.uuid, "team.uuid"),
    name: readRequiredString(record.name, "team.name"),
    active: readRequiredBoolean(record.active, "team.active"),
    createdAt: readRequiredString(record.created_at, "team.created_at"),
    updatedAt: readRequiredString(record.updated_at, "team.updated_at"),
    raw: record,
  };
}

function normalizeUser(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Leexi user");
  return {
    uuid: readRequiredString(record.uuid, "user.uuid"),
    name: readRequiredString(record.name, "user.name"),
    email: readRequiredString(record.email, "user.email"),
    active: readRequiredBoolean(record.active, "user.active"),
    license: optionalStringOrNull(record.license),
    team: record.team == null ? null : normalizeTeam(record.team),
    createdAt: readRequiredString(record.created_at, "user.created_at"),
    updatedAt: readRequiredString(record.updated_at, "user.updated_at"),
    raw: record,
  };
}

function normalizeOwner(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Leexi owner");
  return {
    uuid: readRequiredString(record.uuid, "owner.uuid"),
    name: optionalStringOrNull(record.name),
    email: optionalStringOrNull(record.email),
    raw: record,
  };
}

function normalizeConversationType(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Leexi conversation type");
  return {
    uuid: optionalStringOrNull(record.uuid),
    slug: optionalStringOrNull(record.slug),
    active: optionalBooleanOrNull(record.active),
    raw: record,
  };
}

function normalizeCall(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Leexi call");
  return {
    uuid: readRequiredString(record.uuid, "call.uuid"),
    title: optionalStringOrNull(record.title),
    description: optionalStringOrNull(record.description),
    source: optionalStringOrNull(record.source),
    sourceId: optionalStringOrNull(record.source_id),
    locale: optionalStringOrNull(record.locale),
    direction: optionalStringOrNull(record.direction),
    duration: nullableNumber(record.duration),
    performedAt: optionalStringOrNull(record.performed_at),
    createdAt: readRequiredString(record.created_at, "call.created_at"),
    updatedAt: readRequiredString(record.updated_at, "call.updated_at"),
    isVideo: optionalBooleanOrNull(record.is_video),
    visible: optionalBooleanOrNull(record.visible),
    leexiUrl: optionalStringOrNull(record.leexi_url),
    recordingUrl: optionalStringOrNull(record.recording_url),
    transcriptUrl: optionalStringOrNull(record.transcript_url),
    simpleTranscript:
      optionalStringOrNull(record.simple_transcript) ?? optionalStringOrNull(record["simple_transcript:"]),
    owner: record.owner == null ? null : normalizeOwner(record.owner),
    participatingUsers: readArray(record.participating_users).map((item) => normalizeOwner(item)),
    customerPhoneNumbers: readResponseStringArray(record.customer_phone_numbers),
    customerEmailAddresses: readResponseStringArray(record.customer_email_addresses),
    conversationType: record.conversation_type == null ? null : normalizeConversationType(record.conversation_type),
    raw: record,
  };
}

function normalizeCallNotePrompt(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Leexi call note prompt");
  return {
    uuid: readRequiredString(record.uuid, "prompt.uuid"),
    title: optionalStringOrNull(record.title),
    category: optionalStringOrNull(record.category),
    raw: record,
  };
}

function normalizeCallNoteTranslation(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Leexi call note translation");
  return {
    uuid: readRequiredString(record.uuid, "translation.uuid"),
    locale: optionalStringOrNull(record.locale),
    text: optionalStringOrNull(record.text),
    originalText: optionalStringOrNull(record.original_text),
    updatedAt: optionalStringOrNull(record.updated_at),
    raw: record,
  };
}

function normalizeCallNote(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "Leexi call note");
  return {
    uuid: readRequiredString(record.uuid, "call_note.uuid"),
    createdAt: readRequiredString(record.created_at, "call_note.created_at"),
    updatedAt: readRequiredString(record.updated_at, "call_note.updated_at"),
    call: normalizeCall(record.call),
    prompt: record.prompt == null ? null : normalizeCallNotePrompt(record.prompt),
    translations: readArray(record.translations).map((item) => normalizeCallNoteTranslation(item)),
    raw: record,
  };
}

function buildBasicAuthorizationHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64")}`;
}

async function readLeexiPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createLeexiError(status: number, payload: unknown, phase: LeexiRequestPhase): ProviderRequestError {
  const message = extractLeexiErrorMessage(payload) ?? `Leexi request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 400 || status === 401 || status === 402 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 402 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && (status === 400 || status === 404 || status === 405 || status === 409)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractLeexiErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail))
    : undefined;
}

function requireLeexiKeyId(value: unknown): string {
  const keyId = optionalString(value);
  if (!keyId) {
    throw new ProviderRequestError(400, "keyId is required");
  }
  return keyId;
}

function requireUuidString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function optionalUuidString(value: unknown): string | undefined {
  return optionalString(value);
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
  return normalized.length > 0 ? normalized : undefined;
}

function readResponseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const trimmed = optionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return trimmed;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalNumber(value);
  if (parsed === undefined || !Number.isInteger(parsed)) {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return parsed;
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${fieldName} is missing`);
  }
  return value;
}

function readOptionalBooleanString(value: unknown): string | undefined {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : parsed ? "true" : "false";
}

function nullableNumber(value: unknown): number | null {
  if (value == null) {
    return null;
  }
  return optionalNumber(value) ?? null;
}

function stringifyInteger(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}
