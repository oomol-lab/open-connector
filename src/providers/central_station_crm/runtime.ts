import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const centralStationCrmCredentialHelpUrl = "https://centralstationcrm.com/api-basics";

const centralStationCrmHostSuffix = ".centralstationcrm.net";
const centralStationCrmApiPath = "/api";
const centralStationCrmValidationEndpoint = "/check_connection";
const centralStationCrmUserEndpoint = "/user";

type CentralStationCrmPhase = "validate" | "execute";
type CentralStationCrmEntity = "person" | "company" | "deal";
type CentralStationCrmCollection = "people" | "companies" | "deals";
interface ApiKeyProviderActionInput {
  apiKey: string;
  providerMetadata?: Record<string, unknown>;
  input: Record<string, unknown>;
  actionName: string;
  signal?: AbortSignal;
}
type CentralStationCrmActionInput = ApiKeyProviderActionInput & {
  actionName: string;
};
type CentralStationCrmActionHandler = (input: CentralStationCrmActionInput, fetcher: typeof fetch) => Promise<unknown>;

interface CentralStationCrmRequestInput {
  apiBaseUrl: string;
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | undefined>;
  body?: unknown;
  phase: CentralStationCrmPhase;
  signal?: AbortSignal;
}

export const centralStationCrmActionHandlers: ProviderActionHandlers<
  "central_station_crm",
  CentralStationCrmActionHandler
> = {
  async get_user(input, fetcher) {
    const payload = await requestCentralStationCrmJson({
      apiBaseUrl: readCentralStationCrmApiBaseUrl(input.providerMetadata),
      apiKey: readApiKey(input),
      path: centralStationCrmUserEndpoint,
      fetcher,
      phase: "execute",
    });
    return {
      user: normalizeUser(payload),
      raw: requireRecord(payload, "CentralStationCRM user response"),
    };
  },
  list_people(input, fetcher) {
    return listRecords({
      input,
      fetcher,
      path: "/people",
      collection: "people",
      entity: "person",
      normalizer: normalizePerson,
    });
  },
  search_people(input, fetcher) {
    return listRecords({
      input,
      fetcher,
      path: "/people/search",
      collection: "people",
      entity: "person",
      queryKeys: ["email", "phone", "page", "perpage", "name", "first_name", "includes", "methods"],
      normalizer: normalizePerson,
    });
  },
  get_person(input, fetcher) {
    return getRecord({
      input,
      fetcher,
      path: `/people/${readRequiredId(input.input.id, "id")}`,
      entity: "person",
      normalizer: normalizePerson,
    });
  },
  create_person(input, fetcher) {
    return writeRecord({
      input,
      fetcher,
      method: "POST",
      path: "/people",
      entity: "person",
      normalizer: normalizePerson,
    });
  },
  update_person(input, fetcher) {
    return writeRecord({
      input,
      fetcher,
      method: "PUT",
      path: `/people/${readRequiredId(input.input.id, "id")}`,
      entity: "person",
      normalizer: normalizePerson,
    });
  },
  delete_person(input, fetcher) {
    return deleteRecord({
      input,
      fetcher,
      path: `/people/${readRequiredId(input.input.id, "id")}`,
    });
  },
  list_companies(input, fetcher) {
    return listRecords({
      input,
      fetcher,
      path: "/companies",
      collection: "companies",
      entity: "company",
      normalizer: normalizeCompany,
    });
  },
  search_companies(input, fetcher) {
    return listRecords({
      input,
      fetcher,
      path: "/companies/search",
      collection: "companies",
      entity: "company",
      queryKeys: ["name", "page", "perpage", "includes", "methods"],
      normalizer: normalizeCompany,
    });
  },
  get_company(input, fetcher) {
    return getRecord({
      input,
      fetcher,
      path: `/companies/${readRequiredId(input.input.id, "id")}`,
      entity: "company",
      normalizer: normalizeCompany,
    });
  },
  create_company(input, fetcher) {
    return writeRecord({
      input,
      fetcher,
      method: "POST",
      path: "/companies",
      entity: "company",
      normalizer: normalizeCompany,
    });
  },
  update_company(input, fetcher) {
    return writeRecord({
      input,
      fetcher,
      method: "PUT",
      path: `/companies/${readRequiredId(input.input.id, "id")}`,
      entity: "company",
      normalizer: normalizeCompany,
    });
  },
  delete_company(input, fetcher) {
    return deleteRecord({
      input,
      fetcher,
      path: `/companies/${readRequiredId(input.input.id, "id")}`,
    });
  },
  list_deals(input, fetcher) {
    return listRecords({
      input,
      fetcher,
      path: "/deals",
      collection: "deals",
      entity: "deal",
      normalizer: normalizeDeal,
    });
  },
  search_deals(input, fetcher) {
    return listRecords({
      input,
      fetcher,
      path: "/deals/search",
      collection: "deals",
      entity: "deal",
      queryKeys: ["name", "page", "perpage", "includes", "methods"],
      normalizer: normalizeDeal,
    });
  },
  get_deal(input, fetcher) {
    return getRecord({
      input,
      fetcher,
      path: `/deals/${readRequiredId(input.input.id, "id")}`,
      entity: "deal",
      normalizer: normalizeDeal,
    });
  },
  create_deal(input, fetcher) {
    return writeRecord({
      input,
      fetcher,
      method: "POST",
      path: "/deals",
      entity: "deal",
      normalizer: normalizeDeal,
    });
  },
  update_deal(input, fetcher) {
    return writeRecord({
      input,
      fetcher,
      method: "PUT",
      path: `/deals/${readRequiredId(input.input.id, "id")}`,
      entity: "deal",
      normalizer: normalizeDeal,
    });
  },
  delete_deal(input, fetcher) {
    return deleteRecord({
      input,
      fetcher,
      path: `/deals/${readRequiredId(input.input.id, "id")}`,
    });
  },
};

export async function validateCentralStationCrmCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = readApiKey(input.apiKey);
  const subdomain = readCentralStationCrmSubdomain(input.account);
  const apiBaseUrl = buildCentralStationCrmApiBaseUrl(subdomain);

  await requestCentralStationCrmJson({
    apiBaseUrl,
    apiKey,
    path: centralStationCrmValidationEndpoint,
    fetcher,
    phase: "validate",
    signal,
  });

  const userPayload = await requestCentralStationCrmJson({
    apiBaseUrl,
    apiKey,
    path: centralStationCrmUserEndpoint,
    fetcher,
    phase: "validate",
    signal,
  });
  const user = requireRecord(userPayload, "CentralStationCRM user response");
  const userId = optionalInteger(user.id);
  const userEmail = optionalString(user.login)?.trim();
  const currentAccount = optionalString(user.current_account)?.trim();

  return {
    profile: {
      accountId:
        userId === undefined ? `central_station_crm:${subdomain}` : `central_station_crm:${subdomain}:user:${userId}`,
      displayName: buildAccountLabel(user, subdomain),
    },
    grantedScopes: [],
    metadata: compactObject({
      subdomain,
      apiBaseUrl,
      validationEndpoint: "/api/check_connection",
      userId: userId === undefined ? undefined : String(userId),
      userEmail,
      currentAccount,
      credentialHelpUrl: centralStationCrmCredentialHelpUrl,
    }),
  };
}

export function buildCentralStationCrmApiBaseUrl(account: unknown): string {
  const subdomain = readCentralStationCrmSubdomain(account);
  return `https://${subdomain}${centralStationCrmHostSuffix}${centralStationCrmApiPath}`;
}

export function readCentralStationCrmApiBaseUrl(providerMetadata?: Record<string, unknown>): string {
  const storedBaseUrl = optionalString(providerMetadata?.apiBaseUrl);
  if (storedBaseUrl) {
    return buildCentralStationCrmApiBaseUrl(storedBaseUrl);
  }
  return buildCentralStationCrmApiBaseUrl(providerMetadata?.subdomain);
}

async function listRecords(input: {
  input: CentralStationCrmActionInput;
  fetcher: typeof fetch;
  path: string;
  collection: CentralStationCrmCollection;
  entity: CentralStationCrmEntity;
  queryKeys?: readonly string[];
  normalizer: (record: Record<string, unknown>) => Record<string, unknown>;
}) {
  const page = optionalInteger(input.input.input.page);
  const perpage = optionalInteger(input.input.input.perpage);
  const raw = await requestCentralStationCrmJson({
    apiBaseUrl: readCentralStationCrmApiBaseUrl(input.input.providerMetadata),
    apiKey: readApiKey(input.input),
    path: input.path,
    query: buildQuery(input.input.input, input.queryKeys ?? listQueryKeys),
    fetcher: input.fetcher,
    phase: "execute",
  });
  const items = readWrappedList(raw, input.entity).map(input.normalizer);

  return {
    [input.collection]: items,
    page: page ?? null,
    perpage: perpage ?? null,
    raw: requireArray(raw, `CentralStationCRM ${input.collection} response`),
  };
}

async function getRecord(input: {
  input: CentralStationCrmActionInput;
  fetcher: typeof fetch;
  path: string;
  entity: CentralStationCrmEntity;
  normalizer: (record: Record<string, unknown>) => Record<string, unknown>;
}) {
  const raw = await requestCentralStationCrmJson({
    apiBaseUrl: readCentralStationCrmApiBaseUrl(input.input.providerMetadata),
    apiKey: readApiKey(input.input),
    path: input.path,
    query: buildQuery(input.input.input, ["includes", "methods"]),
    fetcher: input.fetcher,
    phase: "execute",
  });
  const record = readWrappedRecord(raw, input.entity);
  return {
    [input.entity]: input.normalizer(record),
    raw: requireRecord(raw, `CentralStationCRM ${input.entity} response`),
  };
}

async function writeRecord(input: {
  input: CentralStationCrmActionInput;
  fetcher: typeof fetch;
  method: "POST" | "PUT";
  path: string;
  entity: CentralStationCrmEntity;
  normalizer: (record: Record<string, unknown>) => Record<string, unknown>;
}) {
  const raw = await requestCentralStationCrmJson({
    apiBaseUrl: readCentralStationCrmApiBaseUrl(input.input.providerMetadata),
    apiKey: readApiKey(input.input),
    path: input.path,
    method: input.method,
    query: buildQuery(input.input.input, ["includes", "methods", "no_log"]),
    body: {
      [input.entity]: input.input.input[input.entity],
    },
    fetcher: input.fetcher,
    phase: "execute",
  });
  const record = readWrappedRecord(raw, input.entity);
  return {
    [input.entity]: input.normalizer(record),
    raw: requireRecord(raw, `CentralStationCRM ${input.entity} response`),
  };
}

async function deleteRecord(input: { input: CentralStationCrmActionInput; fetcher: typeof fetch; path: string }) {
  const id = readRequiredId(input.input.input.id, "id");
  const raw = await requestCentralStationCrmJson({
    apiBaseUrl: readCentralStationCrmApiBaseUrl(input.input.providerMetadata),
    apiKey: readApiKey(input.input),
    path: input.path,
    method: "DELETE",
    query: buildQuery(input.input.input, ["no_log"]),
    fetcher: input.fetcher,
    phase: "execute",
  });
  const rawRecord = optionalRecord(raw) ?? {};
  return {
    deleted: true,
    id,
    raw: rawRecord,
  };
}

async function requestCentralStationCrmJson(input: CentralStationCrmRequestInput) {
  const timeoutHandle = createProviderTimeout(input.signal);

  try {
    const response = await input.fetcher(buildCentralStationCrmUrl(input.apiBaseUrl, input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildCentralStationCrmHeaders(input.apiKey, input.body !== undefined),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeoutHandle.signal,
    });
    const payload = await readCentralStationCrmPayload(response);
    if (!response.ok) {
      throw createCentralStationCrmError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "CentralStationCRM request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `CentralStationCRM request failed: ${error.message}`
        : "CentralStationCRM request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildCentralStationCrmUrl(apiBaseUrl: string, path: string, query: Record<string, string | undefined> = {}) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${apiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildCentralStationCrmHeaders(apiKey: string, hasBody: boolean) {
  return compactObject<Record<string, string | undefined>>({
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
    "x-apikey": apiKey,
  }) as Record<string, string>;
}

async function readCentralStationCrmPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createCentralStationCrmError(status: number, payload: unknown, phase: CentralStationCrmPhase) {
  const message =
    extractCentralStationCrmErrorMessage(payload) ?? `CentralStationCRM request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }

  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 500, message, payload);
}

function extractCentralStationCrmErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  if (Array.isArray(payload)) {
    const messages = payload.filter((item): item is string => typeof item === "string");
    return messages.length > 0 ? messages.join("; ") : undefined;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.error)?.trim() ??
    optionalString(record.message)?.trim() ??
    optionalString(record.error_description)?.trim()
  );
}

const listQueryKeys = ["page", "perpage", "order", "includes", "methods", "tag_id", "tag_name"] as const;

function buildQuery(input: Record<string, unknown>, keys: readonly string[]) {
  const query: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = input[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value === "boolean") {
      query[key] = String(value);
      continue;
    }
    query[key] = String(value);
  }
  return query;
}

function readWrappedList(payload: unknown, entity: CentralStationCrmEntity) {
  const items = requireArray(payload, `CentralStationCRM ${entity} list response`);
  return items.map((item, index) => readWrappedRecord(item, entity, `item ${index + 1}`));
}

function readWrappedRecord(payload: unknown, entity: CentralStationCrmEntity, label: string = entity) {
  const record = requireRecord(payload, `CentralStationCRM ${label} response`);
  const wrapped = optionalRecord(record[entity]);
  if (!wrapped) {
    throw new ProviderRequestError(502, `CentralStationCRM ${label} response must include ${entity}`, record);
  }
  return wrapped;
}

function normalizeUser(record: unknown) {
  const raw = requireRecord(record, "CentralStationCRM user response");
  return compactObject({
    id: optionalInteger(raw.id),
    first: asNullableString(raw.first),
    last: asNullableString(raw.last),
    name: asNullableString(raw.name),
    login: asNullableString(raw.login),
    current_account: asNullableString(raw.current_account),
    timezone: asNullableString(raw.timezone),
    raw,
  });
}

function normalizePerson(record: Record<string, unknown>) {
  return compactObject({
    id: optionalInteger(record.id),
    account_id: asNullableInteger(record.account_id),
    user_id: asNullableInteger(record.user_id),
    group_id: asNullableInteger(record.group_id),
    first_name: asNullableString(record.first_name),
    name: asNullableString(record.name),
    background: asNullableString(record.background),
    salutation: asNullableString(record.salutation),
    title: asNullableString(record.title),
    country_code: asNullableString(record.country_code),
    created_at: asNullableString(record.created_at),
    updated_at: asNullableString(record.updated_at),
    raw: record,
  });
}

function normalizeCompany(record: Record<string, unknown>) {
  return compactObject({
    id: optionalInteger(record.id),
    account_id: asNullableInteger(record.account_id),
    user_id: asNullableInteger(record.user_id),
    group_id: asNullableInteger(record.group_id),
    name: asNullableString(record.name),
    background: asNullableString(record.background),
    created_at: asNullableString(record.created_at),
    updated_at: asNullableString(record.updated_at),
    raw: record,
  });
}

function normalizeDeal(record: Record<string, unknown>) {
  return compactObject({
    id: optionalInteger(record.id),
    account_id: asNullableInteger(record.account_id),
    company_id: asNullableInteger(record.company_id),
    user_id: asNullableInteger(record.user_id),
    group_id: asNullableInteger(record.group_id),
    name: asNullableString(record.name),
    value: asNullableString(record.value),
    value_type: asNullableString(record.value_type),
    value_sum: asNullableString(record.value_sum),
    value_count: asNullableString(record.value_count),
    current_state: asNullableString(record.current_state),
    target_date: asNullableString(record.target_date),
    finished_at: asNullableString(record.finished_at),
    currency: asNullableString(record.currency),
    background: asNullableString(record.background),
    deal_type_id: asNullableInteger(record.deal_type_id),
    deal_type_stage_id: asNullableInteger(record.deal_type_stage_id),
    probability: asNullableInteger(record.probability),
    created_at: asNullableString(record.created_at),
    updated_at: asNullableString(record.updated_at),
    raw: record,
  });
}

function requireArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`, value);
  }
  return value;
}

function requireRecord(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`, value);
  }
  return record;
}

function readRequiredId(value: unknown, fieldName: string) {
  const id = optionalInteger(value);
  if (id === undefined || id <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return id;
}

function readCentralStationCrmSubdomain(account: unknown) {
  const value = optionalString(account)?.trim();
  if (!value) {
    throw new ProviderRequestError(400, "account is required");
  }

  const parsed = parseCentralStationCrmAccountInput(value);
  if (parsed) {
    return parsed;
  }

  const lowered = value.toLowerCase();
  if (isSafeSubdomain(lowered)) {
    return lowered;
  }

  throw new ProviderRequestError(400, "account must be a CentralStationCRM account subdomain or URL");
}

function parseCentralStationCrmAccountInput(value: string) {
  const candidate = value.includes("://") ? value : value.includes(".") ? `https://${value}` : "";
  if (!candidate) {
    return undefined;
  }

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith(centralStationCrmHostSuffix)) {
      return undefined;
    }
    const subdomain = hostname.slice(0, -centralStationCrmHostSuffix.length);
    return isSafeSubdomain(subdomain) ? subdomain : undefined;
  } catch {
    return undefined;
  }
}

function isSafeSubdomain(value: string) {
  if (!value || value.includes(".") || value.includes("/") || value.includes("?")) {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isNumber = code >= 48 && code <= 57;
    if (!isLowercaseLetter && !isNumber && char !== "-") {
      return false;
    }
  }
  return true;
}

function buildAccountLabel(user: Record<string, unknown>, subdomain: string) {
  const first = optionalString(user.first)?.trim();
  const last = optionalString(user.last)?.trim() || optionalString(user.name)?.trim();
  const fullName = [first, last].filter(Boolean).join(" ");
  if (fullName) {
    return fullName;
  }
  return optionalString(user.login)?.trim() || optionalString(user.name)?.trim() || `CentralStationCRM ${subdomain}`;
}

function asNullableString(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalString(value);
}

function asNullableInteger(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalInteger(value);
}

function readApiKey(value: unknown): string {
  const direct = optionalString(value);
  const nested = direct ?? optionalString(optionalRecord(value)?.apiKey);
  if (!nested) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  return nested;
}
