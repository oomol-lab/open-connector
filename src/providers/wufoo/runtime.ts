import type { CredentialValidationResult } from "../../core/types.ts";

import { Buffer } from "node:buffer";
import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

type WufooRequestPhase = "validate" | "execute";

interface WufooContext {
  apiKey: string;
  subdomain: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface WufooRequestInput extends WufooContext {
  path: string;
  phase: WufooRequestPhase;
  method?: string;
  query?: URLSearchParams;
  form?: URLSearchParams;
}

interface WufooFilter {
  fieldId: string;
  operator: string;
  value: string;
}

type WufooActionHandler = (input: Record<string, unknown>, context: WufooContext) => Promise<unknown>;

export const wufooActionHandlers: Record<string, WufooActionHandler> = {
  list_forms: listForms,
  get_form: getForm,
  list_form_fields: listFormFields,
  list_entries: listEntries,
  count_entries: countEntries,
  submit_entry: submitEntry,
};

export function createWufooContext(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): WufooContext {
  return { apiKey, subdomain: normalizeWufooSubdomain(values.subdomain), fetcher, signal };
}

export async function validateWufooCredential(
  values: Record<string, string>,
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = createWufooContext(values, apiKey, fetcher, signal);
  await requestWufooJson({
    ...context,
    path: "/forms.json",
    query: queryParams({ limit: 1 }),
    phase: "validate",
  });
  return {
    profile: { accountId: `wufoo:${context.subdomain}`, displayName: `Wufoo ${context.subdomain}` },
    grantedScopes: [],
    metadata: {
      subdomain: context.subdomain,
      apiBaseUrl: buildWufooApiBaseUrl(context.subdomain),
      validationEndpoint: "/api/v3/forms.json?limit=1",
    },
  };
}

export function normalizeWufooSubdomain(value: unknown): string {
  const trimmed = optionalString(value)?.toLowerCase();
  if (!trimmed) throw providerInputError("subdomain is required");
  let candidate = trimmed;
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw providerInputError("subdomain must be a Wufoo subdomain or URL");
    }
    if (url.pathname != "/" || url.search || url.hash || url.username || url.password) {
      throw providerInputError("subdomain must be a Wufoo subdomain or URL");
    }
    candidate = url.hostname;
  }
  const suffix = ".wufoo.com";
  if (candidate.endsWith(suffix)) candidate = candidate.slice(0, -suffix.length);
  if (!isValidSubdomain(candidate)) throw providerInputError("subdomain must be a Wufoo subdomain or URL");
  return candidate;
}

export function buildWufooApiBaseUrl(subdomain: string): string {
  return `https://${subdomain}.wufoo.com/api/v3`;
}

function isValidSubdomain(value: string): boolean {
  if (value.length == 0 || value.length > 63 || value.startsWith("-") || value.endsWith("-")) return false;
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isLowerAlpha = 97 <= code && code <= 122;
    const isDigit = 48 <= code && code <= 57;
    if (!isLowerAlpha && !isDigit && char != "-") return false;
  }
  return true;
}

function listForms(input: Record<string, unknown>, context: WufooContext): Promise<unknown> {
  return requestWufooJson({
    ...context,
    path: "/forms.json",
    query: queryParams({
      page: optionalInteger(input.page),
      limit: optionalInteger(input.limit),
      includeTodayCount: optionalBoolean(input.includeTodayCount),
    }),
    phase: "execute",
  }).then((payload) => ({ forms: readArray(payload, "Forms") }));
}

function getForm(input: Record<string, unknown>, context: WufooContext): Promise<unknown> {
  const formIdentifier = requiredString(input.formIdentifier, "formIdentifier", providerInputError);
  return requestWufooJson({
    ...context,
    path: `/forms/${encodeURIComponent(formIdentifier)}.json`,
    query: queryParams({ includeTodayCount: optionalBoolean(input.includeTodayCount) }),
    phase: "execute",
  }).then((payload) => {
    const form = readArray(payload, "Forms")[0];
    if (!form) throw providerInputError("Wufoo form was not found");
    return { form };
  });
}

function listFormFields(input: Record<string, unknown>, context: WufooContext): Promise<unknown> {
  const formIdentifier = requiredString(input.formIdentifier, "formIdentifier", providerInputError);
  return requestWufooJson({
    ...context,
    path: `/forms/${encodeURIComponent(formIdentifier)}/fields.json`,
    query: queryParams({ system: optionalBoolean(input.includeSystemFields) }),
    phase: "execute",
  }).then((payload) => ({ fields: readArray(payload, "Fields") }));
}

function listEntries(input: Record<string, unknown>, context: WufooContext): Promise<unknown> {
  const formIdentifier = requiredString(input.formIdentifier, "formIdentifier", providerInputError);
  const query = queryParams({
    system: optionalBoolean(input.includeSystemFields),
    pageStart: optionalInteger(input.pageStart),
    pageSize: optionalInteger(input.pageSize),
    sort: optionalString(input.sortFieldId),
    sortDirection: optionalString(input.sortDirection),
  });
  appendFilters(query, input);
  return requestWufooJson({
    ...context,
    path: `/forms/${encodeURIComponent(formIdentifier)}/entries.json`,
    query,
    phase: "execute",
  }).then((payload) => ({ entries: readArray(payload, "Entries") }));
}

function countEntries(input: Record<string, unknown>, context: WufooContext): Promise<unknown> {
  const formIdentifier = requiredString(input.formIdentifier, "formIdentifier", providerInputError);
  const query = new URLSearchParams();
  appendFilters(query, input);
  return requestWufooJson({
    ...context,
    path: `/forms/${encodeURIComponent(formIdentifier)}/entries/count.json`,
    query,
    phase: "execute",
  }).then((payload) => {
    const count = Number(optionalRecord(payload)?.EntryCount);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new ProviderRequestError(502, "Wufoo returned an invalid entry count", payload);
    }
    return { count };
  });
}

async function submitEntry(input: Record<string, unknown>, context: WufooContext): Promise<unknown> {
  const formIdentifier = requiredString(input.formIdentifier, "formIdentifier", providerInputError);
  const fields = optionalRecord(input.fields);
  if (!fields) throw providerInputError("fields is required");
  const form = new URLSearchParams();
  for (const [fieldId, value] of Object.entries(fields)) {
    if (typeof value != "string") throw providerInputError(`fields.${fieldId} must be a string`);
    form.append(fieldId, value);
  }
  const payload = optionalRecord(
    await requestWufooJson({
      ...context,
      path: `/forms/${encodeURIComponent(formIdentifier)}/entries.json`,
      method: "POST",
      form,
      phase: "execute",
    }),
  );
  if (!payload) throw new ProviderRequestError(502, "Wufoo returned an invalid submission result");
  return normalizeSubmission(payload);
}

async function requestWufooJson(input: WufooRequestInput): Promise<unknown> {
  const url = new URL(`${buildWufooApiBaseUrl(input.subdomain)}${input.path}`);
  for (const [key, value] of input.query ?? []) url.searchParams.append(key, value);
  const headers = new Headers({
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`${input.apiKey}:footastic`).toString("base64")}`,
    "user-agent": providerUserAgent,
  });
  if (input.form) headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8");
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      body: input.form?.toString(),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Wufoo request failed: ${error instanceof Error ? error.message : "network error"}`,
    );
  }
  const payload = await readResponsePayload(response);
  if (!response.ok) throwWufooHttpError(response.status, payload, input.phase);
  return payload;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Wufoo returned an invalid JSON response");
  }
}

function throwWufooHttpError(status: number, payload: unknown, phase: WufooRequestPhase): never {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.Text) ?? optionalString(record?.ErrorText) ?? `Wufoo request failed with HTTP ${status}`;
  if (status == 401 || status == 403) throw new ProviderRequestError(phase == "validate" ? 400 : status, message);
  if (status == 421 || status == 429) throw new ProviderRequestError(429, message);
  if (status == 404) throw new ProviderRequestError(400, message);
  throw new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function queryParams(values: Record<string, string | number | boolean | undefined>): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value != null) query.set(key, String(value));
  }
  return query;
}

function appendFilters(query: URLSearchParams, input: Record<string, unknown>): void {
  if (!Array.isArray(input.filters) || input.filters.length == 0) return;
  for (const [index, rawFilter] of input.filters.entries()) {
    const filter = readFilter(rawFilter, index);
    query.set(`Filter${index + 1}`, `${filter.fieldId} ${filter.operator} ${filter.value}`);
  }
  query.set("match", optionalString(input.match) ?? "AND");
}

function readFilter(value: unknown, index: number): WufooFilter {
  const filter = optionalRecord(value);
  if (!filter) throw providerInputError(`filters.${index} must be an object`);
  return {
    fieldId: requiredString(filter.fieldId, `filters.${index}.fieldId`, providerInputError),
    operator: requiredString(filter.operator, `filters.${index}.operator`, providerInputError),
    value: requireStringAllowEmpty(filter.value, `filters.${index}.value`),
  };
}

function readArray(payload: unknown, key: string): Array<Record<string, unknown>> {
  const value = optionalRecord(payload)?.[key];
  if (!Array.isArray(value)) throw new ProviderRequestError(502, `Wufoo response is missing ${key}`, payload);
  return value.map((item) => optionalRecord(item) ?? {});
}

function normalizeSubmission(payload: Record<string, unknown>): Record<string, unknown> {
  const successMarker = payload.Success;
  if (successMarker !== 0 && successMarker !== "0" && successMarker !== 1 && successMarker !== "1") {
    throw new ProviderRequestError(502, "Wufoo returned an invalid submission result", payload);
  }
  const success = successMarker === 1 || successMarker === "1";
  const entryId = parseEntryId(payload.EntryId);
  if (success && entryId == null) throw new ProviderRequestError(502, "Wufoo returned an invalid submission result");
  const rawErrors = Array.isArray(payload.FieldErrors) ? payload.FieldErrors : [];
  return {
    success,
    entryId: success ? entryId : null,
    entryLink: optionalString(payload.EntryLink) ?? null,
    redirectUrl: optionalString(payload.RedirectUrl) ?? null,
    errorText: optionalString(payload.ErrorText) ?? null,
    fieldErrors: rawErrors.map((item) => {
      const error = optionalRecord(item);
      return { fieldId: optionalString(error?.ID) ?? "", message: optionalString(error?.ErrorText) ?? "" };
    }),
  };
}

function parseEntryId(value: unknown): number | null {
  if (typeof value == "number") return Number.isSafeInteger(value) && value > 0 ? value : null;
  if (typeof value != "string" || !value || value.trim() != value) return null;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 48 || code > 57) return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && String(parsed) == value ? parsed : null;
}

function requireStringAllowEmpty(value: unknown, fieldName: string): string {
  if (typeof value != "string") throw providerInputError(`${fieldName} must be a string`);
  return value;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
