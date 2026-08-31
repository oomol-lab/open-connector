import type { FeishuJsonRequest } from "./client.ts";

import { compactObject, optionalBoolean } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuBaseActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

interface PaginationInput {
  readonly offset?: number;
  readonly limit?: number;
}

const defaultPageLimit = 100;

export function createFeishuBaseActionHandlers(
  request: FeishuJsonRequest,
): Readonly<Record<string, FeishuBaseActionHandler>> {
  return {
    get_base: async (input) => ({
      base: requireObject(
        await request({
          method: "GET",
          path: basePath(input.appToken),
        }),
        "Base",
      ),
    }),
    create_base: (input) => createBase(request, input),
    copy_base: async (input) => ({
      base: requireObject(
        await request({
          method: "POST",
          path: `${basePath(input.appToken)}/copy`,
          body: compactObject({
            name: input.name,
            folder_token: input.folderToken,
            without_content: input.withoutContent === true ? true : undefined,
            time_zone: input.timeZone,
          }),
        }),
        "copied Base",
      ),
      copied: true,
    }),
    query_base_data: async (input) => {
      const dsl = requireInputObject(input.dsl, "dsl");
      if (!Object.hasOwn(dsl, "dimensions") && !Object.hasOwn(dsl, "measures")) {
        throw new ProviderRequestError(400, "dsl must contain at least one of dimensions or measures");
      }
      return {
        result: requireObject(
          await request({
            method: "POST",
            path: `${basePath(input.appToken)}/data/query`,
            body: dsl,
          }),
          "Base data-query result",
        ),
      };
    },
    list_base_tables: (input) =>
      listResources(request, input, `${basePath(input.appToken)}/tables`, ["tables", "items"]),
    get_base_table: (input) => getTable(request, input),
    create_base_table: async (input) => ({
      table: requireObject(
        await request({
          method: "POST",
          path: `${basePath(input.appToken)}/tables`,
          body: compactObject({
            name: input.name,
            fields: input.fields,
          }),
        }),
        "created Base table",
      ),
      created: true,
    }),
    update_base_table: async (input) => ({
      table: requireObject(
        await request({
          method: "PATCH",
          path: `${basePath(input.appToken)}/tables/${segment(input.tableId)}`,
          body: { name: input.name },
        }),
        "updated Base table",
      ),
      updated: true,
    }),
    delete_base_table: async (input) => {
      await request({
        method: "DELETE",
        path: `${basePath(input.appToken)}/tables/${segment(input.tableId)}`,
      });
      return { deleted: true, tableId: requireString(input.tableId, "tableId") };
    },
    list_base_fields: (input) =>
      listResources(request, input, `${tablePath(input.appToken, input.tableId)}/fields`, ["fields", "items"]),
    get_base_field: async (input) => ({
      field: requireObject(
        await request({
          method: "GET",
          path: `${tablePath(input.appToken, input.tableId)}/fields/${segment(input.fieldId)}`,
        }),
        "Base field",
      ),
    }),
    search_base_field_options: async (input) => {
      const { offset, limit } = pagination(input, 30);
      const fieldId = requireString(input.fieldId, "fieldId");
      const keyword = optionalString(input.keyword) ?? "";
      const data = requireObject(
        await request({
          method: "GET",
          path: `${tablePath(input.appToken, input.tableId)}/fields/${segment(fieldId)}/options`,
          query: {
            offset,
            limit,
            query: keyword || undefined,
          },
        }),
        "Base field option search",
      );
      const page = normalizePage(data, ["options", "items"], offset, limit);
      return {
        fieldId,
        keyword,
        options: page.items,
        offset: page.offset,
        limit: page.limit,
        total: page.total,
        hasMore: page.hasMore,
      };
    },
    create_base_field: async (input) => ({
      field: requireObject(
        await request({
          method: "POST",
          path: `${tablePath(input.appToken, input.tableId)}/fields`,
          body: requireObject(input.field, "field"),
        }),
        "created Base field",
      ),
      created: true,
    }),
    update_base_field: async (input) => ({
      field: requireObject(
        await request({
          method: "PUT",
          path: `${tablePath(input.appToken, input.tableId)}/fields/${segment(input.fieldId)}`,
          body: requireObject(input.field, "field"),
        }),
        "updated Base field",
      ),
      updated: true,
    }),
    delete_base_field: async (input) => {
      await request({
        method: "DELETE",
        path: `${tablePath(input.appToken, input.tableId)}/fields/${segment(input.fieldId)}`,
      });
      return { deleted: true, fieldId: requireString(input.fieldId, "fieldId") };
    },
    list_base_views: (input) =>
      listResources(request, input, `${tablePath(input.appToken, input.tableId)}/views`, ["views", "items"]),
    get_base_view: async (input) => ({
      view: requireObject(
        await request({
          method: "GET",
          path: `${tablePath(input.appToken, input.tableId)}/views/${segment(input.viewId)}`,
        }),
        "Base view",
      ),
    }),
    create_base_views: async (input) => {
      const views: Record<string, unknown>[] = [];
      for (const [index, view] of requireArray(input.views, "views").entries()) {
        views.push(
          requireObject(
            await request({
              method: "POST",
              path: `${tablePath(input.appToken, input.tableId)}/views`,
              body: requireInputObject(view, `views[${index}]`),
            }),
            `created Base view ${index + 1}`,
          ),
        );
      }
      return { views };
    },
    delete_base_view: async (input) => {
      const viewId = requireString(input.viewId, "viewId");
      await request({
        method: "DELETE",
        path: `${tablePath(input.appToken, input.tableId)}/views/${segment(viewId)}`,
      });
      return { deleted: true, viewId };
    },
    list_base_records: (input) => listRecords(request, input),
    search_base_records: (input) => searchRecords(request, input),
    get_base_record: (input) => getRecord(request, input),
    create_base_record: async (input) => ({
      record: requireObject(await writeRecord(request, "POST", input, undefined), "created Base record"),
      created: true,
    }),
    update_base_record: async (input) => ({
      record: requireObject(await writeRecord(request, "PATCH", input, input.recordId), "updated Base record"),
      updated: true,
    }),
    upsert_base_record: async (input) => {
      const recordId = optionalString(input.recordId);
      const method = recordId ? "PATCH" : "POST";
      return {
        record: requireObject(
          await writeRecord(request, method, input, recordId),
          `${recordId ? "updated" : "created"} Base record`,
        ),
        operation: recordId ? "updated" : "created",
      };
    },
    delete_base_record: async (input) => {
      const recordId = requireString(input.recordId, "recordId");
      await deleteRecords(request, input, [recordId]);
      return { deleted: true, recordId };
    },
    batch_create_base_records: async (input) => {
      const records = requireArray(input.records, "records");
      const data = requireObject(
        await request({
          method: "POST",
          path: `${tablePath(input.appToken, input.tableId)}/records/batch_create`,
          query: userIdTypeQuery(input),
          body: { create_records: records },
        }),
        "batch create result",
      );
      return { records: extractItems(data, ["records", "items"]) };
    },
    batch_update_base_records: async (input) => {
      const recordUpdates = requireObject(input.records, "records");
      const recordCount = Object.keys(recordUpdates).length;
      if (recordCount < 1 || recordCount > 200) {
        throw new ProviderRequestError(400, "records must contain between 1 and 200 record updates");
      }
      const data = requireObject(
        await request({
          method: "POST",
          path: `${tablePath(input.appToken, input.tableId)}/records/batch_update`,
          query: userIdTypeQuery(input),
          body: { update_records: recordUpdates },
        }),
        "batch update result",
      );
      const result: Record<string, unknown> = {};
      const updatedRecords = extractItems(data, ["records", "items"]);
      if (updatedRecords.length > 0) {
        result.records = updatedRecords;
      }
      const ignoredFields = firstArray(data, ["ignored_fields"]);
      if (ignoredFields) {
        result.ignoredFields = ignoredFields.filter((field): field is string => typeof field === "string");
      }
      return result;
    },
    batch_delete_base_records: async (input) => {
      const recordIds = requireStringArray(input.recordIds, "recordIds");
      await deleteRecords(request, input, recordIds);
      return { deleted: true, recordIds };
    },
  };
}

async function createBase(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const base = requireObject(
    await request({
      method: "POST",
      path: "/base/v3/bases",
      body: compactObject({
        name: input.name,
        folder_token: input.folderToken,
        time_zone: input.timeZone,
      }),
    }),
    "created Base",
  );
  const result: Record<string, unknown> = { base, created: true };
  const initialTable = optionalObject(input.initialTable);
  if (!initialTable) {
    return result;
  }

  const appToken = optionalString(base.base_token) ?? optionalString(base.app_token) ?? optionalString(base.token);
  if (!appToken) {
    throw invalidResponse("created Base is missing base_token or app_token");
  }
  const defaultTableId = findTableId(base) ?? (await findFirstTableId(request, appToken));
  if (!defaultTableId) {
    throw invalidResponse("created Base is missing its default table");
  }
  const table = requireObject(
    await request({
      method: "POST",
      path: `${basePath(appToken)}/tables`,
      body: {
        name: requireString(initialTable.name, "initialTable.name"),
        fields: requireArray(initialTable.fields, "initialTable.fields"),
      },
    }),
    "created Base table",
  );
  await request({
    method: "DELETE",
    path: `${basePath(appToken)}/tables/${segment(defaultTableId)}`,
  });
  result.table = table;
  result.deletedDefaultTableId = defaultTableId;
  return result;
}

async function findFirstTableId(request: FeishuJsonRequest, appToken: string): Promise<string | undefined> {
  const data = requireObject(
    await request({
      method: "GET",
      path: `${basePath(appToken)}/tables`,
      query: { offset: 0, limit: 100 },
    }),
    "Base table list",
  );
  const first = extractItems(data, ["tables", "items"])[0];
  return optionalObject(first) ? findTableId(first as Record<string, unknown>) : undefined;
}

async function getTable(request: FeishuJsonRequest, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const path = tablePath(input.appToken, input.tableId);
  const [table, fields, views] = await Promise.all([
    request({ method: "GET", path }),
    listEveryResource(request, `${path}/fields`, ["fields", "items"]),
    listEveryResource(request, `${path}/views`, ["views", "items"]),
  ]);
  return {
    table: requireObject(table, "Base table"),
    fields,
    views,
  };
}

async function listEveryResource(request: FeishuJsonRequest, path: string, itemKeys: readonly string[]) {
  const items: unknown[] = [];
  let offset = 0;
  while (true) {
    const data = requireObject(
      await request({
        method: "GET",
        path,
        query: { offset, limit: defaultPageLimit },
      }),
      "Base list result",
    );
    const batch = extractItems(data, itemKeys);
    items.push(...batch);
    const total = optionalNumber(data.total);
    const reportedHasMore = optionalBoolean(data.has_more) ?? optionalBoolean(data.hasMore);
    const complete =
      reportedHasMore === false ||
      (total !== undefined && items.length >= total) ||
      (reportedHasMore === undefined && total === undefined && batch.length < defaultPageLimit);
    if (batch.length === 0 || complete) {
      return items;
    }
    offset += batch.length;
  }
}

function findTableId(value: Record<string, unknown>): string | undefined {
  for (const key of ["table_id", "default_table_id", "id"]) {
    const id = optionalString(value[key]);
    if (id) {
      return id;
    }
  }
  for (const key of ["table", "default_table"]) {
    const nested = optionalObject(value[key]);
    if (nested) {
      const id = findTableId(nested);
      if (id) {
        return id;
      }
    }
  }
  for (const key of ["tables", "default_tables"]) {
    const items = Array.isArray(value[key]) ? value[key] : [];
    const first = optionalObject(items[0]);
    if (first) {
      const id = findTableId(first);
      if (id) {
        return id;
      }
    }
  }
  return undefined;
}

async function listResources(
  request: FeishuJsonRequest,
  input: Record<string, unknown>,
  path: string,
  itemKeys: readonly string[],
) {
  const { offset, limit } = pagination(input);
  const data = requireObject(await request({ method: "GET", path, query: { offset, limit } }), "Base list result");
  return normalizePage(data, itemKeys, offset, limit);
}

async function listRecords(request: FeishuJsonRequest, input: Record<string, unknown>) {
  const { offset, limit } = pagination(input);
  const query: Record<string, string | readonly string[] | number | boolean | undefined> = {
    offset,
    limit,
    field_id: optionalStringArray(input.fieldIds),
    view_id: optionalString(input.viewId),
    filter: serializeJson(input.filter),
    sort: serializeJson(input.sort),
    user_id_type: optionalString(input.userIdType),
  };
  const data = requireObject(
    await request({
      method: "GET",
      path: `${tablePath(input.appToken, input.tableId)}/records`,
      query,
    }),
    "Base record list",
  );
  return normalizeRecordPage(data, offset, limit);
}

async function searchRecords(request: FeishuJsonRequest, input: Record<string, unknown>) {
  const { offset, limit } = pagination(input, 10);
  const body = compactObject({
    keyword: input.keyword,
    search_fields: input.searchFields,
    select_fields: input.selectFields,
    view_id: input.viewId,
    filter: input.filter,
    sort: input.sort,
    offset,
    limit,
  });
  const data = requireObject(
    await request({
      method: "POST",
      path: `${tablePath(input.appToken, input.tableId)}/records/search`,
      query: userIdTypeQuery(input),
      body,
    }),
    "Base record search",
  );
  return normalizeRecordPage(data, offset, limit);
}

async function getRecord(request: FeishuJsonRequest, input: Record<string, unknown>) {
  const recordId = requireString(input.recordId, "recordId");
  const body = compactObject({
    record_id_list: [recordId],
    select_fields: input.selectFields,
  });
  const data = requireObject(
    await request({
      method: "POST",
      path: `${tablePath(input.appToken, input.tableId)}/records/batch_get`,
      query: userIdTypeQuery(input),
      body,
    }),
    "Base record batch get",
  );
  if (optionalStringArray(data.record_not_found)?.includes(recordId)) {
    throw new ProviderRequestError(404, `Base record ${recordId} was not found`);
  }
  const record = findRecord(extractRecords(data), recordId);
  if (!record) {
    throw invalidResponse(`Base record ${recordId} was not returned`);
  }
  return { record };
}

function findRecord(records: readonly unknown[], recordId: string) {
  for (const entry of records) {
    const record = optionalObject(entry);
    if (record && record.record_id === recordId) {
      return record;
    }
  }
  return undefined;
}

async function writeRecord(
  request: FeishuJsonRequest,
  method: "POST" | "PATCH",
  input: Record<string, unknown>,
  recordId: unknown,
) {
  const suffix = optionalString(recordId) ? `/${segment(recordId)}` : "";
  return request({
    method,
    path: `${tablePath(input.appToken, input.tableId)}/records${suffix}`,
    query: userIdTypeQuery(input),
    body: requireObject(input.fields, "fields"),
  });
}

async function deleteRecords(request: FeishuJsonRequest, input: Record<string, unknown>, recordIds: readonly string[]) {
  await request({
    method: "POST",
    path: `${tablePath(input.appToken, input.tableId)}/records/batch_delete`,
    body: { record_id_list: recordIds },
  });
}

function normalizePage(data: Record<string, unknown>, itemKeys: readonly string[], offset: number, limit: number) {
  return pageFromItems(data, extractItems(data, itemKeys), offset, limit);
}

function normalizeRecordPage(data: Record<string, unknown>, offset: number, limit: number) {
  return pageFromItems(data, extractRecords(data), offset, limit);
}

function pageFromItems(data: Record<string, unknown>, items: unknown[], offset: number, limit: number) {
  const reportedTotal = optionalNumber(data.total);
  const total = reportedTotal ?? offset + items.length;
  const hasMore =
    optionalBoolean(data.has_more) ??
    optionalBoolean(data.hasMore) ??
    (reportedTotal !== undefined ? offset + items.length < reportedTotal : items.length === limit);
  return { items, offset, limit, total, hasMore };
}

function extractRecords(data: Record<string, unknown>): unknown[] {
  const items = firstArray(data, ["records", "items"]);
  if (items) {
    return items;
  }

  const matrixKeys = ["record_id_list", "fields", "data"];
  if (!matrixKeys.some((key) => Object.hasOwn(data, key))) {
    return [];
  }

  const recordIds = requireResponseStringArray(data.record_id_list, "record_id_list");
  const fields = requireResponseStringArray(data.fields, "fields");
  const rows = data.data;
  if (!Array.isArray(rows)) {
    throw invalidResponse("data must be an array of record rows");
  }
  if (recordIds.length !== rows.length) {
    throw invalidResponse(`record_id_list and data lengths differ (${recordIds.length} and ${rows.length})`);
  }

  return rows.map((value, rowIndex) => {
    if (!Array.isArray(value)) {
      throw invalidResponse(`data row ${rowIndex + 1} must be an array`);
    }
    if (value.length !== fields.length) {
      throw invalidResponse(`data row ${rowIndex + 1} has ${value.length} cells but fields has ${fields.length}`);
    }
    return {
      record_id: recordIds[rowIndex],
      fields: Object.fromEntries(fields.map((field, fieldIndex) => [field, value[fieldIndex]])),
    };
  });
}

function extractItems(data: Record<string, unknown>, keys: readonly string[]) {
  return firstArray(data, keys) ?? [];
}

function firstArray(data: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return undefined;
}

function pagination(input: PaginationInput, fallbackLimit = defaultPageLimit) {
  return {
    offset: typeof input.offset === "number" ? input.offset : 0,
    limit: typeof input.limit === "number" ? input.limit : fallbackLimit,
  };
}

function userIdTypeQuery(input: Record<string, unknown>) {
  const userIdType = optionalString(input.userIdType);
  return userIdType ? { user_id_type: userIdType } : undefined;
}

function basePath(appToken: unknown) {
  return `/base/v3/bases/${segment(appToken)}`;
}

function tablePath(appToken: unknown, tableId: unknown) {
  return `${basePath(appToken)}/tables/${segment(tableId)}`;
}

function segment(value: unknown) {
  return encodeURIComponent(requireString(value, "path identifier"));
}

function serializeJson(value: unknown) {
  return value === undefined ? undefined : JSON.stringify(value);
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requireStringArray(value: unknown, fieldName: string) {
  const items = requireArray(value, fieldName);
  if (items.every((item) => typeof item === "string" && item.length > 0)) {
    return items as string[];
  }
  throw new ProviderRequestError(400, `${fieldName} must contain non-empty strings`);
}

function requireResponseStringArray(value: unknown, fieldName: string): string[] {
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)) {
    return value;
  }
  throw invalidResponse(`${fieldName} must contain non-empty strings`);
}

function optionalStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : undefined;
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be an array`);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalObject(value);
  if (object) {
    return object;
  }
  throw invalidResponse(`${label} response must be an object`);
}

function requireInputObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalObject(value);
  if (object) {
    return object;
  }
  throw new ProviderRequestError(400, `${fieldName} must be an object`);
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function invalidResponse(message: string) {
  return new ProviderRequestError(502, `Invalid Feishu Base response: ${message}`);
}
