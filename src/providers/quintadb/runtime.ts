import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalRecord,
  optionalString,
  pickOptionalBoolean,
  pickOptionalInteger,
  pickOptionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const quintaDbApiBaseUrl = "https://quintadb.com";
const quintaDbValidationPath = "/apps.json";

export interface QuintaDbContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface QuintaDbRequestInput extends QuintaDbContext {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  phase: "validate" | "execute";
}

export const quintaDbActionHandlers: ProviderActionHandlers<"quintadb", ProviderRuntimeHandler<QuintaDbContext>> = {
  async list_databases(input, context) {
    const payload = await requestQuintaDbJson({
      ...context,
      path: "/apps.json",
      query: {
        page: pickOptionalInteger(input, "page"),
      },
      phase: "execute",
    });
    return {
      databases: requireObjectArrayField(payload, "databases"),
    };
  },
  async get_database(input, context) {
    const databaseId = requiredString(input.databaseId, "databaseId", inputError);
    const payload = await requestQuintaDbJson({
      ...context,
      path: `/apps/${encodeURIComponent(databaseId)}.json`,
      phase: "execute",
    });
    return {
      database: requireObjectField(payload, "database"),
    };
  },
  async list_forms(input, context) {
    const databaseId = requiredString(input.databaseId, "databaseId", inputError);
    const payload = await requestQuintaDbJson({
      ...context,
      path: `/apps/${encodeURIComponent(databaseId)}/entities.json`,
      phase: "execute",
    });
    return {
      forms: requireObjectArrayField(payload, "forms"),
    };
  },
  async list_fields(input, context) {
    const databaseId = requiredString(input.databaseId, "databaseId", inputError);
    const formId = requiredString(input.formId, "formId", inputError);
    const payload = await requestQuintaDbJson({
      ...context,
      path: `/apps/${encodeURIComponent(databaseId)}/entities/${encodeURIComponent(formId)}/properties.json`,
      phase: "execute",
    });
    return {
      fields: requireObjectArrayField(payload, "fields"),
    };
  },
  async list_records(input, context) {
    const databaseId = requiredString(input.databaseId, "databaseId", inputError);
    const formId = requiredString(input.formId, "formId", inputError);
    const payload = await requestQuintaDbJson({
      ...context,
      path: `/apps/${encodeURIComponent(databaseId)}/dtypes/entity/${encodeURIComponent(formId)}.json`,
      query: compactObject({
        page: pickOptionalInteger(input, "page"),
        per_page: pickOptionalInteger(input, "perPage"),
        view: pickOptionalString(input, "viewId"),
        name_value: pickOptionalBoolean(input, "nameValue") ? 1 : undefined,
      }),
      phase: "execute",
    });
    return {
      records: requireObjectArrayField(payload, "records"),
    };
  },
  async get_record(input, context) {
    const databaseId = requiredString(input.databaseId, "databaseId", inputError);
    const recordId = requiredString(input.recordId, "recordId", inputError);
    const payload = await requestQuintaDbJson({
      ...context,
      path: `/apps/${encodeURIComponent(databaseId)}/dtypes/${encodeURIComponent(recordId)}.json`,
      query: {
        name_value: pickOptionalBoolean(input, "nameValue") ? 1 : undefined,
      },
      phase: "execute",
    });
    return {
      record: requireObjectField(payload, "record"),
    };
  },
  async create_record(input, context) {
    const databaseId = requiredString(input.databaseId, "databaseId", inputError);
    const formId = requiredString(input.formId, "formId", inputError);
    const payload = await requestQuintaDbJson({
      ...context,
      path: `/apps/${encodeURIComponent(databaseId)}/dtypes.json`,
      method: "POST",
      body: {
        values: {
          ...requiredRecord(input.values, "values", inputError),
          entity_id: formId,
        },
      },
      phase: "execute",
    });
    return {
      record: requireObjectField(payload, "record"),
    };
  },
  async update_record(input, context) {
    const databaseId = requiredString(input.databaseId, "databaseId", inputError);
    const recordId = requiredString(input.recordId, "recordId", inputError);
    const payload = await requestQuintaDbJson({
      ...context,
      path: `/apps/${encodeURIComponent(databaseId)}/dtypes/${encodeURIComponent(recordId)}.json`,
      method: "PUT",
      body: {
        values: requiredRecord(input.values, "values", inputError),
      },
      phase: "execute",
    });
    return {
      record: requireObjectField(payload, "record"),
    };
  },
  async delete_record(input, context) {
    const databaseId = requiredString(input.databaseId, "databaseId", inputError);
    const recordId = requiredString(input.recordId, "recordId", inputError);
    const payload = await requestQuintaDbJson({
      ...context,
      path: `/apps/${encodeURIComponent(databaseId)}/dtypes/${encodeURIComponent(recordId)}.json`,
      method: "DELETE",
      phase: "execute",
    });
    return {
      record: requireObjectField(payload, "record"),
    };
  },
};

export async function validateQuintaDbCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestQuintaDbJson({
    apiKey,
    fetcher,
    signal,
    path: quintaDbValidationPath,
    query: { page: 1 },
    phase: "validate",
  });
  const databases = requireObjectArrayField(payload, "databases");

  return {
    profile: {
      accountId: "quintadb_api_key",
      displayName: "QuintaDB API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: quintaDbApiBaseUrl,
      validationEndpoint: quintaDbValidationPath,
      firstPageDatabaseCount: databases.length,
    },
  };
}

async function requestQuintaDbJson(input: QuintaDbRequestInput): Promise<unknown> {
  const url = new URL(input.path, quintaDbApiBaseUrl);
  url.searchParams.set("rest_api_key", input.apiKey);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `QuintaDB request failed: ${error.message}` : "QuintaDB request failed",
    );
  }

  const payload = await readQuintaDbPayload(response);
  if (!response.ok) {
    throw createQuintaDbError(response.status, payload, input.phase);
  }
  return payload;
}

async function readQuintaDbPayload(response: Response) {
  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (!response.ok) return text;

    const reason = error instanceof Error ? error.message : "unknown parse error";
    throw new ProviderRequestError(502, `QuintaDB returned invalid JSON: ${reason}`);
  }
}

function createQuintaDbError(status: number, payload: unknown, phase: QuintaDbRequestInput["phase"]) {
  const message = extractQuintaDbMessage(payload) ?? `QuintaDB request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (status === 401 || status === 403) {
    if (phase === "validate") {
      return new ProviderRequestError(400, message);
    }
    return new ProviderRequestError(status, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractQuintaDbMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) return payload.trim();

  const object = optionalRecord(payload);
  return optionalString(object?.error) ?? optionalString(object?.message) ?? optionalString(object?.detail);
}

function requireResponseObject(payload: unknown) {
  return requiredRecord(payload, "QuintaDB response", () => {
    return new ProviderRequestError(502, "QuintaDB returned a non-object response");
  });
}

function requireObjectField(payload: unknown, fieldName: string) {
  const value = optionalRecord(requireResponseObject(payload)[fieldName]);
  if (!value) {
    throw new ProviderRequestError(502, `QuintaDB response is missing the ${fieldName} object`);
  }
  return value;
}

function requireObjectArrayField(payload: unknown, fieldName: string) {
  const value = requireResponseObject(payload)[fieldName];
  return objectArray(value, fieldName, () => {
    return new ProviderRequestError(502, `QuintaDB response has an invalid ${fieldName} array`);
  });
}

function inputError(message: string) {
  return new ProviderRequestError(400, message);
}
