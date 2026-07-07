import type { ClickupActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export interface ClickupActionContext {
  authType: "api_key" | "oauth2";
  accessToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ClickupActionHandler = (input: Record<string, unknown>, context: ClickupActionContext) => Promise<unknown>;

type ClickupRequestMode = "validate" | "execute";

type ClickupRequestOptions = {
  path: string;
  authorizationHeader: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: ClickupRequestMode;
  apiBaseUrl?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | Array<string | number | boolean> | undefined>;
  body?: FormData | Record<string, unknown>;
  notFoundAsInvalidInput?: boolean;
};

export const clickupApiOrigin: string = "https://api.clickup.com";
const clickupApiV2BaseUrl = `${clickupApiOrigin}/api/v2`;
const clickupApiV3BaseUrl = `${clickupApiOrigin}/api/v3`;
export const clickupGrantedScopes: string[] = ["clickup.read", "clickup.write"];
const maxAttachmentRedirects = 5;
const maxAttachmentBytes = 20 * 1024 * 1024;
const attachmentDownloadTimeoutMs = 15_000;

export async function validateClickupCredential(
  accessToken: string,
  authType: "api_key" | "oauth2",
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string; grantedScopes: string[] };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  const profile = await fetchClickupCurrentAccount(accessToken, authType, fetcher, "validate", signal);

  return {
    profile: {
      accountId: profile.accountId,
      displayName: profile.displayName,
      grantedScopes: [...clickupGrantedScopes],
    },
    grantedScopes: [...clickupGrantedScopes],
    metadata: profile.metadata,
  };
}

export async function fetchClickupCurrentAccount(
  accessToken: string,
  authType: "api_key" | "oauth2",
  fetcher: typeof fetch = fetch,
  mode: ClickupRequestMode = "execute",
  signal?: AbortSignal,
): Promise<{ accountId: string; displayName: string; metadata: Record<string, unknown> }> {
  const authorizationHeader = buildClickupAuthorizationHeader(accessToken, authType);
  const userPayload = await requestClickupJson({
    path: "/user",
    authorizationHeader,
    fetcher,
    signal,
    mode,
  });
  const workspacePayload = await requestClickupJson({
    path: "/team",
    authorizationHeader,
    fetcher,
    signal,
    mode,
  });

  const user = readObjectField(userPayload, "user");
  const workspaces = readArrayField(workspacePayload, "teams");
  const userId = asStringId(user.id);
  const username = optionalString(user.username);
  const email = optionalString(user.email);
  const workspaceNames = workspaces
    .map((workspace) => optionalString(optionalRecord(workspace)?.name))
    .filter((value): value is string => Boolean(value));

  return {
    accountId: userId ? `clickup:user:${userId}` : "clickup",
    displayName: username || email || (authType === "oauth2" ? "ClickUp OAuth" : "ClickUp Personal Token"),
    metadata: compactObject({
      apiBaseUrl: clickupApiV2BaseUrl,
      validationUserEndpoint: "/user",
      validationWorkspaceEndpoint: "/team",
      userId,
      username,
      email,
      workspaceCount: workspaces.length,
      workspaceNames,
    }),
  };
}

export const clickupActionHandlers: Record<ClickupActionName, ClickupActionHandler> = {
  async get_current_user(_input, context) {
    const payload = await requestClickupJson({
      path: "/user",
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
    });
    return {
      user: readObjectField(payload, "user"),
    };
  },
  async list_workspaces(_input, context) {
    const payload = await requestClickupJson({
      path: "/team",
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
    });
    return {
      workspaces: readArrayField(payload, "teams"),
    };
  },
  async list_workspace_users(input, context) {
    const workspaceId = requireString(input.workspaceId, "workspaceId");
    const payload = await requestClickupJson({
      path: "/team",
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
    });
    const workspaces = readArrayField(payload, "teams");
    const workspace = workspaces.find((candidate) => {
      const parsedCandidate = optionalRecord(candidate);
      if (!parsedCandidate) {
        return false;
      }
      return asStringId(parsedCandidate.id) === workspaceId;
    });

    if (!workspace) {
      throw clickupRuntimeError("invalid_input", `unknown clickup workspace: ${workspaceId}`, 400);
    }

    return {
      members: readArrayField(workspace as Record<string, unknown>, "members"),
    };
  },
  async get_user(input, context) {
    const workspaceId = requireString(input.workspaceId, "workspaceId");
    const userId = requireIdString(input.userId, "userId");
    const payload = await requestClickupJson({
      path: `/team/${encodeURIComponent(workspaceId)}/user/${encodeURIComponent(userId)}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: compactQuery({
        include_shared: optionalBoolean(input.includeShared),
      }),
      notFoundAsInvalidInput: true,
    });
    return {
      member: readObjectField(payload, "member"),
    };
  },
  async list_spaces(input, context) {
    const payload = await requestClickupJson({
      path: `/team/${encodeURIComponent(requireString(input.workspaceId, "workspaceId"))}/space`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: compactQuery({
        archived: optionalBoolean(input.archived),
      }),
    });
    return {
      spaces: readArrayField(payload, "spaces"),
    };
  },
  async get_space(input, context) {
    const payload = await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      space: payload,
    };
  },
  async create_space(input, context) {
    const payload = await requestClickupJson({
      path: `/team/${encodeURIComponent(requireString(input.workspaceId, "workspaceId"))}/space`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildSpaceBody(input),
    });
    return {
      space: payload,
    };
  },
  async update_space(input, context) {
    const payload = await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "PUT",
      body: await buildHydratedUpdateSpaceBody(input, context),
      notFoundAsInvalidInput: true,
    });
    return {
      space: payload,
    };
  },
  async delete_space(input, context) {
    await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
    };
  },
  async list_folders(input, context) {
    const payload = await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}/folder`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: compactQuery({
        archived: optionalBoolean(input.archived),
      }),
    });
    return {
      folders: readArrayField(payload, "folders"),
    };
  },
  async get_folder(input, context) {
    const payload = await requestClickupJson({
      path: `/folder/${encodeURIComponent(requireString(input.folderId, "folderId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      folder: payload,
    };
  },
  async create_folder(input, context) {
    const payload = await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}/folder`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildFolderBody(input),
    });
    return {
      folder: payload,
    };
  },
  async update_folder(input, context) {
    const payload = await requestClickupJson({
      path: `/folder/${encodeURIComponent(requireString(input.folderId, "folderId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "PUT",
      body: buildFolderBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      folder: payload,
    };
  },
  async delete_folder(input, context) {
    await requestClickupJson({
      path: `/folder/${encodeURIComponent(requireString(input.folderId, "folderId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
    };
  },
  async list_lists(input, context) {
    const payload = await requestClickupJson({
      path: `/folder/${encodeURIComponent(requireString(input.folderId, "folderId"))}/list`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: compactQuery({
        archived: optionalBoolean(input.archived),
      }),
    });
    return {
      lists: readArrayField(payload, "lists"),
    };
  },
  async list_folderless_lists(input, context) {
    const payload = await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}/list`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: compactQuery({
        archived: optionalBoolean(input.archived),
      }),
    });
    return {
      lists: readArrayField(payload, "lists"),
    };
  },
  async get_list(input, context) {
    const payload = await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      list: payload,
    };
  },
  async get_workspace_custom_fields(input, context) {
    const payload = await requestClickupJson({
      path: `/team/${encodeURIComponent(requireString(input.workspaceId, "workspaceId"))}/field`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      fields: readArrayField(payload, "fields"),
    };
  },
  async get_space_custom_fields(input, context) {
    const payload = await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}/field`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      fields: readArrayField(payload, "fields"),
    };
  },
  async get_folder_custom_fields(input, context) {
    const payload = await requestClickupJson({
      path: `/folder/${encodeURIComponent(requireString(input.folderId, "folderId"))}/field`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      fields: readArrayField(payload, "fields"),
    };
  },
  async get_list_custom_fields(input, context) {
    const payload = await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}/field`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      fields: readArrayField(payload, "fields"),
    };
  },
  async set_custom_field_value(input, context) {
    await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/field/${encodeURIComponent(requireString(input.fieldId, "fieldId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildSetCustomFieldValueBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      updated: true,
    };
  },
  async remove_custom_field_value(input, context) {
    await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/field/${encodeURIComponent(requireString(input.fieldId, "fieldId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      removed: true,
    };
  },
  async create_checklist(input, context) {
    const payload = await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/checklist`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildCreateChecklistBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      checklist: readObjectField(payload, "checklist"),
    };
  },
  async update_checklist(input, context) {
    await requestClickupJson({
      path: `/checklist/${encodeURIComponent(requireString(input.checklistId, "checklistId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "PUT",
      body: buildUpdateChecklistBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      updated: true,
    };
  },
  async delete_checklist(input, context) {
    await requestClickupJson({
      path: `/checklist/${encodeURIComponent(requireString(input.checklistId, "checklistId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
    };
  },
  async create_checklist_item(input, context) {
    const payload = await requestClickupJson({
      path: `/checklist/${encodeURIComponent(requireString(input.checklistId, "checklistId"))}/checklist_item`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildCreateChecklistItemBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      checklist: readObjectField(payload, "checklist"),
    };
  },
  async update_checklist_item(input, context) {
    const checklistId = requireString(input.checklistId, "checklistId");
    const checklistItemId = requireString(input.checklistItemId, "checklistItemId");
    const payload = await requestClickupJson({
      path: `/checklist/${encodeURIComponent(checklistId)}/checklist_item/${encodeURIComponent(checklistItemId)}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "PUT",
      body: buildUpdateChecklistItemBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      checklist: readObjectField(payload, "checklist"),
    };
  },
  async delete_checklist_item(input, context) {
    const checklistId = requireString(input.checklistId, "checklistId");
    const checklistItemId = requireString(input.checklistItemId, "checklistItemId");
    await requestClickupJson({
      path: `/checklist/${encodeURIComponent(checklistId)}/checklist_item/${encodeURIComponent(checklistItemId)}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
    };
  },
  async get_space_tags(input, context) {
    const payload = await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}/tag`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      tags: readArrayField(payload, "tags"),
    };
  },
  async add_tag_to_task(input, context) {
    await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/tag/${encodeURIComponent(requireString(input.tagName, "tagName"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      notFoundAsInvalidInput: true,
    });
    return {
      added: true,
    };
  },
  async remove_tag_from_task(input, context) {
    await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/tag/${encodeURIComponent(requireString(input.tagName, "tagName"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      removed: true,
    };
  },
  async add_dependency(input, context) {
    await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/dependency`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildDependencyBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      added: true,
    };
  },
  async delete_dependency(input, context) {
    await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/dependency`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      query: buildDependencyQuery(input),
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
    };
  },
  async add_task_link(input, context) {
    const taskId = requireString(input.taskId, "taskId");
    const linksToTaskId = requireString(input.linksToTaskId, "linksToTaskId");
    const payload = await requestClickupJson({
      path: `/task/${encodeURIComponent(taskId)}/link/${encodeURIComponent(linksToTaskId)}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      notFoundAsInvalidInput: true,
    });
    return {
      task: readObjectField(payload, "task"),
    };
  },
  async delete_task_link(input, context) {
    const taskId = requireString(input.taskId, "taskId");
    const linksToTaskId = requireString(input.linksToTaskId, "linksToTaskId");
    const payload = await requestClickupJson({
      path: `/task/${encodeURIComponent(taskId)}/link/${encodeURIComponent(linksToTaskId)}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      task: readObjectField(payload, "task"),
    };
  },
  async get_custom_task_types(input, context) {
    const payload = await requestClickupJson({
      path: `/team/${encodeURIComponent(requireString(input.workspaceId, "workspaceId"))}/custom_item`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      customTaskTypes: readArrayField(payload, "custom_items"),
    };
  },
  async get_view(input, context) {
    const payload = await requestClickupJson({
      path: `/view/${encodeURIComponent(requireString(input.viewId, "viewId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      view: readWrappedObject(payload, "view"),
    };
  },
  async get_view_tasks(input, context) {
    const payload = await requestClickupJson({
      path: `/view/${encodeURIComponent(requireString(input.viewId, "viewId"))}/task`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: compactQuery({
        page: optionalInteger(input.page),
      }),
      notFoundAsInvalidInput: true,
    });
    return {
      tasks: readArrayField(payload, "tasks"),
      lastPage: optionalBoolean(payload.last_page),
    };
  },
  async get_space_views(input, context) {
    const payload = await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}/view`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      views: readArrayField(payload, "views"),
    };
  },
  async get_folder_views(input, context) {
    const payload = await requestClickupJson({
      path: `/folder/${encodeURIComponent(requireString(input.folderId, "folderId"))}/view`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      views: readArrayField(payload, "views"),
    };
  },
  async get_list_views(input, context) {
    const payload = await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}/view`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      views: readArrayField(payload, "views"),
    };
  },
  async get_workspace_everything_level_views(input, context) {
    const payload = await requestClickupJson({
      path: `/team/${encodeURIComponent(requireString(input.workspaceId, "workspaceId"))}/view`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      views: readArrayField(payload, "views"),
    };
  },
  async add_task_to_list(input, context) {
    await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      notFoundAsInvalidInput: true,
    });
    return {
      added: true,
    };
  },
  async remove_task_from_list(input, context) {
    await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      removed: true,
    };
  },
  async move_task_to_home_list(input, context) {
    const workspaceId = requireString(input.workspaceId, "workspaceId");
    const taskId = requireString(input.taskId, "taskId");
    const listId = requireString(input.listId, "listId");
    const payload = await requestClickupJson({
      apiBaseUrl: clickupApiV3BaseUrl,
      path: `/workspaces/${encodeURIComponent(workspaceId)}/tasks/${encodeURIComponent(taskId)}/home_list/${encodeURIComponent(listId)}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "PUT",
      body: buildMoveTaskToHomeListBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      task: readWrappedObject(payload, "task"),
    };
  },
  async create_task_attachment(input, context) {
    const attachmentSource = await resolveClickupAttachmentSource(input, context.fetcher);
    const formData = new FormData();
    formData.set(
      "attachment",
      new File([Buffer.from(attachmentSource.bytes)], attachmentSource.fileName, {
        type: attachmentSource.mimeType,
      }),
    );

    const payload = await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/attachment`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: formData,
      notFoundAsInvalidInput: true,
    });
    return {
      attachment: payload,
    };
  },
  async create_list(input, context) {
    const payload = await requestClickupJson({
      path: `/folder/${encodeURIComponent(requireString(input.folderId, "folderId"))}/list`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildCreateListBody(input),
    });
    return {
      list: payload,
    };
  },
  async create_folderless_list(input, context) {
    const payload = await requestClickupJson({
      path: `/space/${encodeURIComponent(requireString(input.spaceId, "spaceId"))}/list`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildCreateListBody(input),
    });
    return {
      list: payload,
    };
  },
  async update_list(input, context) {
    const payload = await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "PUT",
      body: await buildHydratedUpdateListBody(input, context),
      notFoundAsInvalidInput: true,
    });
    return {
      list: payload,
    };
  },
  async delete_list(input, context) {
    await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
    };
  },
  async get_task_templates(input, context) {
    const payload = await requestClickupJson({
      path: `/team/${encodeURIComponent(requireString(input.workspaceId, "workspaceId"))}/taskTemplate`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: compactQuery({
        page: optionalInteger(input.page),
      }),
      notFoundAsInvalidInput: true,
    });
    return {
      templates: normalizeTaskTemplates(readArrayField(payload, "templates")),
    };
  },
  async create_task_from_template(input, context) {
    const payload = await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}/taskTemplate/${encodeURIComponent(requireString(input.templateId, "templateId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: compactObject({
        name: requireString(input.name, "name"),
      }),
      notFoundAsInvalidInput: true,
    });
    return compactObject({
      created: true,
      task: readOptionalTaskLikeObject(payload),
    });
  },
  async create_list_from_template(input, context) {
    const payload = await requestClickupJson({
      path: `/folder/${encodeURIComponent(requireString(input.folderId, "folderId"))}/list_template/${encodeURIComponent(requireString(input.templateId, "templateId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildCreateListFromTemplateBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      list: await readCreatedListFromTemplatePayload(payload, context),
    };
  },
  async get_list_members(input, context) {
    const payload = await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}/member`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      members: readArrayField(payload, "members"),
    };
  },
  async list_list_tasks(input, context) {
    const payload = await requestClickupJson({
      path: `/list/${encodeURIComponent(requireString(input.listId, "listId"))}/task`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: buildListTaskQuery(input),
    });
    return {
      tasks: readArrayField(payload, "tasks"),
      lastPage: optionalBoolean(payload.last_page),
    };
  },
  async list_workspace_tasks(input, context) {
    const payload = await requestClickupJson({
      path: `/team/${encodeURIComponent(requireString(input.workspaceId, "workspaceId"))}/task`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: buildWorkspaceTaskQuery(input),
    });
    return {
      tasks: readArrayField(payload, "tasks"),
      lastPage: optionalBoolean(payload.last_page),
    };
  },
  async get_task(input, context) {
    const payload = await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: compactQuery({
        include_subtasks: optionalBoolean(input.includeSubtasks),
        include_markdown_description: optionalBoolean(input.includeMarkdownDescription),
      }),
      notFoundAsInvalidInput: true,
    });
    return {
      task: payload,
    };
  },
  async get_task_members(input, context) {
    const payload = await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/member`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      members: readArrayField(payload, "members"),
    };
  },
  async delete_task(input, context) {
    await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
    };
  },
  async get_task_comments(input, context) {
    const payload = await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/comment`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      query: buildTaskCommentsQuery(input),
      notFoundAsInvalidInput: true,
    });
    return {
      comments: readArrayField(payload, "comments"),
    };
  },
  async create_task_comment(input, context) {
    const payload = await requestClickupJson({
      path: `/task/${encodeURIComponent(requireString(input.taskId, "taskId"))}/comment`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildCreateCommentBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      comment: payload,
    };
  },
  async create_threaded_comment(input, context) {
    const payload = await requestClickupJson({
      path: `/comment/${encodeURIComponent(requireIdString(input.commentId, "commentId"))}/reply`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildCreateCommentBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      comment: payload,
    };
  },
  async get_threaded_comments(input, context) {
    const payload = await requestClickupJson({
      path: `/comment/${encodeURIComponent(requireIdString(input.commentId, "commentId"))}/reply`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return {
      comments: readArrayField(payload, "comments"),
    };
  },
  async update_comment(input, context) {
    const payload = await requestClickupJson({
      path: `/comment/${encodeURIComponent(requireIdString(input.commentId, "commentId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "PUT",
      body: buildUpdateCommentBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      comment: payload,
    };
  },
  async delete_comment(input, context) {
    await requestClickupJson({
      path: `/comment/${encodeURIComponent(requireIdString(input.commentId, "commentId"))}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "DELETE",
      notFoundAsInvalidInput: true,
    });
    return {
      deleted: true,
    };
  },
  async create_task(input, context) {
    const listId = requireString(input.listId, "listId");
    const payload = await requestClickupJson({
      path: `/list/${encodeURIComponent(listId)}/task`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "POST",
      body: buildCreateTaskBody(input),
    });
    return {
      task: payload,
    };
  },
  async update_task(input, context) {
    const taskId = requireString(input.taskId, "taskId");
    const payload = await requestClickupJson({
      path: `/task/${encodeURIComponent(taskId)}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      method: "PUT",
      body: buildUpdateTaskBody(input),
      notFoundAsInvalidInput: true,
    });
    return {
      task: payload,
    };
  },
};

function buildClickupAuthorizationHeader(accessToken: string, authType: "api_key" | "oauth2") {
  return authType === "oauth2" ? `Bearer ${accessToken}` : accessToken;
}

async function requestClickupJson(input: ClickupRequestOptions) {
  const url = new URL(`${input.apiBaseUrl ?? clickupApiV2BaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  try {
    let requestBody: BodyInit | undefined;
    if (input.body instanceof FormData) {
      requestBody = input.body;
    } else if (input.body) {
      requestBody = JSON.stringify(input.body);
    }
    response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: new Headers({
        accept: "application/json",
        authorization: input.authorizationHeader,
        "user-agent": providerUserAgent,
        ...(input.body instanceof FormData ? {} : { "content-type": "application/json" }),
      }),
      body: requestBody,
      signal: input.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw clickupRuntimeError("provider_error", `ClickUp request failed: ${message}`, 502);
  }

  const objectPayload = await parseClickupJsonResponse(response, "ClickUp response");

  if (!response.ok) {
    throw mapClickupError({
      mode: input.mode,
      status: response.status,
      payload: objectPayload,
      notFoundAsInvalidInput: input.notFoundAsInvalidInput ?? false,
    });
  }

  return objectPayload;
}

async function parseClickupJsonResponse(response: Response, label: string) {
  let payload: unknown;
  try {
    if (response.status === 204) {
      payload = {};
    } else {
      const responseText = await response.text();
      payload = responseText ? JSON.parse(responseText) : {};
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw clickupRuntimeError("provider_error", `${label} parsing failed: ${message}`, 502);
  }

  const objectPayload = optionalRecord(payload);
  if (!objectPayload) {
    throw clickupRuntimeError("provider_error", `${label} parsing failed: invalid JSON shape`, 502);
  }

  return objectPayload;
}

function mapClickupError(input: {
  mode: ClickupRequestMode;
  status: number;
  payload: Record<string, unknown>;
  notFoundAsInvalidInput: boolean;
}) {
  const message = readErrorMessage(input.payload, input.status);
  if (input.status === 401) {
    if (input.mode === "validate") {
      return clickupRuntimeError("invalid_input", message, 400);
    }
    return clickupRuntimeError("credential_expired", message, 409);
  }
  if (input.status === 429) {
    return clickupRuntimeError("rate_limited", message, 429);
  }
  if (input.status === 400 || (input.status === 404 && input.notFoundAsInvalidInput)) {
    return clickupRuntimeError("invalid_input", message, 400);
  }
  return clickupRuntimeError("provider_error", message, 502);
}

function readErrorMessage(payload: Record<string, unknown>, status: number) {
  return (
    optionalString(payload.err) ??
    optionalString(payload.error) ??
    optionalString(payload.message) ??
    `ClickUp request failed with status ${status}`
  );
}

function readObjectField(payload: Record<string, unknown>, key: string) {
  const value = optionalRecord(payload[key]);
  if (!value) {
    throw clickupRuntimeError("provider_error", `ClickUp response is missing ${key}`, 502);
  }
  return value;
}

function readWrappedObject(payload: Record<string, unknown>, key: string) {
  return optionalRecord(payload[key]) ?? payload;
}

function readArrayField(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (!Array.isArray(value)) {
    throw clickupRuntimeError("provider_error", `ClickUp response is missing ${key}`, 502);
  }
  return value;
}

function normalizeTaskTemplates(templates: unknown[]) {
  return templates.map((template) => {
    if (typeof template === "string") {
      return { id: template };
    }
    const parsed = optionalRecord(template);
    const id = asStringId(parsed?.id);
    if (!parsed || !id) {
      throw clickupRuntimeError("provider_error", "ClickUp template entry is invalid", 502);
    }
    return {
      ...parsed,
      id,
    };
  });
}

function readOptionalTaskLikeObject(payload: Record<string, unknown>) {
  const wrapped = optionalRecord(payload.task);
  if (wrapped && looksLikeTask(wrapped)) {
    return normalizeTaskLikeObject(wrapped);
  }
  if (looksLikeTask(payload)) {
    return normalizeTaskLikeObject(payload);
  }
  return undefined;
}

function looksLikeTask(payload: Record<string, unknown>) {
  return asStringId(payload.id) !== undefined && optionalString(payload.name) !== undefined;
}

function normalizeTaskLikeObject(payload: Record<string, unknown>) {
  return {
    ...payload,
    id: asStringId(payload.id),
    name: optionalString(payload.name),
  };
}

function readListLikeObject(payload: Record<string, unknown>) {
  const wrapped = optionalRecord(payload.list);
  if (wrapped && looksLikeList(wrapped)) {
    return normalizeListLikeObject(wrapped);
  }
  if (looksLikeList(payload)) {
    return normalizeListLikeObject(payload);
  }
  throw clickupRuntimeError("provider_error", "ClickUp response is missing list", 502);
}

function looksLikeList(payload: Record<string, unknown>) {
  return asStringId(payload.id) !== undefined && optionalString(payload.name) !== undefined;
}

function normalizeListLikeObject(payload: Record<string, unknown>) {
  return {
    ...payload,
    id: asStringId(payload.id),
    name: optionalString(payload.name),
  };
}

async function readCreatedListFromTemplatePayload(payload: Record<string, unknown>, context: ClickupActionContext) {
  try {
    return readListLikeObject(payload);
  } catch (error) {
    const wrapped = optionalRecord(payload.list);
    const listId = asStringId(wrapped?.id) ?? asStringId(payload.id);
    if (!(error instanceof ProviderRequestError) || !listId) {
      throw error;
    }

    const hydratedPayload = await requestClickupJson({
      path: `/list/${encodeURIComponent(listId)}`,
      authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
      fetcher: context.fetcher,
      mode: "execute",
      notFoundAsInvalidInput: true,
    });
    return readListLikeObject(hydratedPayload);
  }
}

function buildListTaskQuery(input: Record<string, unknown>) {
  return compactQuery({
    archived: optionalBoolean(input.archived),
    page: optionalInteger(input.page),
    order_by: optionalString(input.orderBy),
    reverse: optionalBoolean(input.reverse),
    subtasks: optionalBoolean(input.subtasks),
    "statuses[]": normalizeStringArray(input.statuses, "statuses"),
    include_closed: optionalBoolean(input.includeClosed),
    "assignees[]": normalizeIntegerArray(input.assigneeIds, "assigneeIds"),
    "watchers[]": normalizeIntegerArray(input.watchers, "watchers"),
    "tags[]": normalizeStringArray(input.tags, "tags"),
    due_date_gt: optionalInteger(input.dueDateGt),
    due_date_lt: optionalInteger(input.dueDateLt),
    date_created_gt: optionalInteger(input.dateCreatedGt),
    date_created_lt: optionalInteger(input.dateCreatedLt),
    date_updated_gt: optionalInteger(input.dateUpdatedGt),
    date_updated_lt: optionalInteger(input.dateUpdatedLt),
    date_done_gt: optionalInteger(input.dateDoneGt),
    date_done_lt: optionalInteger(input.dateDoneLt),
    parent: optionalString(input.parentTaskId),
    include_markdown_description: optionalBoolean(input.includeMarkdownDescription),
    include_timl: optionalBoolean(input.includeTiml),
  });
}

function buildWorkspaceTaskQuery(input: Record<string, unknown>) {
  return compactQuery({
    page: optionalInteger(input.page),
    order_by: optionalString(input.orderBy),
    reverse: optionalBoolean(input.reverse),
    subtasks: optionalBoolean(input.subtasks),
    "space_ids[]": normalizeStringArray(input.spaceIds, "spaceIds"),
    "project_ids[]": normalizeStringArray(input.folderIds, "folderIds"),
    "list_ids[]": normalizeStringArray(input.listIds, "listIds"),
    "statuses[]": normalizeStringArray(input.statuses, "statuses"),
    include_closed: optionalBoolean(input.includeClosed),
    "assignees[]": normalizeIntegerArray(input.assigneeIds, "assigneeIds"),
    "tags[]": normalizeStringArray(input.tags, "tags"),
    due_date_gt: optionalInteger(input.dueDateGt),
    due_date_lt: optionalInteger(input.dueDateLt),
    date_created_gt: optionalInteger(input.dateCreatedGt),
    date_created_lt: optionalInteger(input.dateCreatedLt),
    date_updated_gt: optionalInteger(input.dateUpdatedGt),
    date_updated_lt: optionalInteger(input.dateUpdatedLt),
    date_done_gt: optionalInteger(input.dateDoneGt),
    date_done_lt: optionalInteger(input.dateDoneLt),
    parent: optionalString(input.parentTaskId),
    include_markdown_description: optionalBoolean(input.includeMarkdownDescription),
  });
}

function buildSpaceBody(input: Record<string, unknown>) {
  return compactObject({
    name: optionalString(input.name),
    color: optionalString(input.color),
    private: optionalBoolean(input.private),
    admin_can_manage: optionalBoolean(input.adminCanManage),
    multiple_assignees: optionalBoolean(input.multipleAssignees),
    features: optionalRecord(input.features),
  });
}

function buildFolderBody(input: Record<string, unknown>) {
  return compactObject({
    name: requireString(input.name, "name"),
  });
}

function buildCreateListBody(input: Record<string, unknown>) {
  return compactObject({
    name: requireString(input.name, "name"),
    content: optionalString(input.content),
    markdown_content: optionalString(input.markdownContent),
    due_date: optionalInteger(input.dueDate),
    due_date_time: optionalBoolean(input.dueDateTime),
    priority: optionalInteger(input.priority),
    assignee: optionalInteger(input.assignee),
    status: optionalString(input.status),
  });
}

function buildCreateListFromTemplateBody(input: Record<string, unknown>) {
  return compactObject({
    name: requireString(input.name, "name"),
    options: buildListTemplateOptions(input.options),
  });
}

function buildListTemplateOptions(value: unknown) {
  const options = optionalRecord(value);
  if (!options) {
    return undefined;
  }
  return compactObject({
    return_immediately: optionalBoolean(options.returnImmediately),
  });
}

function buildSetCustomFieldValueBody(input: Record<string, unknown>) {
  const value = input.value;
  if (value === undefined) {
    throw clickupRuntimeError("invalid_input", "value is required", 400);
  }
  return compactObject({
    value,
    value_options: normalizeOptionalObject(input.valueOptions, "valueOptions"),
  });
}

function buildCreateChecklistBody(input: Record<string, unknown>) {
  return compactObject({
    name: requireString(input.name, "name"),
  });
}

function buildUpdateChecklistBody(input: Record<string, unknown>) {
  if (optionalString(input.name) === undefined && optionalInteger(input.position) === undefined) {
    throw clickupRuntimeError("invalid_input", "at least one writable field is required", 400);
  }

  return compactObject({
    name: optionalString(input.name),
    position: optionalInteger(input.position),
  });
}

function buildCreateChecklistItemBody(input: Record<string, unknown>) {
  return compactObject({
    name: requireString(input.name, "name"),
    assignee: optionalInteger(input.assignee),
  });
}

function buildUpdateChecklistItemBody(input: Record<string, unknown>) {
  if (
    optionalString(input.name) === undefined &&
    input.assignee === undefined &&
    optionalBoolean(input.resolved) === undefined &&
    input.parent === undefined
  ) {
    throw clickupRuntimeError("invalid_input", "at least one writable field is required", 400);
  }

  return compactObject({
    name: optionalString(input.name),
    assignee: normalizeStringIntegerOrNull(input.assignee, "assignee"),
    resolved: optionalBoolean(input.resolved),
    parent: normalizeNullableString(input.parent, "parent"),
  });
}

function buildDependencyBody(input: Record<string, unknown>) {
  return compactObject(resolveDependencyTarget(input));
}

function buildDependencyQuery(input: Record<string, unknown>) {
  return compactQuery(resolveDependencyTarget(input));
}

function buildMoveTaskToHomeListBody(input: Record<string, unknown>) {
  return compactObject({
    move_custom_fields: optionalBoolean(input.moveCustomFields),
    custom_fields_to_move: normalizeStringArray(input.customFieldsToMove, "customFieldsToMove"),
    status_mappings: normalizeMoveTaskStatusMappings(input.statusMappings),
  });
}

async function resolveClickupAttachmentSource(
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<{ bytes: Uint8Array; fileName: string; mimeType: string }> {
  const fileName = requireString(input.fileName, "fileName");
  const mimeType = optionalString(input.mimeType);
  const url = optionalString(input.url);
  const contentText = optionalString(input.contentText);
  const contentBase64 = optionalString(input.contentBase64);
  const providedSources = [url, contentText, contentBase64].filter((value) => value !== undefined).length;

  if (providedSources !== 1) {
    throw clickupRuntimeError("invalid_input", "exactly one attachment source field is required", 400);
  }

  if (url) {
    const response = await fetchPublicAttachmentUrl(fetcher, url);
    return {
      bytes: response.bytes,
      fileName,
      mimeType: mimeType ?? response.mimeType ?? "application/octet-stream",
    };
  }

  if (contentText !== undefined) {
    return {
      bytes: Uint8Array.from(Buffer.from(contentText)),
      fileName,
      mimeType: mimeType ?? "text/plain",
    };
  }

  if (contentBase64 === undefined) {
    throw clickupRuntimeError("invalid_input", "attachment source is required", 400);
  }

  return {
    bytes: decodeBase64AttachmentContent(contentBase64),
    fileName,
    mimeType: mimeType ?? "application/octet-stream",
  };
}

async function fetchPublicAttachmentUrl(
  fetcher: typeof fetch,
  url: string,
): Promise<{ bytes: Uint8Array; mimeType?: string }> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(clickupRuntimeError("provider_error", "attachment source download timed out", 504));
    }, attachmentDownloadTimeoutMs);
  });

  try {
    let currentUrl = assertPublicClickupAttachmentUrl(url);
    let response: Response | undefined;
    for (let redirectCount = 0; redirectCount <= maxAttachmentRedirects; redirectCount += 1) {
      response = await Promise.race([
        fetcher(currentUrl, {
          headers: {
            accept: "*/*",
            "user-agent": providerUserAgent,
          },
          redirect: "manual",
          signal: controller.signal,
        }),
        timeoutPromise,
      ]);

      if (![301, 302, 303, 307, 308].includes(response.status)) {
        break;
      }

      const location = response.headers.get("location");
      if (!location) {
        break;
      }
      currentUrl = assertPublicClickupAttachmentUrl(new URL(location, currentUrl).toString());
    }

    if (!response) {
      throw clickupRuntimeError("provider_error", "attachment source download failed", 502);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      throw clickupRuntimeError("provider_error", "attachment source redirected too many times", 502);
    }

    if (!response.ok) {
      throw clickupRuntimeError(
        "provider_error",
        `failed to fetch attachment source: ${response.status}`,
        response.status,
      );
    }

    return {
      bytes: await Promise.race([readAttachmentResponseBytes(response), timeoutPromise]),
      mimeType: response.headers.get("content-type") ?? undefined,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function assertPublicClickupAttachmentUrl(value: string): URL {
  return assertPublicHttpUrl(value, {
    fieldName: "url",
    createError(message) {
      return clickupRuntimeError("invalid_input", message, 400);
    },
  });
}

async function readAttachmentResponseBytes(response: Response) {
  const contentLength = parseContentLength(response.headers.get("content-length"));
  if (contentLength != null && contentLength > maxAttachmentBytes) {
    throw clickupRuntimeError("invalid_input", `attachment source exceeds ${maxAttachmentBytes} bytes`, 400);
  }

  const body = response.body;
  if (body == null) {
    return new Uint8Array(await response.arrayBuffer());
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      total += value.byteLength;
      if (total > maxAttachmentBytes) {
        await reader.cancel();
        throw clickupRuntimeError("invalid_input", `attachment source exceeds ${maxAttachmentBytes} bytes`, 400);
      }
      chunks.push(value);
    }
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function parseContentLength(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function decodeBase64AttachmentContent(contentBase64: string) {
  const normalizedContent = contentBase64.trim();
  if (normalizedContent !== "" && normalizedContent.length % 4 !== 0) {
    throw clickupRuntimeError("invalid_input", "contentBase64 must be valid base64", 400);
  }

  const bytes = Buffer.from(normalizedContent, "base64");
  if (bytes.toString("base64") !== normalizedContent) {
    throw clickupRuntimeError("invalid_input", "contentBase64 must be valid base64", 400);
  }
  return Uint8Array.from(bytes);
}

function buildUpdateListBody(input: Record<string, unknown>) {
  return compactObject({
    name: optionalString(input.name),
    content: optionalString(input.content),
    markdown_content: optionalString(input.markdownContent),
    due_date: optionalInteger(input.dueDate),
    due_date_time: optionalBoolean(input.dueDateTime),
    priority: optionalInteger(input.priority),
    assignee: normalizeIntegerOrNone(input.assignee, "assignee"),
    status: optionalString(input.status),
    unset_status: optionalBoolean(input.unsetStatus),
  });
}

async function buildHydratedUpdateSpaceBody(input: Record<string, unknown>, context: ClickupActionContext) {
  const spaceId = requireString(input.spaceId, "spaceId");
  const currentSpace = await requestClickupJson({
    path: `/space/${encodeURIComponent(spaceId)}`,
    authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return compactObject({
    name: optionalString(input.name) ?? requireProviderString(currentSpace.name, "space.name"),
    color: optionalString(input.color) ?? optionalString(currentSpace.color),
    private: optionalBoolean(input.private) ?? requireProviderBoolean(currentSpace.private, "space.private"),
    admin_can_manage: optionalBoolean(input.adminCanManage) ?? optionalBoolean(currentSpace.admin_can_manage),
    multiple_assignees:
      optionalBoolean(input.multipleAssignees) ??
      requireProviderBoolean(currentSpace.multiple_assignees, "space.multiple_assignees"),
    features: mergeRecordObjects(
      requireProviderObject(currentSpace.features, "space.features"),
      optionalRecord(input.features),
    ),
  });
}

async function buildHydratedUpdateListBody(input: Record<string, unknown>, context: ClickupActionContext) {
  if (optionalString(input.name)) {
    return buildUpdateListBody(input);
  }

  const listId = requireString(input.listId, "listId");
  const currentList = await requestClickupJson({
    path: `/list/${encodeURIComponent(listId)}`,
    authorizationHeader: buildClickupAuthorizationHeader(context.accessToken, context.authType),
    fetcher: context.fetcher,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });

  return buildUpdateListBody({
    ...input,
    name: requireProviderString(currentList.name, "list.name"),
  });
}

function buildTaskCommentsQuery(input: Record<string, unknown>) {
  const hasStart = optionalInteger(input.start) !== undefined;
  const hasStartId = optionalString(input.startId) !== undefined;
  if (hasStart !== hasStartId) {
    throw clickupRuntimeError("invalid_input", "start and startId must be provided together", 400);
  }

  return compactQuery({
    start: optionalInteger(input.start),
    start_id: optionalString(input.startId),
  });
}

function requireProviderString(value: unknown, key: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw clickupRuntimeError("provider_error", `ClickUp response is missing ${key}`, 502);
  }
  return parsed;
}

function requireProviderBoolean(value: unknown, key: string) {
  const parsed = optionalBoolean(value);
  if (parsed === undefined) {
    throw clickupRuntimeError("provider_error", `ClickUp response is missing ${key}`, 502);
  }
  return parsed;
}

function requireProviderObject(value: unknown, key: string) {
  const parsed = optionalRecord(value);
  if (!parsed) {
    throw clickupRuntimeError("provider_error", `ClickUp response is missing ${key}`, 502);
  }
  return parsed;
}

function mergeRecordObjects(base: Record<string, unknown>, overrides: Record<string, unknown> | undefined) {
  if (!overrides) {
    return base;
  }

  return Object.fromEntries([
    ...Object.entries(base),
    ...Object.entries(overrides).map(([key, value]) => {
      const baseValue = optionalRecord(base[key]);
      const overrideValue = optionalRecord(value);
      if (baseValue && overrideValue) {
        return [key, { ...baseValue, ...overrideValue }];
      }
      return [key, value];
    }),
  ]);
}

function buildCreateCommentBody(input: Record<string, unknown>) {
  return compactObject({
    comment_text: requireString(input.commentText, "commentText"),
    assignee: optionalInteger(input.assignee),
    group_assignee: normalizeStringOrInteger(input.groupAssignee, "groupAssignee"),
    notify_all: optionalBoolean(input.notifyAll),
  });
}

function buildUpdateCommentBody(input: Record<string, unknown>) {
  return compactObject({
    comment_text: requireString(input.commentText, "commentText"),
    assignee: optionalInteger(input.assignee),
    group_assignee: normalizeStringOrInteger(input.groupAssignee, "groupAssignee"),
    resolved: optionalBoolean(input.resolved),
  });
}

function buildCreateTaskBody(input: Record<string, unknown>) {
  return compactObject({
    name: requireString(input.name, "name"),
    description: optionalString(input.description),
    markdown_content: optionalString(input.markdownContent),
    assignees: normalizeIntegerArray(input.assigneeIds, "assigneeIds"),
    group_assignees: normalizeIntegerArray(input.groupAssigneeIds, "groupAssigneeIds"),
    tags: normalizeStringArray(input.tags, "tags"),
    status: optionalString(input.status),
    priority: normalizeNullableInteger(input.priority, "priority"),
    due_date: optionalInteger(input.dueDate),
    due_date_time: optionalBoolean(input.dueDateTime),
    start_date: optionalInteger(input.startDate),
    start_date_time: optionalBoolean(input.startDateTime),
    notify_all: optionalBoolean(input.notifyAll),
    parent: normalizeNullableString(input.parentTaskId, "parentTaskId"),
    links_to: normalizeNullableString(input.linksToTaskId, "linksToTaskId"),
    time_estimate: optionalInteger(input.timeEstimate),
    points: optionalNumber(input.points),
    custom_fields: normalizeRecordArray(input.customFields, "customFields"),
    custom_item_id: optionalInteger(input.customItemId),
    check_required_custom_fields: optionalBoolean(input.checkRequiredCustomFields),
  });
}

function buildUpdateTaskBody(input: Record<string, unknown>) {
  const assigneeUpdates = buildAssigneeUpdates(input);
  const customItemId = normalizeNullableInteger(input.customItemId, "customItemId");
  const hasWritableField =
    optionalString(input.name) !== undefined ||
    optionalString(input.description) !== undefined ||
    optionalString(input.markdownContent) !== undefined ||
    optionalString(input.status) !== undefined ||
    optionalInteger(input.priority) !== undefined ||
    optionalInteger(input.dueDate) !== undefined ||
    optionalBoolean(input.dueDateTime) !== undefined ||
    optionalInteger(input.startDate) !== undefined ||
    optionalBoolean(input.startDateTime) !== undefined ||
    optionalBoolean(input.archived) !== undefined ||
    optionalString(input.parentTaskId) !== undefined ||
    optionalInteger(input.timeEstimate) !== undefined ||
    optionalNumber(input.points) !== undefined ||
    assigneeUpdates !== undefined ||
    customItemId !== undefined;

  if (!hasWritableField) {
    throw clickupRuntimeError("invalid_input", "at least one writable field is required", 400);
  }

  return compactObject({
    name: optionalString(input.name),
    description: optionalString(input.description),
    markdown_content: optionalString(input.markdownContent),
    status: optionalString(input.status),
    priority: optionalInteger(input.priority),
    due_date: optionalInteger(input.dueDate),
    due_date_time: optionalBoolean(input.dueDateTime),
    start_date: optionalInteger(input.startDate),
    start_date_time: optionalBoolean(input.startDateTime),
    archived: optionalBoolean(input.archived),
    parent: optionalString(input.parentTaskId),
    time_estimate: optionalInteger(input.timeEstimate),
    points: optionalNumber(input.points),
    assignees: assigneeUpdates,
    custom_item_id: customItemId,
  });
}

function buildAssigneeUpdates(input: Record<string, unknown>) {
  const add = normalizeIntegerArray(input.assigneeIdsToAdd, "assigneeIdsToAdd");
  const rem = normalizeIntegerArray(input.assigneeIdsToRemove, "assigneeIdsToRemove");
  if (!add && !rem) {
    return undefined;
  }
  return {
    add: add ?? [],
    rem: rem ?? [],
  };
}

function requireString(value: unknown, fieldName: string) {
  const parsed = optionalString(value);
  if (!parsed) {
    throw clickupRuntimeError("invalid_input", `${fieldName} is required`, 400);
  }
  return parsed;
}

function requireIdString(value: unknown, fieldName: string) {
  const parsed = asStringId(value);
  if (!parsed) {
    throw clickupRuntimeError("invalid_input", `${fieldName} is required`, 400);
  }
  return parsed;
}

function normalizeStringArray(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw clickupRuntimeError("invalid_input", `${fieldName} must be an array`, 400);
  }
  return value.map((item) => requireString(item, fieldName));
}

function normalizeIntegerArray(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw clickupRuntimeError("invalid_input", `${fieldName} must be an array`, 400);
  }
  return value.map((item) => {
    const parsed = optionalInteger(item);
    if (parsed === undefined) {
      throw clickupRuntimeError("invalid_input", `${fieldName} must contain integers`, 400);
    }
    return parsed;
  });
}

function normalizeIntegerOrNone(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (value === "none") {
    return value;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw clickupRuntimeError("invalid_input", `${fieldName} must be an integer or "none"`, 400);
  }
  return parsed;
}

function normalizeNullableInteger(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return value;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw clickupRuntimeError("invalid_input", `${fieldName} must be an integer or null`, 400);
  }
  return parsed;
}

function normalizeStringOrInteger(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw clickupRuntimeError("invalid_input", `${fieldName} must be a string or integer`, 400);
  }
  return parsed;
}

function normalizeStringIntegerOrNull(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw clickupRuntimeError("invalid_input", `${fieldName} must be a string, integer, or null`, 400);
  }
  return parsed;
}

function normalizeNullableString(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value !== "string") {
    throw clickupRuntimeError("invalid_input", `${fieldName} must be a string or null`, 400);
  }
  return value;
}

function resolveDependencyTarget(input: Record<string, unknown>) {
  const dependsOnTaskId = optionalString(input.dependsOnTaskId);
  const dependencyOfTaskId = optionalString(input.dependencyOfTaskId);
  const provided = Number(Boolean(dependsOnTaskId)) + Number(Boolean(dependencyOfTaskId));
  if (provided !== 1) {
    throw clickupRuntimeError("invalid_input", "exactly one dependency target field is required", 400);
  }
  return compactObject({
    depends_on: dependsOnTaskId,
    dependency_of: dependencyOfTaskId,
  });
}

function normalizeMoveTaskStatusMappings(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw clickupRuntimeError("invalid_input", "statusMappings must be an array", 400);
  }
  return value.map((entry) => {
    const parsedEntry = optionalRecord(entry);
    if (!parsedEntry) {
      throw clickupRuntimeError("invalid_input", "statusMappings must contain objects", 400);
    }
    return compactObject({
      source_status: requireString(parsedEntry.sourceStatus, "statusMappings.sourceStatus"),
      destination_status: requireString(parsedEntry.destinationStatus, "statusMappings.destinationStatus"),
    });
  });
}

function normalizeOptionalObject(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  const parsed = optionalRecord(value);
  if (!parsed) {
    throw clickupRuntimeError("invalid_input", `${fieldName} must be an object`, 400);
  }
  return parsed;
}

function normalizeRecordArray(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw clickupRuntimeError("invalid_input", `${fieldName} must be an array`, 400);
  }
  return value.map((item) => {
    const parsed = optionalRecord(item);
    if (!parsed) {
      throw clickupRuntimeError("invalid_input", `${fieldName} must contain objects`, 400);
    }
    return parsed;
  });
}

function asStringId(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function compactQuery<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined)) as T;
}

function clickupRuntimeError(_code: string, message: string, status = 500): ProviderRequestError {
  return new ProviderRequestError(status, message);
}
