import type { CredentialValidationResult, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  isAbortLikeError,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

export const productiveApiBaseUrl = "https://api.productive.io/api/v2/";
const productiveRequestTimeoutMs = 15_000;

type ProductiveRequestPhase = "validate" | "execute";
type ProductiveActionHandler = (
  input: Record<string, unknown>,
  context: { apiKey: string; organizationId: string; fetcher: typeof fetch },
) => Promise<unknown>;

export const productiveActionHandlers: ProviderActionHandlers<"productive", ProductiveActionHandler> = {
  list_tasks(input, context) {
    return listTasks(input, context);
  },
  get_task(input, context) {
    return getTask(input, context);
  },
  create_task(input, context) {
    return createTask(input, context);
  },
  update_task(input, context) {
    return updateTask(input, context);
  },
  list_time_entries(input, context) {
    return listTimeEntries(input, context);
  },
  create_time_entry(input, context) {
    return createTimeEntry(input, context);
  },
  update_time_entry(input, context) {
    return updateTimeEntry(input, context);
  },
  delete_time_entry(input, context) {
    return deleteTimeEntry(input, context);
  },
};

export async function validateProductiveCredential(
  input: Record<string, string>,
  fetcher: typeof fetch = providerFetch,
): Promise<CredentialValidationResult> {
  const apiKey = readRequiredApiKey(input.apiKey);
  const organizationId = readRequiredOrganizationId(input);
  const payload = await productiveGetJson("organization", { apiKey, organizationId }, fetcher, {
    phase: "validate",
  });
  const organization = normalizeResource(readDataResource(payload, "organization"));

  return {
    profile: {
      accountId: organization.id,
      displayName:
        optionalString(organization.attributes.name) ??
        optionalString(organization.attributes.company_name) ??
        `Organization ${organization.id}`,
      grantedScopes: [],
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: productiveApiBaseUrl.replace(/\/$/, ""),
      validationEndpoint: "/organization",
      organizationId,
      organizationName:
        optionalString(organization.attributes.name) ?? optionalString(organization.attributes.company_name),
    }),
  };
}

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "productive",
  skipDnsValidation: true,
  handlers: productiveActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, "productive");
    return {
      apiKey: credential.apiKey,
      organizationId: readRequiredOrganizationId(credential.values),
      fetcher,
    };
  },
});

async function listTasks(
  input: Record<string, unknown>,
  context: { apiKey: string; organizationId: string; fetcher: typeof fetch },
) {
  const payload = await productiveGetJson(buildListPath("tasks", input), context, context.fetcher, {
    phase: "execute",
  });
  return {
    tasks: readDataArray(payload, "tasks").map((item) => normalizeTaskResource(item)),
    included: readOptionalArray(payload.included),
    links: optionalRecord(payload.links) ?? {},
    meta: optionalRecord(payload.meta) ?? {},
  };
}

async function getTask(
  input: Record<string, unknown>,
  context: { apiKey: string; organizationId: string; fetcher: typeof fetch },
) {
  const taskId = readRequiredString(input.taskId, "taskId");
  const path = buildPathWithQuery(`tasks/${encodeURIComponent(taskId)}`, {
    include: optionalString(input.include),
  });
  const payload = await productiveGetJson(path, context, context.fetcher, { phase: "execute" });
  return {
    task: normalizeTaskResource(readDataResource(payload, "task")),
    included: readOptionalArray(payload.included),
  };
}

async function createTask(
  input: Record<string, unknown>,
  context: { apiKey: string; organizationId: string; fetcher: typeof fetch },
) {
  const attributes = compactObject({
    ...readOptionalRecord(input.attributes, "attributes"),
    title: readRequiredString(input.title, "title"),
    description: nullableInputString(input.description),
    due_date: input.dueDate,
  });
  const payload = await productiveRequestJson(
    "tasks",
    context,
    context.fetcher,
    {
      method: "POST",
      body: buildJsonApiBody("tasks", attributes, readRelationshipMap(input.relationships)),
    },
    "execute",
  );
  return {
    task: normalizeTaskResource(readDataResource(payload, "task")),
    included: readOptionalArray(payload.included),
  };
}

async function updateTask(
  input: Record<string, unknown>,
  context: { apiKey: string; organizationId: string; fetcher: typeof fetch },
) {
  const taskId = readRequiredString(input.taskId, "taskId");
  const attributes = compactObject({
    ...readOptionalRecord(input.attributes, "attributes"),
    title: input.title,
    description: nullableInputString(input.description),
    due_date: input.dueDate,
  });
  ensureMutationPayload(attributes, input.relationships);
  const payload = await productiveRequestJson(
    `tasks/${encodeURIComponent(taskId)}`,
    context,
    context.fetcher,
    {
      method: "PATCH",
      body: buildJsonApiBody("tasks", attributes, readRelationshipMap(input.relationships), taskId),
    },
    "execute",
  );
  return {
    task: normalizeTaskResource(readDataResource(payload, "task")),
    included: readOptionalArray(payload.included),
  };
}

async function listTimeEntries(
  input: Record<string, unknown>,
  context: { apiKey: string; organizationId: string; fetcher: typeof fetch },
) {
  const payload = await productiveGetJson(buildListPath("time_entries", input), context, context.fetcher, {
    phase: "execute",
  });
  return {
    timeEntries: readDataArray(payload, "time_entries").map((item) => normalizeTimeEntryResource(item)),
    included: readOptionalArray(payload.included),
    links: optionalRecord(payload.links) ?? {},
    meta: optionalRecord(payload.meta) ?? {},
  };
}

async function createTimeEntry(
  input: Record<string, unknown>,
  context: { apiKey: string; organizationId: string; fetcher: typeof fetch },
) {
  const attributes = compactObject({
    ...readOptionalRecord(input.attributes, "attributes"),
    date: input.date,
    time: input.time,
    note: input.note,
    billable: input.billable,
  });
  const relationships = {
    ...readRelationshipMap(input.relationships),
    person: { type: "people", id: readRequiredString(input.personId, "personId") },
    service: { type: "services", id: readRequiredString(input.serviceId, "serviceId") },
  };
  const payload = await productiveRequestJson(
    "time_entries",
    context,
    context.fetcher,
    {
      method: "POST",
      body: buildJsonApiBody("time_entries", attributes, relationships),
    },
    "execute",
  );
  return {
    timeEntry: normalizeTimeEntryResource(readDataResource(payload, "time_entry")),
    included: readOptionalArray(payload.included),
  };
}

async function updateTimeEntry(
  input: Record<string, unknown>,
  context: { apiKey: string; organizationId: string; fetcher: typeof fetch },
) {
  const timeEntryId = readRequiredString(input.timeEntryId, "timeEntryId");
  const attributes = compactObject({
    ...readOptionalRecord(input.attributes, "attributes"),
    date: input.date,
    time: input.time,
    note: nullableInputString(input.note),
    billable: input.billable,
  });
  ensureMutationPayload(attributes, input.relationships);
  const payload = await productiveRequestJson(
    `time_entries/${encodeURIComponent(timeEntryId)}`,
    context,
    context.fetcher,
    {
      method: "PATCH",
      body: buildJsonApiBody("time_entries", attributes, readRelationshipMap(input.relationships), timeEntryId),
    },
    "execute",
  );
  return {
    timeEntry: normalizeTimeEntryResource(readDataResource(payload, "time_entry")),
    included: readOptionalArray(payload.included),
  };
}

async function deleteTimeEntry(
  input: Record<string, unknown>,
  context: { apiKey: string; organizationId: string; fetcher: typeof fetch },
) {
  const timeEntryId = readRequiredString(input.timeEntryId, "timeEntryId");
  await productiveRequestJson(
    `time_entries/${encodeURIComponent(timeEntryId)}`,
    context,
    context.fetcher,
    { method: "DELETE" },
    "execute",
  );
  return { success: true };
}

function buildListPath(resource: string, input: Record<string, unknown>) {
  const query: Record<string, string | number | boolean | undefined> = {
    "page[number]": input.pageNumber as number | undefined,
    "page[size]": input.pageSize as number | undefined,
    sort: optionalString(input.sort),
    include: optionalString(input.include),
  };
  const filter = optionalRecord(input.filter);
  if (filter) {
    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        query[`filter[${key}]`] = value;
      }
    }
  }

  return buildPathWithQuery(resource, query);
}

function buildPathWithQuery(path: string, query: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }

  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

async function productiveGetJson(
  path: string,
  context: { apiKey: string; organizationId: string },
  fetcher: typeof fetch,
  options: { phase: ProductiveRequestPhase },
) {
  return productiveRequestJson(path, context, fetcher, { method: "GET" }, options.phase);
}

async function productiveRequestJson(
  path: string,
  context: { apiKey: string; organizationId: string },
  fetcher: typeof fetch,
  init: { method: string; body?: unknown },
  phase: ProductiveRequestPhase,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), productiveRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetcher(new URL(path, productiveApiBaseUrl), {
      method: init.method,
      headers: new Headers(
        compactObject<Record<string, string | undefined>>({
          accept: "application/vnd.api+json",
          "content-type": init.body ? "application/vnd.api+json" : undefined,
          "user-agent": providerUserAgent,
          "x-auth-token": context.apiKey,
          "x-organization-id": context.organizationId,
        }) as Record<string, string>,
      ),
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Productive request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Productive request failed: ${error.message}` : "Productive request failed",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) {
    return {};
  }

  if (!response.ok) {
    const payload = await readJsonResponse(response, { tolerateInvalidJson: true });
    throw mapProductiveError(response.status, payload, phase);
  }

  const payload = await readJsonResponse(response);
  return payload;
}

async function readJsonResponse(response: Response, options: { tolerateInvalidJson?: boolean } = {}) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (options.tolerateInvalidJson) {
      return {};
    }
    throw new ProviderRequestError(502, "Productive returned invalid JSON");
  }
}

function mapProductiveError(status: number, payload: Record<string, unknown>, phase: ProductiveRequestPhase) {
  const message = readProductiveErrorMessage(payload) ?? `Productive API request failed with ${status}`;
  if (status === 401) {
    return phase === "validate"
      ? new ProviderRequestError(400, message, payload)
      : new ProviderRequestError(status, message, payload);
  }
  if (status === 400 || status === 403 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function readProductiveErrorMessage(payload: Record<string, unknown>) {
  const errors = payload.errors;
  if (Array.isArray(errors)) {
    const first = optionalRecord(errors[0]);
    return optionalString(first?.detail) ?? optionalString(first?.title) ?? optionalString(first?.message);
  }

  return optionalString(payload.error) ?? optionalString(payload.message) ?? optionalString(payload.detail);
}

function buildJsonApiBody(
  type: string,
  attributes: Record<string, unknown>,
  relationships: Record<string, { type: string; id: string }> = {},
  id?: string,
) {
  return {
    data: compactObject({
      type,
      id,
      attributes,
      relationships: Object.fromEntries(
        Object.entries(relationships).map(([key, value]) => [key, { data: { type: value.type, id: value.id } }]),
      ),
    }),
  };
}

function readRelationshipMap(value: unknown) {
  const input = optionalRecord(value);
  if (!input) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, child]) => {
      const relation = optionalRecord(child);
      if (!relation) {
        throw new ProviderRequestError(400, `${key} relationship must be an object`);
      }
      return [
        key,
        {
          type: readRequiredString(relation.type, `${key}.type`),
          id: readRequiredString(relation.id, `${key}.id`),
        },
      ];
    }),
  );
}

function readOptionalRecord(value: unknown, fieldName: string) {
  if (value == null) {
    return {};
  }

  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }

  return record;
}

function ensureMutationPayload(attributes: Record<string, unknown>, relationships: unknown) {
  if (Object.keys(attributes).length > 0 || Object.keys(readRelationshipMap(relationships)).length > 0) {
    return;
  }

  throw new ProviderRequestError(400, "at least one field is required");
}

function normalizeTaskResource(value: unknown) {
  const resource = normalizeResource(value);
  return {
    ...resource,
    title: optionalString(resource.attributes.title) ?? "",
    description: nullableOutputString(resource.attributes.description),
    created_at: optionalString(resource.attributes.created_at) ?? "",
    updated_at: optionalString(resource.attributes.updated_at) ?? "",
    due_date: nullableOutputString(resource.attributes.due_date),
    closed_at: nullableOutputString(resource.attributes.closed_at),
  };
}

function normalizeTimeEntryResource(value: unknown) {
  const resource = normalizeResource(value);
  return {
    ...resource,
    date: optionalString(resource.attributes.date) ?? "",
    time: readOptionalNumber(resource.attributes.time) ?? 0,
    note: nullableOutputString(resource.attributes.note),
    billable: resource.attributes.billable === true,
    created_at: optionalString(resource.attributes.created_at) ?? "",
    updated_at: optionalString(resource.attributes.updated_at) ?? "",
  };
}

function normalizeResource(value: unknown) {
  const resource = optionalRecord(value);
  if (!resource) {
    throw new ProviderRequestError(502, "Productive response data must be an object");
  }

  return {
    id: readRequiredString(resource.id, "data.id"),
    type: optionalString(resource.type) ?? "",
    attributes: optionalRecord(resource.attributes) ?? {},
    relationships: optionalRecord(resource.relationships) ?? {},
  };
}

function readDataResource(payload: Record<string, unknown>, label: string) {
  const data = payload.data;
  if (!data || Array.isArray(data)) {
    throw new ProviderRequestError(502, `Productive ${label} response is missing data`);
  }
  return data;
}

function readDataArray(payload: Record<string, unknown>, label: string) {
  if (!Array.isArray(payload.data)) {
    throw new ProviderRequestError(502, `Productive ${label} response data must be an array`);
  }
  return payload.data;
}

function readOptionalArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function nullableInputString(value: unknown) {
  if (value === null) {
    return null;
  }
  return value;
}

function nullableOutputString(value: unknown) {
  if (value === null) {
    return null;
  }
  return optionalString(value) ?? null;
}

function readOptionalNumber(value: unknown) {
  return optionalNumber(value);
}

function readRequiredApiKey(apiKey: unknown) {
  const value = optionalString(apiKey);
  if (!value) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  return value;
}

function readRequiredOrganizationId(extraFields: Record<string, string> | undefined) {
  const organizationId = optionalString(extraFields?.organizationId);
  if (!organizationId) {
    throw new ProviderRequestError(400, "organizationId is required");
  }
  return organizationId;
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
