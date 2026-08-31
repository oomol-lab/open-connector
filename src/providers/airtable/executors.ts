import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BearerProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredRecord,
} from "../../core/cast.ts";
import {
  defineBearerProviderExecutors,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredResponseRecord,
} from "../provider-runtime.ts";

type AirtableRequestMode = "validate" | "execute";
type AirtableActionInput = Record<string, unknown>;
type AirtableActionHandler = ProviderRuntimeHandler<BearerProviderContext>;

interface AirtableAuth {
  accessToken: string;
  tokenType?: string;
}

interface AirtableRequestOptions {
  auth: AirtableAuth;
  path: string;
  fetcher: typeof fetch;
  mode: AirtableRequestMode;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: ReadonlyArray<readonly [string, string]>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

export const airtableApiBaseUrl = "https://api.airtable.com";

const service = "airtable";
const airtableValidationPath = "/v0/meta/whoami";
const airtableListBasesPath = "/v0/meta/bases";
const airtableGetUrlLengthSoftLimit = 15_000;

export const airtableActionHandlers: ProviderActionHandlers<"airtable", AirtableActionHandler> = {
  list_bases(input, context) {
    return listBases(input, context);
  },
  get_base_collaborators(input, context) {
    return getBaseCollaborators(input, context);
  },
  get_base_schema(input, context) {
    return getBaseSchema(input, context);
  },
  create_base(input, context) {
    return createBase(input, context);
  },
  delete_base(input, context) {
    return deleteBase(input, context);
  },
  create_table(input, context) {
    return createTable(input, context);
  },
  update_table(input, context) {
    return updateTable(input, context);
  },
  create_field(input, context) {
    return createField(input, context);
  },
  update_field(input, context) {
    return updateField(input, context);
  },
  list_records(input, context) {
    return listRecords(input, context);
  },
  get_record(input, context) {
    return getRecord(input, context);
  },
  create_records(input, context) {
    return createRecords(input, context);
  },
  update_records(input, context) {
    return updateRecords(input, context);
  },
  delete_records(input, context) {
    return deleteRecords(input, context);
  },
};

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, airtableActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validateAirtableCredential({ accessToken: input.apiKey, tokenType: "Bearer" }, fetcher);
  },
  async oauth2(input, { fetcher }) {
    return validateAirtableCredential({ accessToken: input.accessToken, tokenType: input.tokenType }, fetcher);
  },
};

async function validateAirtableCredential(
  auth: AirtableAuth,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const payload = requiredResponseRecord(
    await requestAirtableJson({
      auth,
      path: airtableValidationPath,
      fetcher,
      mode: "validate",
    }),
    "airtable validation response",
  );

  const accountId = optionalString(payload.id);
  if (!accountId) {
    throw new ProviderRequestError(502, "airtable validation response is missing user id", payload);
  }
  const grantedScopes = optionalStringArray(payload.scopes) ?? [];

  return {
    profile: {
      accountId,
      displayName: optionalString(payload.email) ?? accountId,
    },
    grantedScopes,
    metadata: compactObject({
      apiBaseUrl: `${airtableApiBaseUrl}/v0`,
      validationEndpoint: airtableValidationPath,
      currentUser: payload,
    }),
  };
}

async function listBases(input: AirtableActionInput, context: BearerProviderContext) {
  const payload = requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: airtableListBasesPath,
      query: buildListBasesQuery(input),
      fetcher: context.fetcher,
      mode: "execute",
    }),
    "airtable list bases response",
  );

  return {
    bases: readBaseArray(payload.bases),
    offset: optionalString(payload.offset) ?? null,
  };
}

async function getBaseCollaborators(input: AirtableActionInput, context: BearerProviderContext) {
  const payload = requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: `/v0/meta/bases/${encodeURIComponent(requireString(input.baseId, "baseId"))}`,
      query: buildBaseCollaboratorsQuery(input),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable get base collaborators response",
  );

  return {
    base: payload,
  };
}

async function getBaseSchema(input: AirtableActionInput, context: BearerProviderContext) {
  const payload = requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: `/v0/meta/bases/${encodeURIComponent(requireString(input.baseId, "baseId"))}/tables`,
      query: buildBaseSchemaQuery(input),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable get base schema response",
  );

  return {
    tables: Array.isArray(payload.tables) ? payload.tables : [],
  };
}

async function createBase(input: AirtableActionInput, context: BearerProviderContext) {
  return requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: "/v0/meta/bases",
      method: "POST",
      body: {
        name: requireString(input.name, "name"),
        workspaceId: requireString(input.workspaceId, "workspaceId"),
        tables: readTableConfigs(input.tables),
      },
      fetcher: context.fetcher,
      mode: "execute",
    }),
    "airtable create base response",
  );
}

async function deleteBase(input: AirtableActionInput, context: BearerProviderContext) {
  return requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: `/v0/meta/bases/${encodeURIComponent(requireString(input.baseId, "baseId"))}`,
      method: "DELETE",
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable delete base response",
  );
}

async function createTable(input: AirtableActionInput, context: BearerProviderContext) {
  return requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: `/v0/meta/bases/${encodeURIComponent(requireString(input.baseId, "baseId"))}/tables`,
      method: "POST",
      body: compactObject({
        name: requireString(input.name, "name"),
        description: optionalString(input.description),
        fields: readFieldConfigs(input.fields, "fields"),
      }),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable create table response",
  );
}

async function updateTable(input: AirtableActionInput, context: BearerProviderContext) {
  return requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: `/v0/meta/bases/${encodeURIComponent(requireString(input.baseId, "baseId"))}/tables/${encodeURIComponent(requireString(input.tableIdOrName, "tableIdOrName"))}`,
      method: "PATCH",
      body: compactObject({
        name: optionalString(input.name),
        description: optionalString(input.description),
        dateDependencySettings: optionalRecord(input.dateDependencySettings),
      }),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable update table response",
  );
}

async function createField(input: AirtableActionInput, context: BearerProviderContext) {
  return requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: `/v0/meta/bases/${encodeURIComponent(requireString(input.baseId, "baseId"))}/tables/${encodeURIComponent(requireString(input.tableId, "tableId"))}/fields`,
      method: "POST",
      body: readCreateFieldConfig(input, "field"),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable create field response",
  );
}

async function updateField(input: AirtableActionInput, context: BearerProviderContext) {
  return requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: `/v0/meta/bases/${encodeURIComponent(requireString(input.baseId, "baseId"))}/tables/${encodeURIComponent(requireString(input.tableId, "tableId"))}/fields/${encodeURIComponent(requireString(input.columnId, "columnId"))}`,
      method: "PATCH",
      body: compactObject({
        name: optionalString(input.name),
        description: optionalString(input.description),
        options: optionalRecord(input.options),
      }),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable update field response",
  );
}

async function listRecords(input: AirtableActionInput, context: BearerProviderContext) {
  const path = buildRecordCollectionPath(input);
  const query = buildRecordReadQuery(input);
  const usePostEndpoint = buildAirtableUrl(path, query).toString().length >= airtableGetUrlLengthSoftLimit;

  const payload = requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: usePostEndpoint ? `${path}/listRecords` : path,
      method: usePostEndpoint ? "POST" : undefined,
      query: usePostEndpoint ? undefined : query,
      body: usePostEndpoint ? buildListRecordsPostBody(input) : undefined,
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable list records response",
  );

  return {
    records: readRecordArray(payload.records),
    offset: optionalString(payload.offset) ?? null,
  };
}

async function getRecord(input: AirtableActionInput, context: BearerProviderContext) {
  const payload = requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: `${buildRecordCollectionPath(input)}/${encodeURIComponent(requireString(input.recordId, "recordId"))}`,
      query: buildRecordDetailQuery(input),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable get record response",
  );

  return {
    record: payload,
  };
}

async function createRecords(input: AirtableActionInput, context: BearerProviderContext) {
  const payload = requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: buildRecordCollectionPath(input),
      method: "POST",
      body: compactObject({
        records: readCreateRecords(input.records),
        typecast: optionalBoolean(input.typecast),
        returnFieldsByFieldId: optionalBoolean(input.returnFieldsByFieldId),
      }),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable create records response",
  );

  return {
    records: readRecordArray(payload.records),
  };
}

async function updateRecords(input: AirtableActionInput, context: BearerProviderContext) {
  const payload = requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: buildRecordCollectionPath(input),
      method: "PATCH",
      body: compactObject({
        records: readUpdateRecords(input.records),
        typecast: optionalBoolean(input.typecast),
        returnFieldsByFieldId: optionalBoolean(input.returnFieldsByFieldId),
      }),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable update records response",
  );

  return {
    records: readRecordArray(payload.records),
  };
}

async function deleteRecords(input: AirtableActionInput, context: BearerProviderContext) {
  const payload = requiredResponseRecord(
    await requestAirtableJson({
      auth: context,
      path: buildRecordCollectionPath(input),
      method: "DELETE",
      query: buildDeleteRecordsQuery(input),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    }),
    "airtable delete records response",
  );

  return {
    records: readDeletedRecordArray(payload.records),
  };
}

async function requestAirtableJson(input: AirtableRequestOptions): Promise<unknown> {
  const url = buildAirtableUrl(input.path, input.query);

  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: airtableHeaders(input.auth, input.body === undefined ? undefined : "application/json"),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
  } catch (error) {
    throw wrapAirtableTransportError(error, input.mode, "request");
  }

  let payload: unknown;
  try {
    payload = await readAirtablePayload(response);
  } catch (error) {
    throw wrapAirtableTransportError(error, input.mode, "response parsing");
  }

  if (!response.ok) {
    throw createAirtableError(response, payload, input.mode, input.notFoundAsInvalidInput === true);
  }

  return payload;
}

function buildAirtableUrl(path: string, query?: ReadonlyArray<readonly [string, string]>): URL {
  const url = new URL(path, airtableApiBaseUrl);
  for (const [key, value] of query ?? []) {
    url.searchParams.append(key, value);
  }
  return url;
}

function airtableHeaders(auth: AirtableAuth, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `${auth.tokenType ?? "Bearer"} ${auth.accessToken}`,
    "User-Agent": providerUserAgent,
  };
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  return headers;
}

async function readAirtablePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createAirtableError(
  response: Response,
  payload: unknown,
  mode: AirtableRequestMode,
  notFoundAsInvalidInput: boolean,
): ProviderRequestError {
  const message = readAirtableErrorMessage(payload) ?? `airtable request failed with ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message);
  }
  if (notFoundAsInvalidInput && response.status === 404) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(502, message, response.status);
}

function wrapAirtableTransportError(
  error: unknown,
  mode: AirtableRequestMode,
  phase: "request" | "response parsing",
): ProviderRequestError {
  if (error instanceof ProviderRequestError) {
    return error;
  }

  const detail = error instanceof Error && error.message ? error.message : `unknown ${phase} error`;
  return new ProviderRequestError(mode === "validate" ? 400 : 502, `airtable ${phase} failed: ${detail}`);
}

function readAirtableErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload) {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const error = optionalRecord(record.error);
  if (!error) {
    return undefined;
  }

  const message = optionalString(error.message);
  const type = optionalString(error.type);

  if (message && type) {
    return `${message} (${type})`;
  }
  return message ?? type ?? undefined;
}

function buildListBasesQuery(input: Record<string, unknown>): Array<readonly [string, string]> {
  const query: Array<readonly [string, string]> = [];
  const offset = optionalString(input.offset);
  if (offset) {
    query.push(["offset", offset]);
  }
  return query;
}

function buildBaseCollaboratorsQuery(input: Record<string, unknown>): Array<readonly [string, string]> {
  return buildRepeatedIncludeQuery(input);
}

function buildBaseSchemaQuery(input: Record<string, unknown>): Array<readonly [string, string]> {
  return buildRepeatedIncludeQuery(input);
}

function buildRepeatedIncludeQuery(input: Record<string, unknown>): Array<readonly [string, string]> {
  const query: Array<readonly [string, string]> = [];
  const include = Array.isArray(input.include) ? input.include : [];
  for (const item of include) {
    query.push(["include[]", requireString(item, "include item")]);
  }
  return query;
}

function buildRecordReadQuery(input: Record<string, unknown>): Array<readonly [string, string]> {
  const query = buildCommonRecordReadQuery(input);
  const offset = optionalString(input.offset);
  const pageSize = optionalInteger(input.pageSize);
  const maxRecords = optionalInteger(input.maxRecords);
  const view = optionalString(input.view);
  const filterByFormula = optionalString(input.filterByFormula);

  if (offset) {
    query.push(["offset", offset]);
  }
  if (pageSize !== undefined) {
    query.push(["pageSize", String(pageSize)]);
  }
  if (maxRecords !== undefined) {
    query.push(["maxRecords", String(maxRecords)]);
  }
  if (view) {
    query.push(["view", view]);
  }
  if (filterByFormula) {
    query.push(["filterByFormula", filterByFormula]);
  }

  const sort = Array.isArray(input.sort) ? input.sort : [];
  for (const [index, item] of sort.entries()) {
    const sortItem = requiredResponseRecord(item, `sort[${index}]`);
    const field = requireString(sortItem.field, `sort[${index}].field`);
    query.push([`sort[${index}][field]`, field]);

    const direction = optionalString(sortItem.direction);
    if (direction) {
      query.push([`sort[${index}][direction]`, direction]);
    }
  }

  const recordMetadata = Array.isArray(input.recordMetadata) ? input.recordMetadata : [];
  for (const item of recordMetadata) {
    query.push(["recordMetadata[]", requireString(item, "recordMetadata item")]);
  }

  return query;
}

function buildListRecordsPostBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    view: optionalString(input.view),
    fields: Array.isArray(input.fields) ? input.fields.map((field) => requireString(field, "fields item")) : undefined,
    sort: Array.isArray(input.sort)
      ? input.sort.map((item, index) => {
          const sortItem = requiredResponseRecord(item, `sort[${index}]`);
          return compactObject({
            field: requireString(sortItem.field, `sort[${index}].field`),
            direction: optionalString(sortItem.direction),
          });
        })
      : undefined,
    filterByFormula: optionalString(input.filterByFormula),
    maxRecords: optionalInteger(input.maxRecords),
    pageSize: optionalInteger(input.pageSize),
    offset: optionalString(input.offset),
    cellFormat: optionalString(input.cellFormat),
    timeZone: optionalString(input.timeZone),
    userLocale: optionalString(input.userLocale),
    returnFieldsByFieldId: optionalBoolean(input.returnFieldsByFieldId),
    includeDateDependencyMetadata: optionalBoolean(input.includeDateDependencyMetadata),
    recordMetadata: Array.isArray(input.recordMetadata)
      ? input.recordMetadata.map((item) => requireString(item, "recordMetadata item"))
      : undefined,
  });
}

function buildRecordDetailQuery(input: Record<string, unknown>): Array<readonly [string, string]> {
  return buildCommonRecordReadQuery(input);
}

function buildCommonRecordReadQuery(input: Record<string, unknown>): Array<readonly [string, string]> {
  const query: Array<readonly [string, string]> = [];
  const fields = Array.isArray(input.fields) ? input.fields : [];
  for (const field of fields) {
    query.push(["fields[]", requireString(field, "fields item")]);
  }

  const cellFormat = optionalString(input.cellFormat);
  const timeZone = optionalString(input.timeZone);
  const userLocale = optionalString(input.userLocale);
  const returnFieldsByFieldId = optionalBoolean(input.returnFieldsByFieldId);
  const includeDateDependencyMetadata = optionalBoolean(input.includeDateDependencyMetadata);

  if (cellFormat) {
    query.push(["cellFormat", cellFormat]);
  }
  if (timeZone) {
    query.push(["timeZone", timeZone]);
  }
  if (userLocale) {
    query.push(["userLocale", userLocale]);
  }
  if (returnFieldsByFieldId !== undefined) {
    query.push(["returnFieldsByFieldId", String(returnFieldsByFieldId)]);
  }
  if (includeDateDependencyMetadata !== undefined) {
    query.push(["includeDateDependencyMetadata", String(includeDateDependencyMetadata)]);
  }

  return query;
}

function buildDeleteRecordsQuery(input: Record<string, unknown>): Array<readonly [string, string]> {
  const recordIds = Array.isArray(input.recordIds) ? input.recordIds : [];
  if (recordIds.length === 0) {
    throw new ProviderRequestError(400, "recordIds is required");
  }

  return recordIds.map((recordId) => ["records[]", requireString(recordId, "recordIds item")]);
}

function buildRecordCollectionPath(input: Record<string, unknown>): string {
  const baseId = requireString(input.baseId, "baseId");
  const tableIdOrName = requireString(input.tableIdOrName, "tableIdOrName");
  return `/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(tableIdOrName)}`;
}

function readBaseArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? objectArray(value, "bases", providerResponseError) : [];
}

function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? objectArray(value, "records", providerResponseError) : [];
}

function readDeletedRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? objectArray(value, "records", providerResponseError) : [];
}

function readTableConfigs(value: unknown): Array<Record<string, unknown>> {
  const tables = Array.isArray(value) ? value : [];
  if (tables.length === 0) {
    throw new ProviderRequestError(400, "tables is required");
  }

  return tables.map((table, index) => {
    const tableObject = requiredResponseRecord(table, `tables[${index}]`);
    return compactObject({
      ...tableObject,
      name: requireString(tableObject.name, `tables[${index}].name`),
      description: optionalString(tableObject.description),
      fields: readFieldConfigs(tableObject.fields, `tables[${index}].fields`),
    });
  });
}

function readFieldConfigs(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  const fields = Array.isArray(value) ? value : [];
  if (fields.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }

  return fields.map((field, index) => readCreateFieldConfig(field, `${fieldName}[${index}]`));
}

function readCreateFieldConfig(value: unknown, fieldName: string): Record<string, unknown> {
  const field = { ...requiredResponseRecord(value, fieldName) };
  delete field.baseId;
  delete field.tableId;
  delete field.columnId;

  return compactObject({
    ...field,
    name: requireString(field.name, `${fieldName}.name`),
    type: requireString(field.type, `${fieldName}.type`),
    description: optionalString(field.description),
    options: optionalRecord(field.options),
  });
}

function readCreateRecords(value: unknown): Array<Record<string, unknown>> {
  const records = Array.isArray(value) ? value : [];
  if (records.length === 0) {
    throw new ProviderRequestError(400, "records is required");
  }

  return records.map((record, index) => {
    const recordObject = requiredResponseRecord(record, `records[${index}]`);
    return {
      fields: readRecordFields(recordObject.fields, `records[${index}].fields`),
    };
  });
}

function readUpdateRecords(value: unknown): Array<Record<string, unknown>> {
  const records = Array.isArray(value) ? value : [];
  if (records.length === 0) {
    throw new ProviderRequestError(400, "records is required");
  }

  return records.map((record, index) => {
    const recordObject = requiredResponseRecord(record, `records[${index}]`);
    return {
      id: requireString(recordObject.id, `records[${index}].id`),
      fields: readRecordFields(recordObject.fields, `records[${index}].fields`),
    };
  });
}

function readRecordFields(value: unknown, fieldName: string): Record<string, unknown> {
  const fields = optionalRecord(value);
  if (!fields) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return fields;
}

function requireString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}
