import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderActionSources } from "../provider-runtime.ts";

import {
  compactObject,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  mapProviderActionSources,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "pipedrive";
const apiOrigin = "https://api.pipedrive.com";
const validationPath = "/v1/users/me";

type PipedrivePhase = "validate" | "execute";
type PipedriveMethod = "GET" | "POST" | "PATCH" | "DELETE";
type PipedriveActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface Operation {
  method: PipedriveMethod;
  path: string;
  idField?: string;
  listKey?: string;
  itemKey?: string;
  search?: boolean;
}

const operations: ProviderActionSources<"pipedrive", Operation> = {
  list_persons: { method: "GET", path: "/api/v2/persons", listKey: "persons" },
  get_person: { method: "GET", path: "/api/v2/persons/{id}", idField: "personId", itemKey: "person" },
  create_person: { method: "POST", path: "/api/v2/persons", itemKey: "person" },
  update_person: { method: "PATCH", path: "/api/v2/persons/{id}", idField: "personId", itemKey: "person" },
  delete_person: { method: "DELETE", path: "/api/v2/persons/{id}", idField: "personId" },
  search_persons: { method: "GET", path: "/api/v2/persons/search", search: true },
  list_organizations: { method: "GET", path: "/api/v2/organizations", listKey: "organizations" },
  get_organization: {
    method: "GET",
    path: "/api/v2/organizations/{id}",
    idField: "organizationId",
    itemKey: "organization",
  },
  create_organization: { method: "POST", path: "/api/v2/organizations", itemKey: "organization" },
  update_organization: {
    method: "PATCH",
    path: "/api/v2/organizations/{id}",
    idField: "organizationId",
    itemKey: "organization",
  },
  delete_organization: { method: "DELETE", path: "/api/v2/organizations/{id}", idField: "organizationId" },
  search_organizations: { method: "GET", path: "/api/v2/organizations/search", search: true },
  list_deals: { method: "GET", path: "/api/v2/deals", listKey: "deals" },
  get_deal: { method: "GET", path: "/api/v2/deals/{id}", idField: "dealId", itemKey: "deal" },
  create_deal: { method: "POST", path: "/api/v2/deals", itemKey: "deal" },
  update_deal: { method: "PATCH", path: "/api/v2/deals/{id}", idField: "dealId", itemKey: "deal" },
  delete_deal: { method: "DELETE", path: "/api/v2/deals/{id}", idField: "dealId" },
  search_deals: { method: "GET", path: "/api/v2/deals/search", search: true },
  list_activities: { method: "GET", path: "/api/v2/activities", listKey: "activities" },
  get_activity: { method: "GET", path: "/api/v2/activities/{id}", idField: "activityId", itemKey: "activity" },
  create_activity: { method: "POST", path: "/api/v2/activities", itemKey: "activity" },
  update_activity: { method: "PATCH", path: "/api/v2/activities/{id}", idField: "activityId", itemKey: "activity" },
  delete_activity: { method: "DELETE", path: "/api/v2/activities/{id}", idField: "activityId" },
  list_pipelines: { method: "GET", path: "/api/v2/pipelines", listKey: "pipelines" },
  get_pipeline: { method: "GET", path: "/api/v2/pipelines/{id}", idField: "pipelineId", itemKey: "pipeline" },
  list_stages: { method: "GET", path: "/api/v2/stages", listKey: "stages" },
  get_stage: { method: "GET", path: "/api/v2/stages/{id}", idField: "stageId", itemKey: "stage" },
};

export const pipedriveActionHandlers: ProviderActionHandlers<"pipedrive", PipedriveActionHandler> =
  mapProviderActionSources(
    service,
    operations,
    (_name, operation): PipedriveActionHandler => executeOperation(operation),
  );

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, pipedriveActionHandlers);

export async function validatePipedriveCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message));
  const payload = await requestPipedriveJson({ apiKey, fetcher }, { path: validationPath, phase: "validate" });
  const user = requiredRecord(
    requiredRecord(payload, "Pipedrive validation response", providerResponseError).data,
    "data",
    providerResponseError,
  );
  const accountId =
    optionalInteger(user.id)?.toString() ?? optionalInteger(user.company_id)?.toString() ?? "pipedrive-api-token";
  return {
    profile: {
      accountId,
      displayName:
        optionalString(user.name) ??
        optionalString(user.email) ??
        optionalString(user.company_name) ??
        "Pipedrive API Token",
      grantedScopes: [],
    },
    metadata: compactObject({
      apiBaseUrl: apiOrigin,
      validationEndpoint: validationPath,
      userId: optionalInteger(user.id),
      companyId: optionalInteger(user.company_id),
      companyName: optionalString(user.company_name),
      companyDomain: optionalString(user.company_domain),
    }),
  };
}

function executeOperation(operation: Operation): PipedriveActionHandler {
  return async (input, context) => {
    const path = buildOperationPath(operation, input);
    const payload = await requestPipedriveJson(context, {
      path,
      method: operation.method,
      phase: "execute",
      query: operation.method === "GET" ? buildQuery(input, operation) : undefined,
      body: operation.method === "POST" || operation.method === "PATCH" ? buildBody(input, operation) : undefined,
      notFoundAsInvalidInput: operation.idField !== undefined,
    });
    return shapeOutput(payload, operation);
  };
}

async function requestPipedriveJson(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  options: {
    path: string;
    method?: PipedriveMethod;
    query?: Record<string, string | undefined>;
    body?: Record<string, unknown>;
    phase: PipedrivePhase;
    notFoundAsInvalidInput?: boolean;
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await context.fetcher(buildUrl(options.path, options.query), {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-api-token": context.apiKey,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Pipedrive request failed: ${error.message}` : "Pipedrive request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createPipedriveError(response.status, payload, options.phase, options.notFoundAsInvalidInput);
  }
  const record = requiredRecord(payload, "Pipedrive response", providerResponseError);
  if (record.success === false) {
    throw new ProviderRequestError(
      502,
      readErrorMessage(record) ?? "Pipedrive reported an unsuccessful response",
      record,
    );
  }
  return record;
}

function buildUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, apiOrigin);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildOperationPath(operation: Operation, input: Record<string, unknown>): string {
  if (!operation.idField) {
    return operation.path;
  }
  const id = requiredPositiveInteger(input[operation.idField], operation.idField);
  return operation.path.replace("{id}", encodeURIComponent(id));
}

function buildQuery(input: Record<string, unknown>, operation: Operation): Record<string, string | undefined> {
  const query = stringRecordWithout(input, operation.idField ? [operation.idField] : []);
  if (operation.search && !query.term) {
    query.term = requiredString(input.term ?? input.query, "term", invalidInputError);
  }
  return query;
}

function buildBody(input: Record<string, unknown>, operation: Operation): Record<string, unknown> {
  const omitted = operation.idField ? [operation.idField] : [];
  return objectWithout(input, omitted);
}

function shapeOutput(payload: unknown, operation: Operation): Record<string, unknown> {
  const record = requiredRecord(payload, "Pipedrive response", providerResponseError);
  const data = record.data;
  if (operation.listKey) {
    return { [operation.listKey]: Array.isArray(data) ? data : [], nextCursor: readNextCursor(record) };
  }
  if (operation.itemKey) {
    return { [operation.itemKey]: requiredRecord(data, "Pipedrive response data", providerResponseError) };
  }
  if (operation.search) {
    const dataRecord = requiredRecord(data, "Pipedrive search data", providerResponseError);
    return {
      items: Array.isArray(dataRecord.items) ? dataRecord.items : [],
      nextCursor: readNextCursor(record),
    };
  }
  const dataRecord = optionalRecord(data);
  return {
    id: optionalInteger(dataRecord?.id) ?? dataRecord?.id ?? null,
    deleted: true,
    raw: data,
  };
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createPipedriveError(
  status: number,
  payload: unknown,
  phase: PipedrivePhase,
  notFoundAsInvalidInput?: boolean,
): ProviderRequestError {
  const message = readErrorMessage(payload) ?? `Pipedrive request failed with HTTP ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : status, message, payload);
  }
  if ((status === 404 && notFoundAsInvalidInput) || status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function readErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  return record
    ? (optionalString(record.error) ??
        optionalString(record.error_info) ??
        optionalString(record.message) ??
        optionalString(record.statusText))
    : undefined;
}

function readNextCursor(record: Record<string, unknown>): string | null {
  const additionalData = optionalRecord(record.additional_data);
  const pagination = optionalRecord(additionalData?.pagination);
  return optionalString(pagination?.next_cursor) ?? null;
}

function stringRecordWithout(input: Record<string, unknown>, omitted: string[]): Record<string, string | undefined> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    if (omitted.includes(key) || value === undefined || value === null || typeof value === "object") {
      continue;
    }
    output[toSnakeCase(key)] = String(value);
  }
  return output;
}

function objectWithout(input: Record<string, unknown>, omitted: string[]): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!omitted.includes(key) && value !== undefined) {
      output[toSnakeCase(key)] = value;
    }
  }
  return output;
}

function requiredPositiveInteger(value: unknown, fieldName: string): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
