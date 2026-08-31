import type { FeishuJsonRequest } from "./client.ts";
import type { FeishuIdentity } from "./client.ts";

import { optionalBoolean, optionalRecord, optionalString } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuContactActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export function createFeishuContactActionHandlers(input: {
  readonly identity: FeishuIdentity;
  readonly request: FeishuJsonRequest;
}): Readonly<Record<string, FeishuContactActionHandler>> {
  const handlers: Record<string, FeishuContactActionHandler> = {
    get_user: (actionInput) => getUser(actionInput, input.identity, input.request),
    list_departments: (actionInput) => listDepartments(actionInput, input.request),
    list_department_users: (actionInput) => listDepartmentUsers(actionInput, input.request),
  };
  if (input.identity === "user") {
    handlers.search_users = (actionInput) => searchUsers(actionInput, input.request);
  }
  return handlers;
}

async function getUser(input: Record<string, unknown>, identity: FeishuIdentity, request: FeishuJsonRequest) {
  const userId = optionalString(input.userId);
  const userIdType = optionalString(input.userIdType) ?? "open_id";
  if (!userId) {
    if (identity === "tenant") {
      throw new ProviderRequestError(400, "userId is required when get_user uses tenant identity");
    }
    const data = await request({ path: "/authen/v1/user_info" });
    return { user: data };
  }

  if (identity === "tenant") {
    const data = await request({
      path: `/contact/v3/users/${encodeURIComponent(userId)}`,
      query: { user_id_type: userIdType },
    });
    return { user: optionalRecord(data.user) ?? data };
  } else {
    const data = await request({
      method: "POST",
      path: "/contact/v3/users/basic_batch",
      query: { user_id_type: userIdType },
      body: { user_ids: [userId] },
    });
    const users = Array.isArray(data.users) ? data.users : [];
    return { user: optionalRecord(users[0]) ?? {} };
  }
}

async function searchUsers(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const filter = {
    user_ids: stringArray(input.userIds),
    is_resigned: optionalTrue(input.leftOrganization),
    has_contact: optionalTrue(input.hasChatted),
    exclude_outer_contact: optionalTrue(input.excludeExternalUsers),
    has_enterprise_email: optionalTrue(input.hasEnterpriseEmail),
  };
  const data = await request({
    method: "POST",
    path: "/contact/v3/users/search",
    query: { page_size: optionalNumber(input.pageSize) },
    body: {
      query: optionalString(input.query),
      filter,
    },
  });
  return normalizePage(data);
}

async function listDepartments(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const departmentId = optionalString(input.departmentId) ?? "0";
  const data = await request({
    path: `/contact/v3/departments/${encodeURIComponent(departmentId)}/children`,
    query: {
      department_id_type: optionalString(input.departmentIdType) ?? "open_department_id",
      user_id_type: optionalString(input.userIdType) ?? "open_id",
      fetch_child: optionalBoolean(input.fetchChild),
      page_size: optionalNumber(input.pageSize),
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function listDepartmentUsers(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/contact/v3/users/find_by_department",
    query: {
      department_id: optionalString(input.departmentId),
      department_id_type: optionalString(input.departmentIdType) ?? "open_department_id",
      user_id_type: optionalString(input.userIdType) ?? "open_id",
      page_size: optionalNumber(input.pageSize),
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

function normalizePage(data: Record<string, unknown>) {
  return {
    items: Array.isArray(data.items) ? data.items.filter((item) => optionalRecord(item) != null) : [],
    pageToken: optionalString(data.page_token) ?? null,
    hasMore: data.has_more === true,
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function optionalTrue(value: unknown) {
  return value === true ? true : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
