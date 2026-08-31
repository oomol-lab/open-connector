import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalIntegerOrNull,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
  positiveInteger,
  requiredString,
} from "../../core/cast.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const autotaskZoneInformationBaseUrl = "https://webservices.autotask.net/atservicesrest";

const autotaskApiVersionPath = "v1.0";
const autotaskValidationPath = "Companies/entityInformation";

type AutotaskPhase = "validate" | "execute";
type AutotaskEntity = "Companies" | "Contacts" | "Tickets";

export interface AutotaskCredentials {
  username: string;
  secret: string;
  integrationCode: string;
}

export interface AutotaskActionContext extends AutotaskCredentials {
  apiBaseUrl: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

interface AutotaskZoneInformation {
  apiBaseUrl: string;
  zoneName: string | null;
  webUrl: string | null;
  ci: number | null;
  raw: Record<string, unknown>;
}

type AutotaskActionHandler = (input: Record<string, unknown>, context: AutotaskActionContext) => Promise<unknown>;

export const autotaskActionHandlers: ProviderActionHandlers<"autotask", AutotaskActionHandler> = {
  get_zone_information(_input, context) {
    return getAutotaskZoneInformation(context.username, context.fetcher, context.signal);
  },
  query_records(input, context) {
    return queryAutotaskRecords(input, context);
  },
  get_record(input, context) {
    return getAutotaskRecord(input, context);
  },
  get_entity_information(input, context) {
    return getAutotaskEntityInformation(input, context);
  },
};

export async function validateAutotaskCredential(
  credentials: AutotaskCredentials,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const zone = await getAutotaskZoneInformation(credentials.username, fetcher, signal);
  await requestAutotaskJson({
    apiBaseUrl: zone.apiBaseUrl,
    path: autotaskValidationPath,
    credentials,
    fetcher,
    phase: "validate",
    method: "GET",
    signal,
  });

  return {
    profile: {
      accountId: credentials.username,
      displayName: `Autotask ${credentials.username}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: zone.apiBaseUrl,
      zoneName: zone.zoneName,
      webUrl: zone.webUrl,
      ci: zone.ci,
      validationEndpoint: autotaskValidationPath,
    }),
  };
}

export function resolveAutotaskApiBaseUrl(providerMetadata: Record<string, unknown> | undefined): string {
  const apiBaseUrl = optionalString(providerMetadata?.apiBaseUrl);
  if (!apiBaseUrl) {
    throw new ProviderRequestError(400, "autotask connection is missing apiBaseUrl metadata");
  }
  return normalizeAutotaskApiBaseUrl(apiBaseUrl);
}

async function getAutotaskZoneInformation(
  username: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<AutotaskZoneInformation> {
  const payload = await requestAutotaskZoneInformation(username, fetcher, signal);
  const record = requireObjectPayload(payload, "Autotask zone information");
  const apiBaseUrl = normalizeAutotaskApiBaseUrl(readRequiredString(record.url, "url"));

  return {
    apiBaseUrl,
    zoneName: optionalStringOrNull(record.zoneName),
    webUrl: optionalStringOrNull(record.webUrl),
    ci: optionalIntegerOrNull(record.ci),
    raw: record,
  };
}

async function queryAutotaskRecords(
  input: Record<string, unknown>,
  context: AutotaskActionContext,
): Promise<Record<string, unknown>> {
  const entity = readAutotaskEntity(input.entity);
  const payload = await requestAutotaskJson({
    apiBaseUrl: context.apiBaseUrl,
    path: `${entity}/query`,
    credentials: context,
    fetcher: context.fetcher,
    phase: "execute",
    method: "POST",
    body: buildAutotaskSearch(input),
    signal: context.signal,
  });
  const record = requireObjectPayload(payload, "Autotask query response");
  const items = objectArray(record.items, "Autotask query items", providerResponseError);

  return {
    items,
    pageDetails: optionalRecord(record.pageDetails) ?? {},
    raw: record,
  };
}

async function getAutotaskRecord(
  input: Record<string, unknown>,
  context: AutotaskActionContext,
): Promise<Record<string, unknown>> {
  const entity = readAutotaskEntity(input.entity);
  const id = positiveInteger(input.id, "id", providerInputError);
  const payload = await requestAutotaskJson({
    apiBaseUrl: context.apiBaseUrl,
    path: `${entity}/${id}`,
    credentials: context,
    fetcher: context.fetcher,
    phase: "execute",
    method: "GET",
    signal: context.signal,
  });
  const record = requireObjectPayload(payload, "Autotask record response");

  return {
    item: optionalRecord(record.item) ?? record,
    raw: record,
  };
}

async function getAutotaskEntityInformation(
  input: Record<string, unknown>,
  context: AutotaskActionContext,
): Promise<Record<string, unknown>> {
  const entity = readAutotaskEntity(input.entity);
  const section = optionalString(input.section) ?? "summary";
  const suffix = section === "fields" ? "/fields" : section === "userDefinedFields" ? "/userDefinedFields" : "";
  const payload = await requestAutotaskJson({
    apiBaseUrl: context.apiBaseUrl,
    path: `${entity}/entityInformation${suffix}`,
    credentials: context,
    fetcher: context.fetcher,
    phase: "execute",
    method: "GET",
    signal: context.signal,
  });
  const record = requireObjectPayload(payload, "Autotask entity information response");

  return {
    information: record,
    raw: record,
  };
}

async function requestAutotaskZoneInformation(
  username: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<unknown> {
  const url = buildAutotaskUrl(autotaskZoneInformationBaseUrl, "zoneInformation");
  url.searchParams.set("user", username);
  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Autotask zoneInformation request failed: ${error.message}`
        : "Autotask zoneInformation request failed",
    );
  }

  const payload = await readAutotaskPayload(response);
  if (!response.ok) {
    throw mapAutotaskError(response.status, payload, "validate");
  }
  return payload;
}

async function requestAutotaskJson(input: {
  apiBaseUrl: string;
  path: string;
  credentials: AutotaskCredentials;
  fetcher: ProviderFetch;
  phase: AutotaskPhase;
  method: "GET" | "POST";
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}): Promise<unknown> {
  const url = buildAutotaskUrl(input.apiBaseUrl, input.path);
  let response: Response;
  try {
    response = await input.fetcher(url.toString(), {
      method: input.method,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        Username: input.credentials.username,
        Secret: input.credentials.secret,
        APIIntegrationcode: input.credentials.integrationCode,
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Autotask request failed: ${error.message}` : "Autotask request failed",
    );
  }

  const payload = await readAutotaskPayload(response);
  if (!response.ok) {
    throw mapAutotaskError(response.status, payload, input.phase);
  }
  return payload;
}

async function readAutotaskPayload(response: Response): Promise<unknown> {
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

function mapAutotaskError(status: number, payload: unknown, phase: AutotaskPhase): ProviderRequestError {
  const message = extractAutotaskErrorMessage(payload) ?? `Autotask request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 422 ? 400 : status, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function extractAutotaskErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim().slice(0, 300);
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const errors = record.errors;
  if (Array.isArray(errors)) {
    const first = errors.find((item) => typeof item === "string" && item.trim());
    if (typeof first === "string") {
      return first.trim();
    }
  }
  return optionalString(record.error) ?? optionalString(record.message);
}

function buildAutotaskSearch(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    MaxRecords: input.maxRecords,
    IncludeFields: readOptionalStringArray(input.includeFields, "includeFields"),
    filter: readFilterArray(input.filter),
  });
}

function normalizeAutotaskApiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ProviderRequestError(400, "Autotask apiBaseUrl must be a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "Autotask apiBaseUrl must use https");
  }
  const hostname = url.hostname.toLowerCase();
  if (!isAutotaskApiHostname(hostname)) {
    throw new ProviderRequestError(400, "Autotask apiBaseUrl must be an official autotask.net REST API URL");
  }
  const segments = url.pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const atServicesRestIndex = segments.findIndex((segment) => segment.toLowerCase() === "atservicesrest");
  if (atServicesRestIndex === -1) {
    throw new ProviderRequestError(400, "Autotask apiBaseUrl must include atservicesrest");
  }
  return `${url.origin}/${segments.slice(0, atServicesRestIndex + 1).join("/")}`;
}

function isAutotaskApiHostname(hostname: string): boolean {
  return (
    (hostname.startsWith("webservices") && hostname.endsWith(".autotask.net")) ||
    hostname === "prde.autotask.net" ||
    hostname === "pres.autotask.net"
  );
}

function buildAutotaskUrl(apiBaseUrl: string, path: string): URL {
  const trimmedPath = path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(`${autotaskApiVersionPath}/${trimmedPath}`, `${apiBaseUrl}/`);
}

function readAutotaskEntity(value: unknown): AutotaskEntity {
  if (value === "Companies" || value === "Contacts" || value === "Tickets") {
    return value;
  }
  throw new ProviderRequestError(400, "entity must be Companies, Contacts, or Tickets");
}

function readFilterArray(value: unknown): Array<Record<string, unknown>> {
  if (value === undefined) {
    return [{ op: "exist", field: "id" }];
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, "filter must be a non-empty array");
  }
  return value.map((item) => requireObjectPayload(item, "Autotask filter expression"));
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => readRequiredString(item, fieldName));
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

function requireObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be a JSON object`);
  }
  return record;
}
