import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "nango";
const nangoApiBaseUrl = "https://api.nango.dev";

type NangoMethod = "GET" | "POST" | "PATCH" | "DELETE";
type QueryValue = string | number | boolean | readonly string[] | Record<string, string> | undefined;
type NangoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const nangoActionHandlers: ProviderActionHandlers<"nango", NangoActionHandler> = {
  list_providers(_input, context) {
    return requestNangoJson({ method: "GET", path: "/providers", context });
  },
  get_provider(input, context) {
    return requestNangoJson({
      method: "GET",
      path: `/providers/${encodeURIComponent(readRequiredString(input.provider, "provider"))}`,
      context,
    });
  },
  list_integrations(_input, context) {
    return requestNangoJson({ method: "GET", path: "/integrations", context });
  },
  get_integration(input, context) {
    return requestNangoJson({
      method: "GET",
      path: `/integrations/${encodeURIComponent(readRequiredString(input.uniqueKey, "uniqueKey"))}`,
      query: compactObject({
        include: readOptionalStringArray(input.include, "include"),
      }),
      context,
    });
  },
  list_connections(input, context) {
    return requestNangoJson({
      method: "GET",
      path: "/connections",
      query: compactObject({
        connectionId: optionalString(input.connectionId),
        search: optionalString(input.search),
        tags: readOptionalStringRecord(input.tags, "tags"),
        limit: optionalNumber(input.limit),
        page: optionalNumber(input.page),
      }),
      context,
    });
  },
  get_connection(input, context) {
    const connectionId = readRequiredString(input.connection_id, "connection_id");
    return requestNangoJson({
      method: "GET",
      path: `/connections/${encodeURIComponent(connectionId)}`,
      query: compactObject({
        provider_config_key: readRequiredString(input.provider_config_key, "provider_config_key"),
        force_refresh: optionalBoolean(input.force_refresh),
        refresh_token: optionalBoolean(input.refresh_token),
        refresh_github_app_jwt_token: optionalBoolean(input.refresh_github_app_jwt_token),
      }),
      context,
    });
  },
  set_connection_metadata(input, context) {
    return requestNangoJson({
      method: "POST",
      path: "/connections/metadata",
      body: {
        connection_id: readConnectionIdOrIds(input.connection_id),
        provider_config_key: readRequiredString(input.provider_config_key, "provider_config_key"),
        metadata: readRequiredObject(input.metadata, "metadata"),
      },
      context,
    });
  },
  patch_connection_tags(input, context) {
    const connectionId = readRequiredString(input.connection_id, "connection_id");
    return requestNangoJson({
      method: "PATCH",
      path: `/connections/${encodeURIComponent(connectionId)}`,
      query: {
        provider_config_key: readRequiredString(input.provider_config_key, "provider_config_key"),
      },
      body: {
        tags: readRequiredStringRecord(input.tags, "tags"),
      },
      context,
    });
  },
  delete_connection(input, context) {
    const connectionId = readRequiredString(input.connection_id, "connection_id");
    return requestNangoJson({
      method: "DELETE",
      path: `/connections/${encodeURIComponent(connectionId)}`,
      query: {
        provider_config_key: readRequiredString(input.provider_config_key, "provider_config_key"),
      },
      context,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, nangoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestNangoJson({
      method: "GET",
      path: "/providers",
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    });

    const providerCount = Array.isArray(payload.data) ? payload.data.length : undefined;

    return {
      profile: {
        accountId: "nango",
        displayName: "Nango API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: nangoApiBaseUrl,
        validationEndpoint: "/providers",
        providerCount,
      }),
    };
  },
};

async function requestNangoJson(input: {
  method: NangoMethod;
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  let response: Response;
  let payload: unknown;

  try {
    response = await input.context.fetcher(buildNangoUrl(input.path, input.query), {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Nango request failed: ${error.message}` : "Nango request failed",
      error,
    );
  }

  if (!response.ok) {
    throw createNangoError(response.status, payload);
  }

  return readProviderObject(payload, "payload");
}

function buildNangoUrl(path: string, query: Record<string, QueryValue> = {}): URL {
  const url = new URL(path, nangoApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    appendQueryValue(url.searchParams, key, value);
  }
  return url;
}

function appendQueryValue(searchParams: URLSearchParams, key: string, value: QueryValue): void {
  if (value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      searchParams.append(key, item);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      searchParams.append(`${key}[${childKey}]`, childValue);
    }
    return;
  }

  searchParams.set(key, String(value));
}

function createNangoError(status: number, payload: unknown): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `Nango request failed with ${status || 500}`;

  if (status === 401 || status === 403 || status === 400 || status === 404 || status === 424) {
    return new ProviderRequestError(400, message, payload);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

async function readJsonPayload(response: Response): Promise<unknown> {
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

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const error = optionalRecord(record.error);

  return optionalString(record.message) ?? optionalString(error?.message) ?? optionalString(error?.code);
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, providerInputError);
}

function readProviderObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(502, message));
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }

  return value.map((item, index) => readRequiredString(item, `${fieldName}[${index}]`));
}

function readRequiredStringRecord(value: unknown, fieldName: string): Record<string, string> {
  const record = readRequiredObject(value, fieldName);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, readRequiredString(item, `${fieldName}.${key}`)]),
  );
}

function readOptionalStringRecord(value: unknown, fieldName: string): Record<string, string> | undefined {
  if (value == null) {
    return undefined;
  }

  return readRequiredStringRecord(value, fieldName);
}

function readConnectionIdOrIds(value: unknown): string | string[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => readRequiredString(item, `connection_id[${index}]`));
  }

  return readRequiredString(value, "connection_id");
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
