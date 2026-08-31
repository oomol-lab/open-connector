import type { ApiKeyActionRequest, ProviderActionHandlers } from "../provider-runtime.ts";
import type { DopplerMarketingAutomationActionName } from "./actions.ts";

import {
  optionalBooleanOrNull,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
} from "../provider-runtime.ts";

export interface DopplerMarketingAutomationCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

export const dopplerMarketingAutomationApiBaseUrl = "https://restapi.fromdoppler.com";

type RequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;

interface DopplerMarketingRequest {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  apiKey: string;
  fetcher: typeof fetch;
  phase: RequestPhase;
}

type DopplerMarketingActionHandler = (input: ApiKeyActionRequest, fetcher: typeof fetch) => Promise<unknown>;

export const dopplerMarketingAutomationActionHandlers: ProviderActionHandlers<
  "doppler_marketing_automation",
  DopplerMarketingActionHandler
> = {
  async list_lists(input, fetcher) {
    const credential = credentialContext(input);
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(credential.accountEmail, "/lists"),
      query: paginationQuery(input.input),
      fetcher,
      phase: "execute",
    });
    return normalizeListCollection(payload);
  },
  async get_list(input, fetcher) {
    const credential = credentialContext(input);
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(credential.accountEmail, `/lists/${readListId(input.input)}`),
      fetcher,
      phase: "execute",
    });
    const record = requiredResponseRecord(payload, "Doppler list");
    return {
      list: normalizeList(record),
      data: record,
    };
  },
  async create_list(input, fetcher) {
    const credential = credentialContext(input);
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(credential.accountEmail, "/lists"),
      method: "POST",
      body: {
        name: readTrimmedInputString(input.input.name, "name"),
      },
      fetcher,
      phase: "execute",
    });
    return normalizeCreationResult(payload);
  },
  async update_list(input, fetcher) {
    const credential = credentialContext(input);
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(credential.accountEmail, `/lists/${readListId(input.input)}`),
      method: "PUT",
      body: {
        name: readTrimmedInputString(input.input.name, "name"),
      },
      fetcher,
      phase: "execute",
    });
    return normalizeMessageResult(payload);
  },
  async delete_list(input, fetcher) {
    const credential = credentialContext(input);
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(credential.accountEmail, `/lists/${readListId(input.input)}`),
      method: "DELETE",
      fetcher,
      phase: "execute",
    });
    return normalizeMessageResult(payload);
  },
  async list_subscribers(input, fetcher) {
    const credential = credentialContext(input);
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(credential.accountEmail, "/subscribers"),
      query: paginationQuery(input.input),
      fetcher,
      phase: "execute",
    });
    return normalizeSubscriberCollection(payload);
  },
  async list_list_subscribers(input, fetcher) {
    const credential = credentialContext(input);
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(credential.accountEmail, `/lists/${readListId(input.input)}/subscribers`),
      query: paginationQuery(input.input),
      fetcher,
      phase: "execute",
    });
    return normalizeSubscriberCollection(payload);
  },
  async get_subscriber(input, fetcher) {
    const credential = credentialContext(input);
    const email = readTrimmedInputString(input.input.email, "email");
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(credential.accountEmail, `/subscribers/${encodeURIComponent(email)}`),
      fetcher,
      phase: "execute",
    });
    const record = requiredResponseRecord(payload, "Doppler subscriber");
    return {
      subscriber: normalizeSubscriber(record),
      data: record,
    };
  },
  async add_subscriber_to_list(input, fetcher) {
    const credential = credentialContext(input);
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(credential.accountEmail, `/lists/${readListId(input.input)}/subscribers`),
      method: "POST",
      body: {
        email: readTrimmedInputString(input.input.email, "email"),
        ...(input.input.fields === undefined ? {} : { fields: normalizeDopplerFields(input.input.fields) }),
      },
      fetcher,
      phase: "execute",
    });
    return normalizeMessageResult(payload);
  },
  async remove_subscriber_from_list(input, fetcher) {
    const credential = credentialContext(input);
    const email = readTrimmedInputString(input.input.email, "email");
    const payload = await requestDopplerMarketingJson({
      ...credential,
      path: accountPath(
        credential.accountEmail,
        `/lists/${readListId(input.input)}/subscribers/${encodeURIComponent(email)}`,
      ),
      method: "DELETE",
      fetcher,
      phase: "execute",
    });
    return normalizeMessageResult(payload);
  },
};

function readTrimmedInputString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function normalizeDopplerFields(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    const field = optionalRecord(item);
    return field && typeof field.name === "string" ? { ...field, name: field.name.trim() } : item;
  });
}

export async function validateDopplerMarketingAutomationCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<DopplerMarketingAutomationCredentialCheck> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message));
  const accountEmail = requireAccountEmail(input.accountEmail);
  const validationPath = accountPath(accountEmail);

  await requestDopplerMarketingJson({
    path: validationPath,
    apiKey,
    fetcher,
    phase: "validate",
  });

  return {
    providerAccountId: accountEmail,
    accountLabel: accountEmail,
    providerScopes: [],
    providerMetadata: {
      accountEmail,
      apiBaseUrl: dopplerMarketingAutomationApiBaseUrl,
      validationEndpoint: validationPath,
    },
  };
}

export async function executeDopplerMarketingAutomationAction(
  input: ApiKeyActionRequest & {
    actionName: DopplerMarketingAutomationActionName;
  },
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = dopplerMarketingAutomationActionHandlers[input.actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `doppler_marketing_automation action is not implemented: ${input.actionName}`);
  }
  return handler(input, fetcher);
}

async function requestDopplerMarketingJson(input: DopplerMarketingRequest) {
  const timeout = createProviderTimeout(undefined);
  const url = buildDopplerMarketingUrl(input.path, input.query);
  const method = input.method ?? "GET";

  try {
    const response = await input.fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        authorization: `token ${input.apiKey}`,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": providerUserAgent,
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw createDopplerMarketingError(response.status, response.statusText, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Doppler Email Marketing request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Doppler Email Marketing request failed: ${error.message}`
        : "Doppler Email Marketing request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildDopplerMarketingUrl(path: string, query: Record<string, QueryValue> | undefined) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${dopplerMarketingAutomationApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Doppler Email Marketing returned invalid JSON");
  }
}

function createDopplerMarketingError(status: number, statusText: string, payload: unknown, phase: RequestPhase) {
  const message =
    readErrorMessage(payload) || statusText || `Doppler Email Marketing request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(409, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return (
    optionalString(record?.detail)?.trim() ||
    optionalString(record?.message)?.trim() ||
    optionalString(record?.title)?.trim() ||
    optionalString(record?.error)?.trim() ||
    undefined
  );
}

function normalizeListCollection(payload: unknown) {
  const record = requiredResponseRecord(payload, "Doppler list collection");
  return {
    lists: requireObjectArray(record.items, "Doppler list collection items").map(normalizeList),
    ...normalizePagination(record),
    data: record,
  };
}

function normalizeSubscriberCollection(payload: unknown) {
  const record = requiredResponseRecord(payload, "Doppler subscriber collection");
  return {
    subscribers: requireObjectArray(record.items, "Doppler subscriber collection items").map(normalizeSubscriber),
    ...normalizePagination(record),
    data: record,
  };
}

function normalizePagination(record: Record<string, unknown>) {
  return {
    pageSize: readNullableInteger(record.pageSize, "pageSize"),
    itemsCount: readNullableInteger(record.itemsCount, "itemsCount"),
    currentPage: readNullableInteger(record.currentPage, "currentPage"),
    pagesCount: readNullableInteger(record.pagesCount, "pagesCount"),
    lastPage: readNullableInteger(record.lastPage, "lastPage"),
  };
}

function normalizeList(record: Record<string, unknown>) {
  return {
    listId: readRequiredInteger(record.listId, "listId"),
    name: readRequiredString(record.name, "name"),
    currentStatus: rawStringOrNull(record.currentStatus),
    subscribersCount: readNullableInteger(record.subscribersCount, "subscribersCount"),
    creationDate: rawStringOrNull(record.creationDate),
    hasScheduledCampaigns: optionalBooleanOrNull(record.hasScheduledCampaigns),
    hasFormsAssociated: optionalBooleanOrNull(record.hasFormsAssociated),
    hasSegmentsAssociated: optionalBooleanOrNull(record.hasSegmentsAssociated),
    hasEventsAssociated: optionalBooleanOrNull(record.hasEventsAssociated),
    data: record,
  };
}

function normalizeSubscriber(record: Record<string, unknown>) {
  return {
    email: readRequiredString(record.email, "email"),
    fields: readOptionalObjectArray(record.fields),
    belongsToLists: readOptionalStringArray(record.belongsToLists),
    status: rawStringOrNull(record.status),
    unsubscriptionDate: rawStringOrNull(record.unsubscriptionDate),
    canBeReactivated: optionalBooleanOrNull(record.canBeReactivated),
    isBeingReactivated: optionalBooleanOrNull(record.isBeingReactivated),
    unsubscriptionType: rawStringOrNull(record.unsubscriptionType),
    manualUnsubscriptionReason: rawStringOrNull(record.manualUnsubscriptionReason),
    unsubscriptionComment: rawStringOrNull(record.unsubscriptionComment),
    score: readNullableInteger(record.score, "score"),
    data: record,
  };
}

function normalizeCreationResult(payload: unknown) {
  const record = requiredResponseRecord(payload, "Doppler creation result");
  const createdResourceId = record.createdResourceId;
  return {
    createdResourceId:
      typeof createdResourceId === "string" || typeof createdResourceId === "number" ? String(createdResourceId) : null,
    message: readRequiredString(record.message, "message"),
    data: record,
  };
}

function normalizeMessageResult(payload: unknown) {
  const record = requiredResponseRecord(payload, "Doppler operation result");
  return {
    message: readRequiredString(record.message, "message"),
    data: record,
  };
}

function credentialContext(input: ApiKeyActionRequest) {
  return {
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    accountEmail: requireAccountEmail(
      input.values?.accountEmail ?? optionalString(input.providerMetadata?.accountEmail),
    ),
  };
}

function requireAccountEmail(value: unknown) {
  const accountEmail = typeof value === "string" ? value.trim() : "";
  if (!accountEmail) {
    throw new ProviderRequestError(400, "Doppler Email Marketing account email is required");
  }
  return accountEmail;
}

function accountPath(accountEmail: string, suffix = "") {
  return `/accounts/${encodeURIComponent(accountEmail)}${suffix}`;
}

function paginationQuery(input: Record<string, unknown>) {
  return {
    page: readOptionalInteger(input.page, "page"),
    per_page: readOptionalInteger(input.perPage, "perPage"),
  };
}

function readListId(input: Record<string, unknown>) {
  return readRequiredInteger(input.listId, "listId");
}

function requireObjectArray(value: unknown, label: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value.map((item) => requiredResponseRecord(item, label));
}

function readOptionalObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}

function readOptionalStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(502, `Doppler Email Marketing response missing string field: ${fieldName}`);
  }
  return value;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `Doppler Email Marketing response missing integer field: ${fieldName}`);
  }
  return value;
}

function readOptionalInteger(value: unknown, fieldName: string) {
  return value === undefined ? undefined : readRequiredInteger(value, fieldName);
}

function readNullableInteger(value: unknown, fieldName: string) {
  if (value === null || value === undefined) {
    return null;
  }
  return readRequiredInteger(value, fieldName);
}
