import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  rawStringOrNull,
} from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const service = "accredible_certificates";
const accredibleCertificatesApiBaseUrl = "https://api.accredible.com/";

type AccredibleCertificatesRequestPhase = "validate" | "execute";
type AccredibleCertificatesMethod = "GET" | "POST" | "DELETE";
type AccredibleCertificatesActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

interface AccredibleIssuer {
  id?: number;
  name: string | null;
  email: string | null;
}

export const accredibleCertificatesActionHandlers: ProviderActionHandlers<
  "accredible_certificates",
  AccredibleCertificatesActionHandler
> = {
  list_groups(_input, context) {
    return executeListGroups(context);
  },
  get_group(input, context) {
    return executeGetGroup(input, context);
  },
  search_groups(input, context) {
    return executeSearchGroups(input, context);
  },
  list_credentials(input, context) {
    return executeListCredentials(input, context);
  },
  get_credential(input, context) {
    return executeGetCredential(input, context);
  },
  search_credentials(input, context) {
    return executeSearchCredentials(input, context);
  },
  create_credential(input, context) {
    return executeCreateCredential(input, context);
  },
  delete_credential(input, context) {
    return executeDeleteCredential(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  accredibleCertificatesActionHandlers,
);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const issuer = normalizeIssuer(
      await requestAccredibleCertificatesJson({
        apiKey: input.apiKey,
        path: "/v1/issuer/details",
        fetcher,
        signal,
        phase: "validate",
      }),
    );

    return {
      profile: {
        accountId: issuer.id === undefined ? "accredible_certificates:api_key" : String(issuer.id),
        displayName: issuer.name ?? issuer.email ?? "Accredible API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: accredibleCertificatesApiBaseUrl,
        validationEndpoint: "/v1/issuer/details",
        issuerId: issuer.id,
        issuerName: issuer.name,
        issuerEmail: issuer.email,
      }),
    };
  },
};

async function executeListGroups(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await requestAccredibleCertificatesJson({
    apiKey: context.apiKey,
    path: "/v1/issuer/all_groups",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requiredResponseRecord(payload, "Accredible list groups response");

  return {
    groups: normalizeGroupList(record.groups),
    meta: normalizePaginationMeta(record.meta),
  };
}

async function executeGetGroup(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const groupId = requireStringLike(input.group_id, "group_id");
  const payload = await requestAccredibleCertificatesJson({
    apiKey: context.apiKey,
    path: `/v1/issuer/groups/${encodeURIComponent(groupId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requiredResponseRecord(payload, "Accredible get group response");

  return {
    group: normalizeGroup(record.group),
  };
}

async function executeSearchGroups(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAccredibleCertificatesJson({
    apiKey: context.apiKey,
    path: "/v1/issuer/groups/search",
    method: "POST",
    body: compactRequestObject(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requiredResponseRecord(payload, "Accredible search groups response");

  return {
    groups: normalizeGroupList(record.groups),
    meta: normalizePaginationMeta(record.meta),
  };
}

async function executeListCredentials(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAccredibleCertificatesJson({
    apiKey: context.apiKey,
    path: "/v1/all_credentials",
    query: stringifyQueryValues(
      pickFields(input, [
        "group_id",
        "email",
        "recipient_id",
        "license_id",
        "start_date",
        "end_date",
        "start_updated_date",
        "end_updated_date",
        "page_size",
        "page",
      ]),
    ),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requiredResponseRecord(payload, "Accredible list credentials response");

  return {
    credentials: normalizeCredentialList(record.credentials),
    meta: normalizePaginationMeta(record.meta),
  };
}

async function executeGetCredential(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const credentialId = requireStringLike(input.id, "id");
  const payload = await requestAccredibleCertificatesJson({
    apiKey: context.apiKey,
    path: `/v1/credentials/${encodeURIComponent(credentialId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requiredResponseRecord(payload, "Accredible get credential response");

  return {
    credential: normalizeCredential(record.credential),
  };
}

async function executeSearchCredentials(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAccredibleCertificatesJson({
    apiKey: context.apiKey,
    path: "/v1/credentials/search",
    method: "POST",
    body: compactRequestObject(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requiredResponseRecord(payload, "Accredible search credentials response");

  return {
    credentials: normalizeCredentialList(record.credentials),
    meta: normalizePaginationMeta(record.meta),
  };
}

async function executeCreateCredential(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAccredibleCertificatesJson({
    apiKey: context.apiKey,
    path: "/v1/credentials",
    method: "POST",
    body: compactRequestObject(input),
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requiredResponseRecord(payload, "Accredible create credential response");

  return {
    credential: normalizeCredential(record.credential),
  };
}

async function executeDeleteCredential(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const credentialId = requireStringLike(input.id, "id");
  const payload = await requestAccredibleCertificatesJson({
    apiKey: context.apiKey,
    path: `/v1/credentials/${encodeURIComponent(credentialId)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = optionalRecord(payload);

  return {
    deleted: true,
    credential: record?.credential === undefined ? null : normalizeCredential(record.credential),
  };
}

async function requestAccredibleCertificatesJson(input: {
  apiKey: string;
  path: string;
  method?: AccredibleCertificatesMethod;
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: AccredibleCertificatesRequestPhase;
}): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  const method = input.method ?? "GET";

  let response: Response;
  let payload: unknown;
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Token token=${input.apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (method === "POST") {
    headers["content-type"] = "application/json";
  }

  try {
    response = await input.fetcher(buildAccredibleCertificatesUrl(input.path, input.query ?? {}), {
      method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readAccredibleCertificatesPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Accredible request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Accredible request failed: ${error.message}` : "Accredible request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createAccredibleCertificatesError(response.status, payload, input.phase);
  }

  return payload;
}

function buildAccredibleCertificatesUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, accredibleCertificatesApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readAccredibleCertificatesPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Accredible returned invalid JSON");
  }
}

function createAccredibleCertificatesError(
  status: number,
  payload: unknown,
  phase: AccredibleCertificatesRequestPhase,
): ProviderRequestError {
  const message =
    extractAccredibleCertificatesErrorMessage(payload) ?? `Accredible request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractAccredibleCertificatesErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = record.error;
  if (typeof error === "string" && error.trim()) {
    return error;
  }

  const nestedError = optionalRecord(error);
  const nestedMessage = optionalString(nestedError?.message);
  if (nestedMessage) {
    return nestedMessage;
  }

  const message = optionalString(record.message);
  if (message) {
    return message;
  }

  if (Array.isArray(record.errors)) {
    const firstError = record.errors.find((item) => typeof item === "string");
    if (typeof firstError === "string" && firstError.trim()) {
      return firstError;
    }
  }

  return undefined;
}

function normalizeIssuer(payload: unknown): AccredibleIssuer {
  const record = requiredResponseRecord(payload, "Accredible issuer response");
  const issuer = requiredResponseRecord(record.issuer, "Accredible issuer");

  return {
    id: optionalNumber(issuer.id),
    name: rawStringOrNull(issuer.name),
    email: rawStringOrNull(issuer.email),
  };
}

function normalizeGroupList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeGroup(item));
}

function normalizeGroup(value: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(value, "Accredible group");
  const id = optionalNumber(record.id);
  if (id === undefined) {
    throw new ProviderRequestError(502, "Accredible group is missing id", record);
  }

  return {
    id,
    name: rawStringOrNull(record.name),
    courseName: rawStringOrNull(record.course_name),
    courseDescription: rawStringOrNull(record.course_description),
    language: rawStringOrNull(record.language),
    designName: rawStringOrNull(record.design_name),
    departmentId: nullableNumber(record.department_id),
    raw: record,
  };
}

function normalizeCredentialList(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => normalizeCredential(item));
}

function normalizeCredential(value: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(value, "Accredible credential");
  const id = requireStringLike(record.id, "credential.id");

  return {
    id,
    name: rawStringOrNull(record.name),
    description: rawStringOrNull(record.description),
    complete: optionalBoolean(record.complete) ?? null,
    issuedOn: rawStringOrNull(record.issued_on),
    expiredOn: rawStringOrNull(record.expired_on),
    groupId: nullableNumber(record.group_id),
    groupName: rawStringOrNull(record.group_name),
    url: rawStringOrNull(record.url),
    encodedId: rawStringOrNull(record.encoded_id),
    private: optionalBoolean(record.private) ?? null,
    recipient:
      record.recipient === undefined || record.recipient === null ? null : normalizeRecipient(record.recipient),
    raw: record,
  };
}

function normalizeRecipient(value: unknown): Record<string, unknown> {
  const record = requiredResponseRecord(value, "Accredible recipient");
  return {
    id: record.id === undefined || record.id === null ? null : requireStringLike(record.id, "id"),
    name: rawStringOrNull(record.name),
    email: rawStringOrNull(record.email),
    metaData: optionalRecord(record.meta_data) ?? null,
  };
}

function normalizePaginationMeta(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value) ?? {};
  return {
    currentPage: nullableNumber(record.current_page),
    nextPage: nullableNumber(record.next_page),
    prevPage: nullableNumber(record.prev_page),
    totalPages: nullableNumber(record.total_pages),
    totalCount: nullableNumber(record.total_count),
    raw: record,
  };
}

function compactRequestObject(input: Record<string, unknown>): Record<string, unknown> {
  return jsonObject(input);
}

function pickFields(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    result[key] = input[key];
  }
  return jsonObject(result);
}

function stringifyQueryValues(input: Record<string, unknown>): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      result[key] = undefined;
      continue;
    }
    result[key] = String(value);
  }
  return result;
}

function requireStringLike(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  throw new ProviderRequestError(502, `Accredible response missing ${fieldName}`);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
