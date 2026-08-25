import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface AccountProfile {
  providerAccountId: string;
  accountLabel: string;
  providerMetadata: Record<string, unknown>;
}
import { mapSurveyMonkeyProviderScopes } from "./scopes.ts";

class ConnectorError extends ProviderRequestError {
  constructor(_code: string, message: string, status: number, cause?: unknown) {
    super(status, message, cause);
  }
}

const SurveyMonkeyError = ConnectorError;

const surveyMonkeyApiBaseUrls = [
  "https://api.surveymonkey.com",
  "https://api.eu.surveymonkey.com",
  "https://api.surveymonkey.ca",
] as const;

const surveyMonkeyDefaultRequestTimeoutMs = 30_000;
const surveyMonkeyValidationPath = "/v3/users/me";

type SurveyMonkeyRequestPhase = "validate" | "execute" | "trigger";
type SurveyMonkeyActionContext = {
  accessToken: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
};
type SurveyMonkeyActionHandler = (
  input: Record<string, unknown>,
  context: SurveyMonkeyActionContext,
) => Promise<unknown>;
type QueryValue = string | number | boolean | undefined;

export const surveyMonkeyActionHandlers: Record<string, SurveyMonkeyActionHandler> = {
  async get_current_user(_input, context) {
    return {
      user: requireObject(
        await requestSurveyMonkeyJson({
          ...context,
          path: surveyMonkeyValidationPath,
          method: "GET",
          phase: "execute",
        }),
        "SurveyMonkey user",
      ),
    };
  },

  async list_surveys(input, context) {
    return normalizePaginatedResult(
      await requestSurveyMonkeyJson({
        ...context,
        path: "/v3/surveys",
        method: "GET",
        phase: "execute",
        query: compactObject({
          page: readOptionalPositiveInteger(input.page, "page"),
          per_page: readOptionalPositiveInteger(input.perPage, "perPage"),
          title: readOptionalString(input.title),
          folder_id: readOptionalString(input.folderId),
          sort_by: readOptionalString(input.sortBy),
          sort_order: readOptionalString(input.sortOrder),
          start_modified_at: readOptionalString(input.startModifiedAt),
          end_modified_at: readOptionalString(input.endModifiedAt),
        }),
      }),
    );
  },

  async get_survey_details(input, context) {
    const surveyId = readRequiredString(input.surveyId, "surveyId");
    return {
      survey: requireObject(
        await requestSurveyMonkeyJson({
          ...context,
          path: `/v3/surveys/${encodeURIComponent(surveyId)}/details`,
          method: "GET",
          phase: "execute",
        }),
        "SurveyMonkey survey",
      ),
    };
  },

  async create_survey(input, context) {
    return {
      survey: requireObject(
        await requestSurveyMonkeyJson({
          ...context,
          path: "/v3/surveys",
          method: "POST",
          phase: "execute",
          body: compactObject({
            title: readRequiredString(input.title, "title"),
            nickname: readOptionalString(input.nickname),
            language: readOptionalString(input.language),
            folder_id: readOptionalString(input.folderId),
            footer: readOptionalBoolean(input.footer, "footer"),
          }),
        }),
        "SurveyMonkey survey",
      ),
    };
  },

  async list_survey_responses(input, context) {
    return listSurveyResponses(input, context, false);
  },

  async list_survey_response_details(input, context) {
    return listSurveyResponses(input, context, true);
  },

  async get_survey_response_details(input, context) {
    const surveyId = readRequiredString(input.surveyId, "surveyId");
    const responseId = readRequiredString(input.responseId, "responseId");
    return {
      response: requireObject(
        await requestSurveyMonkeyJson({
          ...context,
          path: `/v3/surveys/${encodeURIComponent(surveyId)}/responses/${encodeURIComponent(responseId)}/details`,
          method: "GET",
          phase: "execute",
        }),
        "SurveyMonkey response",
      ),
    };
  },

  async get_survey_rollups(input, context) {
    const surveyId = readRequiredString(input.surveyId, "surveyId");
    const collectorIds = readOptionalStringArray(input.collectorIds, "collectorIds");
    return normalizeSurveyRollups(
      await requestSurveyMonkeyJson({
        ...context,
        path: `/v3/surveys/${encodeURIComponent(surveyId)}/rollups`,
        method: "GET",
        phase: "execute",
        query: compactObject({
          collector_ids: collectorIds?.join(","),
          status: readOptionalString(input.status),
          start_created_at: readOptionalString(input.startCreatedAt),
          end_created_at: readOptionalString(input.endCreatedAt),
          start_modified_at: readOptionalString(input.startModifiedAt),
          end_modified_at: readOptionalString(input.endModifiedAt),
        }),
      }),
    );
  },

  async list_collectors(input, context) {
    const surveyId = readRequiredString(input.surveyId, "surveyId");
    return normalizePaginatedResult(
      await requestSurveyMonkeyJson({
        ...context,
        path: `/v3/surveys/${encodeURIComponent(surveyId)}/collectors`,
        method: "GET",
        phase: "execute",
        query: paginationQuery(input),
      }),
    );
  },

  async create_weblink_collector(input, context) {
    const surveyId = readRequiredString(input.surveyId, "surveyId");
    return {
      collector: requireObject(
        await requestSurveyMonkeyJson({
          ...context,
          path: `/v3/surveys/${encodeURIComponent(surveyId)}/collectors`,
          method: "POST",
          phase: "execute",
          body: compactObject({
            type: "weblink",
            name: readOptionalString(input.name),
          }),
        }),
        "SurveyMonkey collector",
      ),
    };
  },

  async list_contact_lists(input, context) {
    return normalizePaginatedResult(
      await requestSurveyMonkeyJson({
        ...context,
        path: "/v3/contact_lists",
        method: "GET",
        phase: "execute",
        query: paginationQuery(input),
      }),
    );
  },

  async create_contact_list(input, context) {
    const payload = await requestSurveyMonkeyJson({
      ...context,
      path: "/v3/contact_lists",
      method: "POST",
      phase: "execute",
      body: {
        name: readRequiredString(input.name, "name"),
      },
    });
    return {
      contactList: normalizeCreatedContactList(payload),
    };
  },

  async list_contacts(input, context) {
    return normalizePaginatedResult(
      await requestSurveyMonkeyJson({
        ...context,
        path: "/v3/contacts",
        method: "GET",
        phase: "execute",
        query: compactObject({
          ...paginationQuery(input),
          status: readOptionalString(input.status),
          sort_by: readOptionalString(input.sortBy),
          sort_order: readOptionalString(input.sortOrder),
          search: readOptionalString(input.search),
          search_by: readOptionalString(input.searchBy),
        }),
      }),
    );
  },

  async create_contact(input, context) {
    const email = readOptionalString(input.email);
    const phoneNumber = readOptionalString(input.phoneNumber);
    // schema 负责公开 action 输入校验；这里保留防御，避免直接调用 handler 时绕过业务约束。
    if (!email && !phoneNumber) {
      throw new ConnectorError("invalid_input", "at least one of email or phoneNumber is required", 400);
    }
    const payload = await requestSurveyMonkeyJson({
      ...context,
      path: "/v3/contacts",
      method: "POST",
      phase: "execute",
      body: compactObject({
        email,
        first_name: readOptionalString(input.firstName),
        last_name: readOptionalString(input.lastName),
        phone_number: phoneNumber,
        custom_fields: readOptionalStringRecord(input.customFields, "customFields"),
      }),
    });
    const record = requireObject(payload, "SurveyMonkey contact response");
    let contact: unknown = record;
    if (Array.isArray(record.data)) {
      [contact] = record.data;
      if (!contact) {
        throw new ConnectorError("provider_error", "SurveyMonkey contact response contains no contact", 502);
      }
    }
    return {
      contact: requireObject(contact, "SurveyMonkey contact"),
    };
  },
} satisfies Record<string, SurveyMonkeyActionHandler>;

export async function validateSurveyMonkeyCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const accessToken = input.apiKey?.trim();
  if (!accessToken) throw new SurveyMonkeyError("invalid_input", "apiKey is required", 400);
  const apiBaseUrl = normalizeSurveyMonkeyApiBaseUrl(input.apiBaseUrl);
  const user = requireObject(
    await requestSurveyMonkeyJson({
      accessToken,
      apiBaseUrl,
      path: surveyMonkeyValidationPath,
      method: "GET",
      fetcher,
      phase: "validate",
    }),
    "SurveyMonkey user",
  );
  const profile = buildSurveyMonkeyAccountProfile(user, apiBaseUrl);
  const grantedProviderScopes = readGrantedProviderScopes(user);
  return {
    profile: { accountId: profile.providerAccountId, displayName: profile.accountLabel },
    grantedScopes: mapSurveyMonkeyProviderScopes(grantedProviderScopes),
    metadata: profile.providerMetadata,
  };
}

function normalizeSurveyMonkeyApiBaseUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConnectorError("invalid_input", "SurveyMonkey apiBaseUrl is required", 400);
  }
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new ConnectorError("invalid_input", "SurveyMonkey apiBaseUrl must be a valid URL", 400);
  }
  const normalized = parsed.origin;
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new ConnectorError(
      "invalid_input",
      "SurveyMonkey apiBaseUrl must be an official API origin without a path",
      400,
    );
  }
  if (!(surveyMonkeyApiBaseUrls as readonly string[]).includes(normalized)) {
    throw new ConnectorError("invalid_input", "SurveyMonkey apiBaseUrl must be the US, EU, or Canada API origin", 400);
  }
  return normalized;
}

async function requestSurveyMonkeyJson(input: {
  accessToken: string;
  apiBaseUrl: string;
  path: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  fetcher: typeof fetch;
  phase: SurveyMonkeyRequestPhase;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
}) {
  const apiBaseUrl = normalizeSurveyMonkeyApiBaseUrl(input.apiBaseUrl);
  const url = new URL(input.path, `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(undefined, surveyMonkeyDefaultRequestTimeoutMs);
  try {
    const response = await input.fetcher(url, {
      method: input.method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.accessToken}`,
        "User-Agent": providerUserAgent,
        ...(input.body ? { "Content-Type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const raw = await response.text().catch(() => "");
    const payload = parseSurveyMonkeyPayload(raw);
    if (isSurveyMonkeyRevokedAccessPayload(payload)) {
      throw mapSurveyMonkeyRevokedAccessError(payload, input.phase);
    }
    if (!response.ok) {
      throw mapSurveyMonkeyError(response.status, payload, input.phase);
    }
    if (!raw.trim()) {
      return null;
    }
    if (payload === undefined) {
      throw new ConnectorError("provider_error", "SurveyMonkey returned invalid JSON", 502);
    }
    return payload;
  } catch (error) {
    if (error instanceof ConnectorError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ConnectorError("provider_error", "SurveyMonkey request timed out", 504);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ConnectorError("provider_error", `SurveyMonkey request failed: ${message}`, 502);
  } finally {
    timeout.cleanup();
  }
}

function listSurveyResponses(
  input: Record<string, unknown>,
  context: SurveyMonkeyActionContext,
  includeDetails: boolean,
) {
  const surveyId = readRequiredString(input.surveyId, "surveyId");
  return requestSurveyMonkeyJson({
    ...context,
    path: `/v3/surveys/${encodeURIComponent(surveyId)}/responses${includeDetails ? "/bulk" : ""}`,
    method: "GET",
    phase: "execute",
    query: compactObject({
      page: readOptionalPositiveInteger(input.page, "page"),
      per_page: readOptionalPositiveInteger(input.perPage, "perPage"),
      status: readOptionalString(input.status),
      start_created_at: readOptionalString(input.startCreatedAt),
      end_created_at: readOptionalString(input.endCreatedAt),
    }),
  }).then(normalizePaginatedResult);
}

function normalizePaginatedResult(payload: unknown) {
  const record = requireObject(payload, "SurveyMonkey paginated response");
  if (!Array.isArray(record.data)) {
    throw new ConnectorError("provider_error", "SurveyMonkey paginated response is missing data", 502);
  }
  return {
    items: record.data.map((item) => requireObject(item, "SurveyMonkey list item")),
    page: optionalInteger(record.page) ?? 1,
    perPage: optionalInteger(record.per_page) ?? record.data.length,
    total: optionalInteger(record.total) ?? record.data.length,
    links: optionalRecord(record.links) ?? {},
  };
}

function normalizeSurveyRollups(payload: unknown) {
  const record = requireObject(payload, "SurveyMonkey rollups response");
  const data = record.data;
  let items: unknown[];
  if (Array.isArray(data)) {
    items = data;
  } else {
    const dataRecord = optionalRecord(data);
    if (!dataRecord) {
      throw new ConnectorError("provider_error", "SurveyMonkey rollups response is missing data", 502);
    }
    // 兼容以 question id 为键、rollup 对象为值的响应形态。
    items = "id" in dataRecord || "summary" in dataRecord ? [dataRecord] : Object.values(dataRecord);
  }
  const rollups = items.map((item) => {
    const rollup = requireObject(item, "SurveyMonkey question rollup");
    if (rollup.summary === undefined || Array.isArray(rollup.summary)) {
      return rollup;
    }
    const summary = optionalRecord(rollup.summary);
    if (!summary) {
      throw new ConnectorError(
        "provider_error",
        "SurveyMonkey question rollup summary must be an object or array",
        502,
      );
    }
    return { ...rollup, summary: [summary] };
  });
  return { rollups };
}

function normalizeCreatedContactList(payload: unknown) {
  const record = requireObject(payload, "SurveyMonkey contact list response");
  if (Array.isArray(record.data)) {
    const [contactList] = record.data;
    if (!contactList) {
      throw new ConnectorError("provider_error", "SurveyMonkey contact list response contains no contact list", 502);
    }
    return requireObject(contactList, "SurveyMonkey contact list");
  }
  return requireObject(record.data ?? record, "SurveyMonkey contact list");
}

function readGrantedProviderScopes(user: Record<string, unknown>) {
  const scopes = optionalRecord(user.scopes);
  if (!scopes || !Array.isArray(scopes.granted)) {
    throw new ConnectorError("provider_error", "SurveyMonkey user response is missing scopes.granted", 502);
  }
  if (scopes.granted.some((scope) => typeof scope !== "string" || !scope.trim())) {
    throw new ConnectorError("provider_error", "SurveyMonkey user response contains invalid scopes.granted", 502);
  }
  return scopes.granted.map((scope) => (scope as string).trim());
}

function buildSurveyMonkeyAccountProfile(user: Record<string, unknown>, apiBaseUrl: string): AccountProfile {
  const id = readRequiredString(user.id, "SurveyMonkey user id");
  const firstName = readOptionalString(user.first_name);
  const lastName = readOptionalString(user.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  const label = fullName || readOptionalString(user.username) || readOptionalString(user.email) || `User ${id}`;
  return {
    providerAccountId: `survey_monkey:${id}`,
    accountLabel: label,
    providerMetadata: compactObject({
      apiBaseUrl,
      accountType: readOptionalString(user.account_type),
      language: readOptionalString(user.language),
      validationEndpoint: surveyMonkeyValidationPath,
    }),
  };
}

function paginationQuery(input: Record<string, unknown>) {
  return compactObject({
    page: readOptionalPositiveInteger(input.page, "page"),
    per_page: readOptionalPositiveInteger(input.perPage, "perPage"),
  });
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ConnectorError("invalid_input", `${fieldName} is required`, 400);
  }
  return value.trim();
}

function readOptionalString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ConnectorError("invalid_input", `${fieldName} must be a positive integer`, 400);
  }
  return value as number;
}

function readOptionalBoolean(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ConnectorError("invalid_input", `${fieldName} must be a boolean`, 400);
  }
  return value;
}

function readOptionalStringRecord(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  const record = optionalRecord(value);
  if (!record || Object.values(record).some((item) => typeof item !== "string")) {
    throw new ConnectorError("invalid_input", `${fieldName} must contain only string values`, 400);
  }
  return record as Record<string, string>;
}

function readOptionalStringArray(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new ConnectorError("invalid_input", `${fieldName} must be a non-empty array of non-empty strings`, 400);
  }
  return value.map((item) => item.trim());
}

function requireObject(value: unknown, fieldName: string) {
  try {
    return requiredRecord(value, fieldName);
  } catch {
    throw new ConnectorError("provider_error", `${fieldName} must be an object`, 502);
  }
}

function parseSurveyMonkeyPayload(raw: string) {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function mapSurveyMonkeyError(status: number, payload: unknown, phase: SurveyMonkeyRequestPhase) {
  const message = extractSurveyMonkeyErrorMessage(payload) ?? `SurveyMonkey request failed with status ${status}`;
  const errorId = extractSurveyMonkeyErrorId(payload);
  if (status === 429) {
    return new ConnectorError("rate_limited", message, 429);
  }
  if (status === 401) {
    return new ConnectorError(
      phase === "validate" ? "invalid_input" : "credential_expired",
      message,
      phase === "validate" ? 400 : 401,
    );
  }
  if (status === 403) {
    if (phase === "validate") {
      return new ConnectorError("invalid_input", message, 400);
    }
    if (errorId === "1014") return new ConnectorError("scope_missing", message, 403);
    if (errorId === "1017") return new ConnectorError("rate_limited", message, 429);
    if (errorId === "1018") return new ConnectorError("provider_error", message, 502);
    return new ConnectorError("policy_denied", message, 403);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ConnectorError("invalid_input", message, status === 422 ? 400 : status);
  }
  return new ConnectorError("provider_error", message, status >= 500 ? 502 : status);
}

function extractSurveyMonkeyErrorId(payload: unknown) {
  const record = optionalRecord(payload);
  const nested = optionalRecord(record?.error);
  const value = nested?.id;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return undefined;
}

function isSurveyMonkeyRevokedAccessPayload(payload: unknown) {
  const record = optionalRecord(payload);
  return record?.status === 1 && record.errmsg === "Client revoked access grant";
}

function mapSurveyMonkeyRevokedAccessError(payload: unknown, phase: SurveyMonkeyRequestPhase) {
  const message = extractSurveyMonkeyErrorMessage(payload) ?? "SurveyMonkey access was revoked";
  return new ConnectorError(
    phase === "validate" ? "invalid_input" : "credential_expired",
    message,
    phase === "validate" ? 400 : 401,
  );
}

function extractSurveyMonkeyErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  const nested = optionalRecord(record?.error);
  return (
    readOptionalString(nested?.message) ??
    readOptionalString(nested?.name) ??
    readOptionalString(record?.errmsg) ??
    readOptionalString(record?.message) ??
    readOptionalString(record?.error)
  );
}
