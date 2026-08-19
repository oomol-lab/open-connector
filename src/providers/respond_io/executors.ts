import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

const service = "respond_io";
const apiBaseUrl = "https://api.respond.io/v2";
const requestTimeoutMs = 30_000;
const maxResponseBytes = 10 * 1024 * 1024;
const mutableContactFields = [
  "firstName",
  "lastName",
  "phone",
  "email",
  "language",
  "profilePic",
  "countryCode",
  "custom_fields",
];

type RespondIoPhase = "validate" | "execute";
type RespondIoMethod = "DELETE" | "GET" | "POST" | "PUT";

interface RespondIoRequest {
  path: string;
  method: RespondIoMethod;
  context: ApiKeyProviderContext;
  phase: RespondIoPhase;
  query?: Record<string, unknown>;
  body?: unknown;
}

type RespondIoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const respondIoActionHandlers: ProviderActionHandlers<"respond_io", RespondIoActionHandler> = {
  get_contact(input, context) {
    return requestContact(input, context, "GET");
  },
  create_contact(input, context) {
    return requestContact(input, context, "POST", pickContactFields(input));
  },
  update_contact(input, context) {
    assertHasMutableContactField(input);
    return requestContact(input, context, "PUT", pickContactFields(input));
  },
  delete_contact(input, context) {
    return requestContact(input, context, "DELETE");
  },
  create_or_update_contact(input, context) {
    return requestRespondIoJson({
      path: `/contact/create_or_update/${encodeContactIdentifier(input.identifier, true)}`,
      method: "POST",
      body: pickContactFields(input),
      context,
      phase: "execute",
    });
  },
  list_contacts(input, context) {
    return requestRespondIoJson({
      path: "/contact/list",
      method: "POST",
      query: pickPagination(input),
      body: compactObject({
        search: input.search,
        timezone: trimInputString(input.timezone, "timezone"),
        filter: input.filter,
      }),
      context,
      phase: "execute",
    });
  },
  add_contact_tags(input, context) {
    return requestRespondIoJson({
      path: `/contact/${encodeContactIdentifier(input.identifier, true)}/tag`,
      method: "POST",
      body: readTags(input.tags),
      context,
      phase: "execute",
    });
  },
  remove_contact_tags(input, context) {
    return requestRespondIoJson({
      path: `/contact/${encodeContactIdentifier(input.identifier, true)}/tag`,
      method: "DELETE",
      body: readTags(input.tags),
      context,
      phase: "execute",
    });
  },
  assign_conversation(input, context) {
    return requestRespondIoJson({
      path: `/contact/${encodeContactIdentifier(input.identifier, true)}/conversation/assignee`,
      method: "POST",
      body: { assignee: typeof input.assignee === "string" ? input.assignee.trim() : input.assignee },
      context,
      phase: "execute",
    });
  },
  update_conversation_status(input, context) {
    return requestRespondIoJson({
      path: `/contact/${encodeContactIdentifier(input.identifier, true)}/conversation/status`,
      method: "POST",
      body: compactObject({
        status: input.status,
        category: optionalTrimmedString(input.category),
        summary: optionalTrimmedString(input.summary),
      }),
      context,
      phase: "execute",
    });
  },
  create_comment(input, context) {
    return requestRespondIoJson({
      path: `/contact/${encodeContactIdentifier(input.identifier, true)}/comment`,
      method: "POST",
      body: { text: trimInputString(input.text, "text") },
      context,
      phase: "execute",
    });
  },
  list_users(input, context) {
    return requestRespondIoJson({
      path: "/space/user",
      method: "GET",
      query: pickPagination(input),
      context,
      phase: "execute",
    });
  },
  list_channels(input, context) {
    return requestRespondIoJson({
      path: "/space/channel",
      method: "GET",
      query: pickPagination(input),
      context,
      phase: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, respondIoActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
    if (!headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new ProviderRequestError(400, "apiKey is required");
    }
    const payload = await requestRespondIoJson({
      path: "/space/user",
      method: "GET",
      query: { limit: 1 },
      context: { apiKey, fetcher, signal },
      phase: "validate",
    });
    const record = optionalRecord(payload);
    if (!record || !Array.isArray(record.items) || !optionalRecord(record.pagination)) {
      throw new ProviderRequestError(502, "Respond.io returned an invalid user list");
    }
    return {
      profile: {
        accountId: `respond_io:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`,
        displayName: "Respond.io Workspace",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/space/user",
      },
    };
  },
};

function requestContact(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  method: RespondIoMethod,
  body?: unknown,
): Promise<unknown> {
  return requestRespondIoJson({
    path: `/contact/${encodeContactIdentifier(input.identifier, method !== "POST")}`,
    method,
    body,
    context,
    phase: "execute",
  });
}

async function requestRespondIoJson(input: RespondIoRequest): Promise<unknown> {
  const url = new URL(input.path.replace(/^\/+/, ""), `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value != null) {
      url.searchParams.set(key, String(value));
    }
  }
  const timeout = createProviderTimeout(input.context.signal, requestTimeoutMs);
  try {
    const response = await input.context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey.trim()}`,
        "user-agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw mapHttpError(response.status, readErrorMessage(payload), input.phase);
    }
    if (payload === undefined) {
      throw new ProviderRequestError(502, "Respond.io returned an empty response");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `Respond.io ${input.path} request timed out`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Respond.io ${input.path} request failed: ${error.message}`
        : `Respond.io ${input.path} request failed`,
    );
  } finally {
    timeout.cleanup();
  }
}

function pickContactFields(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    firstName: optionalTrimmedString(input.firstName),
    lastName: input.lastName,
    phone: input.phone,
    email: input.email,
    language: input.language,
    profilePic: input.profilePic,
    countryCode: input.countryCode,
    custom_fields: normalizeCustomFields(input.custom_fields),
  });
}

function normalizeCustomFields(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((item) => {
    const record = optionalRecord(item);
    return record ? { ...record, name: trimInputString(record.name, "custom_fields.name") } : item;
  });
}

function pickPagination(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({ limit: input.limit, cursorId: input.cursorId });
}

function encodeContactIdentifier(value: unknown, allowId: boolean): string {
  const identifier = trimInputString(value, "identifier");
  const separator = identifier.indexOf(":");
  const prefix = separator > 0 ? identifier.slice(0, separator) : "";
  const identifierValue = separator > 0 ? identifier.slice(separator + 1).trim() : "";
  const validStringPrefix = (prefix === "email" || prefix === "phone") && identifierValue.length > 0;
  const numericId = Number(identifierValue);
  const validId = allowId && prefix === "id" && Number.isInteger(numericId) && numericId > 0;
  if (!validStringPrefix && !validId) {
    throw new ProviderRequestError(
      400,
      allowId
        ? "identifier must use id:<number>, email:<address>, or phone:<number> format"
        : "identifier must use email:<address> or phone:<number> format",
    );
  }
  return `${prefix}:${encodeURIComponent(identifierValue)}`;
}

function assertHasMutableContactField(input: Record<string, unknown>): void {
  if (!mutableContactFields.some((field) => Object.hasOwn(input, field))) {
    throw new ProviderRequestError(400, "at least one contact field must be provided");
  }
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "tags must be an array");
  }
  return value.map((tag) => trimInputString(tag, "tags"));
}

function trimInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => {
    const normalized = message.endsWith(".") ? message.slice(0, -1) : message;
    return new ProviderRequestError(400, normalized);
  });
}

function optionalTrimmedString(value: unknown): string | undefined {
  return value === undefined ? undefined : optionalString(value);
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Respond.io response", maxResponseBytes);
  if (!text.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return undefined;
    }
    throw new ProviderRequestError(502, "Respond.io response was not valid JSON");
  }
}

function readErrorMessage(payload: unknown): string {
  const record = optionalRecord(payload);
  return (
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.code) ??
    "Respond.io request failed"
  );
}

function mapHttpError(status: number, message: string, phase: RespondIoPhase): ProviderRequestError {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}
