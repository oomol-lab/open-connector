import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "ambivo";
const ambivoApiBaseUrl = "https://fapi.ambivo.com";
const ambivoValidationPath = "/crm/leads";
const ambivoMaxResponseBytes = 10 * 1024 * 1024;

interface AmbivoRequestOptions {
  readonly path: string;
  readonly apiKey: string;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
  readonly mode: "validate" | "execute";
  readonly method?: "GET" | "POST" | "PATCH" | "DELETE";
  readonly query?: Record<string, string | undefined>;
  readonly body?: unknown;
}

type AmbivoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const ambivoActionHandlers: ProviderActionHandlers<"ambivo", AmbivoActionHandler> = {
  list_leads(input, context) {
    return listPaginatedRecords(input, context, {
      path: "/crm/leads",
      outputField: "leads",
    });
  },
  create_lead(input, context) {
    return writeRecord(input, context, {
      path: "/crm/leads",
      method: "POST",
      body: buildPersonBody(input),
    });
  },
  update_lead(input, context) {
    const leadId = requireNonEmptyString(input.leadId, "leadId");
    return writeRecord(input, context, {
      path: `/crm/leads/${encodeURIComponent(leadId)}`,
      method: "PATCH",
      body: buildPersonBody(input),
    });
  },
  list_contacts(input, context) {
    return listContactRecords(input, context);
  },
  create_contact(input, context) {
    return writeRecord(input, context, {
      path: "/crm/contacts",
      method: "POST",
      body: buildPersonBody(input),
    });
  },
  update_contact(input, context) {
    const contactId = requireNonEmptyString(input.contactId, "contactId");
    return writeRecord(input, context, {
      path: `/crm/contacts/${encodeURIComponent(contactId)}`,
      method: "PATCH",
      body: buildPersonBody(input),
    });
  },
  list_tasks(input, context) {
    return listPaginatedRecords(input, context, {
      path: "/crm/tasks",
      outputField: "tasks",
    });
  },
  create_task(input, context) {
    return writeRecord(input, context, {
      path: "/crm/tasks",
      method: "POST",
      body: buildTaskBody(input),
    });
  },
  update_task(input, context) {
    const taskId = requireNonEmptyString(input.taskId, "taskId");
    return writeRecord(input, context, {
      path: `/crm/tasks/${encodeURIComponent(taskId)}`,
      method: "PATCH",
      body: buildTaskBody(input),
    });
  },
  async delete_task(input, context) {
    const taskId = requireNonEmptyString(input.taskId, "taskId");
    const payload = await requestAmbivoJson({
      path: `/crm/tasks/${encodeURIComponent(taskId)}`,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      mode: "execute",
      method: "DELETE",
    });
    const body = requireObject(payload, "Ambivo returned an invalid delete-task payload");
    return {
      deleted: readBoolean(body.deleted, "deleted"),
      ids: readStringArray(body.ids, "ids"),
      raw: body,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, ambivoActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ambivoApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set("authorization", buildAmbivoAuthorizationHeader(credential.apiKey));
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestAmbivoJson({
      path: ambivoValidationPath,
      apiKey: input.apiKey,
      fetcher,
      signal,
      mode: "validate",
      query: {
        page_size: "1",
        page_num: "1",
      },
    });
    return {
      profile: {
        accountId: "api_key",
        displayName: "Ambivo API Token",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: ambivoApiBaseUrl,
        validationEndpoint: ambivoValidationPath,
      },
    };
  },
};

async function listPaginatedRecords(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  options: { readonly path: string; readonly outputField: string },
) {
  const payload = await requestAmbivoJson({
    path: options.path,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: buildListQuery(input),
  });
  const body = requireObject(payload, `Ambivo returned an invalid ${options.outputField} payload`);
  const records = readObjectArray(body[options.outputField], options.outputField);

  return {
    [options.outputField]: records,
    pageSize: readNullableInteger(body.page_size),
    pageNum: readNullableInteger(body.page_num),
    raw: body,
  };
}

async function listContactRecords(input: Record<string, unknown>, context: ApiKeyProviderContext) {
  const payload = await requestAmbivoJson({
    path: "/crm/contacts",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: buildListQuery(input),
  });

  if (Array.isArray(payload)) {
    return {
      contacts: payload.map((item) => requireObject(item, "Ambivo returned an invalid contact")),
      raw: payload,
    };
  } else {
    const body = requireObject(payload, "Ambivo returned an invalid contacts payload");
    return {
      contacts: readObjectArray(body.contacts, "contacts"),
      raw: body,
    };
  }
}

async function writeRecord(
  _input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  options: {
    readonly path: string;
    readonly method: "POST" | "PATCH";
    readonly body: Record<string, unknown>;
  },
) {
  const payload = await requestAmbivoJson({
    path: options.path,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    method: options.method,
    body: options.body,
  });
  const record = requireObject(payload, "Ambivo returned an invalid CRM record payload");
  return {
    record,
    raw: record,
  };
}

async function requestAmbivoJson(options: AmbivoRequestOptions) {
  const url = new URL(options.path, ambivoApiBaseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: buildAmbivoAuthorizationHeader(options.apiKey),
    "user-agent": providerUserAgent,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const timeout = createProviderTimeout(options.signal);
  try {
    const response = await options.fetcher(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: timeout.signal,
    });
    const payload = await readAmbivoPayload(response);
    if (!response.ok) {
      throw mapAmbivoError(response.status, payload, options.mode);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Ambivo request timed out");
    }
    throw new ProviderRequestError(
      502,
      `Ambivo request failed: ${error instanceof Error ? error.message : "Unknown transport error"}`,
    );
  } finally {
    timeout.cleanup();
  }
}

function buildAmbivoAuthorizationHeader(apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed;
  } else {
    return `Bearer ${trimmed}`;
  }
}

async function readAmbivoPayload(response: Response) {
  const text = await readProviderTextBody(response, "Ambivo response", ambivoMaxResponseBytes);
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "Ambivo returned malformed JSON");
    } else {
      return { message: text };
    }
  }
}

function mapAmbivoError(status: number, payload: unknown, mode: "validate" | "execute") {
  const message = readErrorMessage(payload) ?? `Ambivo request failed with status ${status}`;
  if (status === 401 || status === 403) {
    if (mode === "validate") {
      return new ProviderRequestError(401, message);
    } else {
      return new ProviderRequestError(401, message);
    }
  } else if (status === 429) {
    return new ProviderRequestError(429, message);
  } else if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new ProviderRequestError(status, message);
  } else {
    return new ProviderRequestError(502, message);
  }
}

function readErrorMessage(payload: unknown) {
  const body = optionalRecord(payload);
  if (!body) {
    return undefined;
  }

  const detail = body.detail;
  if (typeof detail === "string" && detail) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "string" && first) {
      return first;
    }
    const firstObject = optionalRecord(first);
    if (typeof firstObject?.msg === "string" && firstObject.msg) {
      return firstObject.msg;
    }
  }

  const error = body.error;
  if (typeof error === "string" && error) {
    return error;
  }
  const errorObject = optionalRecord(error);
  if (typeof errorObject?.message === "string" && errorObject.message) {
    return errorObject.message;
  }

  return typeof body.message === "string" && body.message ? body.message : undefined;
}

function buildListQuery(input: Record<string, unknown>) {
  const matchFilter = optionalRecord(input.matchFilter);
  const sort = optionalRecord(input.sort);
  return {
    match_filter_dict: matchFilter === undefined ? undefined : JSON.stringify(matchFilter),
    eval_object_id: typeof input.evalObjectId === "boolean" ? String(input.evalObjectId) : undefined,
    sort_dict: sort === undefined ? undefined : JSON.stringify(sort),
    page_size: readOptionalStringifiedInteger(input.pageSize),
    page_num: readOptionalStringifiedInteger(input.pageNum),
    start_date: readOptionalString(input.startDate),
    end_date: readOptionalString(input.endDate),
  };
}

function buildPersonBody(input: Record<string, unknown>) {
  return {
    name: input.name === undefined ? undefined : requireNonEmptyString(input.name, "name"),
    email: input.email,
    phone: input.phone,
    source: input.source,
    status: input.status,
    comments: input.comments,
    tags: input.tags,
    employer_name: input.employerName,
    profession: input.profession,
    title: input.title,
    ssn: input.ssn,
    website: input.website,
    birth_year: input.birthYear,
    birth_month: input.birthMonth,
    birth_day: input.birthDay,
    decision_date: input.decisionDate,
    business_need_description: input.businessNeedDescription,
    social_dict_list: input.socialProfiles,
  };
}

function buildTaskBody(input: Record<string, unknown>) {
  return {
    name: input.name === undefined ? undefined : requireNonEmptyString(input.name, "name"),
    description: input.description,
    status: input.status,
    priority: input.priority,
    due_date: input.dueDate,
    subject_type: input.subjectType,
    subject: input.subject,
    userid: input.userId,
    action: input.action,
    action_data: input.actionData,
    tags: input.tags,
    is_completed: input.isCompleted,
    completed_date: input.completedDate,
  };
}

function requireNonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown) {
  const result = typeof value === "string" ? value.trim() : "";
  return result || undefined;
}

function readOptionalStringifiedInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? String(value) : undefined;
}

function readNullableInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `Ambivo returned an invalid ${fieldName}`);
  }
  return value;
}

function readStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ProviderRequestError(502, `Ambivo returned an invalid ${fieldName}`);
  }
  return value;
}

function readObjectArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `Ambivo returned an invalid ${fieldName}`);
  }
  return value.map((item) => requireObject(item, `Ambivo returned an invalid ${fieldName} item`));
}

function requireObject(value: unknown, message: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, message);
  }
  return value as Record<string, unknown>;
}
