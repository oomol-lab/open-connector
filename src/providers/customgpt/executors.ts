import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { CustomgptActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "customgpt";
const customgptApiBaseUrl = "https://app.customgpt.ai";

type CustomgptRequestPhase = "validate" | "execute";
type CustomgptActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type CustomgptActionHandler = (input: Record<string, unknown>, context: CustomgptActionContext) => Promise<unknown>;

export const customgptActionHandlers: Record<CustomgptActionName, CustomgptActionHandler> = {
  list_agents(input, context) {
    return executeListAgents(input, context);
  },
  get_agent(input, context) {
    return executeGetAgent(input, context);
  },
  list_conversations(input, context) {
    return executeListConversations(input, context);
  },
  create_conversation(input, context) {
    return executeCreateConversation(input, context);
  },
  send_message(input, context) {
    return executeSendMessage(input, context);
  },
  list_messages(input, context) {
    return executeListMessages(input, context);
  },
  list_documents(input, context) {
    return executeListDocuments(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, customgptActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: CustomgptActionContext = {
      apiKey: input.apiKey,
      fetcher,
      signal,
    };
    const payload = await customgptRequest({
      path: "/api/v1/user",
      context,
      phase: "validate",
    });
    const user = readObject(unwrapData(payload));

    return {
      profile: {
        accountId: String(optionalInteger(user.id) ?? optionalString(user.id) ?? "customgpt-api-key"),
        displayName: optionalString(user.email) ?? optionalString(user.name) ?? "CustomGPT API Key",
        grantedScopes: [],
      },
      metadata: compactObject({
        apiBaseUrl: customgptApiBaseUrl,
        userId: readOptionalInteger(user.id),
        userName: optionalString(user.name),
        email: optionalString(user.email),
        currentTeamId: readOptionalInteger(user.current_team_id),
      }),
    } satisfies CredentialValidationResult;
  },
};

async function executeListAgents(input: Record<string, unknown>, context: CustomgptActionContext): Promise<unknown> {
  const payload = await customgptRequest({
    path: "/api/v1/projects",
    query: pickQuery(input, ["page", "duration", "order", "orderBy", "width", "height", "name"]),
    context,
    phase: "execute",
  });
  const raw = readObject(unwrapData(payload));

  return {
    agents: readObjectArray(raw.data),
    pagination: normalizePagination(raw),
    raw,
  };
}

async function executeGetAgent(input: Record<string, unknown>, context: CustomgptActionContext): Promise<unknown> {
  const projectId = positiveInteger(input.projectId, "projectId", providerInputError);
  const payload = await customgptRequest({
    path: `/api/v1/projects/${projectId}`,
    query: pickQuery(input, ["width", "height"]),
    context,
    phase: "execute",
  });
  const agent = readObject(unwrapData(payload));

  return {
    agent,
    raw: agent,
  };
}

async function executeListConversations(
  input: Record<string, unknown>,
  context: CustomgptActionContext,
): Promise<unknown> {
  const projectId = positiveInteger(input.projectId, "projectId", providerInputError);
  const payload = await customgptRequest({
    path: `/api/v1/projects/${projectId}/conversations`,
    query: pickQuery(input, ["page", "order", "orderBy", "userFilter", "name", "lastUpdatedAfter"]),
    context,
    phase: "execute",
  });
  const raw = readObject(unwrapData(payload));

  return {
    conversations: readObjectArray(raw.data),
    pagination: normalizePagination(raw),
    raw,
  };
}

async function executeCreateConversation(
  input: Record<string, unknown>,
  context: CustomgptActionContext,
): Promise<unknown> {
  const projectId = positiveInteger(input.projectId, "projectId", providerInputError);
  const payload = await customgptRequest({
    path: `/api/v1/projects/${projectId}/conversations`,
    method: "POST",
    body: compactObject({
      name: optionalString(input.name),
    }),
    context,
    phase: "execute",
  });
  const conversation = readObject(unwrapData(payload));

  return {
    conversation,
    sessionId: readNullableString(conversation.session_id),
    raw: conversation,
  };
}

async function executeSendMessage(input: Record<string, unknown>, context: CustomgptActionContext): Promise<unknown> {
  const projectId = positiveInteger(input.projectId, "projectId", providerInputError);
  const sessionId = requiredString(input.sessionId, "sessionId", providerInputError);
  const payload = await customgptRequest({
    path: `/api/v1/projects/${projectId}/conversations/${encodeURIComponent(sessionId)}/messages`,
    method: "POST",
    query: compactObject({
      lang: optionalString(input.lang),
      external_id: optionalString(input.externalId),
    }),
    body: buildSendMessageFormData(input),
    context,
    phase: "execute",
  });
  const message = readObject(unwrapData(payload));

  return {
    message,
    messageId: readNullableInteger(message.id),
    response: readNullableString(message.openai_response),
    citations: message.citations ?? null,
    raw: message,
  };
}

async function executeListMessages(input: Record<string, unknown>, context: CustomgptActionContext): Promise<unknown> {
  const projectId = positiveInteger(input.projectId, "projectId", providerInputError);
  const sessionId = requiredString(input.sessionId, "sessionId", providerInputError);
  const payload = await customgptRequest({
    path: `/api/v1/projects/${projectId}/conversations/${encodeURIComponent(sessionId)}/messages`,
    query: compactObject({
      ...pickQuery(input, ["page", "order"]),
      includeInsights: optionalBoolean(input.includeInsights),
    }),
    context,
    phase: "execute",
  });
  const raw = readObject(unwrapData(payload));

  return {
    messages: readObjectArray(raw.data),
    pagination: normalizePagination(raw),
    raw,
  };
}

async function executeListDocuments(input: Record<string, unknown>, context: CustomgptActionContext): Promise<unknown> {
  const projectId = positiveInteger(input.projectId, "projectId", providerInputError);
  const payload = await customgptRequest({
    path: `/api/v1/projects/${projectId}/pages`,
    query: compactObject({
      page: readOptionalInteger(input.page),
      limit: readOptionalInteger(input.limit),
      order: optionalString(input.order),
      search: optionalString(input.search),
      crawl_status: optionalString(input.crawlStatus),
      index_status: optionalString(input.indexStatus),
    }),
    context,
    phase: "execute",
  });
  const raw = readObject(unwrapData(payload));
  const pages = readObject(raw.pages);

  return {
    project: readNullableObject(raw.project),
    documents: readObjectArray(pages.data),
    pagination: normalizePagination(pages),
    raw,
  };
}

async function customgptRequest(input: {
  path: string;
  context: CustomgptActionContext;
  phase: CustomgptRequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: Record<string, unknown> | FormData;
}): Promise<unknown> {
  const url = new URL(input.path, customgptApiBaseUrl);
  appendQuery(url, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: customgptHeaders(input.context.apiKey, input.body),
      body: input.body ? buildRequestBody(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readCustomgptPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `CustomGPT request failed: ${error.message}` : "CustomGPT request failed",
    );
  }

  if (!response.ok) {
    throw createCustomgptError(response, payload, input.phase);
  }

  return payload;
}

function customgptHeaders(apiKey: string, body?: Record<string, unknown> | FormData): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };

  if (body && !(body instanceof FormData)) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

function buildRequestBody(body: Record<string, unknown> | FormData): BodyInit {
  return body instanceof FormData ? body : JSON.stringify(body);
}

function appendQuery(url: URL, query: Record<string, unknown> | undefined): void {
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return compactObject(Object.fromEntries(keys.map((key) => [key, input[key]])));
}

async function readCustomgptPayload(response: Response): Promise<unknown> {
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

function createCustomgptError(
  response: Response,
  payload: unknown,
  phase: CustomgptRequestPhase,
): ProviderRequestError {
  const message = extractCustomgptErrorMessage(payload) ?? response.statusText ?? "CustomGPT request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if ([400, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractCustomgptErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }

  const root = optionalRecord(payload);
  if (!root) {
    return undefined;
  }
  return (
    optionalString(root.message) ??
    optionalString(readObject(root.data).message) ??
    optionalString(readObject(root.error).message)
  );
}

function unwrapData(payload: unknown): unknown {
  const root = optionalRecord(payload);
  if (!root || !("data" in root)) {
    return payload;
  }
  return root.data;
}

function readObject(value: unknown): Record<string, unknown> {
  return optionalRecord(value) ?? {};
}

function readNullableObject(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => readObject(item));
}

function normalizePagination(input: Record<string, unknown>): Record<string, unknown> {
  return {
    currentPage: readNullableInteger(input.current_page),
    lastPage: readNullableInteger(input.last_page),
    perPage: readNullableInteger(input.per_page),
    total: readNullableInteger(input.total),
    nextPageUrl: readNullableString(input.next_page_url),
    previousPageUrl: readNullableString(input.prev_page_url),
  };
}

function buildSendMessageFormData(input: Record<string, unknown>): FormData {
  const formData = new FormData();
  formData.append("prompt", requiredString(input.prompt, "prompt", providerInputError));
  appendOptionalFormString(formData, "custom_persona", input.customPersona);
  appendOptionalFormString(formData, "chatbot_model", input.chatbotModel);
  appendOptionalFormString(formData, "response_source", input.responseSource);
  appendOptionalFormString(formData, "custom_context", input.customContext);
  appendOptionalFormString(formData, "agent_capability", input.agentCapability);
  appendSourceLabels(formData, input.labels);

  const labelsExclusive = optionalBoolean(input.labelsExclusive);
  if (labelsExclusive !== undefined) {
    formData.append("labels_exclusive", String(labelsExclusive));
  }

  const actionOverrides = optionalRecord(input.actionOverrides);
  if (actionOverrides) {
    formData.append("action_overrides", JSON.stringify(actionOverrides));
  }

  return formData;
}

function appendSourceLabels(formData: FormData, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }
  for (const label of value) {
    const text = optionalString(label);
    if (text) {
      formData.append("labels[0][]", text);
    }
  }
}

function appendOptionalFormString(formData: FormData, key: string, value: unknown): void {
  const text = optionalString(value);
  if (text) {
    formData.append(key, text);
  }
}

function readOptionalInteger(value: unknown): number | undefined {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  return optionalInteger(value);
}

function readNullableInteger(value: unknown): number | null {
  return readOptionalInteger(value) ?? null;
}

function readNullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
