import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalNumber, optionalRawString, optionalRecord } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "liveagent";
const liveagentCredentialHelpUrl = "https://support.liveagent.com/741982-API-key";
const liveagentValidationPath = "/my_account/_link";
const liveagentApiPathPrefix = "/api/v3";
const liveagentMaxResponseBytes = 10 * 1024 * 1024;

type LiveagentMode = "validate" | "execute";
type LiveagentMethod = "GET" | "POST" | "PUT" | "PATCH";
type QueryValue = string | number | boolean | undefined;

interface LiveagentContext {
  readonly apiKey: string;
  readonly apiBaseUrl: string;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
}

type LiveagentActionHandler = (input: Record<string, unknown>, context: LiveagentContext) => Promise<unknown>;

export const liveagentActionHandlers: ProviderActionHandlers<"liveagent", LiveagentActionHandler> = {
  async list_tickets(input, context) {
    const payload = await requestLiveagentJson({
      ...context,
      path: "/tickets",
      query: buildPageQuery(input),
      mode: "execute",
    });
    const body = optionalRecord(payload);
    const rows = asObjectArray(body?.rows ?? payload, "LiveAgent returned invalid tickets");

    return {
      tickets: rows.map(normalizeTicketListItem),
      raw: body ?? { rows },
    };
  },

  async get_ticket(input, context) {
    const ticket = asObject(
      await requestLiveagentJson({
        ...context,
        path: `/tickets/${encodeURIComponent(String(input.ticketId))}`,
        mode: "execute",
      }),
      "LiveAgent returned invalid ticket",
    );

    return { ticket: normalizeTicket(ticket) };
  },

  async create_ticket(input, context) {
    const ticket = asObject(
      await requestLiveagentJson({
        ...context,
        path: "/tickets",
        method: "POST",
        body: pickRequestBody(input, [
          "useridentifier",
          "subject",
          "departmentid",
          "recipient",
          "message",
          "recipient_name",
          "carbon_copies",
          "blind_carbon_copies",
          "status",
          "mail_message_id",
          "do_not_send_mail",
          "use_template",
          "is_html_message",
          "tags",
          "custom_fields",
        ]),
        mode: "execute",
      }),
      "LiveAgent returned invalid created ticket",
    );

    return { ticket: normalizeTicket(ticket) };
  },

  async update_ticket(input, context) {
    const ticket = asObject(
      await requestLiveagentJson({
        ...context,
        path: `/tickets/${encodeURIComponent(String(input.ticketId))}`,
        method: "PUT",
        body: pickRequestBody(input, [
          "owner_contactid",
          "departmentid",
          "agentid",
          "status",
          "subject",
          "tags",
          "custom_fields",
        ]),
        mode: "execute",
      }),
      "LiveAgent returned invalid updated ticket",
    );

    return { ticket: normalizeTicket(ticket) };
  },

  async list_contacts(input, context) {
    const payload = await requestLiveagentJson({
      ...context,
      path: "/contacts",
      query: buildPageQuery(input),
      mode: "execute",
    });
    const contacts = asObjectArray(payload, "LiveAgent returned invalid contacts");
    return {
      contacts: contacts.map(normalizeContact),
      raw: payload,
    };
  },

  async get_contact(input, context) {
    const contact = asObject(
      await requestLiveagentJson({
        ...context,
        path: `/contacts/${encodeURIComponent(String(input.contactId))}`,
        mode: "execute",
      }),
      "LiveAgent returned invalid contact",
    );

    return { contact: normalizeContact(contact) };
  },

  async create_contact(input, context) {
    const contact = asObject(
      await requestLiveagentJson({
        ...context,
        path: "/contacts",
        method: "POST",
        body: pickContactBody(input),
        mode: "execute",
      }),
      "LiveAgent returned invalid created contact",
    );

    return { contact: normalizeContact(contact) };
  },

  async update_contact(input, context) {
    const contact = asObject(
      await requestLiveagentJson({
        ...context,
        path: `/contacts/${encodeURIComponent(String(input.contactId))}`,
        method: "PUT",
        body: pickContactBody(input),
        mode: "execute",
      }),
      "LiveAgent returned invalid updated contact",
    );

    return { contact: normalizeContact(contact) };
  },

  async list_groups(input, context) {
    void input;
    const payload = await requestLiveagentJson({
      ...context,
      path: "/groups",
      mode: "execute",
    });
    const groups = asObjectArray(payload, "LiveAgent returned invalid groups");
    return {
      groups: groups.map(normalizeGroup),
      raw: payload,
    };
  },

  async get_group(input, context) {
    const payload = await requestLiveagentJson({
      ...context,
      path: `/groups/${encodeURIComponent(String(input.groupId))}`,
      mode: "execute",
    });
    const group = readFirstObject(payload, "LiveAgent returned invalid group");
    return { group: normalizeGroup(group) };
  },

  async list_departments(input, context) {
    const payload = await requestLiveagentJson({
      ...context,
      path: "/departments",
      query: buildPageQuery(input),
      mode: "execute",
    });
    const departments = asObjectArray(payload, "LiveAgent returned invalid departments");
    return {
      departments: departments.map(normalizeDepartment),
      raw: payload,
    };
  },

  async get_department(input, context) {
    const department = asObject(
      await requestLiveagentJson({
        ...context,
        path: `/departments/${encodeURIComponent(String(input.departmentId))}`,
        mode: "execute",
      }),
      "LiveAgent returned invalid department",
    );

    return { department: normalizeDepartment(department) };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<LiveagentContext>({
  service,
  handlers: liveagentActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<LiveagentContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      apiBaseUrl: resolveLiveagentApiBaseUrl(credential.metadata, credential.values.baseUrl),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    return resolveLiveagentApiBaseUrl(credential.metadata, credential.values.baseUrl);
  },
  auth: { type: "api_key_header", name: "apikey" },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const apiKey = input.apiKey;
    const baseUrl = normalizeLiveagentBaseUrl(input.values.baseUrl);
    const apiBaseUrl = buildLiveagentApiBaseUrl(baseUrl);
    const payload = optionalRecord(
      await requestLiveagentJson({
        apiBaseUrl,
        apiKey,
        path: liveagentValidationPath,
        fetcher,
        signal,
        mode: "validate",
      }),
    );
    const accountLink = optionalRawString(payload?.link);
    const host = new URL(baseUrl).host;

    return {
      profile: {
        accountId: `liveagent:${host}:${hashApiKey(apiKey)}`,
        displayName: accountLink ?? host,
      },
      grantedScopes: [],
      metadata: compactObject({
        baseUrl,
        apiBaseUrl,
        validationEndpoint: `${liveagentApiPathPrefix}${liveagentValidationPath}`,
        accountLink,
        credentialHelpUrl: liveagentCredentialHelpUrl,
      }),
    };
  },
};

function normalizeLiveagentBaseUrl(value: unknown) {
  if (typeof value != "string" || !value.trim()) {
    throw new ProviderRequestError(400, "baseUrl is required");
  }

  const url = assertPublicHttpUrl(value.trim(), {
    fieldName: "baseUrl",
    createError: (message) => new ProviderRequestError(400, message),
  });

  if (url.username || url.password) {
    throw new ProviderRequestError(400, "baseUrl must not include credentials");
  }

  if (url.pathname != "/") {
    throw new ProviderRequestError(400, "baseUrl must be the LiveAgent account root URL without any path");
  }

  url.hash = "";
  url.search = "";
  return trimTrailingSlash(url.toString());
}

function buildLiveagentApiBaseUrl(baseUrl: string) {
  return `${baseUrl}${liveagentApiPathPrefix}`;
}

function resolveLiveagentApiBaseUrl(providerMetadata: Record<string, unknown>, credentialBaseUrl?: string) {
  const apiBaseUrl = optionalRawString(providerMetadata?.apiBaseUrl);
  if (apiBaseUrl) {
    return normalizeLiveagentApiBaseUrl(apiBaseUrl);
  } else {
    return buildLiveagentApiBaseUrl(normalizeLiveagentBaseUrl(credentialBaseUrl ?? providerMetadata?.baseUrl));
  }
}

function normalizeLiveagentApiBaseUrl(value: string) {
  if (!value.endsWith(liveagentApiPathPrefix)) {
    return buildLiveagentApiBaseUrl(normalizeLiveagentBaseUrl(value));
  } else {
    const rootUrl = value.slice(0, -liveagentApiPathPrefix.length);
    return buildLiveagentApiBaseUrl(normalizeLiveagentBaseUrl(rootUrl));
  }
}

async function requestLiveagentJson(input: {
  readonly apiBaseUrl: string;
  readonly apiKey: string;
  readonly path: string;
  readonly fetcher: typeof fetch;
  readonly mode: LiveagentMode;
  readonly method?: LiveagentMethod;
  readonly query?: Record<string, QueryValue>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
}) {
  return runProviderRequest({ signal: input.signal, label: "LiveAgent" }, async (signal) => {
    const response = await input.fetcher(buildLiveagentUrl(input.apiBaseUrl, input.path, input.query), {
      method: input.method ?? "GET",
      headers: buildLiveagentHeaders(input.apiKey, input.body !== undefined),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal,
    });
    const payload = await readLiveagentPayload(response);

    if (!response.ok) {
      throw createLiveagentError(response.status, payload, input.mode);
    }

    return payload;
  });
}

function buildLiveagentUrl(apiBaseUrl: string, path: string, query?: Record<string, QueryValue>) {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function buildLiveagentHeaders(apiKey: string, hasBody: boolean) {
  const headers = new Headers({
    accept: "application/json",
    apikey: apiKey,
    "user-agent": providerUserAgent,
  });
  if (hasBody) {
    headers.set("content-type", "application/json");
  }
  return headers;
}

async function readLiveagentPayload(response: Response) {
  if (response.status === 204) {
    return null;
  }

  const text = await readProviderTextBody(response, "LiveAgent response", liveagentMaxResponseBytes);
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function createLiveagentError(status: number, payload: unknown, mode: LiveagentMode) {
  const message = readErrorMessage(payload) ?? `LiveAgent request failed with status ${status}`;

  if (status === 401 || status === 403) {
    return mode === "validate" ? new ProviderRequestError(400, message) : new ProviderRequestError(status, message);
  }

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(status === 404 ? 404 : 400, message);
  }

  return new ProviderRequestError(502, message);
}

function buildPageQuery(input: Record<string, unknown>) {
  return compactObject({
    _page: optionalInteger(input.page),
    _perPage: optionalInteger(input.perPage),
    _from: optionalInteger(input.from),
    _to: optionalInteger(input.to),
    _sortDir: optionalRawString(input.sortDir),
    _sortField: optionalRawString(input.sortField),
    _filters: optionalRawString(input.filters),
  });
}

function pickContactBody(input: Record<string, unknown>) {
  return pickRequestBody(input, [
    "id",
    "company_id",
    "firstname",
    "lastname",
    "system_name",
    "description",
    "avatar_url",
    "gender",
    "language",
    "city",
    "countrycode",
    "ip",
    "emails",
    "phones",
    "groups",
    "job_position",
    "note",
    "useragent",
    "screen",
    "time_offset",
    "latitude",
    "longitude",
    "custom_fields",
  ]);
}

function pickRequestBody(input: Record<string, unknown>, keys: readonly string[]) {
  const body: Record<string, unknown> = {};
  for (const key of keys) {
    const value = input[key];
    if (value !== undefined) {
      body[key] = value;
    }
  }
  return body;
}

function normalizeTicket(value: Record<string, unknown>) {
  return {
    id: asNullableString(value.id),
    code: asNullableString(value.code),
    subject: asNullableString(value.subject),
    status: asNullableString(value.status),
    departmentid: asNullableString(value.departmentid),
    agentid: asNullableString(value.agentid),
    owner_contactid: asNullableString(value.owner_contactid),
    owner_email: asNullableString(value.owner_email),
    owner_name: asNullableString(value.owner_name),
    tags: asNullableDelimitedStringArray(value.tags),
    raw: value,
  };
}

function normalizeTicketListItem(value: Record<string, unknown>) {
  return {
    conversationid: asNullableString(value.conversationid),
    code: asNullableString(value.code),
    subject: asNullableString(value.subject),
    status: asNullableString(value.status),
    departmentid: asNullableString(value.departmentid),
    agentid: asNullableString(value.agentid),
    contactid: asNullableString(value.contactid),
    ownerEmail: asNullableString(value.owner_email ?? firstArrayString(value.emails)),
    ownerName: asNullableString(value.owner_name ?? joinName(value.firstname, value.lastname)),
    datecreated: asNullableTimestamp(value.datecreated ?? value.date_created),
    datechanged: asNullableTimestamp(value.datechanged ?? value.date_changed),
    tags: asNullableDelimitedStringArray(value.tags),
    raw: value,
  };
}

function normalizeContact(value: Record<string, unknown>) {
  return {
    id: asNullableString(value.id),
    firstname: asNullableString(value.firstname),
    lastname: asNullableString(value.lastname),
    system_name: asNullableString(value.system_name),
    type: asNullableString(value.type),
    registration_email: asNullableString(value.registration_email),
    emails: asNullableStringArray(value.emails),
    phones: asNullableStringArray(value.phones),
    groups: asNullableStringArray(value.groups),
    raw: value,
  };
}

function normalizeGroup(value: Record<string, unknown>) {
  return {
    id: asNullableString(value.id),
    name: asNullableString(value.name),
    color: asNullableString(value.color),
    background_color: asNullableString(value.background_color),
    raw: value,
  };
}

function normalizeDepartment(value: Record<string, unknown>) {
  return {
    department_id: asNullableString(value.department_id),
    name: asNullableString(value.name),
    online_status: asNullableString(value.online_status),
    agent_count: asNullableNumber(value.agent_count),
    agent_ids: asNullableStringArray(value.agent_ids),
    mailaccount_id: asNullableString(value.mailaccount_id),
    raw: value,
  };
}

function asObject(value: unknown, errorMessage: string) {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, errorMessage);
  }
  return object;
}

function asObjectArray(value: unknown, errorMessage: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, errorMessage);
  }
  return value.map((item) => asObject(item, errorMessage));
}

function readFirstObject(value: unknown, errorMessage: string) {
  if (Array.isArray(value)) {
    const first = value[0];
    return asObject(first, errorMessage);
  } else {
    return asObject(value, errorMessage);
  }
}

function asNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  } else {
    return optionalRawString(value) ?? null;
  }
}

function asNullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  } else {
    return optionalNumber(value) ?? null;
  }
}

function asNullableStringArray(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  } else if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item == "string");
  } else {
    return null;
  }
}

function asNullableDelimitedStringArray(value: unknown) {
  if (typeof value == "string") {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    return items.length > 0 ? items : null;
  } else {
    return asNullableStringArray(value);
  }
}

function asNullableTimestamp(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  } else if (typeof value == "number") {
    return optionalInteger(value) ?? null;
  }

  const text = optionalRawString(value)?.trim();
  if (!text) {
    return null;
  }

  const numericValue = Number(text);
  if (Number.isSafeInteger(numericValue)) {
    return numericValue;
  }

  const milliseconds = Date.parse(normalizeLiveagentDateTime(text));
  if (Number.isNaN(milliseconds)) {
    return null;
  } else {
    return Math.floor(milliseconds / 1000);
  }
}

function normalizeLiveagentDateTime(value: string) {
  let normalized = value;
  const spaceIndex = normalized.indexOf(" ");
  if (spaceIndex > 0 && !normalized.includes("T")) {
    normalized = `${normalized.slice(0, spaceIndex)}T${normalized.slice(spaceIndex + 1)}`;
  }

  if (hasTimezoneSuffix(normalized)) {
    return normalized;
  } else {
    return `${normalized}Z`;
  }
}

function hasTimezoneSuffix(value: string) {
  if (value.endsWith("Z") || value.endsWith("z")) {
    return true;
  }

  const offsetIndex = value.length - 6;
  if (offsetIndex <= 0) {
    return false;
  }

  const offsetSign = value[offsetIndex];
  return (offsetSign == "+" || offsetSign == "-") && value[offsetIndex + 3] == ":";
}

function firstArrayString(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.find((item): item is string => typeof item == "string");
}

function joinName(firstname: unknown, lastname: unknown) {
  const parts = [optionalRawString(firstname), optionalRawString(lastname)].filter(
    (part): part is string => typeof part == "string" && part.length > 0,
  );
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function readErrorMessage(payload: unknown) {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const error = body.error;
  if (typeof error == "string" && error) {
    return error;
  }

  const errorObject = optionalRecord(error);
  return (
    optionalRawString(errorObject?.message) ??
    optionalRawString(errorObject?.description) ??
    optionalRawString(body.message) ??
    optionalRawString(body.error_description)
  );
}

function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
