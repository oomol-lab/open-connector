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
import { projectSectionActionHandlers } from "./runtime-projects-sections.ts";
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
  handlers: Object.assign({}, workspaceUserTeamActionHandlers, projectSectionActionHandlers, asanaActionHandlers),
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
