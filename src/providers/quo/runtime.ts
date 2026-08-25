import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type QueryValue = string | number | readonly string[] | undefined;
type QuoActionContext = ApiKeyProviderContext;
type QuoActionHandler = (input: Record<string, unknown>, context: QuoActionContext) => Promise<unknown>;

export const quoApiBaseUrl = "https://api.openphone.com";

export const quoActionHandlers: ProviderActionHandlers<"quo", QuoActionHandler> = {
  list_phone_numbers(input, context) {
    return quoRequest(
      {
        path: "/v1/phone-numbers",
        query: compactObject({
          userId: readOptionalString(input.userId),
        }),
      },
      context,
    );
  },
  get_phone_number(input, context) {
    return quoRequest(
      {
        path: `/v1/phone-numbers/${encodePath(readRequiredString(input.phoneNumberId, "phoneNumberId"))}`,
      },
      context,
    );
  },
  list_users(input, context) {
    return quoRequest(
      {
        path: "/v1/users",
        query: compactObject({
          maxResults: readOptionalNumber(input.maxResults),
          pageToken: readOptionalString(input.pageToken),
        }),
      },
      context,
    );
  },
  get_user(input, context) {
    return quoRequest(
      {
        path: `/v1/users/${encodePath(readRequiredString(input.userId, "userId"))}`,
      },
      context,
    );
  },
  list_contacts(input, context) {
    return quoRequest(
      {
        path: "/v1/contacts",
        query: compactObject({
          externalIds: readOptionalStringArray(input.externalIds),
          sources: readOptionalStringArray(input.sources),
          maxResults: readOptionalNumber(input.maxResults),
          pageToken: readOptionalString(input.pageToken),
        }),
      },
      context,
    );
  },
  get_contact(input, context) {
    return quoRequest(
      {
        path: `/v1/contacts/${encodePath(readRequiredString(input.id, "id"))}`,
      },
      context,
    );
  },
  create_contact(input, context) {
    return quoRequest(
      {
        method: "POST",
        path: "/v1/contacts",
        body: input,
      },
      context,
    );
  },
  update_contact(input, context) {
    const { id: _id, ...body } = input;
    return quoRequest(
      {
        method: "PATCH",
        path: `/v1/contacts/${encodePath(readRequiredString(input.id, "id"))}`,
        body,
      },
      context,
    );
  },
  delete_contact(input, context) {
    return quoRequest(
      {
        method: "DELETE",
        path: `/v1/contacts/${encodePath(readRequiredString(input.id, "id"))}`,
      },
      context,
    );
  },
  list_messages(input, context) {
    return quoRequest(
      {
        path: "/v1/messages",
        query: compactObject({
          phoneNumberId: readRequiredString(input.phoneNumberId, "phoneNumberId"),
          participants: readStringArray(input.participants, "participants"),
          userId: readOptionalString(input.userId),
          createdAfter: readOptionalString(input.createdAfter),
          createdBefore: readOptionalString(input.createdBefore),
          maxResults: readOptionalNumber(input.maxResults),
          pageToken: readOptionalString(input.pageToken),
        }),
      },
      context,
    );
  },
  get_message(input, context) {
    return quoRequest(
      {
        path: `/v1/messages/${encodePath(readRequiredString(input.id, "id"))}`,
      },
      context,
    );
  },
  send_text_message(input, context) {
    return quoRequest(
      {
        method: "POST",
        path: "/v1/messages",
        body: input,
      },
      context,
    );
  },
};

export async function validateQuoCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await quoRequest(
    {
      path: "/v1/phone-numbers",
    },
    { apiKey, fetcher },
  );

  const payloadRecord = readRequiredRecord(payload, "payload");
  const firstPhoneNumber = readFirstRecord(payloadRecord.data);
  const providerAccountId = readOptionalString(firstPhoneNumber?.id) ?? hashCredential(apiKey);
  const accountLabel = readOptionalString(firstPhoneNumber?.number) ?? "Quo API Key";

  return {
    profile: { accountId: providerAccountId, displayName: accountLabel, grantedScopes: [] },
    metadata: {
      apiBaseUrl: quoApiBaseUrl,
      validationEndpoint: "/v1/phone-numbers",
      firstPhoneNumber,
    },
  };
}

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("quo", quoActionHandlers);

interface QuoRequestInput {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
}

async function quoRequest(input: QuoRequestInput, context: QuoActionContext) {
  const method = input.method ?? "GET";
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(buildQuoUrl(input), {
      method,
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        ...(input.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Quo request failed: ${error.message}` : "Quo request failed",
    );
  }

  if (!response.ok) {
    throw createQuoError(response.status, payload);
  }

  return normalizeQuoPayload(payload);
}

function buildQuoUrl(input: QuoRequestInput) {
  const url = new URL(input.path, quoApiBaseUrl);

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url;
}

function normalizeQuoPayload(payload: unknown) {
  if (payload === null && typeof payload !== "object") {
    return { data: null };
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload;
  }
  throw new ProviderRequestError(502, "Quo returned an invalid JSON payload");
}

function createQuoError(status: number, payload: unknown) {
  const message = extractErrorMessage(payload) ?? `Quo request failed with ${status || 500}`;

  if (status === 400 || status === 401 || status === 404) {
    return new ProviderRequestError(400, message);
  }

  if (status === 402 || status === 403) {
    return new ProviderRequestError(status, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message);
}

async function readJsonPayload(response: Response) {
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

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  return (
    readOptionalString(record.message) ?? readOptionalString(record.title) ?? readOptionalString(record.description)
  );
}

function readFirstRecord(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const [first] = value;
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return undefined;
  }
  return first as Record<string, unknown>;
}

function readRequiredRecord(value: unknown, fieldName: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `Quo returned invalid ${fieldName}`);
  }
  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string) {
  const stringValue = readOptionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return stringValue;
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function readStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => readRequiredString(item, fieldName));
}

function readOptionalStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => readRequiredString(item, "array item")) : undefined;
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function encodePath(value: string) {
  return encodeURIComponent(value);
}

function hashCredential(apiKey: string) {
  return `quo:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}
