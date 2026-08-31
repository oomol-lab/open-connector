import type { FeishuJsonRequest } from "./client.ts";

import { optionalRecord, optionalString } from "../../../core/cast.ts";
import { providerInputError, ProviderRequestError } from "../../provider-runtime.ts";

interface FeishuDriveActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export function createFeishuDriveActionHandlers(request: FeishuJsonRequest): Record<string, FeishuDriveActionHandler> {
  return {
    inspect_drive_item(input) {
      return inspectDriveItem(input, request);
    },
    search_drive_items(input) {
      return searchDriveItems(input, request);
    },
    list_drive_files(input) {
      return listDriveFiles(input, request);
    },
    create_drive_folder(input) {
      return createDriveFolder(input, request);
    },
    copy_drive_file(input) {
      return copyDriveFile(input, request);
    },
    move_drive_item(input) {
      return moveDriveItem(input, request);
    },
    delete_drive_item(input) {
      return deleteDriveItem(input, request);
    },
    get_drive_task_status(input) {
      return getDriveTaskStatus(input, request);
    },
    list_drive_comments(input) {
      return listDriveComments(input, request);
    },
    create_drive_comment(input) {
      return createDriveComment(input, request);
    },
    update_drive_comment(input) {
      return updateDriveComment(input, request);
    },
    delete_drive_comment(input) {
      return deleteDriveComment(input, request);
    },
    create_drive_comment_reply(input) {
      return createDriveCommentReply(input, request);
    },
    delete_drive_comment_reply(input) {
      return deleteDriveCommentReply(input, request);
    },
    list_drive_permissions(input) {
      return listDrivePermissions(input, request);
    },
    add_drive_permission(input) {
      return addDrivePermission(input, request);
    },
    update_drive_permission(input) {
      return updateDrivePermission(input, request);
    },
    remove_drive_permission(input) {
      return removeDrivePermission(input, request);
    },
  };
}

async function inspectDriveItem(input: Record<string, unknown>, request: FeishuJsonRequest) {
  let token = requireString(input.token, "token");
  let type = requireString(input.type, "type");
  let wikiNode: Record<string, unknown> | undefined = undefined;
  if (type === "wiki") {
    const wikiData = await request({
      path: "/wiki/v2/spaces/get_node",
      query: { token },
    });
    wikiNode = optionalRecord(wikiData.node);
    const objectToken = optionalString(wikiNode?.obj_token);
    const objectType = optionalString(wikiNode?.obj_type);
    if (!objectToken || !objectType) {
      throw new ProviderRequestError(502, "Feishu returned an incomplete Wiki node without obj_token or obj_type");
    }
    token = objectToken;
    type = objectType;
  }

  const data = await request({
    method: "POST",
    path: "/drive/v1/metas/batch_query",
    body: {
      request_docs: [{ doc_token: token, doc_type: type }],
      with_url: true,
    },
  });
  const meta = firstObject(data.metas) ?? {};
  return {
    token,
    type,
    title: optionalString(meta.title),
    url: optionalString(meta.url),
    wikiNode,
    raw: meta,
  };
}

async function searchDriveItems(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: "/search/v2/doc_wiki/search",
    body: {
      query: optionalString(input.query) ?? "",
      doc_filter: optionalRecord(input.docFilter) ?? {},
      wiki_filter: optionalRecord(input.wikiFilter) ?? {},
      page_size: optionalNumber(input.pageSize) ?? 15,
      page_token: optionalString(input.pageToken),
    },
  });
  return {
    items: Array.isArray(data.res_units) ? data.res_units : [],
    total: optionalNumber(data.total),
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token),
    notice: optionalString(data.notice),
  };
}

async function listDriveFiles(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: "/drive/v1/files",
    query: {
      folder_token: optionalString(input.folderToken),
      page_size: optionalNumber(input.pageSize) ?? 200,
      page_token: optionalString(input.pageToken),
      order_by: optionalString(input.orderBy),
      direction: optionalString(input.direction),
    },
  });
  return normalizePage(data, "files");
}

async function createDriveFolder(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const name = requireString(input.name, "name");
  if (new TextEncoder().encode(name).byteLength > 256) {
    throw providerInputError("name must not exceed 256 UTF-8 bytes");
  }
  const data = await request({
    method: "POST",
    path: "/drive/v1/files/create_folder",
    body: {
      name,
      folder_token: optionalString(input.folderToken) ?? "",
    },
  });
  return {
    folder: optionalRecord(data.folder) ?? data,
  };
}

async function copyDriveFile(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const type = requireString(input.type, "type");
  if (type === "folder") {
    throw providerInputError("Feishu does not support copying folders with the Drive copy API");
  }
  const data = await request({
    method: "POST",
    path: `/drive/v1/files/${encodeURIComponent(fileToken)}/copy`,
    query: {
      user_id_type: optionalString(input.userIdType),
    },
    body: {
      name: requireString(input.name, "name"),
      type,
      folder_token: requireString(input.folderToken, "folderToken"),
    },
  });
  return { file: optionalRecord(data.file) ?? data };
}

async function moveDriveItem(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const type = requireString(input.type, "type");
  const folderToken = requireString(input.folderToken, "folderToken");
  const data = await request({
    method: "POST",
    path: `/drive/v1/files/${encodeURIComponent(fileToken)}/move`,
    body: {
      type,
      folder_token: folderToken,
    },
  });
  return {
    fileToken,
    type,
    folderToken,
    taskId: optionalString(data.task_id),
  };
}

async function deleteDriveItem(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const type = requireString(input.type, "type");
  const data = await request({
    method: "DELETE",
    path: `/drive/v1/files/${encodeURIComponent(fileToken)}`,
    query: { type },
  });
  const taskId = optionalString(data.task_id);
  return {
    fileToken,
    type,
    taskId,
    deleted: taskId ? undefined : true,
  };
}

async function getDriveTaskStatus(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const taskId = requireString(input.taskId, "taskId");
  const data = await request({
    path: "/drive/v1/files/task_check",
    query: { task_id: taskId },
  });
  return {
    ...data,
    taskId,
    status: optionalString(data.status) ?? optionalString(data.task_status),
  };
}

async function listDriveComments(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const data = await request({
    path: `/drive/v1/files/${encodeURIComponent(fileToken)}/comments`,
    query: {
      file_type: requireString(input.fileType, "fileType"),
      is_solved: optionalBoolean(input.solved),
      is_whole: optionalBoolean(input.whole),
      need_reaction: optionalBoolean(input.needReaction),
      need_relation: optionalBoolean(input.needRelation),
      page_size: optionalNumber(input.pageSize) ?? 50,
      page_token: optionalString(input.pageToken),
    },
  });
  return normalizePage(data, "items");
}

async function createDriveComment(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const data = await request({
    method: "POST",
    path: `/drive/v1/files/${encodeURIComponent(fileToken)}/new_comments`,
    body: {
      file_type: requireString(input.fileType, "fileType"),
      reply_elements: requireObjectArray(input.replyElements, "replyElements"),
      anchor: optionalRecord(input.anchor),
    },
  });
  return { comment: optionalRecord(data.comment) ?? data };
}

async function updateDriveComment(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "PATCH",
    path: commentPath(input),
    query: {
      file_type: requireString(input.fileType, "fileType"),
    },
    body: {
      is_solved: requireBoolean(input.solved, "solved"),
    },
  });
  return { comment: optionalRecord(data.comment) ?? data };
}

async function deleteDriveComment(input: Record<string, unknown>, request: FeishuJsonRequest) {
  await request({
    method: "DELETE",
    path: commentPath(input),
    query: {
      file_type: requireString(input.fileType, "fileType"),
    },
  });
  return { deleted: true };
}

async function createDriveCommentReply(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    method: "POST",
    path: `${commentPath(input)}/replies`,
    query: {
      file_type: requireString(input.fileType, "fileType"),
    },
    body: {
      reply_elements: requireObjectArray(input.replyElements, "replyElements"),
    },
  });
  return { reply: optionalRecord(data.reply) ?? data };
}

async function deleteDriveCommentReply(input: Record<string, unknown>, request: FeishuJsonRequest) {
  await request({
    method: "DELETE",
    path: `${commentPath(input)}/replies/${encodeURIComponent(requireString(input.replyId, "replyId"))}`,
    query: {
      file_type: requireString(input.fileType, "fileType"),
    },
  });
  return { deleted: true };
}

async function listDrivePermissions(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const data = await request({
    path: permissionPath(input),
    query: {
      type: requireString(input.resourceType, "resourceType"),
      fields: optionalString(input.fields),
      perm_type: optionalString(input.permType),
    },
  });
  return {
    members: Array.isArray(data.members) ? data.members : [],
  };
}

async function addDrivePermission(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const memberType = requireString(input.memberType, "memberType");
  const data = await request({
    method: "POST",
    path: permissionPath(input),
    query: {
      type: requireString(input.resourceType, "resourceType"),
      need_notification: optionalBoolean(input.needNotification),
    },
    body: {
      member_id: requireString(input.memberId, "memberId"),
      member_type: memberType,
      type: memberKind(memberType, optionalString(input.memberKind)),
      perm: requireString(input.permission, "permission"),
      perm_type: optionalString(input.permType),
    },
  });
  return { member: optionalRecord(data.member) ?? data };
}

async function updateDrivePermission(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const memberId = requireString(input.memberId, "memberId");
  const data = await request({
    method: "PUT",
    path: `${permissionPath(input)}/${encodeURIComponent(memberId)}`,
    query: {
      type: requireString(input.resourceType, "resourceType"),
      member_type: requireString(input.memberType, "memberType"),
      need_notification: optionalBoolean(input.needNotification),
    },
    body: {
      perm: requireString(input.permission, "permission"),
    },
  });
  return { member: optionalRecord(data.member) ?? data };
}

async function removeDrivePermission(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const memberId = requireString(input.memberId, "memberId");
  await request({
    method: "DELETE",
    path: `${permissionPath(input)}/${encodeURIComponent(memberId)}`,
    query: {
      type: requireString(input.resourceType, "resourceType"),
      member_type: requireString(input.memberType, "memberType"),
      perm_type: optionalString(input.permType),
    },
  });
  return { deleted: true };
}

function normalizePage(data: Record<string, unknown>, itemKey: string) {
  return {
    items: Array.isArray(data[itemKey]) ? data[itemKey] : [],
    hasMore: data.has_more === true,
    pageToken: optionalString(data.page_token) ?? optionalString(data.next_page_token),
  };
}

function commentPath(input: Record<string, unknown>) {
  const fileToken = requireString(input.fileToken, "fileToken");
  const commentId = requireString(input.commentId, "commentId");
  return `/drive/v1/files/${encodeURIComponent(fileToken)}/comments/${encodeURIComponent(commentId)}`;
}

function permissionPath(input: Record<string, unknown>) {
  return `/drive/v1/permissions/${encodeURIComponent(requireString(input.token, "token"))}/members`;
}

function memberKind(memberType: string, explicit: string | undefined) {
  if (memberType === "wikispaceid") {
    if (!explicit) {
      throw providerInputError("memberKind is required when memberType is wikispaceid");
    }
    return explicit;
  } else if (memberType === "openchat") {
    return "chat";
  } else if (memberType === "opendepartmentid") {
    return "department";
  } else if (memberType === "groupid") {
    return "group";
  } else if (memberType === "appid") {
    return undefined;
  } else {
    return "user";
  }
}

function firstObject(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const item of value) {
    const object = optionalRecord(item);
    if (object) {
      return object;
    }
  }
  return undefined;
}

function requireObjectArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw providerInputError(`${fieldName} must contain at least one item`);
  }
  const objects = value.map(optionalRecord);
  if (objects.some((item) => item == null)) {
    throw providerInputError(`${fieldName} must contain only objects`);
  }
  return objects;
}

function requireString(value: unknown, fieldName: string) {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw providerInputError(`${fieldName} is required`);
  }
  return stringValue;
}

function requireBoolean(value: unknown, fieldName: string) {
  if (typeof value !== "boolean") {
    throw providerInputError(`${fieldName} is required`);
  }
  return value;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
