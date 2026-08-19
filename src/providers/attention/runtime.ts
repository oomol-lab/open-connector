import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { compactObject } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const attentionApiBaseUrl = "https://api.attention.tech/v2";

type AttentionRequestPhase = "validate" | "execute";
type AttentionActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const attentionValidationPath = "/users";

export const attentionActionHandlers: ProviderActionHandlers<"attention", AttentionActionHandler> = {
  async list_conversations(input, context) {
    const payload = await attentionGetJson(
      "/conversations/list",
      buildListConversationsQuery(input),
      context,
      "execute",
    );
    return unwrapListPayload(payload, "conversations");
  },
  async get_conversation(input, context) {
    const id = readRequiredString(input, "id", "conversation ID");
    const payload = await attentionGetJson(
      `/conversations/${encodeURIComponent(id)}`,
      buildGetConversationQuery(input),
      context,
      "execute",
    );
    return { conversation: payload };
  },
  async list_users(input, context) {
    const payload = await attentionGetJson("/users", buildListUsersQuery(input), context, "execute");
    return unwrapListPayload(payload, "users");
  },
  async list_teams(_input, context) {
    const payload = await attentionGetJson("/organizations/teams", {}, context, "execute");
    return unwrapListPayload(payload, "teams");
  },
  async ask_attention(input, context) {
    const payload = await attentionPostJson(
      "/ask_attention/v2",
      buildAskAttentionQuery(input),
      buildAskAttentionBody(input),
      context,
    );
    return { answers: payload };
  },
};

export async function validateAttentionCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await attentionGetJson(attentionValidationPath, {}, { apiKey, fetcher, signal }, "validate");

  return {
    profile: {
      displayName: "Attention API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: attentionApiBaseUrl,
      validationEndpoint: attentionValidationPath,
      validationMode: "users_probe",
    },
  };
}

function buildListConversationsQuery(
  input: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  return compactObject({
    fromDateTime: optionalString(input.fromDateTime),
    toDateTime: optionalString(input.toDateTime),
    page: optionalInteger(input.page),
    size: optionalInteger(input.size),
    "filter[owner.id]": readOptionalStringArray(input.ownerIds)?.join(","),
    "filter[owner.email]": readOptionalStringArray(input.ownerEmails)?.join(","),
    "filter[title]": optionalString(input.title),
    "filter[participants.email]": readOptionalStringArray(input.participantEmails)?.join(","),
    "filter[external_opportunity.id]": readOptionalStringArray(input.externalOpportunityIds)?.join(","),
    "filter[crm_field.entity_code]": optionalString(input.crmFieldEntityCode),
    "filter[crm_field.field_name]": optionalString(input.crmFieldFieldName),
    "filter[crm_field.values]": readOptionalStringArray(input.crmFieldValues)?.join(","),
    "filter[team.id]": readOptionalStringArray(input.teamIds)?.join(","),
    "filter[hide_internal]": optionalBoolean(input.hideInternal),
    "filter[hide_non_analyzed]": optionalBoolean(input.hideNonAnalyzed),
    "filter[hide_pending]": optionalBoolean(input.hidePending),
    "filter[hide_transcript]": optionalBoolean(input.hideTranscript),
    "filter[hide_failed]": optionalBoolean(input.hideFailed),
    "filter[include_internal_participants]": optionalBoolean(input.includeInternalParticipants),
    "filter[include_zoom_metadata]": optionalBoolean(input.includeZoomMetadata),
    "filter[include_import_metadata]": optionalBoolean(input.includeImportMetadata),
    detailedTranscript: optionalBoolean(input.detailedTranscript),
    withCrmRecords: optionalBoolean(input.withCrmRecords),
    withIntelligenceItems: optionalBoolean(input.withIntelligenceItems),
  });
}

function buildGetConversationQuery(input: Record<string, unknown>): Record<string, string | boolean | undefined> {
  return compactObject({
    by: optionalString(input.by),
    "filter[include_internal_participants]": optionalBoolean(input.includeInternalParticipants),
    "filter[include_zoom_metadata]": optionalBoolean(input.includeZoomMetadata),
    "filter[include_import_metadata]": optionalBoolean(input.includeImportMetadata),
    detailedTranscript: optionalBoolean(input.detailedTranscript),
  });
}

function buildListUsersQuery(input: Record<string, unknown>): Record<string, string | boolean | undefined> {
  return compactObject({
    "filter[id]": readOptionalStringArray(input.ids)?.join(","),
    "filter[email]": readOptionalStringArray(input.emails)?.join(","),
    teamUUID: optionalString(input.teamUUID),
    includeDeleted: optionalBoolean(input.includeDeleted),
  });
}

function buildAskAttentionQuery(input: Record<string, unknown>): Record<string, boolean | undefined> {
  return compactObject({
    include_timestamps: optionalBoolean(input.includeTimestamps),
    summarize: optionalBoolean(input.summarize),
  });
}

function buildAskAttentionBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    conversations_ids: readOptionalStringArray(input.conversationIds) ?? [],
    deal_id: optionalString(input.dealId) ?? "",
    prompt: readRequiredString(input, "prompt", "prompt"),
  };
}

async function attentionGetJson(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  context: ApiKeyProviderContext,
  phase: AttentionRequestPhase,
): Promise<unknown> {
  return attentionRequestJson("GET", path, query, undefined, context, phase);
}

async function attentionPostJson(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return attentionRequestJson("POST", path, query, body, context, "execute");
}

async function attentionRequestJson(
  method: "GET" | "POST",
  path: string,
  query: Record<string, string | number | boolean | undefined>,
  body: Record<string, unknown> | undefined,
  context: ApiKeyProviderContext,
  phase: AttentionRequestPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(attentionUrl(path, query), {
      method,
      headers: attentionHeaders(context.apiKey, body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: context.signal,
    });
    payload = await readAttentionPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `attention request failed: ${error.message}` : "attention request failed",
    );
  }

  if (!response.ok) {
    throw createAttentionError(response, payload, phase);
  }

  return payload;
}

function attentionHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function attentionUrl(path: string, query: Record<string, string | number | boolean | undefined>): URL {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(`${attentionApiBaseUrl}/${relativePath}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readAttentionPayload(response: Response): Promise<unknown> {
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

function createAttentionError(
  response: Response,
  payload: unknown,
  phase: AttentionRequestPhase,
): ProviderRequestError {
  const message =
    extractAttentionErrorMessage(payload) ??
    response.statusText ??
    `attention request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractAttentionErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const detail = optionalString(record.detail);
  if (detail) {
    return detail;
  }
  const message = optionalString(record.message);
  if (message) {
    return message;
  }
  const title = optionalString(record.title);
  if (title) {
    return title;
  }
  const data = optionalRecord(record.data);
  return data ? (optionalString(data.message) ?? optionalString(data.detail)) : undefined;
}

function unwrapListPayload(payload: unknown, key: "conversations" | "users" | "teams"): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    return { [key]: undefined };
  }

  return compactObject({
    [key]: record.data,
    links: optionalRecord(record.links),
    meta: optionalRecord(record.meta),
  });
}

function readRequiredString(input: Record<string, unknown>, key: string, label: string): string {
  return requiredString(input[key], label, (message) => new ProviderRequestError(400, message));
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}
