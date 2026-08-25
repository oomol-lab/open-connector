import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

type MocoRequestPhase = "validate" | "execute";
type MocoActionHandler = (input: Record<string, unknown>, context: MocoActionContext) => Promise<unknown>;

interface MocoActionContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface MocoRequestOptions {
  apiKey: string;
  apiBaseUrl: string;
  path: string;
  fetcher: typeof fetch;
  phase: MocoRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined>;
  notFoundAsInvalidInput?: boolean;
}

interface MocoJsonResponse {
  payload: unknown;
  headers: Headers;
}

const service = "moco";
const mocoValidationPath = "/session";
const mocoCredentialHelpUrl = "https://everii-group.github.io/mocoapp-api-docs/authentication.html";

export const mocoActionHandlers: ProviderActionHandlers<"moco", MocoActionHandler> = {
  get_profile(_input, context) {
    return getProfile(context);
  },
  list_companies(input, context) {
    return listCompanies(input, context);
  },
  get_company(input, context) {
    return getCompany(input, context);
  },
  list_contacts(input, context) {
    return listContacts(input, context);
  },
  get_contact(input, context) {
    return getContact(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<MocoActionContext>({
  service,
  handlers: mocoActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MocoActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const account = optionalString(credential.values.account) ?? optionalString(credential.metadata.account);
    const apiBaseUrl =
      optionalString(credential.metadata.apiBaseUrl) ?? buildMocoApiBaseUrl(normalizeMocoAccount(account));
    return {
      apiKey: credential.apiKey,
      apiBaseUrl,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMocoCredential(input.apiKey, input.values, fetcher, signal);
  },
};

async function validateMocoCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>>> {
  const account = normalizeMocoAccount(values.account);
  const apiBaseUrl = buildMocoApiBaseUrl(account);
  const { payload } = await requestMocoJson({
    apiKey,
    apiBaseUrl,
    path: mocoValidationPath,
    fetcher,
    signal,
    phase: "validate",
  });

  const session = readRequiredObject(payload, "session");
  const userId = String(readRequiredInteger(session.id, "session.id"));
  const userUuid = optionalString(session.uuid);

  return {
    profile: {
      accountId: `moco:${account}:user:${userId}`,
      displayName: `MOCO ${account}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      account,
      apiBaseUrl,
      validationEndpoint: `${apiBaseUrlPath()}${mocoValidationPath}`,
      userId,
      userUuid,
      credentialHelpUrl: mocoCredentialHelpUrl,
    }),
  };
}

function getProfile(context: MocoActionContext): Promise<unknown> {
  return requestMocoJson({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path: "/profile",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  }).then(({ payload }) => ({
    profile: normalizeProfile(payload),
  }));
}

async function listCompanies(input: Record<string, unknown>, context: MocoActionContext): Promise<unknown> {
  const { payload, headers } = await requestMocoJson({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path: "/companies",
    query: buildCompanyListQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    companies: readArray(payload, "companies").map((item) => normalizeCompany(item)),
    pagination: normalizePagination(headers),
  };
}

async function getCompany(input: Record<string, unknown>, context: MocoActionContext): Promise<unknown> {
  const companyId = readRequiredPositiveInteger(input.companyId, "companyId");
  const { payload } = await requestMocoJson({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path: `/companies/${encodeURIComponent(String(companyId))}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    company: normalizeCompany(payload),
  };
}

async function listContacts(input: Record<string, unknown>, context: MocoActionContext): Promise<unknown> {
  const { payload, headers } = await requestMocoJson({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path: "/contacts/people",
    query: buildContactListQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });

  return {
    contacts: readArray(payload, "contacts").map((item) => normalizeContact(item)),
    pagination: normalizePagination(headers),
  };
}

async function getContact(input: Record<string, unknown>, context: MocoActionContext): Promise<unknown> {
  const contactId = readRequiredPositiveInteger(input.contactId, "contactId");
  const { payload } = await requestMocoJson({
    apiKey: context.apiKey,
    apiBaseUrl: context.apiBaseUrl,
    path: `/contacts/people/${encodeURIComponent(String(contactId))}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    contact: normalizeContact(payload),
  };
}

async function requestMocoJson(options: MocoRequestOptions): Promise<MocoJsonResponse> {
  const url = new URL(`${trimTrailingSlash(options.apiBaseUrl)}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: "GET",
      headers: mocoHeaders(options.apiKey),
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MOCO request failed: ${error.message}` : "MOCO request failed",
    );
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw mapMocoError(response, payload, options.phase, options.notFoundAsInvalidInput);
  }

  return {
    payload,
    headers: response.headers,
  };
}

function mocoHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Token token=${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

function buildCompanyListQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    ...buildPaginationAndGlobalQuery(input),
    include_archived: optionalBoolean(input.includeArchived),
    type: optionalString(input.type),
    tags: readOptionalTags(input.tags),
    identifier: optionalString(input.identifier),
    term: optionalString(input.term),
  });
}

function buildContactListQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    ...buildPaginationAndGlobalQuery(input),
    tags: readOptionalTags(input.tags),
    term: optionalString(input.term),
    phone: optionalString(input.phone),
  });
}

function buildPaginationAndGlobalQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    page: optionalInteger(input.page),
    per_page: optionalInteger(input.perPage),
    updated_after: optionalString(input.updatedAfter),
    sort_by: buildSortBy(input),
  });
}

function buildSortBy(input: Record<string, unknown>): string | undefined {
  const sortBy = optionalString(input.sortBy);
  if (!sortBy) {
    return undefined;
  }
  const sortDirection = optionalString(input.sortDirection);
  return sortDirection ? `${sortBy} ${sortDirection}` : sortBy;
}

function readOptionalTags(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const tags = value.map((item) => String(item).trim()).filter((item) => item.length > 0);
  return tags.length > 0 ? tags.join(",") : undefined;
}

function normalizeProfile(value: unknown): Record<string, unknown> {
  const profile = readRequiredObject(value, "profile");
  return {
    id: readRequiredInteger(profile.id, "profile.id"),
    email: readNullableString(profile.email),
    fullName: readNullableString(profile.full_name),
    firstName: readNullableString(profile.first_name),
    lastName: readNullableString(profile.last_name),
    active: readNullableBoolean(profile.active),
    external: readNullableBoolean(profile.external),
    avatarUrl: readNullableString(profile.avatar_url),
    unit: normalizeShortReference(profile.unit),
    createdAt: readNullableString(profile.created_at),
    updatedAt: readNullableString(profile.updated_at),
    raw: profile,
  };
}

function normalizeCompany(value: unknown): Record<string, unknown> {
  const company = readRequiredObject(value, "company");
  return {
    id: readRequiredInteger(company.id, "company.id"),
    type: readNullableString(company.type),
    name: readRequiredString(company.name, "company.name"),
    website: readNullableString(company.website),
    email: readNullableString(company.email),
    phone: readNullableString(company.phone),
    tags: readStringArray(company.tags),
    identifier: readNullableString(company.identifier),
    active: readNullableBoolean(company.active),
    archivedOn: readNullableString(company.archived_on),
    createdAt: readNullableString(company.created_at),
    updatedAt: readNullableString(company.updated_at),
    raw: company,
  };
}

function normalizeContact(value: unknown): Record<string, unknown> {
  const contact = readRequiredObject(value, "contact");
  const firstName = readNullableString(contact.firstname);
  const lastName = readNullableString(contact.lastname);
  return {
    id: readRequiredInteger(contact.id, "contact.id"),
    gender: readNullableString(contact.gender),
    firstName,
    lastName,
    fullName: buildFullName(firstName, lastName),
    jobPosition: readNullableString(contact.job_position),
    mobilePhone: readNullableString(contact.mobile_phone),
    workPhone: readNullableString(contact.work_phone),
    workEmail: readNullableString(contact.work_email),
    tags: readStringArray(contact.tags),
    company: normalizeShortCompany(contact.company),
    createdAt: readNullableString(contact.created_at),
    updatedAt: readNullableString(contact.updated_at),
    raw: contact,
  };
}

function normalizeShortReference(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  const object = readRequiredObject(value, "reference");
  return {
    id: readRequiredInteger(object.id, "reference.id"),
    name: readRequiredString(object.name, "reference.name"),
  };
}

function normalizeShortCompany(value: unknown): Record<string, unknown> | null {
  if (value == null) {
    return null;
  }
  const object = readRequiredObject(value, "company");
  return {
    id: readRequiredInteger(object.id, "company.id"),
    type: readNullableString(object.type),
    name: readRequiredString(object.name, "company.name"),
  };
}

function normalizePagination(headers: Headers): Record<string, unknown> {
  const page = readHeaderInteger(headers, "x-page");
  const nextPage = readNextPage(headers.get("link"));
  return {
    page,
    perPage: readHeaderInteger(headers, "x-per-page"),
    total: readHeaderInteger(headers, "x-total"),
    hasNextPage: nextPage !== null,
    nextPage,
  };
}

function readNextPage(linkHeader: string | null): number | null {
  if (!linkHeader) {
    return null;
  }
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const [urlPart, ...parameters] = part.split(";");
    if (urlPart === undefined || !parameters.some((parameter) => parameter.trim() === 'rel="next"')) {
      continue;
    }
    const trimmedUrl = urlPart.trim();
    if (!trimmedUrl.startsWith("<") || !trimmedUrl.endsWith(">")) {
      continue;
    }
    try {
      const url = new URL(trimmedUrl.slice(1, -1));
      const page = Number(url.searchParams.get("page"));
      return Number.isInteger(page) ? page : null;
    } catch {
      return null;
    }
  }
  return null;
}

function mapMocoError(
  response: Response,
  payload: unknown,
  phase: MocoRequestPhase,
  notFoundAsInvalidInput = false,
): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? (response.statusText || "MOCO request failed");
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(502, message);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }
  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(object.error_message) ??
    optionalString(object.detail)
  );
}

export function normalizeMocoAccount(input?: string): string {
  const raw = input?.trim();
  if (!raw) {
    throw new ProviderRequestError(400, "account is required");
  }

  const account = extractMocoAccount(raw);
  if (!account || !isValidMocoAccount(account)) {
    throw new ProviderRequestError(400, "account must be a MOCO account subdomain or URL");
  }
  return account;
}

function buildMocoApiBaseUrl(account: string): string {
  return `https://${account}.mocoapp.com${apiBaseUrlPath()}`;
}

function extractMocoAccount(raw: string): string | undefined {
  if (!raw.includes("://")) {
    return trimApiPath(raw);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" || parsed.hostname === "mocoapp.com") {
    return undefined;
  }
  if (!parsed.hostname.endsWith(".mocoapp.com")) {
    return undefined;
  }
  return parsed.hostname.slice(0, -".mocoapp.com".length);
}

function trimApiPath(value: string): string {
  const withoutHostSuffix = value.endsWith(".mocoapp.com") ? value.slice(0, -".mocoapp.com".length) : value;
  return trimSlashes(withoutHostSuffix);
}

function isValidMocoAccount(account: string): boolean {
  if (account.length === 0 || account.length > 63) {
    return false;
  }
  const labels = account.split(".");
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      !label.startsWith("-") &&
      !label.endsWith("-") &&
      [...label].every((char) => isLowerAlphaNumeric(char) || char === "-"),
  );
}

function isLowerAlphaNumeric(value: string): boolean {
  const code = value.charCodeAt(0);
  return (code >= 97 && code <= 122) || (code >= 48 && code <= 57);
}

function apiBaseUrlPath(): string {
  return "/api/v1";
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function trimSlashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "/") start += 1;
  while (end > start && value[end - 1] === "/") end -= 1;
  return value.slice(start, end);
}

function readArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `MOCO returned invalid ${fieldName}`);
  }
  return value;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `MOCO returned invalid ${fieldName}`);
  }
  return object;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (stringValue === undefined) {
    throw new ProviderRequestError(502, `MOCO returned invalid ${fieldName}`);
  }
  return stringValue;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    throw new ProviderRequestError(502, `MOCO returned invalid ${fieldName}`);
  }
  return numberValue;
}

function readRequiredPositiveInteger(value: unknown, fieldName: string): number {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return numberValue;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readHeaderInteger(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function buildFullName(firstName: string | null, lastName: string | null): string | null {
  const parts = [firstName, lastName].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" ") : null;
}
