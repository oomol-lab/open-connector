import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalString, requiredString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "lightfield";
const lightfieldApiBaseUrl = "https://api.lightfield.app";
const lightfieldApiVersion = "2026-03-01";

type LightfieldRequestMode = "validate" | "execute";
type LightfieldActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const lightfieldActionHandlers: ProviderActionHandlers<"lightfield", LightfieldActionHandler> = {
  get_api_key_metadata(_input, context) {
    return executeGetApiKeyMetadata(context);
  },
  async list_object_definitions(_input, context) {
    const payload = await requestLightfield({
      path: "/v1/objects",
      context,
      mode: "execute",
    });
    return { definitions: readArrayProperty(payload, "data", "Lightfield object definitions") };
  },
  async list_custom_object_records(input, context) {
    const entitySlug = encodePathSegment(requiredString(input.entitySlug, "entitySlug", providerInputError));
    return normalizeListPayload(
      await requestLightfield({
        path: `/v1/objects/${entitySlug}`,
        context,
        mode: "execute",
        query: readListQuery(input),
      }),
    );
  },
  async get_custom_object_record(input, context) {
    const entitySlug = encodePathSegment(requiredString(input.entitySlug, "entitySlug", providerInputError));
    const id = encodePathSegment(requiredString(input.id, "id", providerInputError));
    return {
      record: await requestLightfield({
        path: `/v1/objects/${entitySlug}/values/${id}`,
        context,
        mode: "execute",
      }),
    };
  },
  list_accounts(input, context) {
    return listLightfieldRecords("/v1/accounts", input, context);
  },
  get_account(input, context) {
    return getLightfieldRecord("/v1/accounts", input, context);
  },
  list_contacts(input, context) {
    return listLightfieldRecords("/v1/contacts", input, context);
  },
  get_contact(input, context) {
    return getLightfieldRecord("/v1/contacts", input, context);
  },
  list_opportunities(input, context) {
    return listLightfieldRecords("/v1/opportunities", input, context);
  },
  get_opportunity(input, context) {
    return getLightfieldRecord("/v1/opportunities", input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, lightfieldActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = input.apiKey.trim();
    if (!apiKey) {
      throw new ProviderRequestError(400, "Lightfield API key is required.");
    }

    const metadata = await readValidatedApiKeyMetadata(
      await requestLightfield({
        path: "/v1/auth/validate",
        context: { apiKey, fetcher, signal },
        mode: "validate",
      }),
    );
    const displayName =
      metadata.subjectType === "workspace" ? "Lightfield Workspace API Key" : "Lightfield User API Key";

    return {
      profile: {
        displayName,
        grantedScopes: metadata.scopes,
      },
      grantedScopes: metadata.scopes,
      metadata: compactObject({
        apiBaseUrl: lightfieldApiBaseUrl,
        apiVersion: lightfieldApiVersion,
        validationEndpoint: "/v1/auth/validate",
        subjectType: metadata.subjectType,
        tokenType: metadata.tokenType,
      }),
    };
  },
};

async function executeGetApiKeyMetadata(context: ApiKeyProviderContext): Promise<unknown> {
  return readValidatedApiKeyMetadata(
    await requestLightfield({
      path: "/v1/auth/validate",
      context,
      mode: "execute",
    }),
  );
}

async function listLightfieldRecords(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return normalizeListPayload(
    await requestLightfield({
      path,
      context,
      mode: "execute",
      query: readListQuery(input),
    }),
  );
}

async function getLightfieldRecord(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const id = encodePathSegment(requiredString(input.id, "id", providerInputError));
  return {
    record: await requestLightfield({
      path: `${path}/${id}`,
      context,
      mode: "execute",
    }),
  };
}

async function requestLightfield(input: {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: LightfieldRequestMode;
  query?: Record<string, string>;
}): Promise<unknown> {
  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(lightfieldUrl(input.path, input.query), {
      method: "GET",
      headers: lightfieldHeaders(input.context.apiKey),
      signal: input.context.signal,
    });
    payload = await readLightfieldPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Lightfield request failed: ${error.message}` : "Lightfield request failed",
    );
  }

  if (!response.ok) {
    throw createLightfieldError(response, payload, input.mode);
  }

  return payload;
}

function lightfieldHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "lightfield-version": lightfieldApiVersion,
    "user-agent": providerUserAgent,
  };
}

function lightfieldUrl(path: string, query?: Record<string, string>): URL {
  const url = new URL(path, lightfieldApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

function readListQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  appendQueryValue(query, "limit", input.limit);
  appendQueryValue(query, "offset", input.offset);

  const filters = input.filters;
  if (filters && typeof filters === "object" && !Array.isArray(filters)) {
    for (const [key, value] of Object.entries(filters)) {
      appendQueryValue(query, key, value);
    }
  }

  return query;
}

function appendQueryValue(query: Record<string, string>, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  query[key] = String(value);
}

async function readLightfieldPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Lightfield returned malformed JSON.");
    }
    return text;
  }
}

function createLightfieldError(
  response: Response,
  payload: unknown,
  mode: LightfieldRequestMode,
): ProviderRequestError {
  const message = extractLightfieldErrorMessage(payload) ?? response.statusText;

  if (response.status === 429) {
    return new ProviderRequestError(429, message || "Lightfield rate limit exceeded", payload);
  }

  if (mode === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message || "Invalid Lightfield API key.", payload);
  }

  if (mode === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message || "Lightfield credential expired.", payload);
  }

  if ([400, 404, 422].includes(response.status)) {
    return new ProviderRequestError(400, message || "Invalid Lightfield request.", payload);
  }

  return new ProviderRequestError(response.status || 500, message || "Lightfield request failed.", payload);
}

function extractLightfieldErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return undefined;
  }

  const record = payload as Record<string, unknown>;
  for (const key of ["message", "error", "detail", "title"]) {
    const value = optionalString(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeListPayload(payload: unknown): Record<string, unknown> {
  const record = readRecord(payload, "Lightfield list response");
  return {
    records: readArrayProperty(record, "data", "Lightfield list response"),
    object: readStringProperty(record, "object", "Lightfield list response"),
    totalCount: readNumberProperty(record, "totalCount", "Lightfield list response"),
  };
}

async function readValidatedApiKeyMetadata(payload: unknown): Promise<{
  active: true;
  subjectType: "user" | "workspace";
  tokenType: "api_key";
  scopes: string[];
}> {
  const record = readRecord(payload, "Lightfield API key metadata");
  const active = record.active;
  const subjectType = record.subjectType;
  const tokenType = record.tokenType;
  const scopes = record.scopes;
  if (active !== true) {
    throw new ProviderRequestError(400, "Lightfield API key is not active.", record);
  }
  if (subjectType !== "user" && subjectType !== "workspace") {
    throw new ProviderRequestError(502, "Invalid Lightfield subject type.", record);
  }
  if (tokenType !== "api_key") {
    throw new ProviderRequestError(502, "Invalid Lightfield token type.", record);
  }
  if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === "string")) {
    throw new ProviderRequestError(502, "Invalid Lightfield scopes.", record);
  }

  return {
    active,
    subjectType,
    tokenType,
    scopes,
  };
}

function readRecord(payload: unknown, label: string): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ProviderRequestError(502, `Invalid ${label}.`, payload);
  }
  return payload as Record<string, unknown>;
}

function readArrayProperty(payload: unknown, key: string, label: string): unknown[] {
  const record = readRecord(payload, label);
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Invalid ${label}.`, record);
  }
  return value;
}

function readStringProperty(payload: Record<string, unknown>, key: string, label: string): string {
  const value = payload[key];
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `Invalid ${label}.`, payload);
  }
  return value;
}

function readNumberProperty(payload: Record<string, unknown>, key: string, label: string): number {
  const value = payload[key];
  if (typeof value !== "number") {
    throw new ProviderRequestError(502, `Invalid ${label}.`, payload);
  }
  return value;
}
