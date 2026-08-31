import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const closeApiBaseUrl = "https://api.close.com/api/v1";

type CloseActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type CloseQueryValue = string | number | undefined;

export const closeActionHandlers: ProviderActionHandlers<"close", CloseActionHandler> = {
  list_leads(input, context) {
    return listLeads(input, context);
  },
  get_lead(input, context) {
    return getLead(input, context);
  },
  create_lead(input, context) {
    return createLead(input, context);
  },
  update_lead(input, context) {
    return updateLead(input, context);
  },
  list_contacts(input, context) {
    return listContacts(input, context);
  },
  get_contact(input, context) {
    return getContact(input, context);
  },
  create_contact(input, context) {
    return createContact(input, context);
  },
  update_contact(input, context) {
    return updateContact(input, context);
  },
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
  list_opportunities(input, context) {
    return listOpportunities(input, context);
  },
  get_opportunity(input, context) {
    return getOpportunity(input, context);
  },
  create_opportunity(input, context) {
    return createOpportunity(input, context);
  },
  update_opportunity(input, context) {
    return updateOpportunity(input, context);
  },
};

export async function validateCloseCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await closeRequest("GET", "/me/", {}, undefined, apiKey, fetcher, "validation", signal);
  const meId = readRequiredString(payload.id, "me.id");
  const organizationId = optionalString(payload.organization_id);
  const organizations = readOptionalArray(payload.organizations);
  const primaryOrganization =
    organizations
      ?.map((item) => optionalRecord(item))
      .find((organization) => optionalString(organization?.id) === organizationId) ??
    (organizations && organizations.length > 0 ? optionalRecord(organizations[0]) : undefined);

  return {
    profile: {
      accountId: meId.startsWith("close:") ? meId : `close:${meId}`,
      displayName: optionalString(payload.full_name) ?? readRequiredString(payload.email, "me.email"),
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: closeApiBaseUrl,
      validationEndpoint: "/me/",
      userId: meId,
      organizationId,
      fullName: optionalString(payload.full_name),
      email: optionalString(payload.email),
      organizationName: optionalString(primaryOrganization?.name),
    }),
  };
}

async function getLead(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const leadId = readRequiredInputString(input.leadId, "leadId");
  const payload = await closeRequest(
    "GET",
    `/lead/${encodeURIComponent(leadId)}/`,
    { _fields: readOptionalStringArray(input.includeFields)?.join(",") },
    undefined,
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { lead: readRequiredObject(payload, "lead") };
}

async function createLead(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await closeRequest(
    "POST",
    "/lead/",
    {},
    buildLeadBody(input, false),
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { lead: readRequiredObject(payload, "lead") };
}

async function updateLead(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  assertHasAnyField(input, ["name", "description", "statusId", "url"], "update_lead");
  const leadId = readRequiredInputString(input.leadId, "leadId");
  const payload = await closeRequest(
    "PUT",
    `/lead/${encodeURIComponent(leadId)}/`,
    {},
    buildLeadBody(input, true),
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { lead: readRequiredObject(payload, "lead") };
}

async function listLeads(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await closeRequest(
    "GET",
    "/lead/",
    {
      _limit: optionalInteger(input.limit),
      _skip: optionalInteger(input.skip),
      _fields: readOptionalStringArray(input.includeFields)?.join(","),
    },
    undefined,
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return paginatedResult(payload, "leads");
}

async function listContacts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await closeRequest(
    "GET",
    "/contact/",
    {
      _limit: optionalInteger(input.limit),
      _skip: optionalInteger(input.skip),
      lead_id: optionalString(input.leadId),
      _fields: readOptionalStringArray(input.includeFields)?.join(","),
    },
    undefined,
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return paginatedResult(payload, "contacts");
}

async function getContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const contactId = readRequiredInputString(input.contactId, "contactId");
  const payload = await closeRequest(
    "GET",
    `/contact/${encodeURIComponent(contactId)}/`,
    { _fields: readOptionalStringArray(input.includeFields)?.join(",") },
    undefined,
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { contact: readRequiredObject(payload, "contact") };
}

async function createContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await closeRequest(
    "POST",
    "/contact/",
    {},
    buildContactBody(input, false),
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { contact: readRequiredObject(payload, "contact") };
}

async function updateContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  assertHasAnyField(input, ["name", "title", "emails", "phones", "urls"], "update_contact");
  const contactId = readRequiredInputString(input.contactId, "contactId");
  const payload = await closeRequest(
    "PUT",
    `/contact/${encodeURIComponent(contactId)}/`,
    {},
    buildContactBody(input, true),
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { contact: readRequiredObject(payload, "contact") };
}

async function listTasks(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await closeRequest(
    "GET",
    "/task/",
    {
      _limit: optionalInteger(input.limit),
      _skip: optionalInteger(input.skip),
      lead_id: optionalString(input.leadId),
      assigned_to: optionalString(input.assignedTo),
      is_complete: typeof input.isComplete === "boolean" ? String(input.isComplete) : undefined,
      view: optionalString(input.view),
      _fields: readOptionalStringArray(input.includeFields)?.join(","),
    },
    undefined,
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return paginatedResult(payload, "tasks");
}

async function getTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const taskId = readRequiredInputString(input.taskId, "taskId");
  const payload = await closeRequest(
    "GET",
    `/task/${encodeURIComponent(taskId)}/`,
    { _fields: readOptionalStringArray(input.includeFields)?.join(",") },
    undefined,
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { task: readRequiredObject(payload, "task") };
}

async function createTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await closeRequest(
    "POST",
    "/task/",
    {},
    buildTaskBody(input, false),
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { task: readRequiredObject(payload, "task") };
}

async function updateTask(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  assertHasAnyField(input, ["text", "assignedTo", "date", "dueDate", "isComplete", "isDateless"], "update_task");
  const taskId = readRequiredInputString(input.taskId, "taskId");
  const payload = await closeRequest(
    "PUT",
    `/task/${encodeURIComponent(taskId)}/`,
    {},
    buildTaskBody(input, true),
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { task: readRequiredObject(payload, "task") };
}

async function listOpportunities(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await closeRequest(
    "GET",
    "/opportunity/",
    {
      _limit: optionalInteger(input.limit),
      _skip: optionalInteger(input.skip),
      lead_id: optionalString(input.leadId),
      user_id: optionalString(input.userId),
      status_id: optionalString(input.statusId),
      status_type: optionalString(input.statusType),
      value_period: optionalString(input.valuePeriod),
      is_stalled: typeof input.isStalled === "boolean" ? String(input.isStalled) : undefined,
      query: optionalString(input.query),
      lead_query: optionalString(input.leadQuery),
      _order_by: optionalString(input.orderBy),
      _fields: readOptionalStringArray(input.includeFields)?.join(","),
    },
    undefined,
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return paginatedResult(payload, "opportunities");
}

async function getOpportunity(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const opportunityId = readRequiredInputString(input.opportunityId, "opportunityId");
  const payload = await closeRequest(
    "GET",
    `/opportunity/${encodeURIComponent(opportunityId)}/`,
    { _fields: readOptionalStringArray(input.includeFields)?.join(",") },
    undefined,
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { opportunity: readRequiredObject(payload, "opportunity") };
}

async function createOpportunity(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await closeRequest(
    "POST",
    "/opportunity/",
    {},
    buildOpportunityBody(input, false),
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { opportunity: readRequiredObject(payload, "opportunity") };
}

async function updateOpportunity(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  assertHasAnyField(
    input,
    ["contactId", "userId", "statusId", "confidence", "note", "value", "valuePeriod", "dateWon"],
    "update_opportunity",
  );
  const opportunityId = readRequiredInputString(input.opportunityId, "opportunityId");
  const payload = await closeRequest(
    "PUT",
    `/opportunity/${encodeURIComponent(opportunityId)}/`,
    {},
    buildOpportunityBody(input, true),
    context.apiKey,
    context.fetcher,
    "execution",
    context.signal,
  );
  return { opportunity: readRequiredObject(payload, "opportunity") };
}

async function closeRequest(
  method: "GET" | "POST" | "PUT",
  path: string,
  query: Record<string, CloseQueryValue>,
  body: Record<string, unknown> | undefined,
  apiKey: string,
  fetcher: typeof fetch,
  mode: "validation" | "execution",
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${closeApiBaseUrl}/`);
  for (const [key, value] of Object.entries(compactObject(query))) {
    url.searchParams.set(key, String(value));
  }

  const timeout = createProviderTimeout(signal);
  let response: Response;
  try {
    response = await fetcher(url, {
      method,
      headers: {
        accept: "application/json",
        authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        ...(body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (isAbortLikeError(error) && timeout.didTimeout()) {
      throw new ProviderRequestError(504, `Close ${path} request timed out after 30 seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Close request failed: ${error.message}` : "Close request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readClosePayload(response);
  if (!response.ok) {
    throw buildCloseError(response.status, payload, mode);
  }
  return payload;
}

async function readClosePayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    throw new ProviderRequestError(502, "Close returned an empty response");
  }
  try {
    const payload = JSON.parse(text) as unknown;
    return readRequiredObject(payload, "Close response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Close returned invalid JSON");
  }
}

function buildCloseError(
  status: number,
  payload: Record<string, unknown>,
  mode: "validation" | "execution",
): ProviderRequestError {
  const message =
    optionalString(payload.error) ??
    optionalString(payload.message) ??
    `Close request failed with status ${status || 502}`;
  if (mode === "validation" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 400 || status === 404) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function paginatedResult(payload: Record<string, unknown>, key: string): Record<string, unknown> {
  return {
    [key]: readRequiredArray(payload.data, "data").map((item, index) => readRequiredObject(item, `data[${index}]`)),
    hasMore: optionalBoolean(payload.has_more) ?? false,
  };
}

function readRequiredArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value;
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readRequiredObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  }
  return text;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function readRequiredInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
  }
  return text;
}

function buildLeadBody(input: Record<string, unknown>, isUpdate: boolean): Record<string, unknown> {
  return compactObject({
    ...(isUpdate ? {} : { name: readRequiredInputString(input.name, "name") }),
    name: typeof input.name === "string" ? input.name : undefined,
    description: typeof input.description === "string" ? input.description : undefined,
    status_id: typeof input.statusId === "string" ? input.statusId : undefined,
    url: typeof input.url === "string" ? input.url : undefined,
    addresses: Array.isArray(input.addresses)
      ? input.addresses.map((item, index) => buildLeadAddress(readRequiredObject(item, `addresses[${index}]`)))
      : undefined,
    contacts: Array.isArray(input.contacts)
      ? input.contacts.map((item, index) => buildNestedLeadContact(readRequiredObject(item, `contacts[${index}]`)))
      : undefined,
  });
}

function buildContactBody(input: Record<string, unknown>, isUpdate: boolean): Record<string, unknown> {
  return compactObject({
    ...(isUpdate
      ? {}
      : {
          lead_id: readRequiredInputString(input.leadId, "leadId"),
          name: readRequiredInputString(input.name, "name"),
        }),
    name: typeof input.name === "string" ? input.name : undefined,
    title: typeof input.title === "string" ? input.title : undefined,
    emails: Array.isArray(input.emails)
      ? input.emails.map((item, index) => buildEmailValue(readRequiredObject(item, `emails[${index}]`)))
      : undefined,
    phones: Array.isArray(input.phones)
      ? input.phones.map((item, index) => buildPhoneValue(readRequiredObject(item, `phones[${index}]`)))
      : undefined,
    urls: Array.isArray(input.urls)
      ? input.urls.map((item, index) => buildUrlValue(readRequiredObject(item, `urls[${index}]`)))
      : undefined,
  });
}

function buildLeadAddress(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    label: optionalString(input.label),
    address_1: optionalString(input.address1),
    address_2: optionalString(input.address2),
    city: optionalString(input.city),
    state: optionalString(input.state),
    zipcode: optionalString(input.zipcode),
    country: optionalString(input.country),
  });
}

function buildNestedLeadContact(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    name: readRequiredInputString(input.name, "contacts.name"),
    title: optionalString(input.title),
    emails: Array.isArray(input.emails)
      ? input.emails.map((item, index) => buildEmailValue(readRequiredObject(item, `contacts.emails[${index}]`)))
      : undefined,
    phones: Array.isArray(input.phones)
      ? input.phones.map((item, index) => buildPhoneValue(readRequiredObject(item, `contacts.phones[${index}]`)))
      : undefined,
  });
}

function buildEmailValue(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    email: readRequiredInputString(input.email, "email"),
    type: optionalString(input.type),
  });
}

function buildPhoneValue(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    phone: readRequiredInputString(input.phone, "phone"),
    type: optionalString(input.type),
  });
}

function buildUrlValue(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: readRequiredInputString(input.url, "url"),
    type: optionalString(input.type),
  });
}

function buildTaskBody(input: Record<string, unknown>, isUpdate: boolean): Record<string, unknown> {
  return compactObject({
    ...(isUpdate
      ? {}
      : {
          _type: "lead",
          lead_id: readRequiredInputString(input.leadId, "leadId"),
          text: readRequiredInputString(input.text, "text"),
        }),
    text: typeof input.text === "string" ? input.text : undefined,
    assigned_to: typeof input.assignedTo === "string" ? input.assignedTo : undefined,
    date: typeof input.date === "string" ? input.date : undefined,
    due_date: typeof input.dueDate === "string" ? input.dueDate : undefined,
    is_complete: typeof input.isComplete === "boolean" ? input.isComplete : undefined,
    is_dateless: typeof input.isDateless === "boolean" ? input.isDateless : undefined,
  });
}

function buildOpportunityBody(input: Record<string, unknown>, isUpdate: boolean): Record<string, unknown> {
  return compactObject({
    ...(isUpdate ? {} : { lead_id: readRequiredInputString(input.leadId, "leadId") }),
    contact_id: typeof input.contactId === "string" ? input.contactId : undefined,
    user_id: typeof input.userId === "string" ? input.userId : undefined,
    status_id: typeof input.statusId === "string" ? input.statusId : undefined,
    confidence:
      typeof input.confidence === "number" && Number.isInteger(input.confidence) ? input.confidence : undefined,
    note: typeof input.note === "string" ? input.note : undefined,
    value: typeof input.value === "number" && Number.isInteger(input.value) ? input.value : undefined,
    value_period: typeof input.valuePeriod === "string" ? input.valuePeriod : undefined,
    date_won: typeof input.dateWon === "string" ? input.dateWon : undefined,
  });
}

function assertHasAnyField(input: Record<string, unknown>, fields: string[], actionName: string): void {
  if (!fields.some((field) => input[field] !== undefined)) {
    throw new ProviderRequestError(400, `${actionName} requires at least one writable field`);
  }
}
