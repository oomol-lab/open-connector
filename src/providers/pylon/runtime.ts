import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const pylonApiBaseUrl = "https://api.usepylon.com";
const listIssuesMaxRangeMs = 30 * 24 * 60 * 60 * 1000;

type PylonPhase = "validate" | "execute";
type PylonQueryValue = string | number | boolean | undefined;
type PylonActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const pylonActionHandlers: ProviderActionHandlers<"pylon", PylonActionHandler> = {
  async get_me(_input, context) {
    const payload = await requestPylonJson({
      path: "/me",
      apiKey: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      request_id: readNullableString(payload.request_id),
      organization: readRequiredObject(payload.data, "Pylon organization"),
    };
  },

  async list_issues(input, context) {
    validateListIssuesRange(input);
    const payload = await requestPylonJson({
      path: "/issues",
      apiKey: context.apiKey,
      query: compactObject({
        start_time: readRequiredString(input.start_time, "start_time"),
        end_time: readRequiredString(input.end_time, "end_time"),
        cursor: readOptionalString(input.cursor),
        limit: readOptionalNumber(input.limit),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeListResponse(payload, "issues");
  },

  async get_issue(input, context) {
    const payload = await requestPylonJson({
      path: `/issues/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      apiKey: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeSingleResponse(payload, "issue", "Pylon issue");
  },

  async create_issue(input, context) {
    const payload = await requestPylonJson({
      path: "/issues",
      apiKey: context.apiKey,
      method: "POST",
      body: pickDefined(input, [
        "title",
        "body_html",
        "account_id",
        "requester_id",
        "requester_email",
        "requester_name",
        "requester_avatar_url",
        "user_id",
        "contact_id",
        "assignee_id",
        "team_id",
        "priority",
        "tags",
        "attachment_urls",
        "author_unverified",
        "created_at",
        "custom_fields",
        "destination_metadata",
      ]),
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeSingleResponse(payload, "issue", "Pylon issue");
  },

  async update_issue(input, context) {
    validateUpdateIssueInput(input);
    const payload = await requestPylonJson({
      path: `/issues/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      apiKey: context.apiKey,
      method: "PATCH",
      body: pickDefined(input, [
        "title",
        "state",
        "type",
        "account_id",
        "requester_id",
        "assignee_id",
        "team_id",
        "customer_portal_visible",
        "tags",
        "custom_fields",
      ]),
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeSingleResponse(payload, "issue", "Pylon issue");
  },

  async list_issue_messages(input, context) {
    const payload = await requestPylonJson({
      path: `/issues/${encodeURIComponent(readRequiredString(input.id, "id"))}/messages`,
      apiKey: context.apiKey,
      query: compactObject({
        cursor: readOptionalString(input.cursor),
        limit: readOptionalNumber(input.limit),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeListResponse(payload, "messages");
  },

  async create_issue_note(input, context) {
    const payload = await requestPylonJson({
      path: `/issues/${encodeURIComponent(readRequiredString(input.id, "id"))}/note`,
      apiKey: context.apiKey,
      method: "POST",
      body: pickDefined(input, ["body_html", "attachment_urls", "message_id", "thread_id", "thread_name", "user_id"]),
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeSingleResponse(payload, "note", "Pylon issue note");
  },

  async get_account(input, context) {
    const payload = await requestPylonJson({
      path: `/accounts/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      apiKey: context.apiKey,
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeSingleResponse(payload, "account", "Pylon account");
  },

  async search_accounts(input, context) {
    const payload = await requestPylonJson({
      path: "/accounts/search",
      apiKey: context.apiKey,
      method: "POST",
      body: pickDefined(input, ["filter", "search_text", "cursor", "limit"]),
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeListResponse(payload, "accounts");
  },

  async create_account(input, context) {
    const payload = await requestPylonJson({
      path: "/accounts",
      apiKey: context.apiKey,
      method: "POST",
      body: pickDefined(input, [
        "name",
        "account_type",
        "domains",
        "primary_domain",
        "external_ids",
        "tags",
        "owner_id",
        "logo_url",
        "custom_fields",
      ]),
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeSingleResponse(payload, "account", "Pylon account");
  },

  async get_contact(input, context) {
    const payload = await requestPylonJson({
      path: `/contacts/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      apiKey: context.apiKey,
      query: compactObject({
        cursor: readOptionalString(input.cursor),
        limit: readRequiredNumber(input.limit, "limit"),
      }),
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      ...normalizeSingleResponse(payload, "contact", "Pylon contact"),
      pagination: optionalRecord(payload.pagination) ?? null,
    };
  },

  async search_contacts(input, context) {
    const payload = await requestPylonJson({
      path: "/contacts/search",
      apiKey: context.apiKey,
      method: "POST",
      body: pickDefined(input, ["filter", "search_text", "cursor", "limit"]),
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeListResponse(payload, "contacts");
  },

  async create_contact(input, context) {
    const payload = await requestPylonJson({
      path: "/contacts",
      apiKey: context.apiKey,
      method: "POST",
      body: pickDefined(input, [
        "name",
        "email",
        "account_id",
        "account_external_id",
        "avatar_url",
        "external_ids",
        "phone_numbers",
        "primary_phone_number",
        "portal_role",
        "portal_role_id",
        "custom_fields",
      ]),
      query: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeSingleResponse(payload, "contact", "Pylon contact");
  },
};

export async function validatePylonCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = await requestPylonJson({
    path: "/me",
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
    query: {},
    fetcher,
    phase: "validate",
  });
  const organization = readRequiredObject(payload.data, "Pylon organization");
  const organizationId = readOptionalString(organization.id);
  const organizationName = readOptionalString(organization.name);

  return {
    profile: {
      accountId: organizationId ?? "pylon-api-token",
      displayName: organizationName ?? "Pylon API Token",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: pylonApiBaseUrl,
      validationEndpoint: "/me",
      organizationId,
      organizationName,
    }),
  };
}

function validateListIssuesRange(input: Record<string, unknown>): void {
  if (typeof input.start_time !== "string" || typeof input.end_time !== "string") {
    return;
  }
  const startTime = Date.parse(input.start_time);
  const endTime = Date.parse(input.end_time);
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return;
  }
  if (startTime > endTime) {
    throw new ProviderRequestError(400, "start_time must be earlier than or equal to end_time.");
  }
  if (endTime - startTime > listIssuesMaxRangeMs) {
    throw new ProviderRequestError(400, "The list_issues time range must not exceed 30 days.");
  }
}

function validateUpdateIssueInput(input: Record<string, unknown>): void {
  const hasMutableField = [
    "title",
    "state",
    "type",
    "account_id",
    "requester_id",
    "assignee_id",
    "team_id",
    "customer_portal_visible",
    "tags",
    "custom_fields",
  ].some((key) => input[key] !== undefined);
  if (!hasMutableField) {
    throw new ProviderRequestError(400, "At least one mutable issue field is required.");
  }
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pylon", pylonActionHandlers);

async function requestPylonJson(input: {
  path: string;
  apiKey: string;
  query: Record<string, PylonQueryValue>;
  fetcher: typeof fetch;
  phase: PylonPhase;
  method?: "GET" | "POST" | "PATCH";
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  try {
    const response = await input.fetcher(buildPylonUrl(input.path, input.query), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
    const payload = await readPylonPayload(response);

    if (!response.ok) {
      throw createPylonError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "Pylon returned an invalid payload");
    }
    return payloadRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pylon request failed: ${error.message}` : "Pylon request failed",
    );
  }
}

function buildPylonUrl(path: string, query: Record<string, PylonQueryValue>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${pylonApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readPylonPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Pylon returned a non-JSON response");
  }
}

function createPylonError(status: number, payload: unknown, phase: PylonPhase) {
  const message = readPylonErrorMessage(payload) ?? `Pylon request failed with status ${status}`;

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message);
}

function readPylonErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const messages = errors
      .map((item) => (typeof item === "string" ? item : undefined))
      .filter((item): item is string => Boolean(item));
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  return optionalString(record.error) ?? optionalString(record.message);
}

function normalizeSingleResponse(payload: Record<string, unknown>, key: string, fieldName: string) {
  return {
    request_id: readNullableString(payload.request_id),
    [key]: readRequiredObject(payload.data, fieldName),
  };
}

function normalizeListResponse(payload: Record<string, unknown>, key: string) {
  const data = payload.data;
  if (!Array.isArray(data)) {
    throw new ProviderRequestError(502, "Pylon returned an invalid list payload");
  }

  return {
    request_id: readNullableString(payload.request_id),
    pagination: optionalRecord(payload.pagination) ?? null,
    [key]: data.map((item) => readRequiredObject(item, `Pylon ${key} item`)),
  };
}

function pickDefined(input: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, input[key]] as const).filter(([, value]) => value !== undefined));
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = optionalString(value)?.trim();
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readOptionalString(value: unknown) {
  const text = optionalString(value)?.trim();
  return text || undefined;
}

function readNullableString(value: unknown) {
  return optionalString(value) ?? null;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readRequiredNumber(value: unknown, fieldName: string) {
  if (typeof value !== "number") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readRequiredObject(value: unknown, fieldName: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} was missing from the Pylon response`);
  }
  return record;
}
