import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rocketlane";

const pageSizeSchema = s.integer("The maximum number of records to return per page.", { minimum: 1, maximum: 100 });
const pageTokenSchema = s.nonEmptyString("The pagination token returned by the previous Rocketlane list response.");
const sortOrderSchema = s.stringEnum("The sort order for the Rocketlane list response.", ["ASC", "DESC"]);
const matchSchema = s.stringEnum("Whether Rocketlane should match all filters or any filter.", ["all", "any"]);
const projectIncludeFieldSchema = s.stringEnum("One Rocketlane project field to include in the response.", [
  "annualizedRecurringRevenue",
  "projectFee",
  "allocatedHours",
  "allocatedMinutes",
  "budgetedHours",
  "percentageBudgetedHoursConsumed",
  "percentageBudgetConsumed",
  "billableHours",
  "billableMinutes",
  "nonBillableHours",
  "nonBillableMinutes",
  "trackedHours",
  "trackedMinutes",
  "progressPercentage",
  "startDateActual",
  "dueDateActual",
  "currentPhase",
  "autoAllocation",
  "sources",
  "inferredProgress",
  "plannedDuration",
  "projectAgeInDays",
  "customersInvited",
  "customersJoined",
  "externalReferenceId",
  "metrics",
  "remainingMinutes",
  "remainingHours",
]);
const taskIncludeFieldSchema = s.stringEnum("One Rocketlane task field to include in the response.", [
  "startDateActual",
  "dueDateActual",
  "type",
  "phase",
  "assignees",
  "followers",
  "dependencies",
  "billable",
  "csatEnabled",
  "priority",
  "timeEntryCategory",
  "financialsBudget",
  "taskPrivateNote",
  "parent",
  "externalReferenceId",
]);
const userIncludeFieldSchema = s.stringEnum("One Rocketlane user field to include in the response.", [
  "role",
  "company",
  "permission",
  "holidayCalendar",
  "capacityInMinutes",
  "profilePictureUrl",
]);
const projectSortBySchema = s.stringEnum("The Rocketlane project field used for sorting.", [
  "projectName",
  "startDate",
  "dueDate",
  "startDateActual",
  "dueDateActual",
  "annualizedRecurringRevenue",
  "projectFee",
]);
const taskSortBySchema = s.stringEnum("The Rocketlane task field used for sorting.", [
  "taskName",
  "startDate",
  "dueDate",
  "startDateActual",
  "dueDateActual",
]);
const userSortBySchema = s.stringEnum("The Rocketlane user field used for sorting.", [
  "email",
  "firstName",
  "lastName",
  "type",
  "status",
  "capacityInMinutes",
]);
const userStatusSchema = s.stringEnum("One Rocketlane user status value.", [
  "INACTIVE",
  "INVITED",
  "ACTIVE",
  "PASSIVE",
]);
const userTypeSchema = s.stringEnum("One Rocketlane user type value.", [
  "TEAM_MEMBER",
  "PARTNER",
  "CUSTOMER",
  "EXTERNAL_PARTNER",
]);
const idStringSchema = s.nonEmptyString("The Rocketlane status or external identifier.");
const dateSchema = s.date("A Rocketlane date in YYYY-MM-DD format.");
const paginationSchema = s.looseObject("Pagination metadata returned by Rocketlane list endpoints.");
const projectSchema = s.looseObject("A Rocketlane project.");
const taskSchema = s.looseObject("A Rocketlane task.");
const userSchema = s.looseObject("A Rocketlane user.");

const commonListFields = {
  pageSize: pageSizeSchema,
  pageToken: pageTokenSchema,
  includeAllFields: s.boolean("Whether Rocketlane should return all available fields."),
  sortOrder: sortOrderSchema,
  match: matchSchema,
};

export const rocketlaneActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Rocketlane projects with pagination, sorting, and first-pass project filters.",
    inputSchema: s.object(
      "The input payload for listing Rocketlane projects.",
      {
        ...commonListFields,
        includeFields: s.array("The Rocketlane project fields to include in the response.", projectIncludeFieldSchema, {
          minItems: 1,
        }),
        sortBy: projectSortBySchema,
        projectNameEq: s.nonEmptyString("Return only Rocketlane projects with this exact project name."),
        projectNameContains: s.nonEmptyString(
          "Return only Rocketlane projects whose project name contains this value.",
        ),
        statusEq: idStringSchema,
        statusOneOf: s.array(
          "Return Rocketlane projects whose status matches one of these identifiers.",
          idStringSchema,
          {
            minItems: 1,
          },
        ),
        startDateGt: dateSchema,
        startDateGe: dateSchema,
        dueDateLt: dateSchema,
        customerIdEq: s.positiveInteger("Return only Rocketlane projects for this customer company ID."),
      },
      {
        optional: [
          "pageSize",
          "pageToken",
          "includeFields",
          "includeAllFields",
          "sortBy",
          "sortOrder",
          "match",
          "projectNameEq",
          "projectNameContains",
          "statusEq",
          "statusOneOf",
          "startDateGt",
          "startDateGe",
          "dueDateLt",
          "customerIdEq",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Rocketlane projects.", {
      projects: s.array("The Rocketlane projects returned for the current page.", projectSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Rocketlane project by numeric project ID.",
    inputSchema: s.object(
      "The input payload for getting one Rocketlane project.",
      {
        projectId: s.positiveInteger("The Rocketlane project ID to fetch."),
        includeFields: s.array("The Rocketlane project fields to include in the response.", projectIncludeFieldSchema, {
          minItems: 1,
        }),
        includeAllFields: s.boolean("Whether Rocketlane should return all available project fields."),
      },
      { optional: ["includeFields", "includeAllFields"] },
    ),
    outputSchema: s.object("The response returned for one Rocketlane project.", { project: projectSchema }),
  }),
  defineProviderAction(service, {
    name: "list_tasks",
    description: "List Rocketlane tasks with pagination, sorting, and first-pass task filters.",
    inputSchema: s.object(
      "The input payload for listing Rocketlane tasks.",
      {
        ...commonListFields,
        includeFields: s.array("The Rocketlane task fields to include in the response.", taskIncludeFieldSchema, {
          minItems: 1,
        }),
        sortBy: taskSortBySchema,
        taskNameEq: s.nonEmptyString("Return only Rocketlane tasks with this exact task name."),
        taskNameContains: s.nonEmptyString("Return only Rocketlane tasks whose task name contains this value."),
        taskStatusEq: idStringSchema,
        taskStatusOneOf: s.array(
          "Return Rocketlane tasks whose status matches one of these identifiers.",
          idStringSchema,
          {
            minItems: 1,
          },
        ),
        projectIdEq: s.positiveInteger("Return only Rocketlane tasks for this project ID."),
        startDateGt: dateSchema,
        dueDateLt: dateSchema,
        atRiskEq: s.boolean("Return only Rocketlane tasks that match this at-risk flag."),
      },
      {
        optional: [
          "pageSize",
          "pageToken",
          "includeFields",
          "includeAllFields",
          "sortBy",
          "sortOrder",
          "match",
          "taskNameEq",
          "taskNameContains",
          "taskStatusEq",
          "taskStatusOneOf",
          "projectIdEq",
          "startDateGt",
          "dueDateLt",
          "atRiskEq",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Rocketlane tasks.", {
      tasks: s.array("The Rocketlane tasks returned for the current page.", taskSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_task",
    description: "Get one Rocketlane task by numeric task ID.",
    inputSchema: s.object(
      "The input payload for getting one Rocketlane task.",
      {
        taskId: s.positiveInteger("The Rocketlane task ID to fetch."),
        includeFields: s.array("The Rocketlane task fields to include in the response.", taskIncludeFieldSchema, {
          minItems: 1,
        }),
        includeAllFields: s.boolean("Whether Rocketlane should return all available task fields."),
      },
      { optional: ["includeFields", "includeAllFields"] },
    ),
    outputSchema: s.object("The response returned for one Rocketlane task.", { task: taskSchema }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Rocketlane users with pagination, sorting, and first-pass user filters.",
    inputSchema: s.object(
      "The input payload for listing Rocketlane users.",
      {
        ...commonListFields,
        includeFields: s.array("The Rocketlane user fields to include in the response.", userIncludeFieldSchema, {
          minItems: 1,
        }),
        sortBy: userSortBySchema,
        firstNameEq: s.nonEmptyString("Return only Rocketlane users with this exact first name."),
        firstNameContains: s.nonEmptyString("Return only Rocketlane users whose first name contains this value."),
        emailEq: s.nonEmptyString("Return only Rocketlane users with this exact email address."),
        emailContains: s.nonEmptyString("Return only Rocketlane users whose email address contains this value."),
        statusEq: s.array("Return only Rocketlane users with this exact status.", userStatusSchema, {
          minItems: 1,
          maxItems: 1,
        }),
        statusOneOf: s.array("Return Rocketlane users whose status matches any of these values.", userStatusSchema, {
          minItems: 1,
          maxItems: 3,
        }),
        typeEq: s.array("Return only Rocketlane users with this exact user type.", userTypeSchema, {
          minItems: 1,
          maxItems: 1,
        }),
        permissionIdEq: s.positiveInteger("Return only Rocketlane users with this permission ID."),
      },
      {
        optional: [
          "pageSize",
          "pageToken",
          "includeFields",
          "includeAllFields",
          "sortBy",
          "sortOrder",
          "match",
          "firstNameEq",
          "firstNameContains",
          "emailEq",
          "emailContains",
          "statusEq",
          "statusOneOf",
          "typeEq",
          "permissionIdEq",
        ],
      },
    ),
    outputSchema: s.object("The response returned when listing Rocketlane users.", {
      users: s.array("The Rocketlane users returned for the current page.", userSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get one Rocketlane user by numeric user ID.",
    inputSchema: s.object(
      "The input payload for getting one Rocketlane user.",
      {
        userId: s.positiveInteger("The Rocketlane user ID to fetch."),
        includeFields: s.array("The Rocketlane user fields to include in the response.", userIncludeFieldSchema, {
          minItems: 1,
        }),
        includeAllFields: s.boolean("Whether Rocketlane should return all available user fields."),
      },
      { optional: ["includeFields", "includeAllFields"] },
    ),
    outputSchema: s.object("The response returned for one Rocketlane user.", { user: userSchema }),
  }),
];
