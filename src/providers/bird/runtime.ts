import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BirdActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const birdApiBaseUrl: string = "https://api.bird.com";
const birdRequestTimeoutMs = 30_000;

type BirdRequestPhase = "validate" | "execute";
type BirdRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";
type BirdActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface BirdRequestInput {
  path: string;
  method?: BirdRequestMethod;
  query?: Record<string, string>;
  body?: unknown;
}

export const birdActionHandlers: Record<BirdActionName, BirdActionHandler> = {
  list_channels(input, context) {
    return listChannels(input, context);
  },
  get_channel(input, context) {
    return getChannel(input, context);
  },
  get_message(input, context) {
    return getMessage(input, context);
  },
  list_message_interactions(input, context) {
    return listMessageInteractions(input, context);
  },
  send_message(input, context) {
    return sendMessage(input, context);
  },
  send_batch_messages(input, context) {
    return sendBatchMessages(input, context);
  },
  list_contacts(input, context) {
    return listContacts(input, context);
  },
  get_contact(input, context) {
    return getContact(input, context);
  },
  search_contact_by_identifier(input, context) {
    return searchContactByIdentifier(input, context);
  },
  create_contact(input, context) {
    return createContact(input, context);
  },
  update_contact(input, context) {
    return updateContact(input, context);
  },
  delete_contact(input, context) {
    return deleteContact(input, context);
  },
};

export async function validateBirdCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await birdRequest(
    { apiKey, fetcher, signal },
    {
      path: "/workspaces",
      query: {
        limit: "1",
      },
    },
    "validate",
  );
  const response = requireObject(payload, "bird validateCredential returned no object");
  const workspaces = readOptionalArrayProperty(response, "results") ?? [];
  const firstWorkspace = optionalRecord(workspaces[0]);
  const workspaceId = optionalString(firstWorkspace?.id);
  const workspaceName = optionalString(firstWorkspace?.name);

  return {
    profile: {
      accountId: workspaceId,
      displayName: workspaceName ?? "Bird Access Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/workspaces",
      workspaceCount: workspaces.length,
      workspaceId,
      workspaceName,
    }),
  };
}

async function listChannels(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const payload = await birdRequest(
    context,
    {
      path: `/workspaces/${encodeURIComponent(workspaceId)}/channels`,
      query: buildListChannelsQuery(input),
    },
    "execute",
  );
  const response = requireObject(payload, "bird list_channels returned no object");

  return {
    channels: readArrayProperty(response, "results"),
    nextPageToken: optionalString(response.nextPageToken) ?? null,
    raw: response,
  };
}

async function getChannel(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const channelId = requireStringField(input, "channelId");
  const payload = await birdRequest(
    context,
    {
      path: `/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}`,
    },
    "execute",
  );

  return {
    channel: requireObject(payload, "bird get_channel returned no object"),
  };
}

async function getMessage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const channelId = requireStringField(input, "channelId");
  const messageId = requireStringField(input, "messageId");
  const payload = await birdRequest(
    context,
    {
      path: `/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`,
    },
    "execute",
  );

  return {
    message: requireObject(payload, "bird get_message returned no object"),
  };
}

async function listMessageInteractions(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const channelId = requireStringField(input, "channelId");
  const messageId = requireStringField(input, "messageId");
  const payload = await birdRequest(
    context,
    {
      path: `/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/interactions`,
    },
    "execute",
  );
  const response = requireObject(payload, "bird list_message_interactions returned no object");

  return {
    interactions: readArrayProperty(response, "results"),
    raw: response,
  };
}

async function sendMessage(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const channelId = requireStringField(input, "channelId");
  const message = requireObjectField(input, "message");
  validateMessageHasContent(message);
  const payload = await birdRequest(
    context,
    {
      method: "POST",
      path: `/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/messages`,
      body: message,
    },
    "execute",
  );
  const response = requireObject(payload, "bird send_message returned no object");

  return {
    messageId: optionalString(response.id) ?? null,
    message: response,
  };
}

async function sendBatchMessages(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const channelId = requireStringField(input, "channelId");
  const messages = readObjectArray(input.messages, "messages");
  for (const message of messages) {
    validateMessageHasContent(message);
  }

  const payload = await birdRequest(
    context,
    {
      method: "POST",
      path: `/workspaces/${encodeURIComponent(workspaceId)}/channels/${encodeURIComponent(channelId)}/batch/messages`,
      body: {
        messageRequests: messages,
      },
    },
    "execute",
  );
  const response = requireObject(payload, "bird send_batch_messages returned no object");

  return {
    batchId: optionalString(response.id) ?? null,
    messageIds: readMessageIds(response.messages),
    raw: response,
  };
}

async function listContacts(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const payload = await birdRequest(
    context,
    {
      path: `/workspaces/${encodeURIComponent(workspaceId)}/contacts`,
    },
    "execute",
  );
  const response = requireObject(payload, "bird list_contacts returned no object");

  return {
    contacts: readArrayProperty(response, "results"),
    raw: response,
  };
}

async function getContact(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const contactId = requireStringField(input, "contactId");
  const payload = await birdRequest(
    context,
    {
      path: `/workspaces/${encodeURIComponent(workspaceId)}/contacts/${encodeURIComponent(contactId)}`,
      query: buildGetContactQuery(input),
    },
    "execute",
  );

  return {
    contact: requireObject(payload, "bird get_contact returned no object"),
  };
}

async function searchContactByIdentifier(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const identifier = requireObjectField(input, "identifier");
  const payload = await birdRequest(
    context,
    {
      method: "POST",
      path: `/workspaces/${encodeURIComponent(workspaceId)}/contacts/search`,
      body: {
        identifier,
      },
    },
    "execute",
  );
  const response = requireObject(payload, "bird search_contact_by_identifier returned no object");

  return {
    contacts: readArrayProperty(response, "results"),
    raw: response,
  };
}

async function createContact(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const contact = requireObjectField(input, "contact");
  validateNonEmptyObject(contact, "contact");
  const payload = await birdRequest(
    context,
    {
      method: "POST",
      path: `/workspaces/${encodeURIComponent(workspaceId)}/contacts`,
      body: contact,
    },
    "execute",
  );

  return {
    contact: requireObject(payload, "bird create_contact returned no object"),
  };
}

async function updateContact(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const contactId = requireStringField(input, "contactId");
  const patch = requireObjectField(input, "patch");
  validateNonEmptyObject(patch, "patch");
  const payload = await birdRequest(
    context,
    {
      method: "PATCH",
      path: `/workspaces/${encodeURIComponent(workspaceId)}/contacts/${encodeURIComponent(contactId)}`,
      body: patch,
    },
    "execute",
  );

  return {
    contact: requireObject(payload, "bird update_contact returned no object"),
  };
}

async function deleteContact(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const workspaceId = requireStringField(input, "workspaceId");
  const contactId = requireStringField(input, "contactId");
  await birdRequest(
    context,
    {
      method: "DELETE",
      path: `/workspaces/${encodeURIComponent(workspaceId)}/contacts/${encodeURIComponent(contactId)}`,
    },
    "execute",
  );

  return {
    contactId,
    deleted: true,
  };
}

async function birdRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  request: BirdRequestInput,
  phase: BirdRequestPhase,
): Promise<unknown> {
  const url = new URL(request.path, birdApiBaseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    url.searchParams.append(key, value);
  }

  const timeout = createProviderTimeout(context.signal, birdRequestTimeoutMs);
  let response: Response;
  try {
    response = await context.fetcher(url, {
      method: request.method ?? "GET",
      headers: birdHeaders(context.apiKey, request.body !== undefined),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: timeout.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      error instanceof Error ? error.message : "bird request failed",
    );
  } finally {
    timeout.cleanup();
  }

  let payload: unknown;
  try {
    payload = await readBirdPayload(response);
  } catch (error) {
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "invalid bird response payload");
  }

  if (!response.ok) {
    throw createBirdError(response, payload, phase);
  }

  return payload;
}

function birdHeaders(apiKey: string, hasJsonBody: boolean): Headers {
  const headers = new Headers({
    accept: "application/json",
    authorization: `AccessKey ${apiKey}`,
    "user-agent": providerUserAgent,
  });
  if (hasJsonBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readBirdPayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBirdError(response: Response, payload: unknown, phase: BirdRequestPhase): ProviderRequestError {
  const message =
    extractBirdErrorMessage(payload) ?? response.statusText ?? `bird request failed with status ${response.status}`;

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status >= 500 ? response.status : 502, message, payload);
}

function extractBirdErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const object = optionalRecord(payload);
  return optionalString(object?.message) ?? optionalString(object?.error) ?? optionalString(object?.code);
}

function buildListChannelsQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  setOptionalQuery(query, "limit", input.limit);
  setOptionalQuery(query, "pageToken", input.pageToken);
  setOptionalQuery(query, "reverse", input.reverse);
  setOptionalQuery(query, "platform", input.platform);
  setOptionalQuery(query, "conferencial", input.conferencial);
  setOptionalQuery(query, "onlyMyChannels", input.onlyMyChannels);
  setOptionalQuery(query, "useCaseType", input.useCaseType);
  setOptionalQuery(query, "suite", input.suite);
  setOptionalQuery(query, "platformStatus", input.platformStatus, "status");
  setOptionalArrayQuery(query, "channelIds", input.channelIds);
  setOptionalArrayQuery(query, "resourceOwnerId", input.resourceOwnerIds);
  setOptionalArrayQuery(query, "resourceOwnerIdentifier", input.resourceOwnerIdentifiers);
  return query;
}

function buildGetContactQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  setOptionalQuery(query, "attribute", input.attribute);
  return query;
}

function setOptionalQuery(
  query: Record<string, string>,
  inputName: string,
  value: unknown,
  outputName = inputName,
): void {
  if (value != null && value !== "") {
    query[outputName] = String(value);
  }
}

function setOptionalArrayQuery(query: Record<string, string>, outputName: string, value: unknown): void {
  if (Array.isArray(value) && value.length > 0) {
    query[outputName] = value.map((item) => String(item)).join(",");
  }
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, message);
  }
  return object;
}

function requireObjectField(input: Record<string, unknown>, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(input[fieldName]);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return object;
}

function requireStringField(input: Record<string, unknown>, fieldName: string): string {
  const value = optionalString(input[fieldName]);
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readArrayProperty(input: Record<string, unknown>, fieldName: string): Array<Record<string, unknown>> {
  const value = input[fieldName];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `bird response missing ${fieldName} array`);
  }
  return value.map((item) => requireObject(item, `bird ${fieldName} item is not an object`));
}

function readOptionalArrayProperty(
  input: Record<string, unknown>,
  fieldName: string,
): Array<Record<string, unknown>> | undefined {
  const value = input[fieldName];
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => requireObject(item, `bird ${fieldName} item is not an object`));
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => requireObject(item, `${fieldName} item must be an object`));
}

function readMessageIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const object = optionalRecord(item);
    const id = optionalString(object?.id);
    return id ? [id] : [];
  });
}

function validateMessageHasContent(message: Record<string, unknown>): void {
  if (!optionalRecord(message.body) && !optionalRecord(message.template)) {
    throw new ProviderRequestError(400, "message must include body or template");
  }
}

function validateNonEmptyObject(input: Record<string, unknown>, fieldName: string): void {
  if (Object.keys(input).length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must include at least one field`);
  }
}
