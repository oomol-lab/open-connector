import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "modjo_ai";
const modjoAiApiBaseUrl = "https://api.modjo.ai/v2";

type ModjoRequestMode = "validate" | "execute";
type ModjoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const modjoAiActionHandlers: ProviderActionHandlers<"modjo_ai", ModjoActionHandler> = {
  list_users(input, context) {
    return requestModjo("/users", context, { query: pickQuery(input, ["page", "size", "email"]) });
  },
  get_user(input, context) {
    return requestModjo(`/users/${encodePathNumber(input.id, "id")}`, context);
  },
  list_teams(input, context) {
    return requestModjo("/teams", context, { query: pickQuery(input, ["page", "size", "name"]) });
  },
  get_team(input, context) {
    return requestModjo(`/teams/${encodePathNumber(input.id, "id")}`, context);
  },
  list_team_members(input, context) {
    return requestModjo(`/teams/${encodePathNumber(input.id, "id")}/members`, context, {
      query: pickQuery(input, ["page", "size"]),
    });
  },
  list_accounts(input, context) {
    return requestModjo("/accounts", context, {
      query: pickQuery(input, ["page", "size", "name"]),
    });
  },
  get_account(input, context) {
    return requestModjo(`/accounts/${encodePathNumber(input.id, "id")}`, context);
  },
  list_contacts(input, context) {
    return requestModjo("/contacts", context, {
      query: pickQuery(input, ["page", "size", "name"]),
    });
  },
  get_contact(input, context) {
    return requestModjo(`/contacts/${encodePathNumber(input.id, "id")}`, context);
  },
  list_deals(input, context) {
    return requestModjo("/deals", context, {
      query: pickQuery(input, ["page", "size", "name", "account_id", "status"]),
    });
  },
  get_deal_summary(input, context) {
    return requestModjo(`/deals/${encodePathNumber(input.id, "id")}/summary`, context);
  },
  list_calls(input, context) {
    return requestModjo("/calls", context, {
      query: pickQuery(input, ["page", "size", "expand", "from", "to", "user_id", "deal_id", "account_id"]),
    });
  },
  get_call(input, context) {
    return requestModjo(`/calls/${encodePathString(input.id, "id")}`, context, {
      query: pickQuery(input, ["expand"]),
    });
  },
  get_call_transcript(input, context) {
    return requestModjo(`/calls/${encodePathString(input.id, "id")}/transcript`, context);
  },
  list_call_notes(input, context) {
    return requestModjo(`/calls/${encodePathString(input.id, "id")}/notes`, context);
  },
  list_call_summaries(input, context) {
    return requestModjo(`/calls/${encodePathString(input.id, "id")}/summaries`, context);
  },
  get_call_next_steps(input, context) {
    return requestModjo(`/calls/${encodePathString(input.id, "id")}/next-steps`, context);
  },
  list_call_tags(input, context) {
    return requestModjo(`/calls/${encodePathString(input.id, "id")}/tags`, context);
  },
  list_tags(input, context) {
    return requestModjo("/tags", context, { query: pickQuery(input, ["page", "size"]) });
  },
  list_topics(input, context) {
    return requestModjo("/topics", context, { query: pickQuery(input, ["page", "size"]) });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, modjoAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestModjo(
      "/users",
      { apiKey: input.apiKey, fetcher, signal },
      { mode: "validate", query: { size: "1" } },
    );
    const accountLabel = readValidationAccountLabel(payload);

    return {
      profile: {
        accountId: "api_key",
        displayName: accountLabel,
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: modjoAiApiBaseUrl,
        validationEndpoint: "/users",
        validationMode: "list_users",
        accountLabel,
      },
    };
  },
};

async function requestModjo(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  options: { mode?: ModjoRequestMode; query?: Record<string, string> } = {},
): Promise<Record<string, unknown>> {
  const url = modjoUrl(path, options.query);
  let response: Response;
  try {
    response = await context.fetcher(url.toString(), {
      method: "GET",
      headers: modjoHeaders(context.apiKey),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Modjo request failed: ${error instanceof Error ? error.message : "unknown transport error"}`,
    );
  }

  const payload = await readModjoPayload(response);
  if (!response.ok) {
    throw createModjoError(response, payload, options.mode ?? "execute");
  }

  return payload;
}

function modjoUrl(path: string, query?: Record<string, string>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${modjoAiApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function modjoHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readModjoPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Modjo returned malformed JSON");
    }
    return { message: text };
  }
}

function createModjoError(
  response: Response,
  payload: Record<string, unknown>,
  mode: ModjoRequestMode,
): ProviderRequestError {
  const message = readModjoErrorMessage(payload) ?? `Modjo request failed with ${response.status}`;
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}

function readModjoErrorMessage(payload: Record<string, unknown>): string | undefined {
  for (const key of ["message", "error", "detail"]) {
    const value = optionalString(payload[key]);
    if (value) {
      return value;
    }
  }

  const errors = payload.errors;
  if (Array.isArray(errors) && typeof errors[0] === "string") {
    return errors[0];
  }
  return undefined;
}

function pickQuery(input: Record<string, unknown>, keys: string[]): Record<string, string> {
  const query: Record<string, string> = {};
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null) {
      continue;
    }
    const queryValue = Array.isArray(value)
      ? value
          .map((item) => String(item).trim())
          .filter(Boolean)
          .join(",")
      : typeof value === "string"
        ? value.trim()
        : String(value);
    if (queryValue) {
      query[key] = queryValue;
    }
  }
  return query;
}

function encodePathNumber(value: unknown, fieldName: string): string {
  return encodeURIComponent(String(readPositiveInteger(value, fieldName)));
}

function encodePathString(value: unknown, fieldName: string): string {
  const stringValue = typeof value === "string" ? value.trim() : "";
  if (!stringValue) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return encodeURIComponent(stringValue);
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return numberValue;
}

function readValidationAccountLabel(payload: Record<string, unknown>): string {
  const data = payload.data;
  if (!Array.isArray(data)) {
    return "Modjo API Key";
  }

  const firstUser = data.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  if (!firstUser) {
    return "Modjo API Key";
  }

  const firstName = optionalString(firstUser.firstName);
  const lastName = optionalString(firstUser.lastName);
  const email = optionalString(firstUser.email);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || email || "Modjo API Key";
}
