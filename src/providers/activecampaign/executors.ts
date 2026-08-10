import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  credentialProviderProxyBaseUrl,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const activecampaignValidationPath = "/api/3/users/me";
const service = "activecampaign";

type ActivecampaignRequestMode = "validate" | "execute";

interface ActivecampaignActionContext {
  apiKey: string;
  apiUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ActivecampaignActionHandler = (
  input: Record<string, unknown>,
  context: ActivecampaignActionContext,
) => Promise<unknown>;

interface ActivecampaignRequestOptions {
  apiKey: string;
  apiUrl: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: ActivecampaignRequestMode;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

export const activecampaignActionHandlers: Record<string, ActivecampaignActionHandler> = {
  get_current_user(input, context) {
    return getCurrentUser(input, context);
  },
  list_contacts(input, context) {
    return listContacts(input, context);
  },
  get_contact(input, context) {
    return getContact(input, context);
  },
  upsert_contact(input, context) {
    return upsertContact(input, context);
  },
  list_lists(input, context) {
    return listLists(input, context);
  },
  list_fields(input, context) {
    return listFields(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ActivecampaignActionContext>({
  service,
  handlers: activecampaignActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ActivecampaignActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const apiUrl = optionalString(credential.values.apiUrl) ?? optionalString(credential.metadata.apiUrl);
    if (!apiUrl) {
      throw new ProviderRequestError(401, "Configure activecampaign API URL credentials first.");
    }

    return {
      apiKey: credential.apiKey,
      apiUrl,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateActivecampaignCredential(input.apiKey, input.values, fetcher, signal);
  },
};

export async function validateActivecampaignCredential(
  apiKey: string,
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<Awaited<ReturnType<NonNullable<CredentialValidators["apiKey"]>>>> {
  const apiUrl = normalizeActivecampaignApiUrl(values.apiUrl);
  const payload = await requestActivecampaignJson({
    apiKey,
    apiUrl,
    path: activecampaignValidationPath,
    fetcher,
    signal,
    mode: "validate",
  });

  const user = readRequiredObject(payload.user, "user");
  const userId = requireString(user.id, "user.id");
  const email = optionalString(user.email);
  const username = optionalString(user.username);
  const firstName = optionalString(user.firstName);
  const lastName = optionalString(user.lastName);

  return {
    profile: {
      accountId: buildActivecampaignProviderAccountId(apiUrl, userId),
      displayName: buildUserLabel({ email, username, firstName, lastName }) ?? "ActiveCampaign API Token",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiUrl,
      validationEndpoint: buildValidationEndpoint(apiUrl, activecampaignValidationPath),
      userId,
      email,
      username,
      firstName,
      lastName,
    }),
  };
}

export function normalizeActivecampaignApiUrl(input?: string): string {
  const raw = input?.trim();
  if (!raw) {
    throw new ProviderRequestError(400, "apiUrl is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ProviderRequestError(400, "apiUrl must be a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "apiUrl must use HTTPS");
  }

  parsed.hash = "";
  parsed.search = "";

  const pathname = trimTrailingSlash(parsed.pathname);
  if (pathname === "/api/3") {
    parsed.pathname = "/";
  } else if (endsWithPathSegment(pathname, "/api/3")) {
    parsed.pathname = pathname.slice(0, pathname.length - "/api/3".length) || "/";
  } else {
    parsed.pathname = pathname || "/";
  }

  const normalizedPath = trimTrailingSlash(parsed.pathname);
  if (!normalizedPath || normalizedPath === "/") {
    return parsed.origin;
  }
  return `${parsed.origin}${normalizedPath}`;
}

function buildValidationEndpoint(apiUrl: string, path: string) {
  const url = buildActivecampaignUrl(apiUrl, path);
  return url.pathname;
}

function buildActivecampaignProviderAccountId(apiUrl: string, userId: string) {
  const parsed = new URL(apiUrl);
  const basePath = trimTrailingSlash(parsed.pathname);
  return `activecampaign:${parsed.host}${basePath === "/" ? "" : basePath}:user:${userId}`;
}

function buildUserLabel(input: { email?: string; username?: string; firstName?: string; lastName?: string }) {
  const fullName = [input.firstName, input.lastName].filter((value) => value?.trim()).join(" ");
  return fullName || input.email || input.username;
}

async function getCurrentUser(_input: Record<string, unknown>, context: ActivecampaignActionContext) {
  const payload = await requestActivecampaignJson({
    apiKey: context.apiKey,
    apiUrl: context.apiUrl,
    path: activecampaignValidationPath,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return {
    user: normalizeUser(payload.user),
  };
}

async function listContacts(input: Record<string, unknown>, context: ActivecampaignActionContext) {
  const payload = await requestActivecampaignJson({
    apiKey: context.apiKey,
    apiUrl: context.apiUrl,
    path: "/api/3/contacts",
    query: buildContactListQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return {
    contacts: readRequiredArray(payload.contacts, "contacts").map((item, index) =>
      normalizeContact(item, `contacts[${index}]`),
    ),
    pagination: normalizePagination(payload.meta),
  };
}

async function getContact(input: Record<string, unknown>, context: ActivecampaignActionContext) {
  const contactId = requireString(input.contactId, "contactId");
  const payload = await requestActivecampaignJson({
    apiKey: context.apiKey,
    apiUrl: context.apiUrl,
    path: `/api/3/contacts/${encodeURIComponent(contactId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return {
    contact: normalizeContact(payload.contact, "contact"),
  };
}

async function upsertContact(input: Record<string, unknown>, context: ActivecampaignActionContext) {
  const payload = await requestActivecampaignJson({
    apiKey: context.apiKey,
    apiUrl: context.apiUrl,
    path: "/api/3/contact/sync",
    method: "POST",
    body: {
      contact: compactObject({
        email: requireString(input.email, "email"),
        firstName: optionalString(input.firstName),
        lastName: optionalString(input.lastName),
        phone: optionalString(input.phone),
        fieldValues: normalizeOptionalFieldValueInput(input.fieldValues),
      }),
    },
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return {
    contact: normalizeContact(payload.contact, "contact"),
  };
}

async function listLists(input: Record<string, unknown>, context: ActivecampaignActionContext) {
  const payload = await requestActivecampaignJson({
    apiKey: context.apiKey,
    apiUrl: context.apiUrl,
    path: "/api/3/lists",
    query: compactObject({
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
      "filters[name]": optionalString(input.name),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return {
    lists: readRequiredArray(payload.lists, "lists").map((item, index) => normalizeList(item, `lists[${index}]`)),
    pagination: normalizePagination(payload.meta),
  };
}

async function listFields(input: Record<string, unknown>, context: ActivecampaignActionContext) {
  const payload = await requestActivecampaignJson({
    apiKey: context.apiKey,
    apiUrl: context.apiUrl,
    path: "/api/3/fields",
    query: compactObject({
      limit: optionalInteger(input.limit),
      offset: optionalInteger(input.offset),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return {
    fields: readRequiredArray(payload.fields, "fields").map((item, index) => normalizeField(item, `fields[${index}]`)),
  };
}

function buildContactListQuery(input: Record<string, unknown>) {
  const sortBy = optionalString(input.sortBy);
  const sortDirection = normalizeSortDirection(input.sortDirection);

  return compactObject({
    limit: optionalInteger(input.limit),
    offset: optionalInteger(input.offset),
    search: optionalString(input.search),
    email_like: optionalString(input.emailLike),
    listid: optionalString(input.listId),
    tagid: optionalInteger(input.tagId),
    segmentid: optionalInteger(input.segmentId),
    id_greater: optionalInteger(input.idGreater),
    id_less: optionalInteger(input.idLess),
    "filters[created_after]": optionalString(input.createdAfter),
    "filters[created_before]": optionalString(input.createdBefore),
    "filters[updated_after]": optionalString(input.updatedAfter),
    "filters[updated_before]": optionalString(input.updatedBefore),
    ...(sortBy && sortDirection ? { [`orders[${sortBy}]`]: sortDirection } : {}),
  });
}

function normalizeSortDirection(value: unknown) {
  const direction = optionalString(value);
  if (direction === "asc") {
    return "ASC";
  }
  if (direction === "desc") {
    return "DESC";
  }
  return undefined;
}

async function requestActivecampaignJson(input: ActivecampaignRequestOptions): Promise<Record<string, unknown>> {
  const response = await activecampaignFetch(input);
  const payload = await readJsonObject(response, input.mode);
  if (response.ok) {
    return payload;
  }

  throw mapActivecampaignError({
    status: response.status,
    payload,
    mode: input.mode,
    notFoundAsInvalidInput: input.notFoundAsInvalidInput,
  });
}

async function activecampaignFetch(input: ActivecampaignRequestOptions) {
  const url = buildActivecampaignUrl(input.apiUrl, input.path);
  if (input.query) {
    for (const [key, value] of Object.entries(input.query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "Api-Token": input.apiKey,
  });
  if (input.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  return input.fetcher(url.toString(), {
    method: input.method ?? "GET",
    headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    redirect: "manual",
    signal: input.signal,
  });
}

async function readJsonObject(response: Response, mode: ActivecampaignRequestMode) {
  const text = await response.text();
  if (!text) {
    if (response.ok) {
      throw new ProviderRequestError(502, `activecampaign returned an empty ${mode} response`);
    }
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    return optionalRecord(parsed) ?? {};
  } catch {
    throw new ProviderRequestError(502, "activecampaign returned invalid JSON");
  }
}

function mapActivecampaignError(input: {
  status: number;
  payload: Record<string, unknown>;
  mode: ActivecampaignRequestMode;
  notFoundAsInvalidInput?: boolean;
}) {
  const message =
    extractActivecampaignErrorMessage(input.payload) ?? `activecampaign request failed with status ${input.status}`;

  if (input.status === 429) {
    return new ProviderRequestError(429, message, input.payload);
  }

  if (input.status === 404 && input.notFoundAsInvalidInput) {
    return new ProviderRequestError(400, message, input.payload);
  }

  if (input.status === 401 || input.status === 403) {
    return new ProviderRequestError(input.status, message, input.payload);
  }

  if (input.status >= 400 && input.status < 500) {
    return new ProviderRequestError(400, message, input.payload);
  }

  return new ProviderRequestError(502, message, input.payload);
}

function extractActivecampaignErrorMessage(payload: Record<string, unknown>) {
  const message = optionalString(payload.message);
  if (message) {
    return message;
  }

  const error = optionalString(payload.error);
  if (error) {
    return error;
  }

  const errorsObject = optionalRecord(payload.errors);
  if (errorsObject) {
    for (const value of Object.values(errorsObject)) {
      const itemMessage = optionalString(value);
      if (itemMessage) {
        return itemMessage;
      }
    }
  }

  const errorsArray = asOptionalArray(payload.errors);
  if (errorsArray) {
    for (const item of errorsArray) {
      const messageValue = optionalString(item);
      if (messageValue) {
        return messageValue;
      }
      const record = optionalRecord(item);
      if (!record) {
        continue;
      }
      const detail = optionalString(record.detail) ?? optionalString(record.title) ?? optionalString(record.message);
      if (detail) {
        return detail;
      }
    }
  }

  return undefined;
}

function buildActivecampaignUrl(apiUrl: string, path: string) {
  const base = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
  const relative = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relative, base);
}

function normalizeUser(value: unknown) {
  const raw = readRequiredObject(value, "user");
  return {
    id: requireString(raw.id, "user.id"),
    email: nullableString(raw.email),
    firstName: nullableString(raw.firstName),
    lastName: nullableString(raw.lastName),
    username: nullableString(raw.username),
    phone: nullableString(raw.phone),
    signature: nullableString(raw.signature),
    raw,
  };
}

function normalizeContact(value: unknown, path: string) {
  const raw = readRequiredObject(value, path);
  return compactObject({
    id: requireString(raw.id, `${path}.id`),
    email: nullableString(raw.email),
    firstName: nullableString(raw.firstName),
    lastName: nullableString(raw.lastName),
    phone: nullableString(raw.phone),
    organizationId: nullableString(raw.orgid),
    createdAt: nullableString(raw.cdate),
    updatedAt: nullableString(raw.udate),
    deleted: nullableBoolean(raw.deleted),
    fieldValues: normalizeOptionalFieldValues(raw.fieldValues),
    raw,
  });
}

function normalizeList(value: unknown, path: string) {
  const raw = readRequiredObject(value, path);
  return compactObject({
    id: requireString(raw.id, `${path}.id`),
    name: nullableString(raw.name),
    userId: nullableString(raw.userid ?? raw.user),
    stringId: nullableString(raw.stringid),
    createdAt: nullableString(raw.cdate),
    updatedAt: nullableString(raw.udate),
    private: nullableBoolean(raw.private),
    senderName: nullableString(raw.sender_name),
    senderUrl: nullableString(raw.sender_url),
    senderReminder: nullableString(raw.sender_reminder),
    fullAddress: nullableString(raw.fulladdress),
    raw,
  });
}

function normalizeField(value: unknown, path: string) {
  const raw = readRequiredObject(value, path);
  return compactObject({
    id: requireString(raw.id, `${path}.id`),
    title: nullableString(raw.title),
    type: nullableString(raw.type),
    description: nullableString(raw.descript),
    personalizationTag: nullableString(raw.perstag),
    createdAt: nullableString(raw.created_timestamp ?? raw.cdate),
    updatedAt: nullableString(raw.updated_timestamp ?? raw.udate),
    visible: nullableBoolean(raw.visible),
    required: nullableBoolean(raw.isrequired),
    showInList: nullableBoolean(raw.show_in_list),
    options: normalizeLooseObjectArray(raw.options),
    raw,
  });
}

function normalizePagination(value: unknown) {
  const meta = optionalRecord(value);
  const pageInput = optionalRecord(meta?.page_input);
  return {
    total: nullableInteger(meta?.total),
    limit: nullableInteger(pageInput?.limit),
    offset: nullableInteger(pageInput?.offset),
  };
}

function normalizeOptionalFieldValues(value: unknown) {
  const items = asOptionalArray(value);
  if (!items) {
    return undefined;
  }

  return items.map((item, index) => {
    const raw = readRequiredObject(item, `fieldValues[${index}]`);
    return {
      field: requireString(raw.field, `fieldValues[${index}].field`),
      value: requireString(raw.value, `fieldValues[${index}].value`),
      raw,
    };
  });
}

function normalizeOptionalFieldValueInput(value: unknown) {
  const items = asOptionalArray(value);
  if (!items) {
    return undefined;
  }

  return items.map((item, index) => {
    const raw = readRequiredObject(item, `fieldValues[${index}]`);
    return {
      field: requireString(raw.field, `fieldValues[${index}].field`),
      value: requireString(raw.value, `fieldValues[${index}].value`),
    };
  });
}

function normalizeLooseObjectArray(value: unknown) {
  const items = asOptionalArray(value);
  if (!items) {
    return [];
  }

  return items.map((item, index) => readRequiredObject(item, `array[${index}]`));
}

function nullableString(value: unknown) {
  if (value == null) {
    return null;
  }
  return String(value);
}

function nullableBoolean(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "1" || value === 1 || value === "true") {
    return true;
  }
  if (value === "0" || value === 0 || value === "false") {
    return false;
  }
  return null;
}

function nullableInteger(value: unknown) {
  if (value == null || value === "") {
    return null;
  }
  return optionalInteger(value) ?? null;
}

function readRequiredObject(value: unknown, fieldName: string) {
  return readRequiredObjectInternal(value, fieldName);
}

function readRequiredObjectInternal(value: unknown, fieldName: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `malformed activecampaign payload: ${fieldName}`);
  }
  return object;
}

function readRequiredArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `malformed activecampaign payload: ${fieldName}`);
  }
  return value;
}

function requireString(value: unknown, fieldName: string) {
  const stringValue = optionalString(value) ?? (value == null ? undefined : String(value));
  if (!stringValue) {
    throw new ProviderRequestError(502, `malformed activecampaign payload: ${fieldName}`);
  }
  return stringValue;
}

function asOptionalArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function trimTrailingSlash(value: string) {
  if (!value) {
    return "";
  }

  let end = value.length;
  while (end > 1 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function endsWithPathSegment(value: string, segment: string) {
  if (segment.length > value.length) {
    return false;
  }
  return value.slice(value.length - segment.length) === segment;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: credentialProviderProxyBaseUrl("apiUrl"),
  auth: { type: "api_key_header", name: "api-token" },
});
