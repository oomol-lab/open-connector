import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalNumber, optionalRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  setSearchParams,
} from "../provider-runtime.ts";

export const taveApiBaseUrl = "https://workspace.vsco.co/api/v2";
const defaultTimeoutMs = 30_000;

type TaveActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type TaveContactKind = "person" | "company" | "location" | "employee";

export const taveActionHandlers: ProviderActionHandlers<"tave", TaveActionHandler> = {
  async list_contacts(input, context): Promise<unknown> {
    const payload = await requestTaveJson({
      context,
      path: "/address-book",
      params: compactObject({
        page: readOptionalIntegerString(input.page, "page"),
        pageSize: readOptionalIntegerString(input.pageSize, "pageSize"),
        includeHidden: typeof input.includeHidden === "boolean" ? String(input.includeHidden) : undefined,
        email: readOptionalString(input.email) ?? undefined,
        sortBy: readOptionalString(input.sortBy) ?? undefined,
      }),
      phase: "execute",
    });
    return {
      pagination: normalizePagination(payload.meta),
      contacts: normalizeContactList(payload.items),
    };
  },
  async get_contact(input, context): Promise<unknown> {
    const payload = await requestTaveJson({
      context,
      path: `/address-book/${encodeURIComponent(readRequiredString(input.id, "id"))}`,
      params: {},
      phase: "execute",
    });
    return { contact: normalizeContact(payload) };
  },
  async get_my_studio(_input, context): Promise<unknown> {
    const payload = await requestTaveJson({
      context,
      path: "/studio/me",
      params: {},
      phase: "execute",
    });
    return { studio: normalizeStudio(payload) };
  },
};

export async function validateTaveCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await requestTaveJson({
    context: { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    path: "/studio/me",
    params: {},
    phase: "validate",
  });
  const studioId = readOptionalString(payload.id) ?? undefined;
  const name = readOptionalString(payload.name);
  const email = readOptionalString(payload.email);
  return {
    profile: {
      accountId: studioId ?? email ?? "tave-api-key",
      displayName: name ?? email ?? "VSCO Workspace API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: taveApiBaseUrl,
      validationEndpoint: "/studio/me",
      studioId,
      studioName: name ?? undefined,
      readonlyEnabled: typeof payload.readonlyEnabled === "boolean" ? payload.readonlyEnabled : undefined,
    }),
  };
}

interface TaveRequestInput {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  params: Record<string, string | undefined>;
  phase: "validate" | "execute";
}

async function requestTaveJson(input: TaveRequestInput): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(input.context.signal, defaultTimeoutMs);
  try {
    const url = new URL(input.path.startsWith("/") ? input.path.slice(1) : input.path, `${taveApiBaseUrl}/`);
    setSearchParams(url, input.params);
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const payload = await readTavePayload(response);
    if (!response.ok) {
      throw createTaveError(response.status, payload, input.phase);
    }
    const record = optionalRecord(payload);
    if (!record) throw new ProviderRequestError(502, "Táve returned an invalid payload");
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) throw new ProviderRequestError(504, "Táve request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Táve request failed: ${error.message}` : "Táve request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readTavePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Táve returned invalid JSON");
  }
}

function createTaveError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractTaveErrorMessage(payload) ?? `Táve request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && status >= 400 && status < 500) return new ProviderRequestError(400, message, payload);
  if (phase === "execute" && (status === 401 || status === 403))
    return new ProviderRequestError(status, message, payload);
  if (phase === "execute" && status >= 400 && status < 500) return new ProviderRequestError(status, message, payload);
  return new ProviderRequestError(status || 502, message, payload);
}

function extractTaveErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  const record = optionalRecord(payload);
  return (
    readOptionalString(record?.detail) ??
    readOptionalString(record?.title) ??
    readOptionalString(record?.message) ??
    undefined
  );
}

function normalizePagination(value: unknown): Record<string, number | null> {
  const record = optionalRecord(value);
  return {
    currentPage: optionalInteger(record?.currentPage) ?? null,
    totalPages: optionalInteger(record?.totalPages) ?? null,
    totalItems: optionalInteger(record?.totalItems) ?? null,
    rows: optionalInteger(record?.rows) ?? null,
  };
}

function normalizeContactList(value: unknown): unknown[] {
  return Array.isArray(value) ? value.map((item) => normalizeContact(item)) : [];
}

function normalizeContact(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "contact");
  return {
    id: readOptionalString(record.id),
    kind: readContactKind(record.kind),
    name: readOptionalString(record.name),
    firstName: readOptionalString(record.firstName),
    lastName: readOptionalString(record.lastName),
    companyName: readOptionalString(record.companyName),
    displayAs: readOptionalString(record.displayAs),
    email: readOptionalString(record.email),
    secondaryEmail: readOptionalString(record.secondaryEmail),
    phone: readOptionalString(record.phone),
    cellPhone: readOptionalString(record.cellPhone),
    homePhone: readOptionalString(record.homePhone),
    workPhone: readOptionalString(record.workPhone),
    created: readOptionalString(record.created),
    modified: readOptionalString(record.modified),
    hidden: optionalBoolean(record.hidden) ?? null,
    pinned: optionalBoolean(record.pinned) ?? null,
    url: readOptionalString(record.url),
    address: normalizeAddress(record.address),
    mailingAddress: normalizeAddress(record.mailingAddress),
    links: normalizeLinks(record.links),
    raw: record,
  };
}

function normalizeStudio(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "studio");
  return {
    id: readOptionalString(record.id),
    name: readOptionalString(record.name),
    email: readOptionalString(record.email),
    currencyCode: readOptionalString(record.currencyCode),
    dateFormat: readOptionalString(record.dateFormat),
    decimalSeparator: readOptionalString(record.decimalSeparator),
    defaultBrandId: readOptionalString(record.defaultBrandId),
    temperature: readOptionalString(record.temperature),
    thousandsSeparator: readOptionalString(record.thousandsSeparator),
    timeFormat: readOptionalString(record.timeFormat),
    timezoneId: readOptionalString(record.timezoneId),
    weekStartsOn: readOptionalString(record.weekStartsOn),
    readonlyEnabled: optionalBoolean(record.readonlyEnabled) ?? null,
    readonlyEnabledAt: readOptionalString(record.readonlyEnabledAt),
    created: readOptionalString(record.created),
    modified: readOptionalString(record.modified),
    hidden: optionalBoolean(record.hidden) ?? null,
    links: normalizeLinks(record.links),
    raw: record,
  };
}

function normalizeAddress(value: unknown): Record<string, unknown> | null {
  const record = optionalRecord(value);
  if (!record) return null;
  return {
    streetAddress: readOptionalString(record.streetAddress),
    village: readOptionalString(record.village),
    city: readOptionalString(record.city),
    state: readOptionalString(record.state),
    postalCode: readOptionalString(record.postalCode),
    country: readOptionalString(record.country),
    latitude: optionalNumber(record.latitude) ?? null,
    longitude: optionalNumber(record.longitude) ?? null,
    timezone: readOptionalString(record.timezone),
  };
}

function normalizeLinks(value: unknown): Record<string, string | null> {
  const record = optionalRecord(value);
  const selfRecord = optionalRecord(record?.self);
  return {
    selfHref: readOptionalString(selfRecord?.href),
    managerHref: readOptionalString(record?.managerHref),
    clientHref: readOptionalString(record?.clientHref),
  };
}

function readContactKind(value: unknown): TaveContactKind | null {
  return value === "person" || value === "company" || value === "location" || value === "employee" ? value : null;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = readOptionalString(value);
  if (!stringValue) throw new ProviderRequestError(400, `${fieldName} is required`);
  return stringValue;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readOptionalIntegerString(value: unknown, fieldName: string): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`);
  }
  return String(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `Táve returned an invalid ${label} payload`);
  return record;
}
