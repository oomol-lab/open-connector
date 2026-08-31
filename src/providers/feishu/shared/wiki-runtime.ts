import type { FeishuJsonRequest } from "./client.ts";

import { optionalBoolean, optionalNumber } from "../../../core/cast.ts";
import { providerInputError } from "../../provider-runtime.ts";

interface WikiActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export function createFeishuWikiActionHandlers(request: FeishuJsonRequest): Record<string, WikiActionHandler> {
  return {
    list_wiki_spaces(input) {
      return listSpaces(input, request);
    },
    get_wiki_space(input) {
      return getSpace(input, request);
    },
    create_wiki_space(input) {
      return createSpace(input, request);
    },
    list_wiki_nodes(input) {
      return listNodes(input, request);
    },
    get_wiki_node(input) {
      return getNode(input, request);
    },
    create_wiki_node(input) {
      return createNode(input, request);
    },
    copy_wiki_node(input) {
      return copyNode(input, request);
    },
    move_wiki_node(input) {
      return moveNode(input, request);
    },
    delete_wiki_node(input) {
      return deleteNode(input, request);
    },
    submit_wiki_move_to_drive(input) {
      return submitMoveToDrive(input, request);
    },
    delete_wiki_space(input) {
      return deleteSpace(input, request);
    },
    get_wiki_task(input) {
      return getWikiTask(input, request);
    },
    list_wiki_members(input) {
      return listMembers(input, request);
    },
    add_wiki_member(input) {
      return addMember(input, request);
    },
    remove_wiki_member(input) {
      return removeMember(input, request);
    },
  };
}

async function listSpaces(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/wiki/v2/spaces",
    query: {
      page_size: optionalNumber(input.pageSize),
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function getSpace(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const data = await request({
    path: `/wiki/v2/spaces/${encode(spaceId)}`,
  });
  return { item: recordValue(data.space) };
}

async function createSpace(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/wiki/v2/spaces",
    body: compact({
      name: requiredString(input.name, "name"),
      description: optionalString(input.description),
    }),
  });
  return { item: recordValue(data.space) };
}

async function listNodes(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const data = await request({
    path: `/wiki/v2/spaces/${encode(spaceId)}/nodes`,
    query: {
      parent_node_token: optionalString(input.parentNodeToken),
      page_size: optionalNumber(input.pageSize),
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function getNode(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/wiki/v2/spaces/get_node",
    query: {
      token: requiredString(input.token, "token"),
      obj_type: optionalString(input.objectType),
    },
  });
  return { item: recordValue(data.node) };
}

async function createNode(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const nodeType = optionalString(input.nodeType) ?? "origin";
  const originNodeToken = optionalString(input.originNodeToken);
  if (nodeType === "shortcut" && !originNodeToken) {
    throw providerInputError("originNodeToken is required for shortcut nodes");
  }
  const data = await request({
    method: "POST",
    path: `/wiki/v2/spaces/${encode(spaceId)}/nodes`,
    body: compact({
      node_type: nodeType,
      obj_type: requiredString(input.objectType, "objectType"),
      parent_node_token: optionalString(input.parentNodeToken),
      origin_node_token: originNodeToken,
      title: optionalString(input.title),
    }),
  });
  return { item: recordValue(data.node) };
}

async function copyNode(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const nodeToken = requiredString(input.nodeToken, "nodeToken");
  const targetSpaceId = optionalString(input.targetSpaceId);
  const targetParentToken = optionalString(input.targetParentToken);
  if (Boolean(targetSpaceId) === Boolean(targetParentToken)) {
    throw providerInputError("provide exactly one of targetSpaceId or targetParentToken");
  }
  const data = await request({
    method: "POST",
    path: `/wiki/v2/spaces/${encode(spaceId)}/nodes/${encode(nodeToken)}/copy`,
    body: compact({
      target_space_id: targetSpaceId,
      target_parent_token: targetParentToken,
      title: optionalString(input.title),
    }),
  });
  return { item: recordValue(data.node) };
}

async function moveNode(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const nodeToken = requiredString(input.nodeToken, "nodeToken");
  const data = await request({
    method: "POST",
    path: `/wiki/v2/spaces/${encode(spaceId)}/nodes/${encode(nodeToken)}/move`,
    body: compact({
      target_space_id: requiredString(input.targetSpaceId, "targetSpaceId"),
      target_parent_token: optionalString(input.targetParentToken),
    }),
  });
  return { item: recordValue(data.node ?? data.task ?? data) };
}

async function deleteNode(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const nodeToken = requiredString(input.nodeToken, "nodeToken");
  const data = await request({
    method: "DELETE",
    path: `/wiki/v2/spaces/${encode(spaceId)}/nodes/${encode(nodeToken)}`,
    body: {
      obj_type: optionalString(input.objectType),
      include_children: input.includeChildren === true,
    },
  });
  return {
    deleted: optionalString(data.task_id) == null,
    taskId: optionalString(data.task_id) ?? null,
    raw: data,
  };
}

async function submitMoveToDrive(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const nodeToken = requiredString(input.nodeToken, "nodeToken");
  const folderToken = optionalString(input.folderToken);
  const data = await request({
    method: "POST",
    path: `/wiki/v2/nodes/${encode(nodeToken)}/move_wiki_to_docs`,
    body: compact({ folder_token: folderToken }),
  });
  return {
    taskId: requiredString(data.task_id, "task_id"),
    nodeToken,
    folderToken: folderToken ?? null,
  };
}

async function deleteSpace(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const data = await request({
    method: "DELETE",
    path: `/wiki/v2/spaces/${encode(spaceId)}`,
  });
  const taskId = optionalString(data.task_id);
  return {
    spaceId,
    status: taskId ? "running" : "succeeded",
    taskId: taskId ?? null,
    raw: data,
  };
}

async function getWikiTask(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const taskId = requiredString(input.taskId, "taskId");
  const taskType = optionalString(input.taskType) ?? "move_wiki_to_docs";
  const data = await request({
    path: `/wiki/v2/tasks/${encode(taskId)}`,
    query: { task_type: taskType },
  });
  const task = recordValue(data.task);
  const resultKey = taskType === "delete_space" ? "delete_space_result" : "move_wiki_to_docs_result";
  const result = recordValue(task[resultKey]);
  const rawStatus = optionalNumber(result.status);
  const status = rawStatus === 0 ? "succeeded" : rawStatus === -1 ? "failed" : "running";
  return {
    taskId: optionalString(task.task_id) ?? taskId,
    taskType,
    status,
    statusMessage: optionalString(result.status_msg),
    resourceToken: optionalString(result.obj_token),
    resourceType: optionalString(result.obj_type),
    url: optionalString(result.url),
    raw: task,
  };
}

async function listMembers(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const data = await request({
    path: `/wiki/v2/spaces/${encode(spaceId)}/members`,
    query: {
      page_size: optionalNumber(input.pageSize),
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data);
}

async function addMember(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const data = await request({
    method: "POST",
    path: `/wiki/v2/spaces/${encode(spaceId)}/members`,
    query: { need_notification: optionalBoolean(input.notify) },
    body: {
      member_id: requiredString(input.memberId, "memberId"),
      member_type: requiredString(input.memberType, "memberType"),
      member_role: requiredString(input.memberRole, "memberRole"),
    },
  });
  return { item: recordValue(data.member) };
}

async function removeMember(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const spaceId = requiredString(input.spaceId, "spaceId");
  const memberId = requiredString(input.memberId, "memberId");
  await request({
    method: "DELETE",
    path: `/wiki/v2/spaces/${encode(spaceId)}/members/${encode(memberId)}`,
    body: {
      member_type: requiredString(input.memberType, "memberType"),
      member_role: requiredString(input.memberRole, "memberRole"),
    },
  });
  return { removed: true, memberId };
}

function normalizePage(data: Record<string, unknown>) {
  const hasMore = data.has_more === true;
  return {
    items: recordArray(data.items),
    hasMore,
    pageToken: hasMore ? (optionalString(data.page_token) ?? null) : null,
  };
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item),
      )
    : [];
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function requiredString(value: unknown, field: string) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw providerInputError(`${field} must be a non-empty string`);
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function encode(value: string) {
  return encodeURIComponent(value);
}
