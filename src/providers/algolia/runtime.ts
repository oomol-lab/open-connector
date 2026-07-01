import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { AlgoliaActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type AlgoliaRequestPhase = "validate" | "execute";

interface AlgoliaActionContext {
  apiKey: string;
  applicationId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type AlgoliaActionHandler = (input: Record<string, unknown>, context: AlgoliaActionContext) => Promise<unknown>;

export const algoliaActionHandlers: Record<AlgoliaActionName, AlgoliaActionHandler> = {
  list_indices(input, context) {
    return listAlgoliaIndices(input, context);
  },
  search_index(input, context) {
    return searchAlgoliaIndex(input, context);
  },
  browse_index(input, context) {
    return browseAlgoliaIndex(input, context);
  },
  get_record(input, context) {
    return getAlgoliaRecord(input, context);
  },
  add_or_replace_record(input, context) {
    return addOrReplaceAlgoliaRecord(input, context);
  },
  update_record_partially(input, context) {
    return updateAlgoliaRecordPartially(input, context);
  },
  delete_records_by_filter(input, context) {
    return deleteAlgoliaRecordsByFilter(input, context);
  },
  save_rule(input, context) {
    return saveAlgoliaRule(input, context);
  },
  save_synonym(input, context) {
    return saveAlgoliaSynonym(input, context);
  },
};

export async function validateAlgoliaCredential(
  input: { apiKey: string; applicationId: string | undefined },
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const applicationId = readAlgoliaApplicationId(input);
  const payload = await requestAlgoliaJson({
    applicationId,
    apiKey: input.apiKey,
    path: `/1/keys/${encodeURIComponent(input.apiKey)}`,
    fetcher,
    signal,
    phase: "validate",
  });
  const acl = readOptionalStringArray(payload.acl) ?? [];

  return {
    profile: {
      accountId: buildAlgoliaProviderAccountId(applicationId, input.apiKey),
      displayName: optionalString(payload.description) || `Algolia ${applicationId}`,
      grantedScopes: acl,
    },
    grantedScopes: acl,
    metadata: compactObject({
      applicationId,
      apiBaseUrl: buildAlgoliaApiBaseUrl(applicationId),
      validationEndpoint: "/1/keys/{apiKey}",
      acl,
      indexes: readOptionalStringArray(payload.indexes),
      referers: readOptionalStringArray(payload.referers),
      maxHitsPerQuery: optionalNumber(payload.maxHitsPerQuery),
      maxQueriesPerIPPerHour: optionalNumber(payload.maxQueriesPerIPPerHour),
      validity: optionalNumber(payload.validity),
      description: optionalString(payload.description),
    }),
  };
}

export function readAlgoliaApplicationId(source: Record<string, unknown> | undefined): string {
  const applicationId = source ? optionalString(source.applicationId) : undefined;
  if (!applicationId) {
    throw new ProviderRequestError(400, "Application ID is required");
  }
  if (!isSafeAlgoliaApplicationId(applicationId)) {
    throw new ProviderRequestError(400, "Application ID is invalid");
  }
  return applicationId;
}

async function listAlgoliaIndices(input: Record<string, unknown>, context: AlgoliaActionContext): Promise<unknown> {
  return requestAlgoliaJson({
    ...context,
    path: "/1/indexes",
    query: compactObject({
      page: toOptionalString(input.page),
      hitsPerPage: toOptionalString(input.hitsPerPage),
    }),
    phase: "execute",
  });
}

async function searchAlgoliaIndex(input: Record<string, unknown>, context: AlgoliaActionContext): Promise<unknown> {
  const indexName = requireFieldString(input, "indexName");

  return requestAlgoliaJson({
    ...context,
    path: `/1/indexes/${encodeURIComponent(indexName)}/query`,
    method: "POST",
    body: compactObject({
      query: readOptionalString(input.query),
      page: optionalNumber(input.page),
      hitsPerPage: optionalNumber(input.hitsPerPage),
      filters: readOptionalString(input.filters),
      facetFilters: input.facetFilters,
      numericFilters: input.numericFilters,
      tagFilters: input.tagFilters,
      facets: input.facets,
      attributesToRetrieve: input.attributesToRetrieve,
      attributesToHighlight: input.attributesToHighlight,
      attributesToSnippet: input.attributesToSnippet,
      aroundLatLng: readOptionalString(input.aroundLatLng),
      aroundRadius: input.aroundRadius,
      insideBoundingBox: input.insideBoundingBox,
      insidePolygon: input.insidePolygon,
      clickAnalytics: readOptionalBoolean(input.clickAnalytics),
      analytics: readOptionalBoolean(input.analytics),
      getRankingInfo: readOptionalBoolean(input.getRankingInfo),
      sumOrFiltersScores: readOptionalBoolean(input.sumOrFiltersScores),
    }),
    phase: "execute",
  });
}

async function browseAlgoliaIndex(input: Record<string, unknown>, context: AlgoliaActionContext): Promise<unknown> {
  const indexName = requireFieldString(input, "indexName");

  return requestAlgoliaJson({
    ...context,
    path: `/1/indexes/${encodeURIComponent(indexName)}/browse`,
    method: "POST",
    body: compactObject({
      cursor: readOptionalString(input.cursor),
      query: readOptionalString(input.query),
      filters: readOptionalString(input.filters),
      facetFilters: input.facetFilters,
      numericFilters: input.numericFilters,
      tagFilters: input.tagFilters,
      attributesToRetrieve: input.attributesToRetrieve,
      hitsPerPage: optionalNumber(input.hitsPerPage),
    }),
    phase: "execute",
  });
}

async function getAlgoliaRecord(input: Record<string, unknown>, context: AlgoliaActionContext): Promise<unknown> {
  const indexName = requireFieldString(input, "indexName");
  const objectID = requireFieldString(input, "objectID");

  return requestAlgoliaJson({
    ...context,
    path: `/1/indexes/${encodeURIComponent(indexName)}/${encodeURIComponent(objectID)}`,
    query: compactObject({
      attributesToRetrieve: joinStringArray(input.attributesToRetrieve),
    }),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function addOrReplaceAlgoliaRecord(
  input: Record<string, unknown>,
  context: AlgoliaActionContext,
): Promise<unknown> {
  const indexName = requireFieldString(input, "indexName");
  const record = requireRecord(input.record, "record");
  const objectID = requireFieldString(record, "objectID");

  return requestAlgoliaJson({
    ...context,
    path: `/1/indexes/${encodeURIComponent(indexName)}/${encodeURIComponent(objectID)}`,
    method: "PUT",
    query: compactObject({
      forwardToReplicas: toOptionalString(input.forwardToReplicas),
    }),
    body: record,
    phase: "execute",
  });
}

async function updateAlgoliaRecordPartially(
  input: Record<string, unknown>,
  context: AlgoliaActionContext,
): Promise<unknown> {
  const indexName = requireFieldString(input, "indexName");
  const objectID = requireFieldString(input, "objectID");
  const attributesToUpdate = requireRecord(input.attributesToUpdate, "attributesToUpdate");

  return requestAlgoliaJson({
    ...context,
    path: `/1/indexes/${encodeURIComponent(indexName)}/${encodeURIComponent(objectID)}/partial`,
    method: "POST",
    query: compactObject({
      createIfNotExists: toOptionalString(input.createIfNotExists),
      forwardToReplicas: toOptionalString(input.forwardToReplicas),
    }),
    body: attributesToUpdate,
    phase: "execute",
  });
}

async function deleteAlgoliaRecordsByFilter(
  input: Record<string, unknown>,
  context: AlgoliaActionContext,
): Promise<unknown> {
  const indexName = requireFieldString(input, "indexName");

  return requestAlgoliaJson({
    ...context,
    path: `/1/indexes/${encodeURIComponent(indexName)}/deleteByQuery`,
    method: "POST",
    body: {
      filters: requireFieldString(input, "filters"),
    },
    phase: "execute",
  });
}

async function saveAlgoliaRule(input: Record<string, unknown>, context: AlgoliaActionContext): Promise<unknown> {
  const indexName = requireFieldString(input, "indexName");
  const rule = requireRecord(input.rule, "rule");
  const objectID = requireFieldString(rule, "objectID");

  return requestAlgoliaJson({
    ...context,
    path: `/1/indexes/${encodeURIComponent(indexName)}/rules/${encodeURIComponent(objectID)}`,
    method: "PUT",
    query: compactObject({
      forwardToReplicas: toOptionalString(input.forwardToReplicas),
    }),
    body: rule,
    phase: "execute",
  });
}

async function saveAlgoliaSynonym(input: Record<string, unknown>, context: AlgoliaActionContext): Promise<unknown> {
  const indexName = requireFieldString(input, "indexName");
  const synonym = requireRecord(input.synonym, "synonym");
  const objectID = requireFieldString(synonym, "objectID");

  return requestAlgoliaJson({
    ...context,
    path: `/1/indexes/${encodeURIComponent(indexName)}/synonyms/${encodeURIComponent(objectID)}`,
    method: "PUT",
    query: compactObject({
      forwardToReplicas: toOptionalString(input.forwardToReplicas),
    }),
    body: synonym,
    phase: "execute",
  });
}

async function requestAlgoliaJson(input: {
  applicationId: string;
  apiKey: string;
  path: string;
  fetcher: ProviderFetch;
  phase: AlgoliaRequestPhase;
  signal?: AbortSignal;
  method?: "GET" | "POST" | "PUT";
  query?: Record<string, string | undefined>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, buildAlgoliaApiBaseUrl(input.applicationId));
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: algoliaHeaders(input.applicationId, input.apiKey, input.body !== undefined),
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw wrapAlgoliaTransportError(error, input.phase, "request");
  }

  let payload: unknown;
  try {
    payload = await readAlgoliaPayload(response);
  } catch (error) {
    throw wrapAlgoliaTransportError(error, input.phase, "response parsing");
  }

  if (!response.ok) {
    throw createAlgoliaError(response, payload, input.phase, input.notFoundAsInvalidInput);
  }

  return requireRecord(payload, "payload");
}

function algoliaHeaders(applicationId: string, apiKey: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    "x-algolia-application-id": applicationId,
    "x-algolia-api-key": apiKey,
    "user-agent": providerUserAgent,
    ...(hasBody ? { "content-type": "application/json" } : {}),
  }) as Record<string, string>;
}

function buildAlgoliaApiBaseUrl(applicationId: string): string {
  return `https://${applicationId}.algolia.net`;
}

function isSafeAlgoliaApplicationId(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUppercaseLetter = code >= 65 && code <= 90;
    const isLowercaseLetter = code >= 97 && code <= 122;
    if (isDigit || isUppercaseLetter || isLowercaseLetter || char === "-" || char === "_") {
      continue;
    }
    return false;
  }
  return true;
}

function wrapAlgoliaTransportError(
  error: unknown,
  phase: AlgoliaRequestPhase,
  step: "request" | "response parsing",
): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return new ProviderRequestError(502, `algolia ${phase} ${step} failed: ${message}`);
}

function buildAlgoliaProviderAccountId(applicationId: string, apiKey: string): string {
  const digest = createHash("sha256")
    .update(`${applicationId}:${apiKey}`)
    .digest("hex")
    .slice(0, 16);
  return `algolia:${applicationId}:key:${digest}`;
}

function requireFieldString(input: Record<string, unknown>, fieldName: string): string {
  const value = readOptionalString(input[fieldName]);
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return record;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function joinStringArray(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === "string");
  return items.length > 0 ? items.join(",") : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

async function readAlgoliaPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text().catch(() => "");
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createAlgoliaError(
  response: Response,
  payload: unknown,
  phase: AlgoliaRequestPhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const record = optionalRecord(payload) ?? {};
  const message =
    readOptionalString(record.message) ??
    readOptionalString(record.error) ??
    `algolia request failed with ${response.status}`;

  if (response.status === 400) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  return new ProviderRequestError(response.status, message);
}
