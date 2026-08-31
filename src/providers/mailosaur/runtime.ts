import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import {
  compactObject,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
  recordOrEmpty,
} from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

export const mailosaurApiBaseUrl = "https://mailosaur.com";

type MailosaurRequestPhase = "validate" | "execute";
type MailosaurActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const mailosaurActionHandlers: ProviderActionHandlers<"mailosaur", MailosaurActionHandler> = {
  list_servers(_input, context) {
    return listServers(context);
  },
  get_server(input, context) {
    return getServer(input, context);
  },
  create_server(input, context) {
    return createServer(input, context);
  },
  update_server(input, context) {
    return updateServer(input, context);
  },
  delete_server(input, context) {
    return deleteServer(input, context);
  },
  list_messages(input, context) {
    return listMessages(input, context);
  },
  search_messages(input, context) {
    return searchMessages(input, context);
  },
  get_message(input, context) {
    return getMessage(input, context);
  },
  delete_message(input, context) {
    return deleteMessage(input, context);
  },
  delete_all_messages(input, context) {
    return deleteAllMessages(input, context);
  },
  get_usage_limits(_input, context) {
    return getUsageLimits(context);
  },
  list_usage_transactions(_input, context) {
    return listUsageTransactions(context);
  },
};

export async function validateMailosaurCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await mailosaurRequest(
    "/api/servers",
    { method: "GET" },
    { apiKey: requiredInputString(apiKey, "apiKey"), fetcher, signal },
    "validate",
  );
  const servers = normalizeArrayPayload(payload).map(normalizeServer);
  const firstServer = servers[0];

  return {
    profile: {
      accountId: firstServer?.id ? `mailosaur:server:${firstServer.id}` : "mailosaur-api-key",
      displayName: firstServer?.name ? `Mailosaur: ${firstServer.name}` : "Mailosaur API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: mailosaurApiBaseUrl,
      validationEndpoint: "/api/servers",
      serverCount: servers.length,
      firstServerId: firstServer?.id,
      firstServerName: firstServer?.name,
    }),
  };
}

async function listServers(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await mailosaurRequest("/api/servers", { method: "GET" }, context, "execute");
  return { servers: normalizeArrayPayload(payload).map(normalizeServer) };
}

async function getServer(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requiredInputString(input.id, "id");
  const payload = await mailosaurRequest(
    `/api/servers/${encodeURIComponent(id)}`,
    { method: "GET" },
    context,
    "execute",
  );
  return { server: normalizeServer(payload) };
}

async function createServer(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await mailosaurRequest(
    "/api/servers",
    {
      method: "POST",
      body: { name: requiredInputString(input.name, "name") },
    },
    context,
    "execute",
  );
  return { server: normalizeServer(payload) };
}

async function updateServer(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requiredInputString(input.id, "id");
  const payload = await mailosaurRequest(
    `/api/servers/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: { name: requiredInputString(input.name, "name") },
    },
    context,
    "execute",
  );
  return { server: normalizeServer(payload) };
}

async function deleteServer(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requiredInputString(input.id, "id");
  await mailosaurRequest(`/api/servers/${encodeURIComponent(id)}`, { method: "DELETE" }, context, "execute");
  return { deleted: true, id };
}

async function listMessages(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await mailosaurRequest(
    "/api/messages",
    {
      method: "GET",
      query: buildMessageQuery(input),
    },
    context,
    "execute",
  );
  return { messages: normalizeArrayPayload(payload).map(normalizeMessageSummary) };
}

async function searchMessages(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await mailosaurRequest(
    "/api/messages/search",
    {
      method: "POST",
      query: buildMessageQuery(input),
      body: compactObject({
        sentFrom: optionalString(input.sentFrom),
        sentTo: optionalString(input.sentTo),
        subject: optionalString(input.subject),
        body: optionalString(input.body),
        match: optionalString(input.match),
      }),
    },
    context,
    "execute",
  );
  return { messages: normalizeArrayPayload(payload).map(normalizeMessageSummary) };
}

async function getMessage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requiredInputString(input.id, "id");
  const payload = await mailosaurRequest(
    `/api/messages/${encodeURIComponent(id)}`,
    { method: "GET" },
    context,
    "execute",
  );
  return { message: normalizeMessage(payload) };
}

async function deleteMessage(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const id = requiredInputString(input.id, "id");
  await mailosaurRequest(`/api/messages/${encodeURIComponent(id)}`, { method: "DELETE" }, context, "execute");
  return { deleted: true, id };
}

async function deleteAllMessages(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const server = requiredInputString(input.server, "server");
  await mailosaurRequest("/api/messages", { method: "DELETE", query: { server } }, context, "execute");
  return { deleted: true, server };
}

async function getUsageLimits(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await mailosaurRequest("/api/usage/limits", { method: "GET" }, context, "execute");
  return { limits: recordOrEmpty(payload) };
}

async function listUsageTransactions(context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await mailosaurRequest("/api/usage/transactions", { method: "GET" }, context, "execute");
  return { transactions: normalizeArrayPayload(payload).map(normalizeUsageTransaction) };
}

async function mailosaurRequest(
  path: string,
  request: {
    method: string;
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
  },
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: MailosaurRequestPhase,
): Promise<unknown> {
  const url = new URL(path, mailosaurApiBaseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildMailosaurAuthorization(context.apiKey),
    "user-agent": providerUserAgent,
  };
  const init: RequestInit = {
    method: request.method,
    headers,
    signal: context.signal,
  };
  if (request.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(request.body);
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, init);
    payload = await readMailosaurPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mailosaur request failed: ${error.message}` : "Mailosaur request failed",
    );
  }

  if (!response.ok) {
    throw createMailosaurError(response, payload, phase);
  }
  return payload;
}

function buildMessageQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    server: requiredInputString(input.server, "server"),
    receivedAfter: optionalString(input.receivedAfter),
    page: optionalInteger(input.page),
    itemsPerPage: optionalInteger(input.itemsPerPage),
    dir: optionalString(input.dir),
  });
}

function normalizeArrayPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const object = recordOrEmpty(payload);
  return Array.isArray(object.items) ? object.items : [];
}

function normalizeServer(value: unknown): Record<string, unknown> {
  const object = recordOrEmpty(value);
  return {
    id: String(object.id ?? ""),
    name: String(object.name ?? ""),
    users: Array.isArray(object.users) ? object.users.map(recordOrEmpty) : [],
    messages: normalizeNonNegativeInteger(object.messages),
    raw: object,
  };
}

function normalizeMessageSummary(value: unknown): Record<string, unknown> {
  const object = recordOrEmpty(value);
  return {
    id: String(object.id ?? ""),
    received: readNullableString(object.received),
    type: readNullableString(object.type),
    subject: readNullableString(object.subject),
    from: normalizeContacts(object.from),
    to: normalizeContacts(object.to),
    cc: normalizeContacts(object.cc),
    bcc: normalizeContacts(object.bcc),
    raw: object,
  };
}

function normalizeMessage(value: unknown): Record<string, unknown> {
  const object = recordOrEmpty(value);
  return {
    ...normalizeMessageSummary(object),
    html: normalizeBody(object.html),
    text: normalizeBody(object.text),
    attachments: Array.isArray(object.attachments) ? object.attachments.map(normalizeAttachment) : [],
    server: readNullableString(object.server),
    raw: object,
  };
}

function normalizeContacts(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const object = recordOrEmpty(item);
    return {
      ...object,
      name: readNullableString(object.name),
      email: String(object.email ?? ""),
    };
  });
}

function normalizeBody(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  const object = recordOrEmpty(value);
  return {
    ...object,
    body: readNullableString(object.body),
    links: Array.isArray(object.links) ? object.links.map(normalizeLink) : [],
  };
}

function normalizeLink(value: unknown): Record<string, unknown> {
  const object = recordOrEmpty(value);
  return {
    ...object,
    href: String(object.href ?? ""),
    text: readNullableString(object.text),
  };
}

function normalizeAttachment(value: unknown): Record<string, unknown> {
  const object = recordOrEmpty(value);
  return {
    ...object,
    id: String(object.id ?? ""),
    fileName: readNullableString(object.fileName),
    contentType: readNullableString(object.contentType),
    length: readNullableNumber(object.length),
  };
}

function normalizeUsageTransaction(value: unknown): Record<string, unknown> {
  const object = recordOrEmpty(value);
  return {
    ...object,
    timestamp: String(object.timestamp ?? ""),
    email: normalizeNonNegativeInteger(object.email),
    sms: normalizeNonNegativeInteger(object.sms),
    previews: normalizeNonNegativeInteger(object.previews),
  };
}

async function readMailosaurPayload(response: Response): Promise<unknown> {
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

function createMailosaurError(
  response: Response,
  payload: unknown,
  phase: MailosaurRequestPhase,
): ProviderRequestError {
  const message = extractMailosaurErrorMessage(payload) ?? response.statusText;
  if (response.status === 401) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      message || "Mailosaur authentication failed",
      payload,
    );
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message || "Mailosaur rejected the request", payload);
  }
  return new ProviderRequestError(response.status || 502, message || "Mailosaur request failed", payload);
}

function extractMailosaurErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload;
  }
  const object = optionalRecord(payload);
  return optionalString(object?.message) ?? optionalString(object?.error);
}

function buildMailosaurAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`;
}

function readNullableString(value: unknown): string | null {
  return optionalString(value) ?? null;
}

function readNullableNumber(value: unknown): number | null {
  return optionalNumber(value) ?? null;
}

function normalizeNonNegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
