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

const defaultProjectFields = [
  "name",
  "archived",
  "color",
  "icon",
  "notes",
  "html_notes",
  "due_on",
  "start_on",
  "default_view",
  "privacy_setting",
  "default_access_level",
  "minimum_access_level_for_customization",
  "minimum_access_level_for_sharing",
  "created_at",
  "modified_at",
  "owner",
  "owner.name",
  "workspace",
  "workspace.name",
  "team",
  "team.name",
  "members",
  "members.name",
  "followers",
  "followers.name",
  "permalink_url",
];
const defaultJobFields = ["resource_subtype", "status", "new_project", "new_project.name"];
const defaultCustomFieldSettingFields = [
  "custom_field",
  "custom_field.name",
  "is_important",
  "parent",
  "parent.name",
  "project",
  "project.name",
];
const defaultTaskCountFields = [
  "num_tasks",
  "num_incomplete_tasks",
  "num_completed_tasks",
  "num_milestones",
  "num_incomplete_milestones",
  "num_completed_milestones",
];
const defaultSectionFields = ["name", "created_at", "project", "project.name"];

export const projectSectionActionHandlers: Record<string, AsanaActionHandler> = {
  list_projects(input, context) {
    const location = readExclusiveProjectLocation(input);
    return listAsanaResources(
      "/projects",
      compactAsanaQuery({
        [location.key]: location.value,
        archived: booleanString(input.archived),
        ...buildAsanaPaginationQuery(input, defaultProjectFields),
      }),
      "projects",
      context,
    );
  },

  create_project(input, context) {
    const location = readExclusiveProjectLocation(input);
    return writeAsanaResource(
      "/projects",
      {
        [location.key]: location.value,
        ...buildProjectMutationBody(input, true),
      },
      "project",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultProjectFields),
      },
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

  update_project(input, context) {
    return writeAsanaResource(
      `/projects/${asanaPathGid(input.projectId, "projectId")}`,
      buildProjectMutationBody(input, false),
      "project",
      context,
      {
        method: "PUT",
        query: buildAsanaFieldsQuery(input, defaultProjectFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  delete_project(input, context) {
    return deleteAsanaResource(`/projects/${asanaPathGid(input.projectId, "projectId")}`, context, true);
  },

  async duplicate_project(input, context) {
    const include = optionalDelimitedStringArray(input.include, "include");
    const scheduleDates = buildScheduleDates(input.scheduleDates);
    if (scheduleDates && !include?.split(",").includes("task_dates")) {
      throw asanaInvalidInputError("scheduleDates requires include to contain task_dates.");
    }
    const payload = await requestAsana({
      path: `/projects/${asanaPathGid(input.projectId, "projectId")}/duplicate`,
      context,
      method: "POST",
      query: buildAsanaFieldsQuery(input, defaultJobFields),
      body: compactObject({
        name: requiredString(input.name, "name", asanaInvalidInputError),
        include,
        schedule_dates: scheduleDates,
      }),
      notFoundAsInvalidInput: true,
    });
    return {
      job: requiredRecord(payload.data, "asana job response", (message) => new ProviderRequestError(502, message)),
    };
  },

  list_task_projects(input, context) {
    return listAsanaResources(
      `/tasks/${asanaPathGid(input.taskId, "taskId")}/projects`,
      buildAsanaPaginationQuery(input, defaultProjectFields),
      "projects",
      context,
    );
  },

  list_team_projects(input, context) {
    return listAsanaResources(
      `/teams/${asanaPathGid(input.teamId, "teamId")}/projects`,
      compactAsanaQuery({
        archived: booleanString(input.archived),
        ...buildAsanaPaginationQuery(input, defaultProjectFields),
      }),
      "projects",
      context,
    );
  },

  create_team_project(input, context) {
    return writeAsanaResource(
      `/teams/${asanaPathGid(input.teamId, "teamId")}/projects`,
      buildProjectMutationBody(input, true),
      "project",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultProjectFields),
      },
    );
  },

  list_workspace_projects(input, context) {
    return listAsanaResources(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/projects`,
      compactAsanaQuery({
        archived: booleanString(input.archived),
        ...buildAsanaPaginationQuery(input, defaultProjectFields),
      }),
      "projects",
      context,
    );
  },

  create_workspace_project(input, context) {
    return writeAsanaResource(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/projects`,
      buildProjectMutationBody(input, true),
      "project",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultProjectFields),
      },
    );
  },

  search_workspace_projects(input, context) {
    return listAsanaUnpaginatedResources(
      `/workspaces/${asanaPathGid(input.workspaceId, "workspaceId")}/projects/search`,
      compactAsanaQuery({
        limit: typeof input.limit === "number" ? String(input.limit) : undefined,
        text: optionalString(input.text),
        sort_by: optionalString(input.sortBy),
        sort_ascending: booleanString(input.sortAscending),
        completed: booleanString(input.completed),
        "teams.any": optionalDelimitedStringArray(input.teamIds, "teamIds"),
        "owner.any": optionalDelimitedStringArray(input.ownerIds, "ownerIds"),
        "members.any": optionalDelimitedStringArray(input.memberIds, "memberIds"),
        "members.not": optionalDelimitedStringArray(input.excludedMemberIds, "excludedMemberIds"),
        "portfolios.any": optionalDelimitedStringArray(input.portfolioIds, "portfolioIds"),
        completed_on: nullableSearchDate(input.completedOn),
        "completed_on.before": optionalString(input.completedOnBefore),
        "completed_on.after": optionalString(input.completedOnAfter),
        "completed_at.before": optionalString(input.completedAtBefore),
        "completed_at.after": optionalString(input.completedAtAfter),
        created_on: nullableSearchDate(input.createdOn),
        "created_on.before": optionalString(input.createdOnBefore),
        "created_on.after": optionalString(input.createdOnAfter),
        "created_at.before": optionalString(input.createdAtBefore),
        "created_at.after": optionalString(input.createdAtAfter),
        due_on: nullableSearchDate(input.dueOn),
        "due_on.before": optionalString(input.dueOnBefore),
        "due_on.after": optionalString(input.dueOnAfter),
        "due_at.before": optionalString(input.dueAtBefore),
        "due_at.after": optionalString(input.dueAtAfter),
        start_on: nullableSearchDate(input.startOn),
        "start_on.before": optionalString(input.startOnBefore),
        "start_on.after": optionalString(input.startOnAfter),
        ...buildProjectCustomFieldSearchQuery(input.customFieldFilters),
        ...buildAsanaFieldsQuery(input, defaultProjectFields),
      }),
      "projects",
      context,
    );
  },

  add_project_custom_field(input, context) {
    assertOptionalPlacement(input);
    return writeAsanaResource(
      `/projects/${asanaPathGid(input.projectId, "projectId")}/addCustomFieldSetting`,
      compactObject({
        custom_field: requiredString(input.customFieldId, "customFieldId", asanaInvalidInputError),
        is_important: optionalBoolean(input.isImportant),
        insert_before: optionalString(input.insertBefore),
        insert_after: optionalString(input.insertAfter),
      }),
      "customFieldSetting",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultCustomFieldSettingFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  async remove_project_custom_field(input, context) {
    await requestAsana({
      path: `/projects/${asanaPathGid(input.projectId, "projectId")}/removeCustomFieldSetting`,
      context,
      method: "POST",
      body: {
        custom_field: requiredString(input.customFieldId, "customFieldId", asanaInvalidInputError),
      },
      notFoundAsInvalidInput: true,
    });
    return { success: true };
  },

  get_project_task_counts(input, context) {
    return getAsanaResource(
      `/projects/${asanaPathGid(input.projectId, "projectId")}/task_counts`,
      buildAsanaFieldsQuery(input, defaultTaskCountFields),
      "taskCounts",
      context,
    );
  },

  add_project_members(input, context) {
    return mutateProjectPeople(input, context, "members", "addMembers");
  },

  remove_project_members(input, context) {
    return mutateProjectPeople(input, context, "members", "removeMembers");
  },

  add_project_followers(input, context) {
    return mutateProjectPeople(input, context, "followers", "addFollowers");
  },

  remove_project_followers(input, context) {
    return mutateProjectPeople(input, context, "followers", "removeFollowers");
  },

  get_section(input, context) {
    return getAsanaResource(
      `/sections/${asanaPathGid(input.sectionId, "sectionId")}`,
      buildAsanaFieldsQuery(input, defaultSectionFields),
      "section",
      context,
    );
  },

  update_section(input, context) {
    return writeAsanaResource(
      `/sections/${asanaPathGid(input.sectionId, "sectionId")}`,
      { name: requiredString(input.name, "name", asanaInvalidInputError) },
      "section",
      context,
      {
        method: "PUT",
        query: buildAsanaFieldsQuery(input, defaultSectionFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  delete_section(input, context) {
    return deleteAsanaResource(`/sections/${asanaPathGid(input.sectionId, "sectionId")}`, context, true);
  },

  list_project_sections(input, context) {
    return listAsanaResources(
      `/projects/${asanaPathGid(input.projectId, "projectId")}/sections`,
      buildAsanaPaginationQuery(input, defaultSectionFields),
      "sections",
      context,
    );
  },

  create_project_section(input, context) {
    assertOptionalPlacement(input);
    return writeAsanaResource(
      `/projects/${asanaPathGid(input.projectId, "projectId")}/sections`,
      compactObject({
        name: requiredString(input.name, "name", asanaInvalidInputError),
        insert_before: optionalString(input.insertBefore),
        insert_after: optionalString(input.insertAfter),
      }),
      "section",
      context,
      {
        method: "POST",
        query: buildAsanaFieldsQuery(input, defaultSectionFields),
        notFoundAsInvalidInput: true,
      },
    );
  },

  async add_section_task(input, context) {
    assertOptionalPlacement(input);
    await requestAsana({
      path: `/sections/${asanaPathGid(input.sectionId, "sectionId")}/addTask`,
      context,
      method: "POST",
      body: compactObject({
        task: requiredString(input.taskId, "taskId", asanaInvalidInputError),
        insert_before: optionalString(input.insertBefore),
        insert_after: optionalString(input.insertAfter),
      }),
      notFoundAsInvalidInput: true,
    });
    return { success: true };
  },

  async insert_project_section(input, context) {
    const beforeSection = optionalString(input.beforeSectionId);
    const afterSection = optionalString(input.afterSectionId);
    if ((beforeSection ? 1 : 0) + (afterSection ? 1 : 0) !== 1) {
      throw asanaInvalidInputError("Exactly one of beforeSectionId or afterSectionId must be provided.");
    }
    await requestAsana({
      path: `/projects/${asanaPathGid(input.projectId, "projectId")}/sections/insert`,
      context,
      method: "POST",
      body: compactObject({
        section: requiredString(input.sectionId, "sectionId", asanaInvalidInputError),
        before_section: beforeSection,
        after_section: afterSection,
      }),
      notFoundAsInvalidInput: true,
    });
    return { success: true };
  },
};

interface ProjectLocation {
  key: "workspace" | "team";
  value: string;
}

function readExclusiveProjectLocation(input: Record<string, unknown>): ProjectLocation {
  const workspace = optionalString(input.workspaceId);
  const team = optionalString(input.teamId);
  if ((workspace ? 1 : 0) + (team ? 1 : 0) !== 1) {
    throw asanaInvalidInputError("Exactly one of workspaceId or teamId must be provided.");
  }
  return workspace ? { key: "workspace", value: workspace } : { key: "team", value: team! };
}

function buildProjectMutationBody(input: Record<string, unknown>, requireName: boolean): Record<string, unknown> {
  assertProjectNotes(input);
  assertProjectDates(input);
  const body = compactObject({
    name: requireName ? requiredString(input.name, "name", asanaInvalidInputError) : optionalString(input.name),
    archived: optionalBoolean(input.archived),
    color: nullableString(input.color),
    icon: nullableString(input.icon),
    notes: optionalRawString(input.notes),
    html_notes: optionalRawString(input.htmlNotes),
    due_on: nullableString(input.dueOn),
    start_on: nullableString(input.startOn),
    default_view: optionalString(input.defaultView),
    privacy_setting: optionalString(input.privacySetting),
    default_access_level: optionalString(input.defaultAccessLevel),
    minimum_access_level_for_customization: optionalString(input.minimumAccessLevelForCustomization),
    minimum_access_level_for_sharing: optionalString(input.minimumAccessLevelForSharing),
    custom_fields: optionalRecord(input.customFields),
    owner: nullableString(input.owner),
    followers: requireName ? optionalDelimitedStringArray(input.followers, "followers") : undefined,
  });
  if (!requireName) {
    requireNonEmptyAsanaBody(body, "At least one project field must be provided.");
  }
  return body;
}

function assertProjectNotes(input: Record<string, unknown>): void {
  if (Object.hasOwn(input, "notes") && Object.hasOwn(input, "htmlNotes")) {
    throw asanaInvalidInputError("notes and htmlNotes cannot both be provided.");
  }
}

function assertProjectDates(input: Record<string, unknown>): void {
  if (Object.hasOwn(input, "startOn") && !Object.hasOwn(input, "dueOn")) {
    throw asanaInvalidInputError("startOn requires dueOn in the same request.");
  }
  const startOn = optionalString(input.startOn);
  const dueOn = optionalString(input.dueOn);
  if (startOn && startOn === dueOn) {
    throw asanaInvalidInputError("startOn and dueOn cannot be the same date.");
  }
}

function buildScheduleDates(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const input = requiredRecord(value, "scheduleDates", asanaInvalidInputError);
  const shouldSkipWeekends = input.shouldSkipWeekends;
  if (typeof shouldSkipWeekends !== "boolean") {
    throw asanaInvalidInputError("scheduleDates.shouldSkipWeekends is required.");
  }
  const startOn = optionalString(input.startOn);
  const dueOn = optionalString(input.dueOn);
  if ((startOn ? 1 : 0) + (dueOn ? 1 : 0) !== 1) {
    throw asanaInvalidInputError("scheduleDates requires exactly one of startOn or dueOn.");
  }
  return compactObject({
    should_skip_weekends: shouldSkipWeekends,
    start_on: startOn,
    due_on: dueOn,
  });
}

function mutateProjectPeople(
  input: Record<string, unknown>,
  context: AsanaContext,
  field: "members" | "followers",
  operation: "addMembers" | "removeMembers" | "addFollowers" | "removeFollowers",
): Promise<unknown> {
  return writeAsanaResource(
    `/projects/${asanaPathGid(input.projectId, "projectId")}/${operation}`,
    { [field]: requiredDelimitedStringArray(input[field], field) },
    "project",
    context,
    {
      method: "POST",
      query: buildAsanaFieldsQuery(input, defaultProjectFields),
      notFoundAsInvalidInput: true,
    },
  );
}

function requiredDelimitedStringArray(value: unknown, fieldName: string): string {
  return requiredNonEmptyStringArray(value, fieldName).join(",");
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

function optionalDelimitedStringArray(value: unknown, fieldName: string): string | undefined {
  return value === undefined ? undefined : requiredDelimitedStringArray(value, fieldName);
}

function buildProjectCustomFieldSearchQuery(value: unknown): Record<string, string> {
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
    });
    requireNonEmptyAsanaBody(conditions, `customFieldFilters[${index}] must include at least one condition.`);
    for (const [name, condition] of Object.entries(conditions)) {
      query[`custom_fields.${customFieldId}.${name}`] = condition;
    }
  }
  return query;
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

function nullableSearchDate(value: unknown): string | undefined {
  return value === null ? "null" : optionalString(value);
}

function assertOptionalPlacement(input: Record<string, unknown>): void {
  if (optionalString(input.insertBefore) && optionalString(input.insertAfter)) {
    throw asanaInvalidInputError("insertBefore and insertAfter cannot both be provided.");
  }
}

function booleanString(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}
