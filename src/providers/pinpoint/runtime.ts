import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata: Record<string, unknown>;
}
interface ValidateCredentialResult {
  providerAccountId?: string;
  accountLabel: string;
  providerMetadata: Record<string, unknown>;
}

interface PinpointRequestInput {
  apiBaseUrl: string;
  apiKey: string;
  path: string;
  query?: URLSearchParams;
  phase: "validate" | "execute";
  fetcher: typeof fetch;
}

export async function validatePinpointCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<ValidateCredentialResult> {
  const apiKey = requireString(input.apiKey, "apiKey");
  const apiBaseUrl = normalizePinpointApiBaseUrl(input.subdomain);
  const query = new URLSearchParams({ "page[size]": "1" });
  await requestPinpoint({ apiBaseUrl, apiKey, path: "/jobs", query, phase: "validate", fetcher });

  const subdomain = new URL(apiBaseUrl).hostname.split(".")[0] ?? input.subdomain;
  return {
    providerAccountId: `pinpoint:${subdomain}`,
    accountLabel: `Pinpoint (${subdomain})`,
    providerMetadata: { apiBaseUrl, subdomain, validationEndpoint: "/jobs" },
  };
}

export async function executePinpointAction(
  input: ApiKeyProviderActionInput & {
    actionName: string;
    input: Record<string, unknown>;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const resource = actionResource(input.actionName);
  const id = input.actionName.startsWith("get_") ? requireString(input.input.id, "id") : undefined;
  const path = id ? `/${resource}/${encodeURIComponent(id)}` : `/${resource}`;
  return requestPinpoint({
    apiBaseUrl: requireStoredPinpointApiBaseUrl(input.providerMetadata),
    apiKey: requireString(input.apiKey, "apiKey"),
    path,
    query: buildPinpointQuery(input.input, resource),
    phase: "execute",
    fetcher,
  });
}

export function normalizePinpointApiBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, "subdomain is required");
  }
  const subdomain = value.trim().toLowerCase();
  if (!isValidSubdomain(subdomain)) {
    throw new ProviderRequestError(400, "subdomain must be a single Pinpoint account subdomain");
  }
  return `https://${subdomain}.pinpointhq.com/api/v1`;
}

function isValidSubdomain(value: string) {
  if (value.length < 1 || value.length > 63 || value.startsWith("-") || value.endsWith("-")) return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isLetter = 97 <= code && code <= 122;
    const isDigit = 48 <= code && code <= 57;
    if (!isLetter && !isDigit && character !== "-") return false;
  }
  return true;
}

function requireStoredPinpointApiBaseUrl(metadata?: Record<string, unknown>) {
  const value = optionalString(metadata?.apiBaseUrl);
  if (!value) throw new ProviderRequestError(409, "Pinpoint account subdomain is missing");
  const url = new URL(value);
  return normalizePinpointApiBaseUrl(url.hostname.split(".")[0]);
}

function actionResource(actionName: string) {
  if (actionName.endsWith("job") || actionName.endsWith("jobs")) return "jobs";
  if (actionName.endsWith("candidate") || actionName.endsWith("candidates")) return "candidates";
  if (actionName.endsWith("application") || actionName.endsWith("applications")) return "applications";
  throw new ProviderRequestError(400, `unknown pinpoint action: ${actionName}`);
}

function buildPinpointQuery(input: Record<string, unknown>, resource: string) {
  const query = new URLSearchParams();
  appendNumber(query, "page[number]", optionalInteger(input.page));
  appendNumber(query, "page[size]", optionalInteger(input.pageSize));
  appendArray(query, "include", input.include);
  appendArray(query, `fields[${resource}]`, input.fields);
  appendArray(query, `extra_fields[${resource}]`, input.extraFields);
  appendArray(query, "sort", input.sort);
  if (input.includeTotal === true) query.set("stats[total]", "count");

  const filters = optionalRecord(input.filters);
  if (filters) {
    for (const [name, value] of Object.entries(filters)) appendQueryValue(query, `filter[${name}]`, value);
  }
  return query;
}

function appendNumber(query: URLSearchParams, name: string, value: number | undefined) {
  if (value !== undefined) query.set(name, String(value));
}

function appendArray(query: URLSearchParams, name: string, value: unknown) {
  if (!Array.isArray(value)) return;
  const strings = value.filter((item): item is string => typeof item === "string");
  if (strings.length > 0) query.set(name, strings.join(","));
}

function appendQueryValue(query: URLSearchParams, name: string, value: unknown) {
  if (typeof value === "string" || typeof value === "boolean" || Number.isInteger(value))
    query.set(name, String(value));
  else appendArray(query, name, value);
}

async function requestPinpoint(input: PinpointRequestInput) {
  const timeout = createProviderTimeout(undefined);
  const guardedFetch = input.fetcher;
  const url = new URL(`${input.apiBaseUrl}${input.path}`);
  if (input.query) url.search = input.query.toString();
  try {
    const response = await guardedFetch(url, {
      headers: {
        accept: "application/vnd.api+json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      signal: timeout.signal,
    });
    const payload = await readPinpointPayload(response);
    if (!response.ok) throw createPinpointError(response.status, payload, input.phase);
    return requireJsonApiDocument(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "Pinpoint request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pinpoint request failed: ${error.message}` : "Pinpoint request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPinpointPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Pinpoint returned malformed JSON");
  }
}

function requireJsonApiDocument(payload: unknown) {
  const document = optionalRecord(payload);
  if (!document || !("data" in document))
    throw new ProviderRequestError(502, "Pinpoint response did not include JSON:API data");
  return document;
}

function createPinpointError(status: number, payload: unknown, phase: "validate" | "execute") {
  const message = extractPinpointError(payload) ?? `Pinpoint request failed with status ${status}`;
  if (status === 401 || status === 403) return new ProviderRequestError(phase === "validate" ? 400 : 409, message);
  if (status === 429) return new ProviderRequestError(429, message);
  if (400 <= status && status < 500) return new ProviderRequestError(400, message);
  return new ProviderRequestError(status || 502, message);
}

function extractPinpointError(payload: unknown) {
  const document = optionalRecord(payload);
  const errors = document?.errors;
  if (!Array.isArray(errors)) return optionalString(document?.message);
  const first = optionalRecord(errors[0]);
  return optionalString(first?.detail) ?? optionalString(first?.title);
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) throw new ProviderRequestError(400, `${fieldName} is required`);
  return value.trim();
}
