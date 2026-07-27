import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { AsanaActionHandler, AsanaContext } from "./runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError, requireApiKeyCredential } from "../provider-runtime.ts";
import { workspaceUserTeamActionHandlers } from "./runtime-workspaces-users-teams.ts";
import {
  asanaApiBaseUrl,
  asanaInvalidInputError,
  asanaPathGid,
  buildAsanaFieldsQuery,
  buildAsanaPaginationQuery,
  compactAsanaQuery,
  getAsanaResource,
  listAsanaResources,
  requestAsana,
  requireNonEmptyAsanaBody,
  writeAsanaResource,
} from "./runtime.ts";

const service = "asana";
const asanaValidationPath = "/users/me";

const defaultProjectFields = [
  "name",
  "archived",
  "color",
  "icon",
  "notes",
  "due_on",
  "start_on",
  "default_view",
  "privacy_setting",
  "default_access_level",
  "created_at",
  "modified_at",
  "owner",
  "owner.name",
  "workspace",
  "workspace.name",
  "permalink_url",
];
const defaultTaskFields = [
  "name",
  "resource_subtype",
  "completed",
  "completed_at",
  "created_at",
  "modified_at",
  "notes",
  "due_on",
  "due_at",
  "start_on",
  "start_at",
  "approval_status",
  "assignee",
  "assignee.name",
  "workspace",
  "workspace.name",
  "projects",
  "projects.name",
  "permalink_url",
];

export const asanaActionHandlers: Record<string, AsanaActionHandler> = {
  list_projects(input, context) {
    return listAsanaResources(
      "/projects",
      compactAsanaQuery({
        workspace: requiredString(input.workspaceId, "workspaceId", asanaInvalidInputError),
        archived: booleanToString(input.archived),
        ...buildAsanaPaginationQuery(input, defaultProjectFields),
      }),
      "projects",
      context,
    );
  },

  get_project(input, context) {
    return getAsanaResource(
      `/projects/${asanaPathGid(input.projectId, "projectId")}`,
      buildAsanaFieldsQuery(input, defaultProjectFields),
      "project",
      context,
    );
  },

  create_project(input, context) {
    return writeAsanaResource("/projects", buildCreateProjectBody(input), "project", context, { method: "POST" });
  },

  update_project(input, context) {
    return writeAsanaResource(
      `/projects/${asanaPathGid(input.projectId, "projectId")}`,
      buildUpdateProjectBody(input),
      "project",
      context,
      { method: "PUT", notFoundAsInvalidInput: true },
    );
  },

  list_project_tasks(input, context) {
    return listAsanaResources(
      `/projects/${asanaPathGid(input.projectId, "projectId")}/tasks`,
      compactAsanaQuery({
        completed_since: optionalString(input.completedSince),
        ...buildAsanaPaginationQuery(input, defaultTaskFields),
      }),
      "tasks",
      context,
    );
  },

  get_task(input, context) {
    return getAsanaResource(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}`,
      buildAsanaFieldsQuery(input, defaultTaskFields),
      "task",
      context,
    );
  },

  create_task(input, context) {
    return writeAsanaResource("/tasks", buildCreateTaskBody(input), "task", context, { method: "POST" });
  },

  update_task(input, context) {
    return writeAsanaResource(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}`,
      buildUpdateTaskBody(input),
      "task",
      context,
      { method: "PUT", notFoundAsInvalidInput: true },
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AsanaContext>({
  service,
  handlers: Object.assign({}, workspaceUserTeamActionHandlers, asanaActionHandlers),
  async createContext(context, fetcher): Promise<AsanaContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestAsana({
      path: asanaValidationPath,
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
      query: {
        opt_fields: ["name", "email", "workspaces", "workspaces.name"].join(","),
      },
    });

    const user = requiredRecord(
      payload.data,
      "asana user response",
      (message) => new ProviderRequestError(502, message),
    );
    const userId = optionalString(user.gid);
    const name = optionalString(user.name);
    const email = optionalString(user.email);
    const workspaces = Array.isArray(user.workspaces)
      ? user.workspaces.map((workspace) => optionalRecord(workspace)).filter((workspace) => !!workspace)
      : [];
    const workspaceNames = workspaces
      .map((workspace) => optionalString(workspace.name))
      .filter((workspaceName) => !!workspaceName);

    return {
      profile: {
        accountId: userId,
        displayName: name ?? email ?? "Asana PAT",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: asanaApiBaseUrl,
        validationEndpoint: asanaValidationPath,
        userId,
        name,
        email,
        workspaceCount: workspaces.length,
        workspaceNames,
      }),
    };
  },
};

function buildCreateProjectBody(input: Record<string, unknown>): Record<string, unknown> {
  assertProjectDateRange(input);
  return compactObject({
    workspace: requiredString(input.workspaceId, "workspaceId", asanaInvalidInputError),
    name: requiredString(input.name, "name", asanaInvalidInputError),
    notes: optionalString(input.notes),
    owner: optionalString(input.owner),
    due_on: optionalString(input.dueOn),
    start_on: optionalString(input.startOn),
    privacy_setting: optionalString(input.privacySetting),
    default_view: optionalString(input.defaultView),
    default_access_level: optionalString(input.defaultAccessLevel),
    color: optionalString(input.color),
    icon: optionalString(input.icon),
    custom_fields: optionalRecord(input.customFields),
    archived: optionalBoolean(input.archived),
  });
}

function buildUpdateProjectBody(input: Record<string, unknown>): Record<string, unknown> {
  assertProjectDateRange(input);
  const body = compactObject({
    name: optionalString(input.name),
    notes: optionalString(input.notes),
    owner: optionalString(input.owner),
    due_on: optionalString(input.dueOn),
    start_on: optionalString(input.startOn),
    privacy_setting: optionalString(input.privacySetting),
    default_view: optionalString(input.defaultView),
    default_access_level: optionalString(input.defaultAccessLevel),
    color: optionalString(input.color),
    icon: optionalString(input.icon),
    custom_fields: optionalRecord(input.customFields),
    archived: optionalBoolean(input.archived),
  });
  requireNonEmptyAsanaBody(body, "At least one project field must be provided.");
  return body;
}

function buildCreateTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  assertTaskDateRange(input);
  return compactObject({
    name: requiredString(input.name, "name", asanaInvalidInputError),
    notes: optionalString(input.notes),
    assignee: optionalString(input.assignee),
    completed: optionalBoolean(input.completed),
    due_on: optionalString(input.dueOn),
    due_at: optionalString(input.dueAt),
    start_on: optionalString(input.startOn),
    start_at: optionalString(input.startAt),
    approval_status: optionalString(input.approvalStatus),
    resource_subtype: optionalString(input.resourceSubtype),
    custom_fields: optionalRecord(input.customFields),
    projects: [requiredString(input.projectId, "projectId", asanaInvalidInputError)],
  });
}

function buildUpdateTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  assertTaskDateRange(input);
  const body = compactObject({
    name: optionalString(input.name),
    notes: optionalString(input.notes),
    assignee: optionalString(input.assignee),
    completed: optionalBoolean(input.completed),
    due_on: optionalString(input.dueOn),
    due_at: optionalString(input.dueAt),
    start_on: optionalString(input.startOn),
    start_at: optionalString(input.startAt),
    approval_status: optionalString(input.approvalStatus),
    resource_subtype: optionalString(input.resourceSubtype),
    custom_fields: optionalRecord(input.customFields),
  });
  requireNonEmptyAsanaBody(body, "At least one task field must be provided.");
  return body;
}

function assertProjectDateRange(input: Record<string, unknown>): void {
  if (optionalString(input.startOn) && !optionalString(input.dueOn)) {
    throw new ProviderRequestError(400, "startOn requires dueOn.");
  }
}

function assertTaskDateRange(input: Record<string, unknown>): void {
  const dueOn = optionalString(input.dueOn);
  const dueAt = optionalString(input.dueAt);
  const startOn = optionalString(input.startOn);
  const startAt = optionalString(input.startAt);

  if (dueOn && dueAt) {
    throw new ProviderRequestError(400, "dueOn and dueAt cannot both be provided.");
  }
  if (startOn && startAt) {
    throw new ProviderRequestError(400, "startOn and startAt cannot both be provided.");
  }
  if ((startOn || startAt) && !dueOn && !dueAt) {
    throw new ProviderRequestError(400, "A task start date requires dueOn or dueAt.");
  }
}

function booleanToString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}
