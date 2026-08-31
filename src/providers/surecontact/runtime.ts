import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  stringArray,
} from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const surecontactApiBaseUrl = "https://api.surecontact.com/api/v1/public";

type SureContactRequestPhase = "validate" | "execute";
type SureContactHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type SureContactActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface SureContactRequestOptions {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  path: string;
  method?: SureContactHttpMethod;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  phase: SureContactRequestPhase;
  notFoundAsInvalidInput?: boolean;
}

interface SureContactListOptions {
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  itemKeys: string[];
  outputKey: string;
}

export const surecontactActionHandlers: ProviderActionHandlers<"surecontact", SureContactActionHandler> = {
  list_contacts(input, context) {
    return requestSureContactList(context, {
      path: "/contacts",
      itemKeys: ["contacts", "data"],
      outputKey: "contacts",
      query: contactListQuery(input),
    });
  },
  async get_contact(input, context) {
    const payload = await requestSureContactJson({
      ...context,
      path: `/contacts/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      contact: requiredRecord(payload, "contact", providerResponseError),
      raw: payload,
    };
  },
  async get_contact_by_email(input, context) {
    const payload = await requestSureContactJson({
      ...context,
      path: `/contacts/email/${encodeURIComponent(requiredString(input.email, "email", providerInputError))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      contact: requiredRecord(payload, "contact", providerResponseError),
      raw: payload,
    };
  },
  create_contact(input, context) {
    return requestContactMutation(input, context, "/contacts", "POST");
  },
  upsert_contact(input, context) {
    return requestContactMutation(input, context, "/contacts/upsert", "POST");
  },
  update_contact(input, context) {
    return requestContactMutation(
      input,
      context,
      `/contacts/${encodeURIComponent(requiredString(input.contactUuid, "contactUuid", providerInputError))}`,
      "PUT",
    );
  },
  delete_contact(input, context) {
    return requestSureContactMutation(input, context, {
      path: `/contacts/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}`,
      method: "DELETE",
    });
  },
  attach_contact_tags(input, context) {
    return requestSureContactMutation(input, context, {
      path: `/contacts/${encodeURIComponent(requiredString(input.contactUuid, "contactUuid", providerInputError))}/tags/attach`,
      method: "POST",
      body: { tag_uuids: stringArray(input.uuids, "uuids", providerInputError) },
    });
  },
  detach_contact_tags(input, context) {
    return requestSureContactMutation(input, context, {
      path: `/contacts/${encodeURIComponent(requiredString(input.contactUuid, "contactUuid", providerInputError))}/tags/detach`,
      method: "POST",
      body: { tag_uuids: stringArray(input.uuids, "uuids", providerInputError) },
    });
  },
  attach_contact_lists(input, context) {
    return requestSureContactMutation(input, context, {
      path: `/contacts/${encodeURIComponent(requiredString(input.contactUuid, "contactUuid", providerInputError))}/lists/attach`,
      method: "POST",
      body: { list_uuids: stringArray(input.uuids, "uuids", providerInputError) },
    });
  },
  detach_contact_lists(input, context) {
    return requestSureContactMutation(input, context, {
      path: `/contacts/${encodeURIComponent(requiredString(input.contactUuid, "contactUuid", providerInputError))}/lists/detach`,
      method: "POST",
      body: { list_uuids: stringArray(input.uuids, "uuids", providerInputError) },
    });
  },
  list_lists(input, context) {
    return requestSureContactList(context, {
      path: "/lists",
      itemKeys: ["lists", "data"],
      outputKey: "lists",
      query: listQuery(input),
    });
  },
  async get_list(input, context) {
    const payload = await requestSureContactJson({
      ...context,
      path: `/lists/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      list: requiredRecord(payload, "list", providerResponseError),
      raw: payload,
    };
  },
  async create_list(input, context) {
    return wrapNamedObject(
      "list",
      await requestSureContactJson({
        ...context,
        path: "/lists",
        method: "POST",
        body: {
          name: requiredString(input.name, "name", providerInputError),
          description: optionalString(input.description),
        },
        phase: "execute",
      }),
    );
  },
  async update_list(input, context) {
    return wrapNamedObject(
      "list",
      await requestSureContactJson({
        ...context,
        path: `/lists/${encodeURIComponent(requiredString(input.listUuid, "listUuid", providerInputError))}`,
        method: "PUT",
        body: {
          name: optionalString(input.name),
          description: optionalString(input.description),
        },
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    );
  },
  delete_list(input, context) {
    return requestSureContactMutation(input, context, {
      path: `/lists/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}`,
      method: "DELETE",
    });
  },
  add_contacts_to_list(input, context) {
    return requestSureContactMutation(input, context, {
      path: `/lists/${encodeURIComponent(requiredString(input.listUuid, "listUuid", providerInputError))}/contacts/add`,
      method: "POST",
      body: { contact_uuids: stringArray(input.contactUuids, "contactUuids", providerInputError) },
    });
  },
  remove_contacts_from_list(input, context) {
    return requestSureContactMutation(input, context, {
      path: `/lists/${encodeURIComponent(requiredString(input.listUuid, "listUuid", providerInputError))}/contacts/remove`,
      method: "POST",
      body: { contact_uuids: stringArray(input.contactUuids, "contactUuids", providerInputError) },
    });
  },
  list_tags(input, context) {
    return requestSureContactList(context, {
      path: "/tags",
      itemKeys: ["tags", "data"],
      outputKey: "tags",
      query: listQuery(input),
    });
  },
  async get_tag(input, context) {
    const payload = await requestSureContactJson({
      ...context,
      path: `/tags/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}`,
      phase: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      tag: requiredRecord(payload, "tag", providerResponseError),
      raw: payload,
    };
  },
  async create_tag(input, context) {
    return wrapNamedObject(
      "tag",
      await requestSureContactJson({
        ...context,
        path: "/tags",
        method: "POST",
        body: { name: requiredString(input.name, "name", providerInputError) },
        phase: "execute",
      }),
    );
  },
  async update_tag(input, context) {
    return wrapNamedObject(
      "tag",
      await requestSureContactJson({
        ...context,
        path: `/tags/${encodeURIComponent(requiredString(input.tagUuid, "tagUuid", providerInputError))}`,
        method: "PUT",
        body: { name: optionalString(input.name) },
        phase: "execute",
        notFoundAsInvalidInput: true,
      }),
    );
  },
  delete_tag(input, context) {
    return requestSureContactMutation(input, context, {
      path: `/tags/${encodeURIComponent(requiredString(input.uuid, "uuid", providerInputError))}`,
      method: "DELETE",
    });
  },
};

export async function validateSureContactCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSureContactJson({
    apiKey,
    fetcher,
    signal,
    path: "/contacts",
    query: { per_page: 1 },
    phase: "validate",
  });
  const record = requiredRecord(payload, "SureContact validation response", providerResponseError);
  const contactCount = optionalInteger(record.total) ?? optionalInteger(optionalRecord(record.meta)?.total);

  return {
    profile: {
      accountId: "api_key",
      displayName: "SureContact API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: surecontactApiBaseUrl,
      validationEndpoint: "/contacts",
      contactCount,
    },
  };
}

async function requestContactMutation(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
  method: "POST" | "PUT",
): Promise<unknown> {
  const payload = await requestSureContactJson({
    ...context,
    path,
    method,
    body: contactBody(input),
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  return wrapNamedObject("contact", payload);
}

async function requestSureContactList(
  context: ApiKeyProviderContext,
  options: SureContactListOptions,
): Promise<unknown> {
  const payload = requiredRecord(
    await requestSureContactJson({
      ...context,
      path: options.path,
      query: options.query,
      phase: "execute",
    }),
    "SureContact list response",
    providerResponseError,
  );

  return {
    [options.outputKey]: readItems(payload, options.itemKeys),
    pagination: readPagination(payload),
    raw: payload,
  };
}

async function requestSureContactMutation(
  _input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  options: {
    path: string;
    method: SureContactHttpMethod;
    body?: unknown;
  },
): Promise<unknown> {
  const payload = await requestSureContactJson({
    ...context,
    path: options.path,
    method: options.method,
    body: options.body,
    phase: "execute",
    notFoundAsInvalidInput: true,
  });

  const object = payload == null ? {} : requiredRecord(payload, "SureContact mutation response", providerResponseError);
  return {
    success: optionalBoolean(object.success) ?? true,
    message: optionalString(object.message) ?? null,
    raw: payload,
  };
}

async function requestSureContactJson(options: SureContactRequestOptions): Promise<unknown> {
  const url = new URL(options.path.startsWith("/") ? options.path.slice(1) : options.path, `${surecontactApiBaseUrl}/`);
  for (const [key, value] of Object.entries(queryParams(options.query ?? {}))) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers: surecontactHeaders(options.apiKey, options.body !== undefined),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `SureContact ${options.phase} request failed: ${message}`);
  }

  const payload = await readSureContactPayload(response);
  if (!response.ok) {
    throw createSureContactError(response, payload, options.phase, options.notFoundAsInvalidInput === true);
  }

  return payload;
}

function surecontactHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }

  return headers;
}

async function readSureContactPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "SureContact returned invalid JSON");
    }
    return text;
  }
}

function createSureContactError(
  response: Response,
  payload: unknown,
  phase: SureContactRequestPhase,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message =
    readSureContactErrorMessage(payload) ??
    response.statusText ??
    `SureContact request failed with HTTP ${response.status}`;

  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 404 && notFoundAsInvalidInput) {
    return new ProviderRequestError(404, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(
    response.status >= 500 ? response.status : 502,
    `SureContact ${phase} failed: ${message}`,
    payload,
  );
}

function readSureContactErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = optionalRecord(record.errors);
  if (errors) {
    const firstValue = Object.values(errors)[0];
    if (Array.isArray(firstValue) && typeof firstValue[0] === "string") {
      return firstValue[0];
    }
    if (typeof firstValue === "string") {
      return firstValue;
    }
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function contactListQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return {
    page: optionalInteger(input.page),
    per_page: optionalInteger(input.perPage),
    search: optionalString(input.search),
    status: optionalString(input.status),
    list_uuid: optionalString(input.listUuid),
    tag_uuid: optionalString(input.tagUuid),
  };
}

function listQuery(input: Record<string, unknown>): Record<string, string | number | boolean | undefined> {
  return {
    page: optionalInteger(input.page),
    per_page: optionalInteger(input.perPage),
    search: optionalString(input.search),
  };
}

function contactBody(input: Record<string, unknown>): Record<string, unknown> {
  return {
    email: optionalString(input.email),
    first_name: optionalString(input.firstName),
    last_name: optionalString(input.lastName),
    phone: optionalString(input.phone),
    status: optionalString(input.status),
    custom_fields: optionalRecord(input.customFields),
    list_uuids: optionalStringArray(input.listUuids),
    tag_uuids: optionalStringArray(input.tagUuids),
  };
}

function wrapNamedObject(key: "contact" | "list" | "tag", payload: unknown): Record<string, unknown> {
  const object = requiredRecord(payload, key, providerResponseError);
  const nested = optionalRecord(object[key]);
  return {
    [key]: nested ?? object,
    raw: payload,
  };
}

function readItems(payload: Record<string, unknown>, itemKeys: string[]): Array<Record<string, unknown>> {
  for (const key of itemKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.map((item) => requiredRecord(item, key, providerResponseError));
    }
  }

  return [];
}

function readPagination(payload: Record<string, unknown>): Record<string, unknown> | null {
  const meta = optionalRecord(payload.meta) ?? {};
  const candidate = Object.keys(meta).length > 0 ? meta : payload;
  if (optionalInteger(candidate.current_page) === undefined && optionalInteger(candidate.total) === undefined) {
    return null;
  }

  return {
    current_page: optionalInteger(candidate.current_page),
    per_page: optionalInteger(candidate.per_page),
    total: optionalInteger(candidate.total),
    last_page: optionalInteger(candidate.last_page),
  };
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)) : undefined;
}
