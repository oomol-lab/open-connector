import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "chatarmin";
const chatarminApiBaseUrl = "https://api.chatarmin.com/api/public";
const chatarminDefaultRequestTimeoutMs = 30_000;

type ChatarminRequestPhase = "validate" | "execute";
type ChatarminMethod = "GET" | "POST" | "PUT" | "DELETE";
type ChatarminContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ChatarminActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const chatarminActionHandlers: ProviderActionHandlers<"chatarmin", ChatarminActionHandler> = {
  list_contacts(input, context) {
    return listChatarminRecords("/contacts", input, context);
  },
  get_contact(input, context) {
    return readChatarminResource(
      `/contacts/${encodePathSegment(readRequiredString(input.contactId, "contactId"))}`,
      "contact",
      context,
    );
  },
  create_contact(input, context) {
    return writeChatarminResource("PUT", "/contacts", pickContactBody(input), "contact", context);
  },
  update_contact(input, context) {
    return writeChatarminResource(
      "POST",
      `/contacts/${encodePathSegment(readRequiredString(input.contactId, "contactId"))}`,
      pickContactBody(input),
      "contact",
      context,
    );
  },
  delete_contact(input, context) {
    return deleteChatarminResource(
      `/contacts/${encodePathSegment(readRequiredString(input.contactId, "contactId"))}`,
      context,
    );
  },
  send_message(input, context) {
    return writeChatarminResource(
      "POST",
      "/messages/send",
      pickBody(input, [
        "phone",
        "email",
        "contactId",
        "type",
        "text",
        "mediaUrl",
        "caption",
        "fileName",
        "templateName",
        "language",
        "components",
      ]),
      "message",
      context,
    );
  },
  list_campaigns(input, context) {
    return listChatarminRecords("/campaigns", input, context);
  },
  get_campaign(input, context) {
    return readChatarminResource(
      `/campaigns/${encodePathSegment(readRequiredString(input.campaignId, "campaignId"))}`,
      "campaign",
      context,
    );
  },
  list_flows(input, context) {
    return listChatarminRecords("/flows", input, context);
  },
  get_flow(input, context) {
    return readChatarminResource(
      `/flows/${encodePathSegment(readRequiredString(input.flowId, "flowId"))}`,
      "flow",
      context,
    );
  },
  get_flow_analytics(input, context) {
    return listChatarminRecords(
      `/flows/analytics/${encodePathSegment(readRequiredString(input.flowId, "flowId"))}`,
      input,
      context,
      ["page", "limit", "start", "end"],
    );
  },
  async get_flow_contact_analytics(input, context) {
    const payload = await chatarminRequestJson(
      {
        method: "POST",
        path: `/flows/analyticsv2/${encodePathSegment(readRequiredString(input.flowId, "flowId"))}`,
        body: pickBody(input, ["contactIds", "start", "end"]),
      },
      context,
      "execute",
    );
    const record = requireChatarminObject(payload);
    return { data: optionalRecord(record.data) ?? {} };
  },
  list_voucher_pools(input, context) {
    return listChatarminRecords("/voucher-pools", input, context);
  },
  get_voucher_pool(input, context) {
    return readChatarminResource(
      `/voucher-pools/${encodePathSegment(readRequiredString(input.poolId, "poolId"))}`,
      "voucherPool",
      context,
    );
  },
  create_voucher_pool(input, context) {
    return writeChatarminResource("POST", "/voucher-pools", pickVoucherPoolBody(input), "voucherPool", context);
  },
  update_voucher_pool(input, context) {
    return writeChatarminResource(
      "PUT",
      `/voucher-pools/${encodePathSegment(readRequiredString(input.poolId, "poolId"))}`,
      pickVoucherPoolBody(input),
      "voucherPool",
      context,
    );
  },
  async add_or_replace_voucher_codes(input, context) {
    const payload = await chatarminRequestJson(
      {
        method: "POST",
        path: `/voucher-pools/${encodePathSegment(readRequiredString(input.poolId, "poolId"))}/vouchers`,
        body: pickBody(input, ["codes", "replaceCode"]),
      },
      context,
      "execute",
    );
    const record = requireChatarminObject(payload);
    return {
      added: readOptionalArray(record.added),
      raw: record,
    };
  },
  remove_voucher_code(input, context) {
    return deleteChatarminResource(
      `/voucher-pools/${encodePathSegment(readRequiredString(input.poolId, "poolId"))}/vouchers/${encodePathSegment(readRequiredString(input.code, "code"))}`,
      context,
    );
  },
  delete_voucher_pool(input, context) {
    return deleteChatarminResource(
      `/voucher-pools/${encodePathSegment(readRequiredString(input.poolId, "poolId"))}`,
      context,
    );
  },
  async list_webhooks(_input, context) {
    const payload = await chatarminRequestJson({ method: "GET", path: "/webhooks" }, context, "execute");
    return { webhooks: readOptionalArray(payload) };
  },
  create_webhook(input, context) {
    return writeChatarminResource("PUT", "/webhooks", pickBody(input, ["url", "topic"]), "webhook", context);
  },
  update_webhook(input, context) {
    return writeChatarminResource(
      "POST",
      `/webhooks/${encodePathSegment(readRequiredString(input.webhookId, "webhookId"))}`,
      pickBody(input, ["url", "topic"]),
      "webhook",
      context,
    );
  },
  delete_webhook(input, context) {
    return deleteChatarminResource(
      `/webhooks/${encodePathSegment(readRequiredString(input.webhookId, "webhookId"))}`,
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, chatarminActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await chatarminRequestJson(
      {
        method: "GET",
        path: "/contacts",
        query: {
          page: "1",
          limit: "1",
        },
      },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const record = requireChatarminObject(payload);
    const pagination = optionalRecord(record.pagination);

    return {
      profile: {
        accountId: "chatarmin:api_key",
        displayName: "Chatarmin API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: chatarminApiBaseUrl,
        validationEndpoint: "/contacts",
        contactTotal: pagination?.total,
      }),
    };
  },
};

async function listChatarminRecords(
  path: string,
  input: Record<string, unknown>,
  context: ChatarminContext,
  queryFields = ["page", "limit", "search", "groupBy", "startDate", "endDate"],
): Promise<unknown> {
  const payload = await chatarminRequestJson(
    {
      method: "GET",
      path,
      query: pickQuery(input, queryFields),
    },
    context,
    "execute",
  );
  const record = requireChatarminObject(payload);
  return {
    data: readOptionalArray(record.data),
    pagination: optionalRecord(record.pagination) ?? null,
  };
}

async function readChatarminResource(
  path: string,
  fieldName: string,
  context: ChatarminContext,
): Promise<Record<string, unknown>> {
  const payload = await chatarminRequestJson({ method: "GET", path }, context, "execute");
  return { [fieldName]: requireChatarminObject(payload) };
}

async function writeChatarminResource(
  method: "POST" | "PUT",
  path: string,
  body: Record<string, unknown>,
  fieldName: string,
  context: ChatarminContext,
): Promise<Record<string, unknown>> {
  const payload = await chatarminRequestJson({ method, path, body }, context, "execute");
  return { [fieldName]: requireChatarminObject(payload) };
}

async function deleteChatarminResource(path: string, context: ChatarminContext): Promise<{ success: true }> {
  await chatarminRequestJson({ method: "DELETE", path }, context, "execute");
  return { success: true };
}

async function chatarminRequestJson(
  input: {
    method: ChatarminMethod;
    path: string;
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
  },
  context: ChatarminContext,
  phase: ChatarminRequestPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, chatarminDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(buildChatarminUrl(input.path, input.query), {
      method: input.method,
      headers: chatarminHeaders(context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readChatarminPayload(response);

    if (!response.ok) {
      throw createChatarminError(response.status, payload, phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Chatarmin request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Chatarmin request failed: ${error.message}` : "Chatarmin request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildChatarminUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${chatarminApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function chatarminHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readChatarminPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Chatarmin returned malformed JSON");
  }
}

function createChatarminError(status: number, payload: unknown, phase: ChatarminRequestPhase): ProviderRequestError {
  const message = extractChatarminErrorMessage(payload) ?? `Chatarmin request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && (status === 400 || status === 404 || status === 422)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractChatarminErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = Array.isArray(record.errors) ? record.errors : undefined;
  const firstError = errors?.find((item) => typeof item === "string");

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(firstError) ??
    undefined
  );
}

function requireChatarminObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Chatarmin returned an invalid payload");
  }
  return record;
}

function readOptionalArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickContactBody(input: Record<string, unknown>): Record<string, unknown> {
  return pickBody(input, ["phone", "email", "firstname", "lastname", "consent", "externalId", "properties"]);
}

function pickVoucherPoolBody(input: Record<string, unknown>): Record<string, unknown> {
  return pickBody(input, ["poolName", "vouchers", "reuseCodes", "reminder", "emptyOptions"]);
}

function pickBody(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }
  return body;
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]): Record<string, string | undefined> {
  const query: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "number" || typeof value === "string") {
      query[key] = String(value);
    }
  }
  return query;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
