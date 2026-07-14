import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { CrispActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "crisp";
const crispApiBaseUrl = "https://api.crisp.chat/v1";
const crispFetch = createProviderFetch({ skipDnsValidation: true });

type CrispRequestPhase = "validate" | "execute";
type CrispTokenTier = "website" | "plugin";
type CrispActionHandler = (input: Record<string, unknown>, context: CrispContext) => Promise<unknown>;

interface CrispCredential {
  tokenIdentifier: string;
  tokenKey: string;
  websiteId: string;
  tokenTier: CrispTokenTier;
}

interface CrispContext extends CrispCredential {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface CrispEnvelope {
  reason?: string;
  data: unknown;
}

export const crispActionHandlers: Record<CrispActionName, CrispActionHandler> = {
  async get_website(_input, context) {
    return {
      website: normalizeCrispWebsite(await crispGetData(buildWebsitePath(context.websiteId), context), context),
    };
  },
  async list_conversations(input, context) {
    const data = await crispGetData(buildListConversationsPath(input, context.websiteId), context);
    return {
      conversations: readArray(data).map((conversation) => normalizeCrispConversation(conversation)),
    };
  },
  async get_conversation(input, context) {
    const data = await crispGetData(
      `/website/${encodeURIComponent(context.websiteId)}/conversation/${encodeURIComponent(
        requiredString(input.sessionId, "sessionId", providerInputError),
      )}`,
      context,
    );
    return {
      conversation: normalizeCrispConversation(data),
    };
  },
  async list_conversation_messages(input, context) {
    const data = await crispGetData(buildListMessagesPath(input, context.websiteId), context);
    return {
      messages: readArray(data).map((message) => normalizeCrispMessage(message)),
    };
  },
  async send_text_message(input, context) {
    const payload = await crispPostEnvelope(
      `/website/${encodeURIComponent(context.websiteId)}/conversation/${encodeURIComponent(
        requiredString(input.sessionId, "sessionId", providerInputError),
      )}/message`,
      {
        type: "text",
        from: "operator",
        origin: optionalString(input.origin) ?? "chat",
        content: requiredString(input.content, "content", providerInputError),
      },
      context,
    );
    const data = optionalRecord(payload.data) ?? {};
    return compactObject({
      reason: payload.reason ?? "dispatched",
      fingerprint: optionalNumber(data.fingerprint),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<CrispContext>({
  service,
  handlers: crispActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CrispContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      ...readCrispCredential({
        apiKey: credential.apiKey,
        values: credential.values,
        metadata: credential.metadata,
      }),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const crispCredential = readCrispCredential({
      apiKey: credential.apiKey,
      values: credential.values,
      metadata: credential.metadata,
    });
    const url = createProviderProxyUrl(crispApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);
    applyCrispAuthHeaders(headers, crispCredential);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await crispFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credential = readCrispCredential({
      apiKey: input.apiKey,
      values: input.values,
      metadata: {},
    });
    const context = {
      ...credential,
      fetcher,
      signal,
    };
    const data = await crispGetData(buildWebsitePath(credential.websiteId), context, "validate");
    const website = normalizeCrispWebsite(data, context);

    return {
      profile: {
        accountId: credential.websiteId,
        displayName: optionalString(website.name) ?? optionalString(website.domain) ?? credential.websiteId,
        grantedScopes: [],
      },
      metadata: compactObject({
        apiBaseUrl: crispApiBaseUrl,
        validationEndpoint: buildWebsitePath(credential.websiteId),
        websiteId: credential.websiteId,
        tokenTier: credential.tokenTier,
        websiteName: optionalString(website.name),
        websiteDomain: optionalString(website.domain),
      }),
    } satisfies CredentialValidationResult;
  },
};

function readCrispCredential(input: {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
}): CrispCredential {
  return {
    tokenIdentifier:
      optionalString(input.values.tokenIdentifier) ??
      requiredString(input.metadata.tokenIdentifier, "tokenIdentifier", providerInputError),
    tokenKey: requiredString(input.apiKey, "apiKey", providerInputError),
    websiteId:
      optionalString(input.values.websiteId) ??
      requiredString(input.metadata.websiteId, "websiteId", providerInputError),
    tokenTier: normalizeTokenTier(input.values.tokenTier ?? optionalString(input.metadata.tokenTier)),
  };
}

function normalizeTokenTier(value: string | undefined): CrispTokenTier {
  const normalized = value?.trim() || "website";
  if (normalized === "website" || normalized === "plugin") {
    return normalized;
  }
  throw providerInputError("tokenTier must be website or plugin");
}

function buildWebsitePath(websiteId: string): string {
  return `/website/${encodeURIComponent(websiteId)}`;
}

function buildListConversationsPath(input: Record<string, unknown>, websiteId: string): string {
  const path = `/website/${encodeURIComponent(websiteId)}/conversations/${optionalInteger(input.pageNumber) ?? 1}`;
  const query = new URLSearchParams();
  setQueryParam(query, "per_page", input.perPage);
  setQueryParam(query, "search_query", input.searchQuery);
  setBooleanQueryParam(query, "include_empty", input.includeEmpty);
  setBooleanQueryParam(query, "filter_unread", input.filterUnread);
  setBooleanQueryParam(query, "filter_resolved", input.filterResolved);
  setBooleanQueryParam(query, "filter_not_resolved", input.filterNotResolved);
  setBooleanQueryParam(query, "filter_assigned", input.filterAssigned);
  setBooleanQueryParam(query, "filter_unassigned", input.filterUnassigned);
  return appendQuery(path, query);
}

function buildListMessagesPath(input: Record<string, unknown>, websiteId: string): string {
  const path = `/website/${encodeURIComponent(websiteId)}/conversation/${encodeURIComponent(
    requiredString(input.sessionId, "sessionId", providerInputError),
  )}/messages`;
  const query = new URLSearchParams();
  setQueryParam(query, "timestamp_before", input.timestampBefore);
  setQueryParam(query, "timestamp_after", input.timestampAfter);
  setQueryParam(query, "timestamp_around", input.timestampAround);
  return appendQuery(path, query);
}

function setQueryParam(query: URLSearchParams, name: string, value: unknown): void {
  if (value != null && value !== "") {
    query.set(name, String(value));
  }
}

function setBooleanQueryParam(query: URLSearchParams, name: string, value: unknown): void {
  const parsed = optionalBoolean(value);
  if (parsed !== undefined) {
    query.set(name, parsed ? "1" : "0");
  }
}

function appendQuery(path: string, query: URLSearchParams): string {
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

async function crispGetData(
  path: string,
  context: CrispContext,
  phase: CrispRequestPhase = "execute",
): Promise<unknown> {
  return (await crispRequestEnvelope("GET", path, undefined, context, phase)).data;
}

async function crispPostEnvelope(path: string, body: unknown, context: CrispContext): Promise<CrispEnvelope> {
  return crispRequestEnvelope("POST", path, body, context, "execute");
}

async function crispRequestEnvelope(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  context: CrispContext,
  phase: CrispRequestPhase,
): Promise<CrispEnvelope> {
  let response: Response;
  let payload: unknown;
  try {
    const headers = new Headers({
      accept: "application/json",
      "user-agent": providerUserAgent,
    });
    applyCrispAuthHeaders(headers, context);
    const init: RequestInit = { method, headers, signal: context.signal };
    if (body !== undefined) {
      headers.set("content-type", "application/json");
      init.body = JSON.stringify(body);
    }
    response = await context.fetcher(new URL(`${crispApiBaseUrl}${path}`), init);
    payload = await readCrispPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      phase === "validate" ? 400 : 502,
      error instanceof Error ? `Crisp request failed: ${error.message}` : "Crisp request failed",
    );
  }

  if (!response.ok || readCrispErrorFlag(payload)) {
    throw createCrispError(response, payload, phase);
  }

  return readCrispEnvelope(payload);
}

function applyCrispAuthHeaders(headers: Headers, credential: CrispCredential): void {
  headers.set(
    "authorization",
    `Basic ${Buffer.from(`${credential.tokenIdentifier}:${credential.tokenKey}`).toString("base64")}`,
  );
  headers.set("x-crisp-tier", credential.tokenTier);
}

async function readCrispPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { reason: text };
  }
}

function readCrispEnvelope(payload: unknown): CrispEnvelope {
  const envelope = requireCrispResponseObject(payload, "Crisp response payload must be an object");
  return {
    reason: optionalString(envelope.reason),
    data: envelope.data,
  };
}

function readCrispErrorFlag(payload: unknown): boolean {
  return optionalRecord(payload)?.error === true;
}

function createCrispError(response: Response, payload: unknown, phase: CrispRequestPhase): ProviderRequestError {
  const message =
    optionalString(optionalRecord(payload)?.reason) ?? `Crisp request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status >= 400 && response.status < 500 ? 400 : 502, message, payload);
}

function readArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Crisp response data must be an array", value);
  }
  return value;
}

function normalizeCrispWebsite(value: unknown, context: Pick<CrispCredential, "websiteId">): Record<string, unknown> {
  const website = requireCrispResponseObject(value, "Crisp website response must be an object");
  return compactObject({
    websiteId: optionalString(website.website_id) ?? context.websiteId,
    name: optionalString(website.name),
    domain: optionalString(website.domain),
    logo: optionalString(website.logo) ?? null,
    verified: optionalBoolean(website.verified),
    institutional: optionalBoolean(website.institutional),
    raw: website,
  });
}

function normalizeCrispConversation(value: unknown): Record<string, unknown> {
  const conversation = requireCrispResponseObject(value, "Crisp conversation response must be an object");
  const meta = optionalRecord(conversation.meta);
  const visitor = compactObject({
    nickname: meta ? (optionalString(meta.nickname) ?? null) : undefined,
    email: meta ? (optionalString(meta.email) ?? null) : undefined,
  });
  const unread = normalizeUnread(conversation.unread);
  return compactObject({
    sessionId: optionalString(conversation.session_id),
    websiteId: optionalString(conversation.website_id),
    state: optionalString(conversation.state),
    status: optionalInteger(conversation.status),
    lastMessage: optionalString(conversation.last_message) ?? null,
    createdAt: optionalInteger(conversation.created_at),
    updatedAt: optionalInteger(conversation.updated_at),
    unread,
    visitor: Object.keys(visitor).length > 0 ? visitor : undefined,
    raw: conversation,
  });
}

function normalizeUnread(value: unknown): Record<string, unknown> | undefined {
  const unread = optionalRecord(value);
  if (!unread) {
    return undefined;
  }
  return compactObject({
    operator: optionalInteger(unread.operator),
    visitor: optionalInteger(unread.visitor),
  });
}

function normalizeCrispMessage(value: unknown): Record<string, unknown> {
  const message = requireCrispResponseObject(value, "Crisp message response must be an object");
  return compactObject({
    sessionId: optionalString(message.session_id),
    websiteId: optionalString(message.website_id),
    type: optionalString(message.type),
    from: optionalString(message.from),
    origin: optionalString(message.origin),
    content: message.content,
    fingerprint: optionalNumber(message.fingerprint),
    timestamp: optionalInteger(message.timestamp),
    user: normalizeMessageUser(message.user),
    raw: message,
  });
}

function normalizeMessageUser(value: unknown): Record<string, unknown> | undefined {
  const user = optionalRecord(value);
  if (!user) {
    return undefined;
  }
  const normalized = compactObject({
    userId: optionalString(user.user_id),
    nickname: optionalString(user.nickname),
  });
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function requireCrispResponseObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
