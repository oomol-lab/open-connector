import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { OnePageCrmActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "one_page_crm";
const onePageCrmApiBaseUrl = "https://app.onepagecrm.com/api/v3";
const onePageCrmFetch = createProviderFetch({ skipDnsValidation: true });
const onePageCrmValidationPath = "/users";

interface OnePageCrmCredential {
  userId: string;
  apiKey: string;
}

interface OnePageCrmActionContext extends OnePageCrmCredential {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface OnePageCrmRequestOptions {
  path: string;
  credential: OnePageCrmCredential;
  fetcher: typeof fetch;
  phase: "validate" | "execute";
  signal?: AbortSignal;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
}

type OnePageCrmActionHandler = (input: Record<string, unknown>, context: OnePageCrmActionContext) => Promise<unknown>;

export const onePageCrmActionHandlers: Record<OnePageCrmActionName, OnePageCrmActionHandler> = {
  list_contacts(input, context) {
    return listRecords({
      context,
      path: "/contacts",
      collectionKey: "contacts",
      wrapperKey: "contact",
      query: buildContactsQuery(input),
    });
  },
  get_contact(input, context) {
    const contactId = readInputString(input.contactId, "contactId");
    return readRecord({
      context,
      path: `/contacts/${encodeURIComponent(contactId)}`,
      wrapperKey: "contact",
    });
  },
  create_contact(input, context) {
    return createRecord({
      context,
      path: "/contacts",
      wrapperKey: "contact",
      body: buildContactBody(input),
    });
  },
  list_deals(input, context) {
    return listRecords({
      context,
      path: "/deals",
      collectionKey: "deals",
      wrapperKey: "deal",
      query: buildDealsQuery(input),
    });
  },
  get_deal(input, context) {
    const dealId = readInputString(input.dealId, "dealId");
    return readRecord({
      context,
      path: `/deals/${encodeURIComponent(dealId)}`,
      wrapperKey: "deal",
    });
  },
  create_deal(input, context) {
    return createRecord({
      context,
      path: "/deals",
      wrapperKey: "deal",
      body: buildDealBody(input),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<OnePageCrmActionContext>({
  service,
  handlers: onePageCrmActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OnePageCrmActionContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      ...readOnePageCrmCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const onePageCrmCredential = readOnePageCrmCredential(credential.values);
    const url = createProviderProxyUrl(onePageCrmApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", buildOnePageCrmAuthorizationHeader(onePageCrmCredential));
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await onePageCrmFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `OnePageCRM request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "OnePageCRM request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const credential = readOnePageCrmCredential(input.values);
    const payload = await requestOnePageCrmJson({
      path: onePageCrmValidationPath,
      credential,
      fetcher,
      signal,
      phase: "validate",
    });

    const user = findValidationUser(payload, credential.userId);
    return {
      profile: {
        accountId: credential.userId,
        displayName: readAccountLabel(user, credential.userId),
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: onePageCrmApiBaseUrl,
        userId: credential.userId,
        validationEndpoint: onePageCrmValidationPath,
      },
    };
  },
};

async function listRecords(input: {
  context: OnePageCrmActionContext;
  path: string;
  collectionKey: "contacts" | "deals";
  wrapperKey: "contact" | "deal";
  query: Record<string, string | number | boolean | undefined>;
}): Promise<Record<string, unknown>> {
  const payload = await requestOnePageCrmJson({
    path: input.path,
    credential: input.context,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
    query: input.query,
  });
  const body = requireObject(payload, "OnePageCRM returned an invalid response payload");
  const data = requireObject(body.data, "OnePageCRM returned an invalid data payload");
  const records = readWrappedCollection(data[input.collectionKey], input.wrapperKey);

  return {
    [input.collectionKey]: records,
    totalCount: readOptionalInteger(data.total_count, "total_count"),
    page: readOptionalInteger(data.page, "page"),
    perPage: readOptionalInteger(data.per_page, "per_page"),
    maxPage: readOptionalInteger(data.max_page, "max_page"),
    raw: body,
  };
}

async function readRecord(input: {
  context: OnePageCrmActionContext;
  path: string;
  wrapperKey: "contact" | "deal";
}): Promise<Record<string, unknown>> {
  const payload = await requestOnePageCrmJson({
    path: input.path,
    credential: input.context,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
  });
  const body = requireObject(payload, "OnePageCRM returned an invalid response payload");
  const data = requireObject(body.data, "OnePageCRM returned an invalid data payload");
  return {
    [input.wrapperKey]: readWrappedObject(data[input.wrapperKey], input.wrapperKey),
    raw: body,
  };
}

async function createRecord(input: {
  context: OnePageCrmActionContext;
  path: string;
  wrapperKey: "contact" | "deal";
  body: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const payload = await requestOnePageCrmJson({
    path: input.path,
    credential: input.context,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
    method: "POST",
    body: input.body,
  });
  const body = requireObject(payload, "OnePageCRM returned an invalid response payload");
  const data = requireObject(body.data, "OnePageCRM returned an invalid data payload");
  return {
    [input.wrapperKey]: readWrappedObject(data[input.wrapperKey], input.wrapperKey),
    raw: body,
  };
}

async function requestOnePageCrmJson(options: OnePageCrmRequestOptions): Promise<unknown> {
  const url = new URL(`${onePageCrmApiBaseUrl}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildOnePageCrmAuthorizationHeader(options.credential),
    "user-agent": providerUserAgent,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `OnePageCRM request failed before receiving a response: ${error.message}`
        : "OnePageCRM request failed before receiving a response",
      error,
    );
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw mapOnePageCrmError(response.status, payload, options.phase);
  }

  return payload;
}

function buildContactsQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    page: optionalInteger(input.page),
    per_page: optionalInteger(input.perPage),
    search: optionalString(input.search),
    owner_id: optionalString(input.ownerId),
    tag: optionalString(input.tag),
    filter_id: optionalString(input.filterId),
    sort_by: optionalString(input.sortBy),
    order: optionalString(input.order),
  });
}

function buildDealsQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return compactObject({
    page: optionalInteger(input.page),
    per_page: optionalInteger(input.perPage),
    search: optionalString(input.search),
    status: optionalString(input.status),
    stage: optionalInteger(input.stage),
    owner_id: optionalString(input.ownerId),
    contact_id: optionalString(input.contactId),
    company_id: optionalString(input.companyId),
    tag: optionalString(input.tag),
    filter_id: optionalString(input.filterId),
    sort_by: optionalString(input.sortBy),
    order: optionalString(input.order),
  });
}

function buildContactBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    title: input.title,
    first_name: input.firstName,
    last_name: input.lastName,
    job_title: input.jobTitle,
    starred: input.starred,
    company_id: input.companyId,
    company_name: input.companyName,
    urls: input.urls,
    phones: input.phones,
    emails: input.emails,
    status_id: input.statusId,
    tags: input.tags,
    lead_source_id: input.leadSourceId,
    background: input.background,
    owner_id: input.ownerId,
  });
}

function buildDealBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    contact_id: input.contactId,
    owner_id: input.ownerId,
    pipeline_id: input.pipelineId,
    sales_pipeline_id: input.salesPipelineId,
    name: input.name,
    text: input.text,
    stage: input.stage,
    status: input.status,
    expected_close_date: input.expectedCloseDate,
    close_date: input.closeDate,
    date: input.date,
    amount: input.amount,
    months: input.months,
    cost: input.cost,
    commission_base: input.commissionBase,
    commission_type: input.commissionType,
    commission: input.commission,
    commission_percentage: input.commissionPercentage,
  });
}

function readOnePageCrmCredential(input: Record<string, string>): OnePageCrmCredential {
  return {
    userId: requiredString(input.userId, "userId", inputError),
    apiKey: requiredString(input.apiKey, "apiKey", inputError),
  };
}

function buildOnePageCrmAuthorizationHeader(credential: OnePageCrmCredential): string {
  return `Basic ${Buffer.from(`${credential.userId}:${credential.apiKey}`).toString("base64")}`;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      message: text,
    };
  }
}

function mapOnePageCrmError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `OnePageCRM API request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const message = optionalString(body.message);
  if (message) {
    return message;
  }

  const error = body.error;
  if (typeof error === "string" && error) {
    return error;
  }
  const errorObject = optionalRecord(error);
  const errorMessage = optionalString(errorObject?.message);
  if (errorMessage) {
    return errorMessage;
  }

  const errors = body.errors;
  if (Array.isArray(errors)) {
    return errors.find((item): item is string => typeof item === "string");
  }

  return undefined;
}

function findValidationUser(payload: unknown, userId: string): Record<string, unknown> | undefined {
  const body = requireObject(payload, "OnePageCRM returned an invalid validation payload");
  const data = requireObject(body.data, "OnePageCRM returned an invalid validation data payload");
  const users = data.users;
  if (!Array.isArray(users)) {
    return undefined;
  }

  const normalizedUsers = users
    .map((item) => {
      const wrapper = optionalRecord(item);
      return optionalRecord(wrapper?.user) ?? wrapper;
    })
    .filter((user): user is Record<string, unknown> => user !== undefined);

  return normalizedUsers.find((user) => optionalString(user.id) === userId) ?? normalizedUsers[0];
}

function readAccountLabel(user: Record<string, unknown> | undefined, fallback: string): string {
  const email = optionalString(user?.email);
  if (email) {
    return email;
  }

  const firstName = optionalString(user?.first_name);
  const lastName = optionalString(user?.last_name);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || fallback;
}

function readWrappedCollection(value: unknown, wrapperKey: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `OnePageCRM returned an invalid ${wrapperKey} list`);
  }

  return value.map((item) => {
    const wrapper = optionalRecord(item);
    if (!wrapper) {
      throw new ProviderRequestError(502, `OnePageCRM returned an invalid ${wrapperKey} item`);
    }

    return readWrappedObject(wrapper[wrapperKey] ?? wrapper, wrapperKey);
  });
}

function readWrappedObject(value: unknown, wrapperKey: string): Record<string, unknown> {
  return requireObject(value, `OnePageCRM returned an invalid ${wrapperKey} payload`);
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message);
  }
  return record;
}

function readInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, inputError);
}

function inputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `OnePageCRM returned an invalid ${fieldName} payload`);
  }
  return value;
}
