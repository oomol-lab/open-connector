import type { InsitesActionName } from "./actions.ts";

import { compactObject, requiredString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export interface InsitesCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const insitesApiBaseUrl = "https://api.insites.com/api/v1";

type InsitesRequestPhase = "validate" | "execute";

export function executeInsitesAction(
  actionName: InsitesActionName,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  switch (actionName) {
    case "start_audit":
      return requestInsites({
        path: "/report",
        method: "POST",
        body: buildStartAuditBody(input),
        apiKey,
        fetcher,
        phase: "execute",
      }).then(parseStartedAudit);
    case "get_audit":
      return requestInsites({
        path: `/report/${encodeURIComponent(String(input.reportId))}`,
        method: "GET",
        query: buildGetAuditQuery(input),
        apiKey,
        fetcher,
        phase: "execute",
      }).then(parseAuditResult);
    case "get_llm_audit":
      return requestInsites({
        path: `/llm/report-fetch/${encodeURIComponent(String(input.reportId))}`,
        method: "GET",
        apiKey,
        fetcher,
        phase: "execute",
      }).then(parseAuditResult);
    case "list_audits":
      return requestInsites({
        path: "/reports",
        method: "GET",
        query: buildListAuditQuery(input),
        apiKey,
        fetcher,
        phase: "execute",
      }).then(parseAuditList);
  }
}

export async function validateInsitesCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<InsitesCredentialCheck> {
  const payload = await requestInsites({
    path: "/reports",
    method: "GET",
    query: { limit: "1" },
    apiKey: requiredString(input.apiKey, "apiKey"),
    fetcher,
    phase: "validate",
  });
  parseAuditList(payload);
  return {
    accountLabel: "Insites API Key",
    providerScopes: [],
    providerMetadata: { apiBaseUrl: insitesApiBaseUrl, validationEndpoint: "/reports" },
  };
}

function buildStartAuditBody(input: Record<string, unknown>) {
  return compactObject({
    url: input.url,
    priority: input.priority,
    dedupe_method: input.dedupeMethod,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    name: input.businessName,
    phone: input.phone,
    address: input.address,
    number: input.buildingNumber,
    street: input.street,
    city: input.city,
    state: input.state,
    zip: input.postalCode,
    country_code: input.countryCode,
    lat: input.latitude,
    lng: input.longitude,
    google_place_id: input.googlePlaceId,
    products: input.products,
    locations: input.locations,
    is_competitor_of: input.competitorReportId,
    pages_to_analyse: input.pagesToAnalyze,
    generate_keywords: input.generateKeywords,
  });
}

function buildGetAuditQuery(input: Record<string, unknown>) {
  return stringifyQueryValues(
    compactObject({
      include_datasets: input.includeDatasets,
      available_versions: input.availableVersions,
      version_id: input.versionId,
      staging: input.staging,
      categories: input.categories,
      percentiles: input.percentiles,
    }),
  );
}

function buildListAuditQuery(input: Record<string, unknown>) {
  const orderBy = typeof input.orderBy === "string" ? input.orderBy : undefined;
  const orderDirection = typeof input.orderDirection === "string" ? input.orderDirection : undefined;
  return stringifyQueryValues(
    compactObject({
      filter: Array.isArray(input.filters) ? JSON.stringify(input.filters) : undefined,
      order: orderBy ? JSON.stringify([{ [orderBy]: orderDirection ?? "desc" }]) : undefined,
      limit: input.limit,
      offset: input.offset,
      include_historic: input.includeHistoric,
      list_id: input.listId,
    }),
  );
}

function stringifyQueryValues(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value)]));
}

async function requestInsites(input: {
  path: string;
  method: "GET" | "POST";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  phase: InsitesRequestPhase;
}) {
  const url = new URL(`${insitesApiBaseUrl}${input.path}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(name, value);
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    "api-key": input.apiKey,
    "user-agent": providerUserAgent,
  };
  const init: RequestInit = { method: input.method, headers };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(input.body);
  }

  const timeout = createProviderTimeout(undefined);
  init.signal = timeout.signal;
  try {
    const response = await input.fetcher(url, init);
    const payload = await readInsitesPayload(response);
    if (!response.ok) {
      throw createInsitesError(response, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || (error instanceof Error && error.name === "AbortError")) {
      throw new ProviderRequestError(504, "Insites request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Insites request failed: ${error.message}` : "Insites request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readInsitesPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createInsitesError(response: Response, payload: unknown, phase: InsitesRequestPhase) {
  const message = extractInsitesErrorMessage(payload) ?? response.statusText ?? "Insites request failed";
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(phase === "validate" && response.status < 500 ? 400 : 502, message);
}

function extractInsitesErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = readRecord(payload);
  if (!record) {
    return undefined;
  }
  if (typeof record.message === "string") {
    return record.message;
  }
  const error = readRecord(record.error);
  return typeof error?.message === "string" ? error.message : undefined;
}

function parseStartedAudit(payload: unknown) {
  const record = requireRecord(payload, "Insites returned invalid audit submission data");
  return {
    status: requireString(record.status, "Insites returned an invalid audit status"),
    reportId: requireString(record.reportId, "Insites returned an invalid report ID"),
  };
}

function parseAuditResult(payload: unknown) {
  const record = requireRecord(payload, "Insites returned invalid audit data");
  return {
    status: requireString(record.status, "Insites returned an invalid request status"),
    reportStatus: requireString(record.report_status, "Insites returned an invalid audit processing state"),
    report: readRecord(record.report) ?? null,
  };
}

function parseAuditList(payload: unknown) {
  const record = requireRecord(payload, "Insites returned invalid audit search data");
  if (!Array.isArray(record.reports) || !record.reports.every((item) => readRecord(item))) {
    throw new ProviderRequestError(502, "Insites returned an invalid audit list");
  }
  return {
    status: requireString(record.status, "Insites returned an invalid request status"),
    reports: record.reports,
  };
}

function requireRecord(value: unknown, message: string) {
  const record = readRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function requireString(value: unknown, message: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(502, message);
  }
  return value;
}
