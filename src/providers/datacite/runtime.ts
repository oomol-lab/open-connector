const dataciteApiBaseUrl = "https://api.datacite.org";
const dataciteRequestTimeoutMs = 30_000;

type DatacitePhase = "validate" | "execute";

interface DataciteRequestInput {
  path: string;
  params: Record<string, string | undefined>;
  fetcher: typeof fetch;
  apiKey?: string;
  phase: DatacitePhase;
}

export async function validateDataciteCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[]; metadata: Record<string, unknown> }> {
  await requestDataciteJson({
    path: "/dois",
    params: { "page[size]": "0" },
    fetcher,
    apiKey: requiredString(input.apiKey, "apiKey", providerInputError),
    phase: "validate",
  });

  return {
    profile: { displayName: "DataCite API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: dataciteApiBaseUrl,
      validationEndpoint: "/dois?page[size]=0",
    },
  };
}

export async function executeDataciteAction(
  actionName: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  apiKey?: string,
): Promise<unknown> {
  if (actionName === "get_doi") {
    const doi = readRequiredString(input.doi, "doi");
    return requestDataciteJson({
      path: `/dois/${encodeURIComponent(normalizeDoi(doi))}`,
      params: compactObject({
        affiliation: readOptionalBooleanString(input.affiliation),
        publisher: readOptionalBooleanString(input.publisher),
      }),
      fetcher,
      apiKey,
      phase: "execute",
    });
  }

  if (actionName === "list_dois") {
    return requestDataciteJson({
      path: "/dois",
      params: buildListParams(input),
      fetcher,
      apiKey,
      phase: "execute",
    });
  }

  throw new ProviderRequestError(500, `datacite action is not implemented yet: ${actionName}`);
}

function buildListParams(input: Record<string, unknown>): Record<string, string | undefined> {
  return compactObject({
    query: readOptionalString(input.query),
    prefix: readOptionalString(input.prefix),
    "client-id": readOptionalString(input.clientId),
    "provider-id": readOptionalString(input.providerId),
    "consortium-id": readOptionalString(input.consortiumId),
    "resource-type-id": readStringArray(input.resourceTypeIds),
    subject: readOptionalString(input.subject),
    "user-id": readOptionalString(input.userId),
    "affiliation-id": readOptionalString(input.affiliationId),
    "funder-id": readOptionalString(input.funderId),
    published: readOptionalString(input.published),
    created: readOptionalString(input.created),
    registered: readOptionalString(input.registered),
    state: readStringArray(input.states),
    "has-citations": readOptionalIntegerString(input.hasCitations),
    "has-references": readOptionalIntegerString(input.hasReferences),
    sort: readOptionalString(input.sort),
    detail: readOptionalBooleanString(input.detail),
    affiliation: readOptionalBooleanString(input.affiliation),
    publisher: readOptionalBooleanString(input.publisher),
    "page[number]": readOptionalIntegerString(input.pageNumber),
    "page[size]": readOptionalIntegerString(input.pageSize),
    "page[cursor]": readOptionalString(input.pageCursor),
  });
}

async function requestDataciteJson(input: DataciteRequestInput) {
  const timeoutHandle = createProviderTimeout(undefined, dataciteRequestTimeoutMs);
  const url = new URL(input.path, `${dataciteApiBaseUrl}/`);
  for (const [name, value] of Object.entries(input.params)) {
    if (value !== undefined) {
      url.searchParams.set(name, value);
    }
  }

  const headers: Record<string, string> = {
    accept: "application/vnd.api+json",
    "user-agent": providerUserAgent,
  };
  if (input.apiKey) {
    headers.authorization = `Basic ${Buffer.from(`${input.apiKey}:`).toString("base64")}`;
  }

  try {
    const response = await input.fetcher(url, {
      method: "GET",
      headers,
      signal: timeoutHandle.signal,
    });
    const payload = await readDatacitePayload(response);

    if (!response.ok) {
      throw createDataciteError(response.status, payload, input.phase);
    }
    if (!optionalRecord(payload)) {
      throw new ProviderRequestError(502, "DataCite returned an invalid payload");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "DataCite request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DataCite request failed: ${error.message}` : "DataCite request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function readDatacitePayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "DataCite returned invalid JSON");
  }
}

function createDataciteError(status: number, payload: unknown, phase: DatacitePhase) {
  const message = extractDataciteErrorMessage(payload) ?? `DataCite request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(400, message, status);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractDataciteErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  const errors = Array.isArray(record?.errors) ? record.errors : [];
  const firstError = optionalRecord(errors[0]);
  return (
    optionalString(firstError?.detail) ??
    optionalString(firstError?.title) ??
    optionalString(record?.message) ??
    optionalString(record?.error)
  );
}

function normalizeDoi(value: string) {
  const trimmed = value.trim();
  for (const prefix of ["https://doi.org/", "http://doi.org/"]) {
    if (trimmed.toLowerCase().startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        throw new ProviderRequestError(400, "doi contains invalid percent encoding");
      }
    }
  }
  return trimmed;
}

function readRequiredString(value: unknown, fieldName: string) {
  const parsed = optionalString(value)?.trim();
  if (!parsed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readOptionalString(value: unknown) {
  return optionalString(value)?.trim() || undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => String(item)).join(",");
}

function readOptionalIntegerString(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function readOptionalBooleanString(value: unknown) {
  return typeof value === "boolean" ? String(value) : undefined;
}

import { Buffer } from "node:buffer";
import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";
