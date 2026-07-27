import type { AsanaActionHandler, AsanaContext } from "./runtime.ts";

import {
  compactObject,
  nullableString,
  optionalBoolean,
  optionalRawString,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  asanaInvalidInputError,
  asanaPathGid,
  buildAsanaFieldsQuery,
  buildAsanaPaginationQuery,
  compactAsanaQuery,
  deleteAsanaResource,
  getAsanaResource,
  listAsanaResources,
  listAsanaUnpaginatedResources,
  requestAsana,
  requireNonEmptyAsanaBody,
  writeAsanaResource,
} from "./runtime.ts";

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
const defaultTaskJobFields = [
  "resource_subtype",
  "status",
  "new_task",
  "new_task.name",
  "new_task.resource_subtype",
  "new_task.created_by",
];

export const taskActionHandlers: Record<string, AsanaActionHandler> = {
  list_tasks(input, context) {
    assertGeneralTaskListFilters(input);
    return listAsanaResources(
      "/tasks",
      compactAsanaQuery({
        assignee: optionalString(input.assignee),
        project: optionalString(input.projectId),
        section: optionalString(input.sectionId),
        workspace: optionalString(input.workspaceId),
        completed_since: optionalString(input.completedSince),
        modified_since: optionalString(input.modifiedSince),
        ...buildAsanaPaginationQuery(input, defaultTaskFields),
      }),
      "tasks",
      context,
    );
  },

  list_project_tasks(input, context) {
    return listTaskCollection(`/projects/${asanaPathGid(input.projectId, "projectId")}/tasks`, input, context, true);
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
    return writeAsanaResource("/tasks", buildCreateTaskBody(input, true), "task", context, {
      method: "POST",
      query: buildAsanaFieldsQuery(input, defaultTaskFields),
    });
  },

  update_task(input, context) {
    return writeAsanaResource(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}`,
      buildUpdateTaskBody(input),
      "task",
      context,
      {
        method: "PUT",
        query: buildAsanaFieldsQuery(input, defaultTaskFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  delete_task(input, context) {
    return deleteAsanaResource(`/tasks/${asanaPathGid(input.taskId, "taskId")}`, context, true);
  },

  duplicate_task(input, context) {
    return writeAsanaResource(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/duplicate`,
      compactObject({
        name: optionalRawString(input.name),
        include: optionalDelimitedStringArray(input.include, "include"),
      }),
      "job",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultTaskJobFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  list_section_tasks(input, context) {
    return listTaskCollection(`/sections/${asanaPathGid(input.sectionId, "sectionId")}/tasks`, input, context, true);
  },

  list_tag_tasks(input, context) {
    return listTaskCollection(`/tags/${asanaPathGid(input.tagId, "tagId")}/tasks`, input, context);
  },

  list_user_task_list_tasks(input, context) {
    return listTaskCollection(
      `/user_task_lists/${asanaPathGid(input.userTaskListId, "userTaskListId")}/tasks`,
      input,
      context,
      true,
    );
  },

  list_subtasks(input, context) {
    return listTaskCollection(`/tasks/${asanaPathGid(input.taskId, "taskId")}/subtasks`, input, context);
  },

  create_subtask(input, context) {
    return writeAsanaResource(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/subtasks`,
      buildCreateTaskBody(input, false),
      "task",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultTaskFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  set_task_parent(input, context) {
    assertOptionalPlacement(input);
    if (input.parentId === undefined) {
      throw asanaInvalidInputError("parentId is required.");
    }
    if (input.parentId === null && (input.insertBefore !== undefined || input.insertAfter !== undefined)) {
      throw asanaInvalidInputError("insertBefore and insertAfter cannot be used when removing a task parent.");
    }
    return writeAsanaResource(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/setParent`,
      compactObject({
        parent: nullableString(input.parentId),
        insert_before: nullableString(input.insertBefore),
        insert_after: nullableString(input.insertAfter),
      }),
      "task",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultTaskFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  list_task_dependencies(input, context) {
    return listTaskCollection(`/tasks/${asanaPathGid(input.taskId, "taskId")}/dependencies`, input, context);
  },

  add_task_dependencies(input, context) {
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/addDependencies`,
      { dependencies: requiredNonEmptyStringArray(input.dependencyIds, "dependencyIds") },
      input,
      context,
    );
  },

  remove_task_dependencies(input, context) {
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/removeDependencies`,
      { dependencies: requiredNonEmptyStringArray(input.dependencyIds, "dependencyIds") },
      input,
      context,
    );
  },

  list_task_dependents(input, context) {
    return listTaskCollection(`/tasks/${asanaPathGid(input.taskId, "taskId")}/dependents`, input, context);
  },

  add_task_dependents(input, context) {
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/addDependents`,
      { dependents: requiredNonEmptyStringArray(input.dependentIds, "dependentIds") },
      input,
      context,
    );
  },

  remove_task_dependents(input, context) {
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/removeDependents`,
      { dependents: requiredNonEmptyStringArray(input.dependentIds, "dependentIds") },
      input,
      context,
    );
  },

  add_task_project(input, context) {
    assertOptionalPlacement(input);
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/addProject`,
      compactObject({
        project: requiredString(input.projectId, "projectId", asanaInvalidInputError),
        section: nullableString(input.sectionId),
        insert_before: nullableString(input.insertBefore),
        insert_after: nullableString(input.insertAfter),
      }),
      input,
      context,
    );
  },

  remove_task_project(input, context) {
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/removeProject`,
      { project: requiredString(input.projectId, "projectId", asanaInvalidInputError) },
      input,
      context,
    );
  },

  add_task_tag(input, context) {
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/addTag`,
      { tag: requiredString(input.tagId, "tagId", asanaInvalidInputError) },
      input,
      context,
    );
  },

  remove_task_tag(input, context) {
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/removeTag`,
      { tag: requiredString(input.tagId, "tagId", asanaInvalidInputError) },
      input,
      context,
    );
  },

  add_task_followers(input, context) {
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/addFollowers`,
      { followers: requiredNonEmptyStringArray(input.followerIds, "followerIds") },
      input,
      context,
    );
  },

  remove_task_followers(input, context) {
    return writeTaskAssociation(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/removeFollowers`,
      { followers: requiredNonEmptyStringArray(input.followerIds, "followerIds") },
      input,
      context,
    );
  },

  get_task_by_custom_id(input, context) {
    return getAsanaResource(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/tasks/custom_id/${asanaPathGid(
        input.customId,
        "customId",
      )}`,
      {},
      "task",
      context,
    );
  },

  search_workspace_tasks(input, context) {
    const customTypeQuery = buildCustomTaskTypeSearchQuery(input);
    return listAsanaUnpaginatedResources(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/tasks/search`,
      compactAsanaQuery({
        limit: typeof input.limit === "number" ? String(input.limit) : undefined,
        text: optionalRawString(input.text),
        resource_subtype: optionalString(input.resourceSubtype),
        "assignee.any": optionalDelimitedStringArray(input.assigneeIds, "assigneeIds"),
        "assignee.not": optionalDelimitedStringArray(input.excludedAssigneeIds, "excludedAssigneeIds"),
        "portfolios.any": optionalDelimitedStringArray(input.portfolioIds, "portfolioIds"),
        "projects.any": optionalDelimitedStringArray(input.projectIds, "projectIds"),
        "projects.not": optionalDelimitedStringArray(input.excludedProjectIds, "excludedProjectIds"),
        "projects.all": optionalDelimitedStringArray(input.allProjectIds, "allProjectIds"),
        "sections.any": optionalDelimitedStringArray(input.sectionIds, "sectionIds"),
        "sections.not": optionalDelimitedStringArray(input.excludedSectionIds, "excludedSectionIds"),
        "sections.all": optionalDelimitedStringArray(input.allSectionIds, "allSectionIds"),
        "tags.any": optionalDelimitedStringArray(input.tagIds, "tagIds"),
        "tags.not": optionalDelimitedStringArray(input.excludedTagIds, "excludedTagIds"),
        "tags.all": optionalDelimitedStringArray(input.allTagIds, "allTagIds"),
        "teams.any": optionalDelimitedStringArray(input.teamIds, "teamIds"),
        "followers.any": optionalDelimitedStringArray(input.followerIds, "followerIds"),
        "followers.not": optionalDelimitedStringArray(input.excludedFollowerIds, "excludedFollowerIds"),
        "created_by.any": optionalDelimitedStringArray(input.creatorIds, "creatorIds"),
        "created_by.not": optionalDelimitedStringArray(input.excludedCreatorIds, "excludedCreatorIds"),
        "assigned_by.any": optionalDelimitedStringArray(input.assignedByIds, "assignedByIds"),
        "assigned_by.not": optionalDelimitedStringArray(input.excludedAssignedByIds, "excludedAssignedByIds"),
        "liked_by.not": optionalDelimitedStringArray(input.excludedLikerIds, "excludedLikerIds"),
        "commented_on_by.not": optionalDelimitedStringArray(input.excludedCommenterIds, "excludedCommenterIds"),
        due_on: nullableSearchDate(input.dueOn),
        "due_on.before": optionalString(input.dueOnBefore),
        "due_on.after": optionalString(input.dueOnAfter),
        "due_at.before": optionalString(input.dueAtBefore),
        "due_at.after": optionalString(input.dueAtAfter),
        start_on: nullableSearchDate(input.startOn),
        "start_on.before": optionalString(input.startOnBefore),
        "start_on.after": optionalString(input.startOnAfter),
        created_on: nullableSearchDate(input.createdOn),
        "created_on.before": optionalString(input.createdOnBefore),
        "created_on.after": optionalString(input.createdOnAfter),
        "created_at.before": optionalString(input.createdAtBefore),
        "created_at.after": optionalString(input.createdAtAfter),
        completed_on: nullableSearchDate(input.completedOn),
        "completed_on.before": optionalString(input.completedOnBefore),
        "completed_on.after": optionalString(input.completedOnAfter),
        "completed_at.before": optionalString(input.completedAtBefore),
        "completed_at.after": optionalString(input.completedAtAfter),
        modified_on: nullableSearchDate(input.modifiedOn),
        "modified_on.before": optionalString(input.modifiedOnBefore),
        "modified_on.after": optionalString(input.modifiedOnAfter),
        "modified_at.before": optionalString(input.modifiedAtBefore),
        "modified_at.after": optionalString(input.modifiedAtAfter),
        is_blocking: booleanString(input.isBlocking),
        is_blocked: booleanString(input.isBlocked),
        has_attachment: booleanString(input.hasAttachment),
        completed: booleanString(input.completed),
        is_subtask: booleanString(input.isSubtask),
        sort_by: optionalString(input.sortBy),
        sort_ascending: booleanString(input.sortAscending),
        ...buildTaskCustomFieldSearchQuery(input.customFieldFilters),
        ...customTypeQuery,
        ...buildAsanaFieldsQuery(input, defaultTaskFields),
      }),
      "tasks",
      context,
    );
  },
};

function listTaskCollection(
  path: string,
  input: Record<string, unknown>,
  context: AsanaContext,
  supportsCompletedSince = false,
): Promise<Record<string, unknown>> {
  return listAsanaResources(
    path,
    compactAsanaQuery({
      completed_since: supportsCompletedSince ? optionalString(input.completedSince) : undefined,
      ...buildAsanaPaginationQuery(input, defaultTaskFields),
    }),
    "tasks",
    context,
  );
}

function buildCreateTaskBody(input: Record<string, unknown>, requireLocation: boolean): Record<string, unknown> {
  assertTaskMutationConstraints(input);
  const projects = readCreateProjectIds(input);
  const workspace = optionalString(input.workspaceId);
  const parent = optionalString(input.parentId);
  if (requireLocation && projects === undefined && !workspace && !parent) {
    throw asanaInvalidInputError("projectId, non-empty projectIds, workspaceId, or parentId is required.");
  }

  return compactObject({
    ...buildTaskMutationBody(input, false),
    name: requiredString(input.name, "name", asanaInvalidInputError),
    projects,
    workspace,
    parent,
    followers: optionalNonEmptyStringArray(input.followerIds, "followerIds"),
    tags: optionalNonEmptyStringArray(input.tagIds, "tagIds"),
  });
}

function buildUpdateTaskBody(input: Record<string, unknown>): Record<string, unknown> {
  assertTaskMutationConstraints(input);
  const body = buildTaskMutationBody(input, true);
  requireNonEmptyAsanaBody(body, "At least one task field must be provided.");
  return body;
}

function buildTaskMutationBody(input: Record<string, unknown>, includeUpdateOnly: boolean): Record<string, unknown> {
  return compactObject({
    name: optionalString(input.name),
    notes: optionalRawString(input.notes),
    html_notes: optionalRawString(input.htmlNotes),
    assignee: nullableString(input.assignee),
    assignee_section: nullableString(input.assigneeSectionId),
    completed: optionalBoolean(input.completed),
    due_on: nullableString(input.dueOn),
    due_at: nullableString(input.dueAt),
    start_on: nullableString(input.startOn),
    start_at: nullableString(input.startAt),
    approval_status: optionalString(input.approvalStatus),
    resource_subtype: optionalString(input.resourceSubtype),
    custom_fields: optionalRecord(input.customFields),
    custom_type: includeUpdateOnly ? nullableString(input.customTypeId) : undefined,
    custom_type_status_option: includeUpdateOnly ? nullableString(input.customTypeStatusOptionId) : undefined,
    liked: optionalBoolean(input.liked),
  });
}

function assertTaskMutationConstraints(input: Record<string, unknown>): void {
  if (input.notes !== undefined && input.htmlNotes !== undefined) {
    throw asanaInvalidInputError("notes and htmlNotes cannot both be provided.");
  }
  const dueOn = optionalString(input.dueOn);
  const dueAt = optionalString(input.dueAt);
  const startOn = optionalString(input.startOn);
  const startAt = optionalString(input.startAt);
  if (dueOn && dueAt) {
    throw asanaInvalidInputError("dueOn and dueAt cannot both be provided.");
  }
  if (startOn && startAt) {
    throw asanaInvalidInputError("startOn and startAt cannot both be provided.");
  }
  if (input.startAt !== undefined && input.dueAt === undefined) {
    throw asanaInvalidInputError("startAt requires dueAt to be provided.");
  }
  if (startAt && !dueAt) {
    throw asanaInvalidInputError("A non-null startAt requires a non-null dueAt.");
  }
  if (input.startOn !== undefined && input.dueOn === undefined && input.dueAt === undefined) {
    throw asanaInvalidInputError("startOn requires dueOn or dueAt to be provided.");
  }
  if (startOn && !dueOn && !dueAt) {
    throw asanaInvalidInputError("A non-null startOn requires a non-null dueOn or dueAt.");
  }
}

function assertGeneralTaskListFilters(input: Record<string, unknown>): void {
  if (input.tagId !== undefined) {
    throw asanaInvalidInputError("tagId is not supported by list_tasks; use list_tag_tasks instead.");
  }
  const assignee = optionalString(input.assignee);
  const workspace = optionalString(input.workspaceId);
  if (!!assignee !== !!workspace) {
    throw asanaInvalidInputError("assignee and workspaceId must be provided together.");
  }
  if (!optionalString(input.projectId) && !optionalString(input.sectionId) && !(assignee && workspace)) {
    throw asanaInvalidInputError("projectId, sectionId, or both assignee and workspaceId are required.");
  }
}

async function writeTaskAssociation(
  path: string,
  body: Record<string, unknown>,
  input: Record<string, unknown>,
  context: AsanaContext,
): Promise<Record<string, unknown>> {
  const payload = await requestAsana({
    path,
    context,
    method: "POST",
    query: Object.keys(body).includes("followers") ? buildAsanaFieldsQuery(input, defaultTaskFields) : undefined,
    body,
    notFoundAsInvalidInput: true,
  });
  const data = requiredRecord(
    payload.data,
    "asana task association response",
    (message) => new ProviderRequestError(502, message),
  );
  return Object.keys(data).length === 0 ? { success: true } : { task: data };
}

function readCreateProjectIds(input: Record<string, unknown>): string[] | undefined {
  const legacyProjectId = optionalString(input.projectId);
  const projectIds = optionalNonEmptyStringArray(input.projectIds, "projectIds") ?? [];
  const values = [...new Set([...(legacyProjectId ? [legacyProjectId] : []), ...projectIds])];
  return values.length > 0 ? values : undefined;
}

function requiredNonEmptyStringArray(value: unknown, fieldName: string): string[] {
  const values = requiredStringArray(value, fieldName, asanaInvalidInputError)
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length === 0) {
    throw asanaInvalidInputError(`${fieldName} must contain at least one value.`);
  }
  return values;
}

function optionalNonEmptyStringArray(value: unknown, fieldName: string): string[] | undefined {
  return value === undefined ? undefined : requiredNonEmptyStringArray(value, fieldName);
}

function optionalDelimitedStringArray(value: unknown, fieldName: string): string | undefined {
  return optionalNonEmptyStringArray(value, fieldName)?.join(",");
}

function assertOptionalPlacement(input: Record<string, unknown>): void {
  if (input.insertBefore !== undefined && input.insertAfter !== undefined) {
    throw asanaInvalidInputError("insertBefore and insertAfter cannot both be provided.");
  }
}

function booleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function nullableSearchDate(value: unknown): string | undefined {
  return value === null ? "null" : optionalString(value);
}

function buildTaskCustomFieldSearchQuery(value: unknown): Record<string, string> {
  if (value === undefined) {
    return {};
  }
  if (!Array.isArray(value)) {
    throw asanaInvalidInputError("customFieldFilters must be an array.");
  }

  const query: Record<string, string> = {};
  for (const [index, item] of value.entries()) {
    const filter = requiredRecord(item, `customFieldFilters[${index}]`, asanaInvalidInputError);
    const customFieldId = requiredString(
      filter.customFieldId,
      `customFieldFilters[${index}].customFieldId`,
      asanaInvalidInputError,
    );
    const conditions = compactAsanaQuery({
      is_set: booleanString(filter.isSet),
      value: searchFilterScalar(filter.value),
      starts_with: optionalRawString(filter.startsWith),
      ends_with: optionalRawString(filter.endsWith),
      contains: optionalRawString(filter.contains),
      less_than: searchFilterNumber(filter.lessThan),
      greater_than: searchFilterNumber(filter.greaterThan),
      before: optionalString(filter.before),
      after: optionalString(filter.after),
    });
    requireNonEmptyAsanaBody(conditions, `customFieldFilters[${index}] must include at least one condition.`);
    for (const [name, condition] of Object.entries(conditions)) {
      query[`custom_fields.${customFieldId}.${name}`] = condition;
    }
  }
  return query;
}

function buildCustomTaskTypeSearchQuery(input: Record<string, unknown>): Record<string, string> {
  if (input.customTypeFilter === undefined) {
    return {};
  }
  if (optionalString(input.resourceSubtype) !== "custom") {
    throw asanaInvalidInputError("customTypeFilter requires resourceSubtype to be custom.");
  }
  const filter = requiredRecord(input.customTypeFilter, "customTypeFilter", asanaInvalidInputError);
  const customTypeId = requiredString(filter.customTypeId, "customTypeFilter.customTypeId", asanaInvalidInputError);
  const statusOptionId = requiredString(
    filter.statusOptionId,
    "customTypeFilter.statusOptionId",
    asanaInvalidInputError,
  );
  return { [`custom_types.${customTypeId}.custom_type_status_option.gid`]: statusOptionId };
}

function searchFilterScalar(value: unknown): string | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  return optionalRawString(value);
}

function searchFilterNumber(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}
