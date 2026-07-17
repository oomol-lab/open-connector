import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  readProviderTextBody,
  setSearchParams,
} from "../provider-runtime.ts";

export const scopusApiBaseUrl = "https://api.elsevier.com/content";
const scopusRequestTimeoutMs = 30_000;

type ScopusPhase = "validate" | "execute";

export interface ScopusContext {
  apiKey: string;
  institutionToken?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface ScopusQuota {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
}

interface ScopusResponse {
  payload: Record<string, unknown>;
  quota: ScopusQuota;
}

type ScopusActionHandler = (input: Record<string, unknown>, context: ScopusContext) => Promise<unknown>;

export const scopusActionHandlers: Record<string, ScopusActionHandler> = {
  async search_documents(input, context) {
    validateDocumentSearchInput(input);
    const response = await requestScopusJson(
      {
        path: "/search/scopus",
        query: mapParams(input, {
          query: "query",
          view: "view",
          fields: "field",
          start: "start",
          count: "count",
          sort: "sort",
          dateRange: "date",
          subjectArea: "subj",
          content: "content",
          facets: "facets",
        }),
        phase: "execute",
      },
      context,
    );

    return normalizeSearchResponse(response, ["search-results"]);
  },

  async get_abstract(input, context) {
    const identifierType = readRequiredInput(input.identifierType, "identifierType");
    const identifier = readRequiredInput(input.identifier, "identifier");
    const response = await requestScopusJson(
      {
        path: `/abstract/${identifierType}/${encodeURIComponent(identifier)}`,
        query: mapParams(input, {
          view: "view",
          fields: "field",
          referenceStart: "startref",
          referenceCount: "refcount",
        }),
        phase: "execute",
      },
      context,
    );

    return {
      record: readNestedRecord(response.payload, ["abstracts-retrieval-response"]),
      quota: response.quota,
      raw: response.payload,
    };
  },

  async search_authors(input, context) {
    const response = await requestScopusJson(
      {
        path: "/search/author",
        query: mapParams(input, {
          query: "query",
          fields: "field",
          start: "start",
          count: "count",
          sort: "sort",
          facets: "facets",
          resolveAliases: "alias",
        }),
        phase: "execute",
      },
      context,
    );

    return normalizeSearchResponse(response, ["search-results"]);
  },

  async get_author(input, context) {
    const identifierType = readRequiredInput(input.identifierType, "identifierType");
    const identifier = readRequiredInput(input.identifier, "identifier");
    const response = await requestScopusJson(
      {
        path: `/author/${identifierType}/${encodeURIComponent(identifier)}`,
        query: mapParams(input, {
          view: "view",
          fields: "field",
          resolveAliases: "alias",
          referenceStart: "startref",
          referenceCount: "refcount",
        }),
        phase: "execute",
      },
      context,
    );

    return {
      profiles: readNestedRecords(response.payload, ["author-retrieval-response", "orcid-message"]),
      quota: response.quota,
      raw: response.payload,
    };
  },

  async search_affiliations(input, context) {
    const response = await requestScopusJson(
      {
        path: "/search/affiliation",
        query: mapParams(input, {
          query: "query",
          fields: "field",
          start: "start",
          count: "count",
          sort: "sort",
          facets: "facets",
        }),
        phase: "execute",
      },
      context,
    );

    return normalizeSearchResponse(response, ["search-results"]);
  },

  async get_affiliation(input, context) {
    const identifierType = readRequiredInput(input.identifierType, "identifierType");
    const identifier = readRequiredInput(input.identifier, "identifier");
    const response = await requestScopusJson(
      {
        path: `/affiliation/${identifierType}/${encodeURIComponent(identifier)}`,
        query: mapParams(input, {
          view: "view",
          fields: "field",
          referenceStart: "startref",
          referenceCount: "refcount",
        }),
        phase: "execute",
      },
      context,
    );

    return {
      profiles: readNestedRecords(response.payload, ["affiliation-retrieval-response"]),
      quota: response.quota,
      raw: response.payload,
    };
  },

  async search_sources(input, context) {
    const response = await requestScopusJson(
      {
        path: "/serial/title",
        query: mapParams(input, {
          title: "title",
          issn: "issn",
          publisher: "pub",
          subjectArea: "subj",
          subjectCode: "subjCode",
          contentType: "content",
          openAccess: "oa",
          dateRange: "date",
          view: "view",
          fields: "field",
          start: "start",
          count: "count",
        }),
        phase: "execute",
      },
      context,
    );

    return normalizeSearchResponse(response, ["serial-metadata-response", "search-results"]);
  },
};

export async function validateScopusCredential(
  apiKey: string,
  institutionToken: string | undefined,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const normalizedInstitutionToken = optionalString(institutionToken);
  const response = await requestScopusJson(
    {
      path: "/search/scopus",
      query: {
        query: "TITLE(scopus)",
        count: "1",
        field: "dc:identifier,dc:title",
      },
      phase: "validate",
    },
    { apiKey, institutionToken: normalizedInstitutionToken, fetcher, signal },
  );

  return {
    profile: {
      accountId: "scopus:api_key",
      displayName: "Scopus API Key",
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/search/scopus",
      usesInstitutionToken: normalizedInstitutionToken ? true : undefined,
      quotaLimit: response.quota.limit ?? undefined,
      quotaRemaining: response.quota.remaining ?? undefined,
      quotaResetAt: response.quota.resetAt ?? undefined,
    }),
  };
}

interface ScopusRequest {
  path: string;
  query: Record<string, string | undefined>;
  phase: ScopusPhase;
}

async function requestScopusJson(input: ScopusRequest, context: ScopusContext): Promise<ScopusResponse> {
  const timeout = createProviderTimeout(context.signal, scopusRequestTimeoutMs);
  try {
    const response = await context.fetcher(buildScopusUrl(input.path, input.query), {
      method: "GET",
      headers: buildScopusHeaders(context),
      signal: timeout.signal,
    });
    const payload = await readScopusPayload(response);

    if (!response.ok) {
      throw createScopusError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "Scopus returned an invalid JSON object");
    }

    return {
      payload: payloadRecord,
      quota: readScopusQuota(response.headers),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Scopus request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Scopus request failed: ${error.message}` : "Scopus request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildScopusUrl(path: string, query: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${scopusApiBaseUrl}/`);
  setSearchParams(url, query);
  return url;
}

function buildScopusHeaders(context: Pick<ScopusContext, "apiKey" | "institutionToken">): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-els-apikey": context.apiKey,
  };
  if (context.institutionToken) {
    headers["x-els-insttoken"] = context.institutionToken;
  }
  return headers;
}

async function readScopusPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "Scopus response");
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.trim();
  }
}

function createScopusError(status: number, payload: unknown, phase: ScopusPhase): ProviderRequestError {
  const message = extractScopusErrorMessage(payload) ?? `Scopus request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(502, message);
}

function extractScopusErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text.startsWith("<")) {
      return text || undefined;
    }

    for (const element of ["statusText", "error-message", "message"]) {
      const value = readXmlElement(text, element);
      if (value) {
        return value;
      }
    }
    return undefined;
  }

  return findNestedMessage(payload);
}

function findNestedMessage(value: unknown): string | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  for (const key of ["message", "statusText", "error-message", "error", "detail"]) {
    const message = optionalString(record[key]);
    if (message) {
      return message;
    }
  }

  for (const nested of Object.values(record)) {
    const message = findNestedMessage(nested);
    if (message) {
      return message;
    }
  }
  return undefined;
}

function readXmlElement(xml: string, element: string): string | undefined {
  const openTag = `<${element}>`;
  const closeTag = `</${element}>`;
  const start = xml.indexOf(openTag);
  const end = xml.indexOf(closeTag, start + openTag.length);
  if (start < 0 || end < 0) {
    return undefined;
  }
  return optionalString(xml.slice(start + openTag.length, end));
}

function normalizeSearchResponse(response: ScopusResponse, envelopeKeys: string[]) {
  const envelope = readNestedRecord(response.payload, envelopeKeys);
  return {
    totalResults: readNullableInteger(envelope["opensearch:totalResults"]),
    startIndex: readNullableInteger(envelope["opensearch:startIndex"]),
    itemsPerPage: readNullableInteger(envelope["opensearch:itemsPerPage"]),
    entries: readRecordArray(envelope.entry),
    facets: readRecordArray(envelope.facet),
    links: readRecordArray(envelope.link),
    quota: response.quota,
    raw: response.payload,
  };
}

function readNestedRecord(payload: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  for (const key of keys) {
    const record = optionalRecord(payload[key]);
    if (record) {
      return record;
    }
  }
  throw missingScopusEnvelope(keys);
}

function readNestedRecords(payload: Record<string, unknown>, keys: string[]): Array<Record<string, unknown>> {
  for (const key of keys) {
    const value = payload[key];
    const records = readRecordArray(value);
    if (records.length > 0 || Array.isArray(value)) {
      return records;
    }
    const record = optionalRecord(value);
    if (record) {
      return [record];
    }
  }
  throw missingScopusEnvelope(keys);
}

function missingScopusEnvelope(keys: string[]): ProviderRequestError {
  return new ProviderRequestError(502, `Scopus response is missing the expected ${keys.join(" or ")} envelope`);
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const record = optionalRecord(item);
      return record ? [record] : [];
    });
  }

  const record = optionalRecord(value);
  return record ? [record] : [];
}

function readScopusQuota(headers: Headers): ScopusQuota {
  const resetEpochSeconds = readNullableInteger(headers.get("x-ratelimit-reset"));
  return {
    limit: readNullableInteger(headers.get("x-ratelimit-limit")),
    remaining: readNullableInteger(headers.get("x-ratelimit-remaining")),
    resetAt: toIsoDate(resetEpochSeconds),
  };
}

function toIsoDate(epochSeconds: number | null): string | null {
  if (epochSeconds === null || !Number.isSafeInteger(epochSeconds)) {
    return null;
  }
  const date = new Date(epochSeconds * 1_000);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function mapParams(
  input: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, string | undefined> {
  const query: Record<string, string | undefined> = {};
  for (const [inputName, upstreamName] of Object.entries(mapping)) {
    const value = input[inputName];
    if (value === undefined || value === null) {
      continue;
    }
    query[upstreamName] = typeof value === "string" ? value.trim() : String(value);
  }
  return query;
}

function readNullableInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function readRequiredInput(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function validateDocumentSearchInput(input: Record<string, unknown>): void {
  if (input.view === "COMPLETE" && typeof input.count === "number" && input.count > 25) {
    throw new ProviderRequestError(400, "count must be at most 25 when view is COMPLETE");
  }
}
