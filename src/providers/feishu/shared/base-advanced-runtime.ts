import type { FeishuJsonRequest, FeishuQueryValue } from "./client.ts";

import { compactObject } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuBaseAdvancedActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createFeishuBaseAdvancedActionHandlers(
  request: FeishuJsonRequest,
): Readonly<Record<string, FeishuBaseAdvancedActionHandler>> {
  const get = (input: Record<string, unknown>, path: string, query?: Record<string, unknown>) =>
    result(request({ path, query: compactQuery(query) }));
  const write = (
    input: Record<string, unknown>,
    method: "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body: Record<string, unknown> = {},
    query?: Record<string, unknown>,
  ) =>
    writeResult(
      request({
        method,
        path,
        query: compactQuery(query),
        body: compactObject(body),
      }),
    );
  const remove = async (path: string, id: unknown, body?: Record<string, unknown>) => {
    await request({ method: "DELETE", path, body });
    return { deleted: true, id: requireString(id, "id") };
  };

  return {
    list_base_blocks: async (input) => {
      const data = await request({
        method: "POST",
        path: basePath(input, "blocks", "list"),
        body: compactObject({ parent_id: input.parentId }),
      });
      let items = objectItems(data.blocks);
      if (typeof input.type === "string") {
        items = items.filter((item) => item.type === input.type);
        data.total = items.length;
      }
      return normalizedList(data, items);
    },
    create_base_block: (input) =>
      write(input, "POST", basePath(input, "blocks"), {
        type: input.type,
        name: input.name,
        parent_id: input.parentId,
      }),
    move_base_block: async (input) => {
      if (input.beforeId !== undefined && input.afterId !== undefined) {
        throw new ProviderRequestError(400, "beforeId and afterId are mutually exclusive");
      }
      return await write(input, "POST", basePath(input, "blocks", input.blockId, "move"), {
        parent_id: input.parentId === undefined ? null : input.parentId,
        before_id: input.beforeId,
        after_id: input.afterId,
      });
    },
    rename_base_block: (input) =>
      write(input, "POST", basePath(input, "blocks", input.blockId, "rename"), {
        name: input.name,
      }),
    delete_base_block: (input) => remove(basePath(input, "blocks", input.blockId), input.blockId),
    list_base_record_history: async (input) => {
      const data = await request({
        path: basePath(input, "record_history"),
        query: compactQuery({
          table_id: input.tableId,
          record_id: input.recordId,
          max_version: input.maxVersion,
          page_size: input.pageSize ?? 30,
        }),
      });
      return normalizedList(data, firstObjectItems(data, ["items", "records", "history"]));
    },
    create_base_record_share_links: async (input) => ({
      result: await request({
        method: "POST",
        path: tablePath(input, "records", "share_links", "batch"),
        body: { record_ids: uniqueStrings(input.recordIds, "recordIds") },
      }),
    }),
    get_base_view_filter: (input) => get(input, viewPath(input, "filter")),
    set_base_view_filter: (input) =>
      write(input, "PUT", viewPath(input, "filter"), requireObject(input.config, "config")),
    get_base_view_visible_fields: (input) => get(input, viewPath(input, "visible_fields")),
    set_base_view_visible_fields: (input) =>
      write(input, "PUT", viewPath(input, "visible_fields"), requireObject(input.config, "config")),
    get_base_view_group: (input) => get(input, viewPath(input, "group")),
    set_base_view_group: (input) =>
      write(input, "PUT", viewPath(input, "group"), requireObject(input.config, "config")),
    get_base_view_sort: (input) => get(input, viewPath(input, "sort")),
    set_base_view_sort: (input) => write(input, "PUT", viewPath(input, "sort"), requireObject(input.config, "config")),
    get_base_view_timebar: (input) => get(input, viewPath(input, "timebar")),
    set_base_view_timebar: (input) =>
      write(input, "PUT", viewPath(input, "timebar"), requireObject(input.config, "config")),
    get_base_view_card: (input) => get(input, viewPath(input, "card")),
    set_base_view_card: (input) => write(input, "PUT", viewPath(input, "card"), requireObject(input.config, "config")),
    rename_base_view: (input) => write(input, "PATCH", viewPath(input), { name: input.name }),
    list_base_roles: async (input) => {
      const data = rolePayload(await request({ path: basePath(input, "roles") }));
      const items = Array.isArray(data)
        ? objectItems(data)
        : firstObjectItems(requireObject(data, "role list"), ["roles", "items"]);
      return normalizedList({}, items);
    },
    get_base_role: async (input) => ({
      result: objectRolePayload(await request({ path: basePath(input, "roles", input.roleId) })),
    }),
    create_base_role: async (input) => ({
      result: objectRolePayload(
        await request({
          method: "POST",
          path: basePath(input, "roles"),
          body: requireObject(input.role, "role"),
        }),
      ),
      success: true,
    }),
    update_base_role: async (input) => ({
      result: objectRolePayload(
        await request({
          method: "PUT",
          path: basePath(input, "roles", input.roleId),
          body: requireObject(input.changes, "changes"),
        }),
      ),
      success: true,
    }),
    delete_base_role: async (input) => {
      rolePayload(
        await request({
          method: "DELETE",
          path: basePath(input, "roles", input.roleId),
          body: {},
        }),
      );
      return { deleted: true, id: requireString(input.roleId, "roleId") };
    },
    enable_base_advanced_permissions: (input) => changeAdvancedPermissions(request, input, true),
    disable_base_advanced_permissions: (input) => changeAdvancedPermissions(request, input, false),
    list_base_workflows: (input) => listAllWorkflows(request, input),
    get_base_workflow: (input) =>
      get(input, basePath(input, "workflows", input.workflowId), {
        user_id_type: input.userIdType,
      }),
    create_base_workflow: (input) =>
      write(input, "POST", basePath(input, "workflows"), requireObject(input.workflow, "workflow")),
    update_base_workflow: (input) =>
      write(input, "PUT", basePath(input, "workflows", input.workflowId), requireObject(input.workflow, "workflow")),
    enable_base_workflow: (input) => write(input, "PATCH", basePath(input, "workflows", input.workflowId, "enable")),
    disable_base_workflow: (input) => write(input, "PATCH", basePath(input, "workflows", input.workflowId, "disable")),
    list_base_forms: async (input) => {
      const data = await request({
        path: tablePath(input, "forms"),
        query: compactQuery({
          page_size: input.pageSize ?? 100,
          page_token: input.pageToken,
        }),
      });
      return normalizedList(data, firstObjectItems(data, ["forms", "items"]));
    },
    get_base_form: (input) => get(input, formPath(input)),
    get_base_form_detail: async (input) => ({
      result: await request({
        method: "POST",
        path: "/base/v3/bases/tables/forms/detail",
        body: { share_token: input.shareToken },
      }),
    }),
    create_base_form: (input) =>
      write(input, "POST", tablePath(input, "forms"), {
        name: input.name,
        description: input.description,
      }),
    update_base_form: (input) =>
      write(input, "PATCH", formPath(input), {
        name: input.name,
        description: input.description,
      }),
    delete_base_form: (input) => remove(formPath(input), input.formId),
    list_base_form_questions: async (input) => {
      const data = await request({ path: formPath(input, "questions") });
      return normalizedList(data, firstObjectItems(data, ["questions", "items"]));
    },
    create_base_form_questions: (input) =>
      write(input, "POST", formPath(input, "questions"), {
        questions: input.questions,
      }),
    update_base_form_questions: (input) =>
      write(input, "PATCH", formPath(input, "questions"), {
        questions: input.questions,
      }),
    delete_base_form_questions: (input) =>
      write(input, "DELETE", formPath(input, "questions"), {
        question_ids: input.questionIds,
      }),
    submit_base_form: (input) =>
      write(input, "POST", "/base/v3/bases/tables/forms/submit", {
        share_token: input.shareToken,
        content: input.content,
      }),
    list_base_dashboards: async (input) => {
      const data = await request({
        path: basePath(input, "dashboards"),
        query: pageQuery(input, 100),
      });
      return normalizedList(data, firstObjectItems(data, ["dashboards", "items"]));
    },
    get_base_dashboard: (input) => get(input, dashboardPath(input)),
    create_base_dashboard: (input) =>
      write(input, "POST", basePath(input, "dashboards"), {
        name: input.name,
        theme: typeof input.themeStyle === "string" ? { theme_style: input.themeStyle } : undefined,
      }),
    update_base_dashboard: (input) =>
      write(input, "PATCH", dashboardPath(input), {
        name: input.name,
        theme: typeof input.themeStyle === "string" ? { theme_style: input.themeStyle } : undefined,
      }),
    delete_base_dashboard: (input) => remove(dashboardPath(input), input.dashboardId),
    arrange_base_dashboard: (input) =>
      write(
        input,
        "POST",
        dashboardPath(input, "arrange"),
        {},
        {
          user_id_type: input.userIdType,
        },
      ),
    list_base_dashboard_blocks: async (input) => {
      const data = await request({
        path: dashboardPath(input, "blocks"),
        query: pageQuery(input, 20),
      });
      return normalizedList(data, firstObjectItems(data, ["blocks", "items"]));
    },
    get_base_dashboard_block: (input) =>
      get(input, dashboardPath(input, "blocks", input.blockId), {
        user_id_type: input.userIdType,
      }),
    get_base_dashboard_block_data: (input) =>
      get(input, basePath(input, "dashboards", "blocks", input.blockId, "data")),
    create_base_dashboard_block: (input) =>
      write(
        input,
        "POST",
        dashboardPath(input, "blocks"),
        {
          name: input.name,
          type: input.type,
          data_config: input.dataConfig,
        },
        { user_id_type: input.userIdType },
      ),
    update_base_dashboard_block: (input) =>
      write(
        input,
        "PATCH",
        dashboardPath(input, "blocks", input.blockId),
        {
          name: input.name,
          data_config: input.dataConfig,
        },
        { user_id_type: input.userIdType },
      ),
    delete_base_dashboard_block: (input) => remove(dashboardPath(input, "blocks", input.blockId), input.blockId),
  };
}

async function result(value: Promise<Record<string, unknown>>) {
  return { result: await value };
}

async function writeResult(value: Promise<Record<string, unknown>>) {
  return { result: await value, success: true };
}

async function listAllWorkflows(request: FeishuJsonRequest, input: Record<string, unknown>) {
  const items: Record<string, unknown>[] = [];
  let pageToken = "";
  for (;;) {
    const data = await request({
      method: "POST",
      path: basePath(input, "workflows", "list"),
      body: compactObject({
        status: input.status,
        page_size: input.pageSize ?? 100,
        page_token: pageToken || undefined,
      }),
    });
    items.push(...firstObjectItems(data, ["items", "workflows"]));
    const nextToken = optionalString(data.page_token) ?? "";
    if (data.has_more !== true || nextToken.length === 0) {
      return {
        items,
        total: items.length,
        pageToken: "",
        hasMore: false,
      };
    }
    pageToken = nextToken;
  }
}

async function changeAdvancedPermissions(request: FeishuJsonRequest, input: Record<string, unknown>, enabled: boolean) {
  const data = await request({
    method: "PUT",
    path: basePath(input, "advperm", "enable"),
    query: { enable: enabled },
    body: {},
  });
  const payload = rolePayload(data);
  return {
    result: optionalObject(payload) ?? {},
    success: true,
  };
}

function rolePayload(data: Record<string, unknown>): unknown {
  if (typeof data.code === "number") {
    if (data.code !== 0) {
      throw new ProviderRequestError(502, optionalString(data.message) ?? "Feishu Base role operation failed");
    }
    return data.data ?? {};
  }
  return data;
}

function objectRolePayload(data: Record<string, unknown>) {
  return requireObject(rolePayload(data), "role result");
}

function normalizedList(data: Record<string, unknown>, items: readonly Record<string, unknown>[]) {
  return {
    items,
    total: nonNegativeInteger(data.total) ?? nonNegativeInteger(data.count) ?? items.length,
    pageToken: optionalString(data.page_token) ?? "",
    hasMore: data.has_more === true,
  };
}

function firstObjectItems(data: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    if (Array.isArray(data[key])) {
      return objectItems(data[key]);
    }
  }
  return [];
}

function objectItems(value: unknown) {
  return Array.isArray(value)
    ? value.map(optionalObject).filter((item): item is Record<string, unknown> => item !== undefined)
    : [];
}

function basePath(input: Record<string, unknown>, ...parts: unknown[]) {
  return path("base", "v3", "bases", requireString(input.baseToken, "baseToken"), ...parts);
}

function tablePath(input: Record<string, unknown>, ...parts: unknown[]) {
  return basePath(input, "tables", requireString(input.tableId, "tableId"), ...parts);
}

function viewPath(input: Record<string, unknown>, ...parts: unknown[]) {
  return tablePath(input, "views", requireString(input.viewId, "viewId"), ...parts);
}

function formPath(input: Record<string, unknown>, ...parts: unknown[]) {
  return tablePath(input, "forms", requireString(input.formId, "formId"), ...parts);
}

function dashboardPath(input: Record<string, unknown>, ...parts: unknown[]) {
  return basePath(input, "dashboards", requireString(input.dashboardId, "dashboardId"), ...parts);
}

function path(...parts: unknown[]) {
  return `/${parts.map((part) => encodeURIComponent(requireString(part, "path segment"))).join("/")}`;
}

function pageQuery(input: Record<string, unknown>, defaultSize: number) {
  return compactQuery({
    page_size: input.pageSize ?? defaultSize,
    page_token: input.pageToken,
  });
}

function uniqueStrings(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  const items = value.map((item) => requireString(item, fieldName));
  return [...new Set(items)];
}

function compactQuery(value: Record<string, unknown> | undefined) {
  if (!value) {
    return undefined;
  }
  const result: Record<string, FeishuQueryValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      result[key] = item;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function requireObject(value: unknown, fieldName: string) {
  const object = optionalObject(value);
  if (!object) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return object;
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function nonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}
