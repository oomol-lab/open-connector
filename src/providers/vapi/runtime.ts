import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ApiKeyProviderContext,
  ProviderActionHandlers,
  ProviderActionName,
  ProviderActionSources,
  ProviderFetch,
} from "../provider-runtime.ts";

import {
  base64Bytes,
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { mapProviderActionSources, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const vapiApiBaseUrl = "https://api.vapi.ai";

type VapiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

type VapiResponseShape =
  | { type: "single"; key: string }
  | { type: "array"; key: string; candidates?: string[] }
  | { type: "paginated"; key: string; candidates?: string[] }
  | { type: "analytics" }
  | { type: "details" }
  | { type: "tool_test" };

interface VapiActionSpec {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  pathKeys?: string[];
  kind?: "json" | "multipart";
  response: VapiResponseShape;
  defaults?: Record<string, unknown>;
}

const vapiTimestampAliasMap = {
  created_at_ge: "createdAtGe",
  created_at_gt: "createdAtGt",
  created_at_le: "createdAtLe",
  created_at_lt: "createdAtLt",
  updated_at_ge: "updatedAtGe",
  updated_at_gt: "updatedAtGt",
  updated_at_le: "updatedAtLe",
  updated_at_lt: "updatedAtLt",
};

const vapiAssistantAliasMap = {
  server_url: "serverUrl",
  first_message: "firstMessage",
  hipaa_enabled: "hipaaEnabled",
  credential_ids: "credentialIds",
  client_messages: "clientMessages",
  server_messages: "serverMessages",
  background_sound: "backgroundSound",
  end_call_message: "endCallMessage",
  end_call_phrases: "endCallPhrases",
  server_url_secret: "serverUrlSecret",
  voicemail_message: "voicemailMessage",
  first_message_mode: "firstMessageMode",
  backchannel_enabled: "backchannelEnabled",
  max_duration_seconds: "maxDurationSeconds",
  response_delay_seconds: "responseDelaySeconds",
  silence_timeout_seconds: "silenceTimeoutSeconds",
  llm_request_delay_seconds: "llmRequestDelaySeconds",
  background_denoising_enabled: "backgroundDenoisingEnabled",
  model_output_in_messages_enabled: "modelOutputInMessagesEnabled",
  num_words_to_interrupt_assistant: "numWordsToInterruptAssistant",
};

const vapiListChatsAliasMap = {
  squad_id: "squadId",
  session_id: "sessionId",
  sort_order: "sortOrder",
  assistant_id: "assistantId",
  assistant_id_any: "assistantIdAny",
  previous_chat_id: "previousChatId",
  ...vapiTimestampAliasMap,
};

const vapiMonitoringAliasMap = {
  monitor_id: "monitorId",
  sort_order: "sortOrder",
  ...vapiTimestampAliasMap,
};

const vapiProviderResourceAliasMap = {
  resource_name: "resourceName",
  resource_id: "resourceId",
  sort_order: "sortOrder",
  ...vapiTimestampAliasMap,
};

const vapiPhoneNumberAliasMap = {
  sip_uri: "sipUri",
  squad_id: "squadId",
  sms_enabled: "smsEnabled",
  workflow_id: "workflowId",
  assistant_id: "assistantId",
  credential_id: "credentialId",
  twilio_api_key: "twilioApiKey",
  twilio_api_secret: "twilioApiSecret",
  twilio_auth_token: "twilioAuthToken",
  twilio_account_sid: "twilioAccountSid",
  number_desired_area_code: "numberDesiredAreaCode",
  number_e164_check_enabled: "numberE164CheckEnabled",
  fallback_destination: "fallbackDestination",
};

const vapiEvalListAliasMap = {
  sort_order: "sortOrder",
  ...vapiTimestampAliasMap,
};

const vapiActionSpecs: ProviderActionSources<"vapi", VapiActionSpec> = {
  list_assistants: { method: "GET", path: "/assistant", response: { type: "array", key: "assistants" } },
  create_assistant: { method: "POST", path: "/assistant", response: { type: "single", key: "assistant" } },
  get_assistant: {
    method: "GET",
    path: "/assistant/{id}",
    pathKeys: ["id"],
    response: { type: "single", key: "assistant" },
  },
  update_assistant: {
    method: "PATCH",
    path: "/assistant/{id}",
    pathKeys: ["id"],
    response: { type: "single", key: "assistant" },
  },
  list_calls: { method: "GET", path: "/call", response: { type: "array", key: "calls" } },
  get_call: { method: "GET", path: "/call/{id}", pathKeys: ["id"], response: { type: "single", key: "call" } },
  delete_call: { method: "DELETE", path: "/call/{id}", pathKeys: ["id"], response: { type: "single", key: "call" } },
  list_chats: {
    method: "GET",
    path: "/chat",
    response: { type: "paginated", key: "chats", candidates: ["chats", "results"] },
  },
  get_chat: { method: "GET", path: "/chat/{id}", pathKeys: ["id"], response: { type: "single", key: "chat" } },
  delete_chat: { method: "DELETE", path: "/chat/{id}", pathKeys: ["id"], response: { type: "single", key: "chat" } },
  create_openai_chat: { method: "POST", path: "/chat/responses", response: { type: "single", key: "response" } },
  create_analytics_query: { method: "POST", path: "/analytics", response: { type: "analytics" } },
  create_eval: { method: "POST", path: "/eval", response: { type: "single", key: "eval" } },
  get_eval: { method: "GET", path: "/eval/{id}", pathKeys: ["id"], response: { type: "single", key: "eval" } },
  update_eval: { method: "PATCH", path: "/eval/{id}", pathKeys: ["id"], response: { type: "single", key: "eval" } },
  delete_eval: { method: "DELETE", path: "/eval/{id}", pathKeys: ["id"], response: { type: "single", key: "eval" } },
  delete_eval_run: { method: "DELETE", path: "/eval/run/{id}", pathKeys: ["id"], response: { type: "details" } },
  list_evals: {
    method: "GET",
    path: "/eval",
    response: { type: "paginated", key: "evals", candidates: ["results", "evals"] },
  },
  get_file: { method: "GET", path: "/file/{id}", pathKeys: ["id"], response: { type: "single", key: "file" } },
  upload_file: { method: "POST", path: "/file", kind: "multipart", response: { type: "single", key: "file" } },
  list_monitoring_policies: {
    method: "GET",
    path: "/monitoring/policy",
    response: { type: "array", key: "policies", candidates: ["policies", "results"] },
  },
  create_policy: { method: "POST", path: "/monitoring/policy", response: { type: "single", key: "policy" } },
  list_provider_resources: {
    method: "GET",
    path: "/provider/{provider}/{resourceName}",
    pathKeys: ["provider", "resourceName"],
    response: { type: "paginated", key: "providerResources", candidates: ["results", "providerResources"] },
  },
  create_provider_resource: {
    method: "POST",
    path: "/provider/{provider}/{resourceName}",
    pathKeys: ["provider", "resourceName"],
    defaults: { provider: "11labs", resourceName: "pronunciation-dictionary" },
    response: { type: "single", key: "providerResource" },
  },
  list_phone_numbers: {
    method: "GET",
    path: "/phone-number",
    response: { type: "array", key: "phoneNumbers", candidates: ["phoneNumbers", "phone_numbers"] },
  },
  create_phone_number: { method: "POST", path: "/phone-number", response: { type: "single", key: "phoneNumber" } },
  update_phone_number: {
    method: "PATCH",
    path: "/phone-number/{id}",
    pathKeys: ["id"],
    response: { type: "single", key: "phoneNumber" },
  },
  delete_phone_number: {
    method: "DELETE",
    path: "/phone-number/{id}",
    pathKeys: ["id"],
    response: { type: "single", key: "phoneNumber" },
  },
  list_structured_outputs: {
    method: "GET",
    path: "/structured-output",
    response: { type: "paginated", key: "structuredOutputs", candidates: ["results", "structuredOutputs"] },
  },
  list_insights: {
    method: "GET",
    path: "/reporting/insight",
    response: { type: "paginated", key: "insights", candidates: ["results", "insights"] },
  },
  update_insight: {
    method: "PATCH",
    path: "/reporting/insight/{id}",
    pathKeys: ["id"],
    response: { type: "single", key: "insight" },
  },
  create_scorecard: {
    method: "POST",
    path: "/observability/scorecard",
    response: { type: "single", key: "scorecard" },
  },
  list_scorecards: {
    method: "GET",
    path: "/observability/scorecard",
    response: { type: "paginated", key: "scorecards", candidates: ["results", "scorecards"] },
  },
  create_session: { method: "POST", path: "/session", response: { type: "single", key: "session" } },
  list_sessions: {
    method: "GET",
    path: "/session",
    response: { type: "paginated", key: "sessions", candidates: ["results", "sessions"] },
  },
  get_tool: { method: "GET", path: "/tool/{id}", pathKeys: ["id"], response: { type: "single", key: "tool" } },
  update_tool: { method: "PATCH", path: "/tool/{id}", pathKeys: ["id"], response: { type: "single", key: "tool" } },
  test_code_tool_execution: { method: "POST", path: "/tool/test", response: { type: "tool_test" } },
};

export const vapiActionHandlers: ProviderActionHandlers<"vapi", VapiActionHandler> = mapProviderActionSources(
  "vapi",
  vapiActionSpecs,
  (actionName): VapiActionHandler =>
    (input, context) =>
      executeVapiActionByName(actionName, input, context),
);

export async function validateVapiCredential(
  apiKey: string,
  fetcher: ProviderFetch,
): Promise<CredentialValidationResult> {
  const payload = await vapiRequest(
    apiKey,
    {
      method: "GET",
      path: "/assistant",
      query: { limit: 1 },
      mode: "validate",
    },
    fetcher,
  );
  const assistants = extractArrayPayload(payload, ["assistants"]);
  const firstAssistant = optionalRecord(assistants[0]);
  const orgId = firstNonEmptyString(firstAssistant?.orgId, firstAssistant?.org_id);
  return {
    profile: {
      accountId: orgId ?? "vapi-api-key",
      displayName: "Vapi API Key",
      grantedScopes: [],
    },
    metadata: compactObject({
      validationEndpoint: "/assistant?limit=1",
      orgId,
      sampleAssistantId: firstNonEmptyString(firstAssistant?.id),
    }),
  };
}

async function executeVapiActionByName(
  actionName: ProviderActionName<"vapi">,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const spec = vapiActionSpecs[actionName];
  const normalizedInput = normalizeVapiActionInput(actionName, input);
  const requestInput = applyVapiActionDefaults(normalizedInput, spec.defaults);
  const request = buildVapiRequest(spec, requestInput);
  const payload =
    spec.kind === "multipart"
      ? await vapiRequest(
          context.apiKey,
          {
            method: spec.method,
            path: request.path,
            query: request.query,
            formData: await buildVapiMultipartFormData(request.body, context),
            mode: "execute",
          },
          context.fetcher,
        )
      : await vapiRequest(
          context.apiKey,
          {
            method: spec.method,
            path: request.path,
            query: request.query,
            body: actionName === "create_openai_chat" ? prepareOpenAiChatBody(request.body) : request.body,
            mode: "execute",
          },
          context.fetcher,
        );
  return normalizeVapiResponse(payload, spec.response);
}

function normalizeVapiActionInput(actionName: string, input: Record<string, unknown>): Record<string, unknown> {
  switch (actionName) {
    case "update_assistant":
      return applyAliases(input, vapiAssistantAliasMap);
    case "list_chats":
      return applyAliases(input, vapiListChatsAliasMap);
    case "list_monitoring_policies":
      return applyAliases(input, vapiMonitoringAliasMap);
    case "list_provider_resources":
      return applyAliases(input, vapiProviderResourceAliasMap);
    case "create_provider_resource":
      return applyAliases(input, { resource_name: "resourceName" });
    case "create_phone_number":
    case "update_phone_number":
      return applyAliases(input, vapiPhoneNumberAliasMap);
    case "list_evals":
      return applyAliases(input, vapiEvalListAliasMap);
    default:
      return { ...input };
  }
}

function applyVapiActionDefaults(
  input: Record<string, unknown>,
  defaults?: Record<string, unknown>,
): Record<string, unknown> {
  if (!defaults) return input;
  const merged = { ...input };
  for (const [key, value] of Object.entries(defaults)) {
    if (merged[key] === undefined) merged[key] = value;
  }
  return merged;
}

function applyAliases(input: Record<string, unknown>, aliases: Record<string, string>): Record<string, unknown> {
  const normalized = { ...input };
  for (const [sourceKey, targetKey] of Object.entries(aliases)) {
    if (normalized[targetKey] !== undefined || normalized[sourceKey] === undefined) continue;
    normalized[targetKey] = normalized[sourceKey];
    delete normalized[sourceKey];
  }
  return normalized;
}

function buildVapiRequest(
  spec: VapiActionSpec,
  input: Record<string, unknown>,
): { path: string; query?: Record<string, unknown>; body: Record<string, unknown> } {
  const remainingInput = { ...input };
  let path = spec.path;
  for (const pathKey of spec.pathKeys ?? []) {
    const value = remainingInput[pathKey];
    if (!value) throw new ProviderRequestError(400, `${pathKey} is required`);
    path = path.replace(`{${pathKey}}`, encodeURIComponent(String(value)));
    delete remainingInput[pathKey];
  }
  const query = spec.method === "GET" || spec.method === "DELETE" ? compactUndefined(remainingInput) : undefined;
  const body = spec.method === "GET" || spec.method === "DELETE" ? {} : compactUndefined(remainingInput);
  return { path, query, body };
}

function prepareOpenAiChatBody(input: Record<string, unknown>): Record<string, unknown> {
  if (input.stream === true) {
    throw new ProviderRequestError(400, "stream=true is not supported by the connector");
  }
  if (input.squad && input.squadId) {
    throw new ProviderRequestError(400, "squad and squadId cannot be used together");
  }
  if (input.assistant && input.assistantId) {
    throw new ProviderRequestError(400, "assistant and assistantId cannot be used together");
  }
  if (input.sessionId && input.previousChatId) {
    throw new ProviderRequestError(400, "sessionId and previousChatId cannot be used together");
  }
  return { ...input, stream: false };
}

async function buildVapiMultipartFormData(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
): Promise<FormData> {
  const formData = new FormData();
  const fileInput = optionalRecord(input.file);
  if (!fileInput) {
    throw new ProviderRequestError(400, "file is required");
  }
  const uploadSource = await resolveVapiUploadSource(fileInput, context);
  formData.append("file", new File([uploadSource.bytes], uploadSource.fileName, { type: uploadSource.mimeType }));
  const remainingInput = { ...input };
  delete remainingInput.file;
  for (const [key, value] of Object.entries(compactUndefined(remainingInput))) {
    formData.append(key, serializeMultipartValue(value));
  }
  return formData;
}

async function resolveVapiUploadSource(
  input: Record<string, unknown>,
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">,
): Promise<{ bytes: ArrayBuffer; fileName: string; mimeType: string }> {
  const fileName = firstNonEmptyString(input.name);
  const mimeType = firstNonEmptyString(input.mimetype) ?? "application/octet-stream";
  const fileUrl = firstNonEmptyString(input.url);
  const contentBase64 = firstNonEmptyString(input.contentBase64);
  if (!fileName) {
    throw new ProviderRequestError(400, "file.name is required");
  }
  if (!fileUrl && !contentBase64) {
    throw new ProviderRequestError(400, "file.url or file.contentBase64 is required");
  }
  if (fileUrl) {
    const url = assertPublicHttpUrl(fileUrl, {
      fieldName: "file.url",
      createError: (message) => new ProviderRequestError(400, message),
    });
    const response = await context.fetcher(url, { signal: context.signal });
    if (!response.ok) {
      throw new ProviderRequestError(response.status || 502, `failed to fetch upload source: ${response.status}`);
    }
    return {
      bytes: await response.arrayBuffer(),
      fileName,
      mimeType: response.headers.get("content-type") ?? mimeType,
    };
  }
  try {
    const bytes = base64Bytes(contentBase64, "file.contentBase64", (message) => new ProviderRequestError(400, message));
    return {
      bytes: bytes.buffer,
      fileName,
      mimeType,
    };
  } catch {
    throw new ProviderRequestError(400, "file.contentBase64 must be valid base64");
  }
}

async function vapiRequest(
  apiKey: string,
  input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
    formData?: FormData;
    mode: "validate" | "execute";
  },
  fetcher: ProviderFetch,
): Promise<unknown> {
  const url = new URL(input.path, vapiApiBaseUrl);
  appendQueryEntries(url, input.query);
  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: input.method,
      headers: input.formData != null ? vapiHeaders(apiKey, false) : vapiHeaders(apiKey, input.body != null),
      body:
        input.formData != null
          ? input.formData
          : input.body != null && Object.keys(input.body).length > 0
            ? JSON.stringify(input.body)
            : undefined,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `vapi request failed: ${error.message}` : "vapi request failed",
    );
  }
  if (!response.ok) {
    throw await normalizeVapiError(response, input.mode);
  }
  return readVapiResponse(response);
}

function vapiHeaders(apiKey: string, includeJsonContentType: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (includeJsonContentType) headers["content-type"] = "application/json";
  return headers;
}

async function normalizeVapiError(response: Response, mode: "validate" | "execute"): Promise<ProviderRequestError> {
  const payload = await readVapiResponse(response).catch(() => null);
  const message = readErrorMessage(payload) ?? `vapi request failed with status ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(response.status || 502, message);
}

async function readVapiResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return {};
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json() as Promise<unknown>;
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { text };
  }
}

function readErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const directMessage = firstNonEmptyString(record.message, record.error, record.details, record.text);
  if (directMessage) return directMessage;
  const nestedError = optionalRecord(record.error);
  return firstNonEmptyString(nestedError?.message, nestedError?.detail);
}

function normalizeVapiResponse(payload: unknown, responseShape: VapiResponseShape): unknown {
  switch (responseShape.type) {
    case "single":
      return { [responseShape.key]: extractSinglePayload(payload, responseShape.key) };
    case "array":
      return { [responseShape.key]: extractArrayPayload(payload, responseShape.candidates ?? [responseShape.key]) };
    case "paginated": {
      const record = optionalRecord(payload);
      return {
        [responseShape.key]: extractArrayPayload(payload, responseShape.candidates ?? [responseShape.key]),
        metadata: extractPaginationMetadata(record),
      };
    }
    case "analytics":
      return { results: extractArrayPayload(payload, ["results"]) };
    case "details": {
      const record = optionalRecord(payload);
      const details = optionalRecord(record?.details) ?? record ?? { value: payload };
      return { details };
    }
    case "tool_test": {
      const record = optionalRecord(payload) ?? {};
      return compactUndefined({
        success: optionalBoolean(record.success),
        result: record.result,
        error: firstNonEmptyString(record.error),
        logs: normalizeStringArray(record.logs),
        executionTimeMs: optionalNumber(record.executionTimeMs) ?? optionalNumber(record.execution_time_ms),
      });
    }
  }
}

function extractSinglePayload(payload: unknown, key: string): unknown {
  const record = optionalRecord(payload);
  if (!record) return payload;
  if (record[key] !== undefined) return record[key];
  const snakeKey = toSnakeCase(key);
  if (record[snakeKey] !== undefined) return record[snakeKey];
  const data = optionalRecord(record.data);
  if (data?.[key] !== undefined) return data[key];
  if (data?.[snakeKey] !== undefined) return data[snakeKey];
  return payload;
}

function extractArrayPayload(payload: unknown, candidates: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = optionalRecord(payload);
  if (!record) return [];
  for (const candidate of candidates) {
    const direct = record[candidate];
    if (Array.isArray(direct)) return direct;
    const snake = record[toSnakeCase(candidate)];
    if (Array.isArray(snake)) return snake;
  }
  const data = optionalRecord(record.data);
  if (data) {
    for (const candidate of candidates) {
      const direct = data[candidate];
      if (Array.isArray(direct)) return direct;
      const snake = data[toSnakeCase(candidate)];
      if (Array.isArray(snake)) return snake;
    }
  }
  return [];
}

function extractPaginationMetadata(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!payload) return {};
  const metadataRecord = optionalRecord(payload.metadata);
  const metadata = metadataRecord ? { ...metadataRecord } : {};
  return {
    ...compactUndefined({
      page: optionalInteger(payload.page),
      limit: optionalInteger(payload.limit),
      total: optionalInteger(payload.total),
    }),
    ...metadata,
  };
}

function appendQueryEntries(url: URL, entries?: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(entries ?? {})) {
    appendQueryValue(url, key, value);
  }
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendQueryValue(url, key, item);
    return;
  }
  if (typeof value === "object") {
    url.searchParams.append(key, JSON.stringify(value));
    return;
  }
  url.searchParams.append(key, String(value));
}

function compactUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return compactObject(value);
}

function serializeMultipartValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function normalizeStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`).replace(/^_/, "");
}
