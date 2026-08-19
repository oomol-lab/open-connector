import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const mailercloudApiBaseUrl = "https://cloudapi.mailercloud.com/v1";

type MailercloudRequestPhase = "validate" | "execute";
type MailercloudActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface MailercloudRequestInput {
  apiKey: string;
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  phase: MailercloudRequestPhase;
  body?: unknown;
}

const mailercloudValidationPath = "/contact/property/search";
const createContactBodyKeys = [
  "email",
  "list_id",
  "first_name",
  "middle_name",
  "last_name",
  "phone",
  "city",
  "state",
  "country",
  "postal_code",
  "company_name",
  "job_title",
  "department",
  "industry",
  "salary",
  "lead_source",
  "contact_type",
  "tags",
  "custom_fields",
];

export const mailercloudActionHandlers: ProviderActionHandlers<"mailercloud", MailercloudActionHandler> = {
  create_contact(input, context) {
    return mailercloudRequest({
      apiKey: context.apiKey,
      path: "/contacts",
      method: "POST",
      body: pickDefined(input, createContactBodyKeys),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  create_list(input, context) {
    return mailercloudRequest({
      apiKey: context.apiKey,
      path: "/list",
      method: "POST",
      body: pickDefined(input, ["name", "list_type"]),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  list_contact_properties(input, context) {
    return mailercloudRequest({
      apiKey: context.apiKey,
      path: mailercloudValidationPath,
      method: "POST",
      body: pickDefined(input, ["page", "limit", "search", "type"]),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  create_contact_property(input, context) {
    return mailercloudRequest({
      apiKey: context.apiKey,
      path: "/contact/property",
      method: "POST",
      body: pickDefined(input, ["name", "type", "description"]),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  update_contact_property(input, context) {
    return mailercloudRequest({
      apiKey: context.apiKey,
      path: `/contact/property/${encodePathSegment(input.property_id)}`,
      method: "PATCH",
      body: pickDefined(input, ["name", "description"]),
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
  delete_contact_property(input, context) {
    return mailercloudRequest({
      apiKey: context.apiKey,
      path: `/contact/property/${encodePathSegment(input.property_id)}`,
      method: "DELETE",
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    });
  },
};

export async function validateMailercloudCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await mailercloudRequest({
    apiKey,
    path: mailercloudValidationPath,
    method: "POST",
    body: {
      page: 1,
      limit: 10,
    },
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "mailercloud",
      displayName: "Mailercloud API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: mailercloudApiBaseUrl,
      validationEndpoint: mailercloudValidationPath,
    },
  };
}

async function mailercloudRequest(input: MailercloudRequestInput): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(`${mailercloudApiBaseUrl}${input.path}`, {
      method: input.method,
      headers: mailercloudHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
    payload = await readMailercloudPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mailercloud request failed: ${error.message}` : "Mailercloud request failed",
    );
  }

  if (!response.ok) {
    throw createMailercloudError(response, payload, input.phase);
  }

  if (!optionalRecord(payload)) {
    throw new ProviderRequestError(502, "Mailercloud returned a non-object response", payload);
  }

  return payload;
}

function mailercloudHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: apiKey,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readMailercloudPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return { success: true };
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMailercloudError(
  response: Response,
  payload: unknown,
  phase: MailercloudRequestPhase,
): ProviderRequestError {
  const message =
    extractMailercloudErrorMessage(payload) ?? `Mailercloud request failed with status ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if ([400, 401, 403, 404, 405, 409, 422].includes(response.status)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractMailercloudErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "error", "detail"]) {
    const value = record[key];
    const message = optionalString(value);
    if (message) {
      return message;
    }
    const nested = optionalRecord(value);
    const nestedMessage = optionalString(nested?.message);
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  if (!Array.isArray(record.errors)) {
    return undefined;
  }

  for (const item of record.errors) {
    const message = optionalString(item);
    if (message) {
      return message;
    }
    const error = optionalRecord(item);
    const errorMessage = optionalString(error?.message);
    if (errorMessage) {
      return errorMessage;
    }
  }

  return undefined;
}

function pickDefined(input: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    if (input[key] !== undefined) {
      body[key] = input[key];
    }
  }
  return body;
}
