import type { CredentialValidationResult, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "postmark";
const postmarkApiBaseUrl = "https://api.postmarkapp.com";
const validationPath = "/server";
const notFoundCodes = new Set([12, 701, 1001, 1101]);
const providerSide422Codes = new Set([405, 412, 413]);

type PostmarkActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const postmarkActionHandlers: Record<string, PostmarkActionHandler> = {
  get_server: (_input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({ path: validationPath, context, mode: "execute" }),
  send_email: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({
      path: "/email",
      method: "POST",
      body: compactObject({ ...input }),
      context,
      mode: "execute",
    }),
  send_email_with_template: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({
      path: "/email/withTemplate",
      method: "POST",
      body: compactObject({ ...input }),
      context,
      mode: "execute",
    }),
  send_batch_with_templates: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({
      path: "/email/batchWithTemplates",
      method: "POST",
      body: { Messages: input.Messages },
      context,
      mode: "execute",
    }),
  search_outbound_messages: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({
      path: "/messages/outbound",
      query: buildSearchOutboundMessagesQuery(input),
      context,
      mode: "execute",
    }),
  get_outbound_message_details: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({
      path: `/messages/outbound/${encodeURIComponent(requiredInputString(input.messageId, "messageId"))}/details`,
      context,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
  get_bounces: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({ path: "/bounces", query: buildBouncesQuery(input), context, mode: "execute" }),
  list_templates: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({ path: "/templates", query: buildTemplatesQuery(input), context, mode: "execute" }),
  get_template: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({
      path: `/templates/${encodeURIComponent(stringifyPathValue(input.templateIdOrAlias, "templateIdOrAlias"))}`,
      context,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
  create_template: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({
      path: "/templates",
      method: "POST",
      body: compactObject({ ...input }),
      context,
      mode: "execute",
    }),
  edit_template: (input: Record<string, unknown>, context: ApiKeyProviderContext) => editTemplate(input, context),
  validate_template: (input: Record<string, unknown>, context: ApiKeyProviderContext) =>
    requestPostmarkJson({
      path: "/templates/validate",
      method: "POST",
      body: compactObject({ ...input }),
      context,
      mode: "execute",
    }),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, postmarkActionHandlers);

export async function validatePostmarkCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const server = await requestPostmarkJson<Record<string, unknown>>({
    path: validationPath,
    context: { apiKey, fetcher },
    mode: "validate",
  });
  const serverId = optionalInteger(server.ID);
  const serverName = optionalString(server.Name);
  return {
    profile: {
      accountId: serverId !== undefined ? `postmark:server:${serverId}` : "postmark-server-token",
      displayName: serverName || "Postmark Server Token",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: validationPath,
      serverId,
      serverName,
      serverLink: optionalString(server.ServerLink),
      deliveryType: optionalString(server.DeliveryType),
    },
  };
}

async function editTemplate(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const body = { ...input };
  const templateIdOrAlias = stringifyPathValue(body.templateIdOrAlias, "templateIdOrAlias");
  delete body.templateIdOrAlias;
  return requestPostmarkJson({
    path: `/templates/${encodeURIComponent(templateIdOrAlias)}`,
    method: "PUT",
    body: compactObject(body),
    context,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function requestPostmarkJson<T = unknown>(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: "validate" | "execute";
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}): Promise<T> {
  const url = new URL(input.path, postmarkApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
        "x-postmark-server-token": input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Postmark request failed: ${error.message}` : "Postmark request failed",
    );
  }
  if (!response.ok) throw await toPostmarkError(response, input.mode, input.notFoundAsInvalidInput === true);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ProviderRequestError(502, "Postmark returned invalid JSON");
  }
}

async function toPostmarkError(
  response: Response,
  mode: "validate" | "execute",
  notFoundAsInvalidInput: boolean,
): Promise<ProviderRequestError> {
  const payload = await readPostmarkErrorPayload(response);
  const errorCode = optionalInteger(payload.ErrorCode);
  const message = optionalString(payload.Message) ?? `Postmark request failed with status ${response.status}`;
  if (response.status === 401 || errorCode === 10) return new ProviderRequestError(401, message, payload);
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (errorCode === 12) return new ProviderRequestError(400, message, payload);
  if (
    notFoundAsInvalidInput &&
    (response.status === 404 || (errorCode !== undefined && notFoundCodes.has(errorCode)))
  ) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 422)
    return new ProviderRequestError(
      errorCode !== undefined && providerSide422Codes.has(errorCode) ? 502 : 400,
      message,
      payload,
    );
  if (response.status === 415) return new ProviderRequestError(502, message, payload);
  return new ProviderRequestError(mode === "validate" ? 401 : response.status >= 500 ? 502 : 400, message, payload);
}

async function readPostmarkErrorPayload(response: Response): Promise<Record<string, unknown>> {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    return optionalRecord(JSON.parse(raw)) ?? { Message: raw };
  } catch {
    return { Message: raw };
  }
}

function buildSearchOutboundMessagesQuery(
  input: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  const metadataFilters = optionalRecord(input.metadata);
  return {
    ...compactObject({
      count: optionalInteger(input.count),
      offset: optionalInteger(input.offset),
      recipient: optionalString(input.recipient),
      fromemail: optionalString(input.fromemail),
      tag: optionalString(input.tag),
      status: optionalString(input.status),
      todate: optionalString(input.todate),
      fromdate: optionalString(input.fromdate),
      subject: optionalString(input.subject),
      messagestream: optionalString(input.messagestream),
    }),
    ...Object.fromEntries(
      Object.entries(metadataFilters ?? {}).flatMap(([key, value]) => {
        const stringValue = optionalString(value);
        return stringValue ? [[`metadata_${key}`, stringValue]] : [];
      }),
    ),
  };
}

function buildBouncesQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    count: optionalInteger(input.count),
    offset: optionalInteger(input.offset),
    type: optionalString(input.type),
    inactive: typeof input.inactive === "boolean" ? input.inactive : undefined,
    emailFilter: optionalString(input.emailFilter),
    messageID: optionalString(input.messageID),
    mailboxHash: optionalString(input.mailboxHash),
    tag: optionalString(input.tag),
    todate: optionalString(input.todate),
    fromdate: optionalString(input.fromdate),
  });
}

function buildTemplatesQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    count: optionalInteger(input.count),
    offset: optionalInteger(input.offset),
    TemplateType: optionalString(input.TemplateType),
    LayoutTemplate: optionalString(input.LayoutTemplate),
  });
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function stringifyPathValue(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return String(value);
  return requiredInputString(value, fieldName);
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.postmarkapp.com",
  auth: { type: "api_key_header", name: "x-postmark-server-token" },
});
