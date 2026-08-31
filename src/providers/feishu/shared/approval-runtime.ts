import type { FeishuJsonRequest, FeishuQueryValue } from "./client.ts";

import { compactObject, optionalRawString } from "../../../core/cast.ts";
import { ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuApprovalActionHandler {
  (input: Record<string, unknown>): Promise<Record<string, unknown>>;
}

const taskTopics: Readonly<Record<string, string>> = {
  pending: "1",
  completed: "2",
  initiated: "3",
  cc_unread: "17",
  cc_read: "18",
};
const addSignTypes: Readonly<Record<string, number>> = {
  before: 1,
  after: 2,
  parallel: 3,
};
const approvalMethods: Readonly<Record<string, number>> = {
  any: 1,
  all: 2,
  sequential: 3,
};

export function createFeishuApprovalActionHandlers(
  request: FeishuJsonRequest,
): Readonly<Record<string, FeishuApprovalActionHandler>> {
  return {
    search_approvals: async (input) =>
      normalizePage(
        await request({
          method: "POST",
          path: "/approval/v4/approvals/search_launchable",
          body: compactObject({
            keyword: input.keyword,
            locale: input.locale,
            page_size: input.pageSize,
            page_token: input.pageToken,
          }),
        }),
        "approvals",
      ),
    get_approval: async (input) => ({
      approval: await request({
        path: `/approval/v4/approvals/${segment(requireString(input.approvalCode, "approvalCode"))}/detail`,
        query: compactQuery({
          locale: input.locale,
        }),
      }),
    }),
    create_approval_instance: async (input) => {
      const instance = await request({
        method: "POST",
        path: "/approval/v4/instances/initiate",
        body: compactObject({
          approval_code: input.approvalCode,
          form: serializeForm(input.form),
          node_approver_list: input.nodeApprovers,
          node_cc_list: input.nodeCcUsers,
          uuid: input.idempotencyKey,
        }),
      });
      return {
        instanceCode: requireString(instance.instance_code, "instance_code"),
        instanceLink: optionalRawString(instance.instance_link) ?? "",
        instance,
      };
    },
    get_approval_instance: async (input) => ({
      instance: await request({
        path: "/approval/v4/instances/detail",
        query: compactQuery({
          instance_code: input.instanceCode,
          locale: input.locale,
          user_id_type: input.userIdType,
        }),
      }),
    }),
    cancel_approval_instance: (input) =>
      executeWrite(request, "/approval/v4/instances/recall", {
        instance_code: input.instanceCode,
      }),
    add_approval_cc: (input) =>
      executeWrite(
        request,
        "/approval/v4/instances/add_cc",
        compactObject({
          instance_code: input.instanceCode,
          cc_user_ids: input.userIds,
          comment: input.comment,
        }),
        compactQuery({
          user_id_type: input.userIdType,
        }),
      ),
    list_initiated_approval_instances: async (input) =>
      normalizePage(
        await request({
          path: "/approval/v4/instances/initiated",
          query: listQuery(input),
        }),
        "instances",
      ),
    list_approval_tasks: async (input) =>
      normalizePage(
        await request({
          path: "/approval/v4/tasks",
          query: {
            ...listQuery(input),
            topic: mapEnum(input.topic, taskTopics, "topic"),
          },
        }),
        "tasks",
      ),
    approve_approval_task: (input) =>
      executeWrite(request, "/approval/v4/tasks/pass", {
        instance_code: input.instanceCode,
        task_id: input.taskId,
        form: serializeForm(input.form),
        comment: input.comment,
      }),
    reject_approval_task: (input) =>
      executeWrite(request, "/approval/v4/tasks/refuse", {
        instance_code: input.instanceCode,
        task_id: input.taskId,
        comment: input.comment,
      }),
    transfer_approval_task: (input) =>
      executeWrite(
        request,
        "/approval/v4/tasks/forward",
        {
          instance_code: input.instanceCode,
          task_id: input.taskId,
          transfer_user_id: input.transferUserId,
          comment: input.comment,
        },
        compactQuery({
          user_id_type: input.userIdType,
        }),
      ),
    add_sign_approval_task: (input) =>
      executeWrite(
        request,
        "/approval/v4/tasks/add_sign",
        {
          instance_code: input.instanceCode,
          task_id: input.taskId,
          add_sign_user_ids: input.userIds,
          add_sign_type: mapEnum(input.addSignType, addSignTypes, "addSignType"),
          approval_method:
            input.approvalMethod === undefined
              ? undefined
              : mapEnum(input.approvalMethod, approvalMethods, "approvalMethod"),
          comment: input.comment,
        },
        compactQuery({
          user_id_type: input.userIdType,
        }),
      ),
    rollback_approval_task: (input) =>
      executeWrite(request, "/approval/v4/tasks/rollback", {
        instance_code: input.instanceCode,
        task_id: input.taskId,
        node_ids: input.nodeIds,
        comment: input.comment,
      }),
    remind_approval_tasks: (input) =>
      executeWrite(request, "/approval/v4/instances/remind", {
        instance_code: input.instanceCode,
        task_ids: input.taskIds,
        comment: input.comment,
      }),
  };
}

async function executeWrite(
  request: FeishuJsonRequest,
  path: string,
  body: Record<string, unknown>,
  query?: Readonly<Record<string, FeishuQueryValue>>,
) {
  const result = await request({
    method: "POST",
    path,
    query,
    body: compactObject(body),
  });
  return { success: true, result };
}

function normalizePage(data: Record<string, unknown>, itemKey: string) {
  const items = Array.isArray(data[itemKey])
    ? (data[itemKey] as unknown[])
        .map(optionalObject)
        .filter((item): item is Record<string, unknown> => item !== undefined)
    : [];
  return {
    items,
    pageToken: optionalRawString(data.page_token) ?? "",
    hasMore: data.has_more === true,
    total: optionalNonNegativeInteger(data.count) ?? items.length,
  };
}

function listQuery(input: Record<string, unknown>) {
  return compactQuery({
    page_size: input.pageSize,
    page_token: input.pageToken,
    locale: input.locale,
    definition_code: input.definitionCode,
    start_timestamp: input.startTimestamp,
    end_timestamp: input.endTimestamp,
    user_id_type: input.userIdType,
  });
}

function serializeForm(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "form must be an array");
  }
  return JSON.stringify(value);
}

function mapEnum<T>(value: unknown, values: Readonly<Record<string, T>>, fieldName: string) {
  const key = requireString(value, fieldName);
  const mapped = values[key];
  if (mapped === undefined) {
    throw new ProviderRequestError(400, `${fieldName} has an unsupported value`);
  }
  return mapped;
}

function compactQuery(value: Record<string, unknown>) {
  const result: Record<string, FeishuQueryValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item === undefined ||
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean" ||
      (Array.isArray(item) && item.every((entry) => typeof entry === "string"))
    ) {
      if (item !== undefined) {
        result[key] = item as FeishuQueryValue;
      }
    }
  }
  return result;
}

function segment(value: string) {
  return encodeURIComponent(value);
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new ProviderRequestError(400, `${fieldName} must be a non-empty string`);
}

function optionalNonNegativeInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
