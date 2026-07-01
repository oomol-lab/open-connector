import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { FeatheryActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString, stringArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "feathery";
const featheryApiBaseUrl = "https://api.feathery.io";
const featheryValidationPath = "/api/account/";
const featheryRequestTimeoutMs = 30_000;

type FeatheryRequestMode = "validate" | "execute";
type FeatheryRequestMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface FeatheryActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FeatheryRequestInput {
  path: string;
  apiKey: string;
  method: FeatheryRequestMethod;
  mode: FeatheryRequestMode;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
}

type FeatheryActionHandler = (input: Record<string, unknown>, context: FeatheryActionContext) => Promise<unknown>;

export const featheryActionHandlers: Record<FeatheryActionName, FeatheryActionHandler> = {
  async get_account_info(_input, context) {
    return {
      account: normalizeObjectPayload(
        await requestFeatheryJson(
          {
            path: "/api/account/",
            apiKey: context.apiKey,
            method: "GET",
            mode: "execute",
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async list_forms(input, context) {
    return {
      forms: normalizeArrayPayload(
        await requestFeatheryJson(
          {
            path: "/api/form/",
            apiKey: context.apiKey,
            method: "GET",
            mode: "execute",
            query: buildTagsQuery(input.tags),
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async get_form_schema(input, context) {
    return {
      schema: normalizeObjectPayload(
        await requestFeatheryJson(
          {
            path: `/api/form/${encodeURIComponent(readRequiredTrimmedString(input.form_id, "form_id"))}/schema/`,
            apiKey: context.apiKey,
            method: "GET",
            mode: "execute",
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async create_or_update_form_submissions(input, context) {
    return {
      result: normalizeObjectPayload(
        await requestFeatheryJson(
          {
            path: `/api/form/${encodeURIComponent(readRequiredTrimmedString(input.form_id, "form_id"))}/submission/`,
            apiKey: context.apiKey,
            method: "POST",
            mode: "execute",
            body: {
              submissions: input.submissions,
            },
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async list_hidden_fields(_input, context) {
    return {
      hiddenFields: normalizeArrayPayload(
        await requestFeatheryJson(
          {
            path: "/api/field/hidden/",
            apiKey: context.apiKey,
            method: "GET",
            mode: "execute",
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async create_hidden_field(input, context) {
    return {
      hiddenField: normalizeObjectPayload(
        await requestFeatheryJson(
          {
            path: "/api/field/hidden/",
            apiKey: context.apiKey,
            method: "POST",
            mode: "execute",
            body: {
              field_id: readRequiredTrimmedString(input.field_id, "field_id"),
            },
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async edit_hidden_field(input, context) {
    return {
      hiddenField: normalizeObjectPayload(
        await requestFeatheryJson(
          {
            path: `/api/field/hidden/${encodeURIComponent(readRequiredTrimmedString(input.field_id, "field_id"))}/`,
            apiKey: context.apiKey,
            method: "PATCH",
            mode: "execute",
            body: {
              field_id: readRequiredTrimmedString(input.new_field_id, "new_field_id"),
            },
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async delete_hidden_field(input, context) {
    const fieldId = readRequiredTrimmedString(input.field_id, "field_id");
    const raw = await requestFeatheryJson(
      {
        path: `/api/field/hidden/${encodeURIComponent(fieldId)}/`,
        apiKey: context.apiKey,
        method: "DELETE",
        mode: "execute",
        signal: context.signal,
      },
      context.fetcher,
    );
    return {
      deleted: true,
      field_id: fieldId,
      raw,
    };
  },
  async list_users(input, context) {
    validateListUsersInput(input);
    return {
      users: normalizeArrayPayload(
        await requestFeatheryJson(
          {
            path: "/api/user/",
            apiKey: context.apiKey,
            method: "GET",
            mode: "execute",
            query: compactObject({
              created_after: readOptionalTrimmedString(input.created_after),
              created_before: readOptionalTrimmedString(input.created_before),
              filter_field_id: readOptionalTrimmedString(input.filter_field_id),
              filter_field_value: readOptionalTrimmedString(input.filter_field_value),
            }),
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async get_user_data(input, context) {
    return {
      fields: normalizeArrayPayload(
        await requestFeatheryJson(
          {
            path: "/api/user/field/",
            apiKey: context.apiKey,
            method: "GET",
            mode: "execute",
            query: compactObject({
              id: readOptionalTrimmedString(input.id),
            }),
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async get_user_session(input, context) {
    return {
      session: normalizeObjectPayload(
        await requestFeatheryJson(
          {
            path: `/api/user/${encodeURIComponent(readRequiredTrimmedString(input.user_id, "user_id"))}/session/`,
            apiKey: context.apiKey,
            method: "GET",
            mode: "execute",
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async create_or_fetch_user(input, context) {
    return {
      user: normalizeObjectPayload(
        await requestFeatheryJson(
          {
            path: "/api/user/",
            apiKey: context.apiKey,
            method: "POST",
            mode: "execute",
            body: {
              id: readRequiredTrimmedString(input.id, "id"),
            },
            signal: context.signal,
          },
          context.fetcher,
        ),
      ),
    };
  },
  async delete_user(input, context) {
    const id = readRequiredTrimmedString(input.id, "id");
    const raw = await requestFeatheryJson(
      {
        path: `/api/user/${encodeURIComponent(id)}/`,
        apiKey: context.apiKey,
        method: "DELETE",
        mode: "execute",
        signal: context.signal,
      },
      context.fetcher,
    );
    return {
      deleted: true,
      id,
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, featheryActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const account = normalizeObjectPayload(
      await requestFeatheryJson(
        {
          path: featheryValidationPath,
          apiKey: input.apiKey,
          method: "GET",
          mode: "validate",
          signal,
        },
        fetcher,
      ),
    );

    const team = readOptionalTrimmedString(account.team);
    return {
      profile: {
        accountId: team ? `team:${team}` : "api_key",
        displayName: team ? `Feathery ${team}` : "Feathery API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: featheryApiBaseUrl,
        validationEndpoint: featheryValidationPath,
        team,
      }),
    };
  },
};

async function requestFeatheryJson(input: FeatheryRequestInput, fetcher: typeof fetch): Promise<unknown> {
  const url = new URL(input.path, featheryApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }

    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeoutSignal = AbortSignal.timeout(featheryRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
  try {
    const response = await fetcher(url.toString(), {
      method: input.method,
      headers: featheryHeaders(input.apiKey, input.body === undefined ? undefined : "json"),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });

    const payload = await readFeatheryPayload(response);
    assertFeatheryResponse(response, payload, input.mode);
    return payload;
  } catch (error) {
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "Feathery request timed out");
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Feathery request failed");
  }
}

function featheryHeaders(apiKey: string, bodyType?: "json"): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Token ${apiKey}`,
    "user-agent": providerUserAgent,
    ...(bodyType === "json" ? { "content-type": "application/json" } : {}),
  };
}

async function readFeatheryPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Feathery returned a non-JSON response");
  }
}

function assertFeatheryResponse(response: Response, payload: unknown, mode: FeatheryRequestMode): void {
  if (response.ok) {
    return;
  }

  const message = readFeatheryErrorMessage(payload) ?? response.statusText;
  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    throw new ProviderRequestError(400, message || "Invalid Feathery API key", payload);
  }
  if (response.status === 401 || response.status === 403) {
    throw new ProviderRequestError(response.status, message || "Feathery authorization failed", payload);
  }

  if (response.status >= 400 && response.status < 500) {
    throw new ProviderRequestError(400, message || "Feathery rejected the request", payload);
  }

  throw new ProviderRequestError(response.status || 502, message || "Feathery request failed", payload);
}

function readFeatheryErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  for (const key of ["error", "detail", "message"]) {
    const value = object[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  const errors = object.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim());
    return typeof first === "string" ? first.trim() : undefined;
  }

  return undefined;
}

function normalizeArrayPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.map((item) => optionalRecord(item) ?? {});
  }

  const object = optionalRecord(payload);
  if (!object) {
    return [];
  }

  for (const key of ["data", "results", "forms", "users", "fields", "hidden_fields"]) {
    const value = object[key];
    if (Array.isArray(value)) {
      return value.map((item) => optionalRecord(item) ?? {});
    }
  }

  return [];
}

function normalizeObjectPayload(payload: unknown): Record<string, unknown> {
  return optionalRecord(payload) ?? {};
}

function buildTagsQuery(value: unknown): Record<string, string[]> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = stringArray(value, "tags")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return tags.length > 0 ? { tags } : undefined;
}

function validateListUsersInput(input: Record<string, unknown>): void {
  if (readOptionalTrimmedString(input.filter_field_id) && !readOptionalTrimmedString(input.filter_field_value)) {
    throw new ProviderRequestError(400, "filter_field_value is required when filter_field_id is provided");
  }
}

function readOptionalTrimmedString(value: unknown): string | undefined {
  return optionalString(value);
}

function readRequiredTrimmedString(value: unknown, field: string): string {
  const trimmed = readOptionalTrimmedString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${field} is required`);
  }

  return trimmed;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) ||
    (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
  );
}
