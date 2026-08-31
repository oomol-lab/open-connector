import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
} from "../provider-runtime.ts";

const mailblusterApiBaseUrl = "https://api.mailbluster.com";
const mailblusterDefaultRequestTimeoutMs = 30_000;

type MailblusterActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const mailblusterActionHandlers: ProviderActionHandlers<"mailbluster", MailblusterActionHandler> = {
  list_fields(_input, context) {
    return requestMailblusterJson({
      context,
      method: "GET",
      path: "/api/fields",
    });
  },
  create_lead(input, context) {
    return requestMailblusterJson({
      context,
      method: "POST",
      path: "/api/leads",
      body: createLeadBody(input),
    });
  },
  get_lead(input, context) {
    return requestMailblusterJson({
      context,
      method: "GET",
      path: `/api/leads/${encodeURIComponent(requiredInputString(input.lead_hash, "lead_hash"))}`,
    });
  },
  update_lead(input, context) {
    return requestMailblusterJson({
      context,
      method: "PUT",
      path: `/api/leads/${encodeURIComponent(requiredInputString(input.lead_hash, "lead_hash"))}`,
      body: updateLeadBody(input),
    });
  },
  delete_lead(input, context) {
    return requestMailblusterJson({
      context,
      method: "DELETE",
      path: `/api/leads/${encodeURIComponent(requiredInputString(input.lead_hash, "lead_hash"))}`,
    });
  },
};

export async function validateMailblusterCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMailblusterJson({
    context: { apiKey, fetcher, signal },
    method: "GET",
    path: "/api/fields",
  });
  const fields = readMailblusterFields(payload);
  const firstField = optionalRecord(fields[0]);

  return {
    profile: {
      accountId: "mailbluster:api-key",
      displayName: "MailBluster API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: mailblusterApiBaseUrl,
      validationEndpoint: "/api/fields",
      fieldCount: fields.length,
      firstFieldId: firstField?.id,
      firstFieldLabel: firstField ? optionalString(firstField.fieldLabel) : undefined,
    }),
  };
}

function createLeadBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
    email: optionalString(input.email),
    timezone: optionalString(input.timezone),
    ipAddress: optionalString(input.ipAddress),
    subscribed: optionalBoolean(input.subscribed),
    fields: optionalRecord(input.fields),
    meta: optionalRecord(input.meta),
    tags: readOptionalStringArray(input.tags),
    doubleOptIn: optionalBoolean(input.doubleOptIn),
    overrideExisting: optionalBoolean(input.overrideExisting),
  });
}

function updateLeadBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    firstName: optionalString(input.firstName),
    lastName: optionalString(input.lastName),
    email: optionalString(input.email),
    timezone: optionalString(input.timezone),
    ipAddress: optionalString(input.ipAddress),
    subscribed: optionalBoolean(input.subscribed),
    fields: optionalRecord(input.fields),
    meta: optionalRecord(input.meta),
    tags: readOptionalStringArray(input.tags),
    addTags: readOptionalStringArray(input.addTags),
    removeTags: readOptionalStringArray(input.removeTags),
  });
}

async function requestMailblusterJson(input: {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, `${mailblusterApiBaseUrl}/`);
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: input.context.apiKey,
    "user-agent": providerUserAgent,
  };
  if (input.body) {
    headers["content-type"] = "application/json";
  }
  const timeout = createProviderTimeout(input.context.signal, mailblusterDefaultRequestTimeoutMs);

  let response: Response;
  try {
    response = await input.context.fetcher(url.toString(), {
      method: input.method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      timeout.didTimeout()
        ? `MailBluster request timed out after ${mailblusterDefaultRequestTimeoutMs}ms`
        : error instanceof Error
          ? `MailBluster request failed: ${error.message}`
          : "MailBluster request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readMailblusterPayload(response);
  if (!response.ok) {
    throw mapMailblusterError(response.status, readMailblusterMessage(payload, response.statusText));
  }

  return requireMailblusterObject(payload);
}

async function readMailblusterPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "MailBluster returned malformed JSON");
    }
    return { message: text };
  }
}

function requireMailblusterObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, "MailBluster returned an invalid JSON object");
}

function mapMailblusterError(status: number, message: string): ProviderRequestError {
  if (status === 401 || status === 403) {
    return new ProviderRequestError(400, message || "Invalid MailBluster API key");
  }
  if (status === 404) {
    return new ProviderRequestError(404, message || "MailBluster resource not found");
  }
  if (status === 429) {
    return new ProviderRequestError(429, message || "MailBluster rate limit exceeded");
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message || "MailBluster rejected the request");
  }

  return new ProviderRequestError(502, message || "MailBluster request failed");
}

function readMailblusterMessage(payload: unknown, fallback: string): string {
  const object = optionalRecord(payload);
  if (!object) {
    return fallback;
  }

  const directMessage = optionalString(object.message) ?? optionalString(object.error);
  if (directMessage) {
    return directMessage;
  }

  const nestedError = optionalRecord(object.error);
  return nestedError ? (optionalString(nestedError.message) ?? fallback) : fallback;
}

function readMailblusterFields(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.fields)) {
    return payload.fields;
  }

  throw new ProviderRequestError(502, "MailBluster /api/fields returned invalid fields");
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return stringArray(value, "string array input", (message) => new ProviderRequestError(400, message));
}
