import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "float";

const pageSchema = s.integer("The page number of the page of results to return.", {
  minimum: 1,
});
const perPageSchema = s.integer("The number of items per page. Float supports up to 200.", {
  minimum: 1,
  maximum: 200,
});
const activeSchema: JsonSchema = {
  type: "integer",
  enum: [0, 1],
  description: "Filter active entities with 1 for active or 0 for archived.",
};
const allocationStatusSchema: JsonSchema = {
  type: "integer",
  enum: [0, 1, 2, 3, 4],
  description: "The Float allocation status value to filter by.",
};
const idSchema = (description: string) => s.integer(description, { minimum: 1 });
const nonEmptyStringSchema = (description: string) =>
  s.string(description, {
    minLength: 1,
    pattern: "\\S",
  });
const fieldsSchema = s.array(
  "The Float fields to include in the response.",
  nonEmptyStringSchema("One Float field name to include in the response."),
  { minItems: 1 },
);

const paginationSchema = s.object("Pagination metadata returned from Float response headers.", {
  totalCount: s.nullable(s.integer("The total number of items when Float returned it.")),
  pageCount: s.nullable(s.integer("The total number of pages when Float returned it.")),
  currentPage: s.nullable(s.integer("The current page number when Float returned it.")),
  perPage: s.nullable(s.integer("The number of items per page when Float returned it.")),
});

const accountSchema = s.object("A normalized Float account.", {
  accountId: s.nullable(s.integer("The Float account ID.")),
  name: s.nullable(s.string("The account name.")),
  email: s.nullable(s.string("The account email address.")),
  accountType: s.nullable(s.integer("The high-level Float account permission type.")),
  access: s.nullable(s.integer("The granular Float account access value.")),
  active: s.nullable(s.integer("Whether the account is active, using Float's 1 or 0 value.")),
  peopleId: s.nullable(s.integer("The linked Float person ID when expanded and present.")),
  raw: s.unknownObject("The raw account object returned by Float."),
});

const personSchema = s.object("A normalized Float person.", {
  peopleId: s.nullable(s.integer("The Float person ID.")),
  name: s.nullable(s.string("The person's full name.")),
  email: s.nullable(s.string("The person's email address.")),
  jobTitle: s.nullable(s.string("The person's job title.")),
  departmentName: s.nullable(s.string("The current department name when present.")),
  active: s.nullable(s.integer("Whether the person is active, using Float's 1 or 0 value.")),
  startDate: s.nullable(s.string("The date the person started when present.")),
  endDate: s.nullable(s.string("The date the person finished when present.")),
  raw: s.unknownObject("The raw person object returned by Float."),
});

const clientSchema = s.object("A normalized Float client.", {
  clientId: s.nullable(s.integer("The Float client ID.")),
  name: s.nullable(s.string("The client name.")),
  raw: s.unknownObject("The raw client object returned by Float."),
});

const projectSchema = s.object("A normalized Float project.", {
  projectId: s.nullable(s.integer("The Float project ID.")),
  name: s.nullable(s.string("The project name.")),
  projectCode: s.nullable(s.string("The optional third-party project identifier.")),
  clientId: s.nullable(s.integer("The ID of the project's client.")),
  status: s.nullable(s.integer("The Float project status value.")),
  active: s.nullable(s.integer("Whether the project is active, using Float's 1 or 0 value.")),
  startDate: s.nullable(s.string("The project start date when present.")),
  endDate: s.nullable(s.string("The project end date when present.")),
  raw: s.unknownObject("The raw project object returned by Float."),
});

const allocationSchema = s.object("A normalized Float allocation returned as a task.", {
  taskId: s.nullable(s.integer("The Float allocation task ID.")),
  projectId: s.nullable(s.integer("The project ID for this allocation.")),
  peopleId: s.nullable(s.integer("The person ID for this allocation when present.")),
  startDate: s.nullable(s.string("The allocation start date.")),
  endDate: s.nullable(s.string("The allocation end date.")),
  hours: s.nullable(s.number("The number of hours per day.")),
  status: s.nullable(s.integer("The Float allocation status value.")),
  billable: s.nullable(s.integer("Whether the allocation is billable, using Float's 1 or 0 value.")),
  name: s.nullable(s.string("The allocation name or note when present.")),
  raw: s.unknownObject("The raw allocation object returned by Float."),
});

const optionalPaginationInputFields = ["page", "perPage"];
const listPeopleOptionalFields = [
  "page",
  "perPage",
  "active",
  "departmentId",
  "email",
  "peopleTypeId",
  "employeeType",
  "tagName",
  "sort",
  "modifiedSince",
  "fields",
  "expand",
];
const listProjectsOptionalFields = [
  "page",
  "perPage",
  "active",
  "clientId",
  "tagName",
  "sort",
  "modifiedSince",
  "fields",
];
const listAllocationsOptionalFields = [
  "page",
  "perPage",
  "clientId",
  "projectId",
  "phaseId",
  "projectTaskId",
  "peopleId",
  "startDate",
  "endDate",
  "billable",
  "status",
  "tagName",
  "modifiedSince",
  "fields",
  "expand",
];

export const floatActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List Float accounts that can access the team.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Float accounts.",
      {
        page: pageSchema,
        perPage: perPageSchema,
        expand: s.stringEnum("Use people_id to include the linked Float person ID.", ["people_id"]),
      },
      { optional: ["page", "perPage", "expand"] },
    ),
    outputSchema: s.object("The response returned when listing Float accounts.", {
      pagination: paginationSchema,
      accounts: s.array("The accounts returned by Float.", accountSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_people",
    description: "List Float people on the schedule with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Float people.",
      {
        page: pageSchema,
        perPage: perPageSchema,
        active: activeSchema,
        departmentId: idSchema("The Float department ID to filter people by."),
        email: nonEmptyStringSchema("An email address to filter people by exact match."),
        peopleTypeId: idSchema("The Float people type ID to filter by."),
        employeeType: activeSchema,
        tagName: nonEmptyStringSchema("An exact Float tag name to filter people by."),
        sort: nonEmptyStringSchema("A Float people field to sort by, prefix with - for descending."),
        modifiedSince: nonEmptyStringSchema("A Float modified timestamp or Unix timestamp filter."),
        fields: fieldsSchema,
        expand: s.stringEnum("Use accounts to include linked account data.", ["accounts"]),
      },
      { optional: listPeopleOptionalFields },
    ),
    outputSchema: s.object("The response returned when listing Float people.", {
      pagination: paginationSchema,
      people: s.array("The people returned by Float.", personSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_clients",
    description: "List Float clients.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Float clients.",
      {
        page: pageSchema,
        perPage: perPageSchema,
      },
      { optional: optionalPaginationInputFields },
    ),
    outputSchema: s.object("The response returned when listing Float clients.", {
      pagination: paginationSchema,
      clients: s.array("The clients returned by Float.", clientSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Float projects with optional filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Float projects.",
      {
        page: pageSchema,
        perPage: perPageSchema,
        active: activeSchema,
        clientId: idSchema("The Float client ID to filter projects by."),
        tagName: nonEmptyStringSchema("An exact Float tag name to filter projects by."),
        sort: nonEmptyStringSchema("A Float projects field to sort by, prefix with - for descending."),
        modifiedSince: nonEmptyStringSchema("A Float modified timestamp or Unix timestamp filter."),
        fields: fieldsSchema,
      },
      { optional: listProjectsOptionalFields },
    ),
    outputSchema: s.object("The response returned when listing Float projects.", {
      pagination: paginationSchema,
      projects: s.array("The projects returned by Float.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_allocations",
    description: "List Float allocations as tasks with optional schedule filters.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing Float allocations.",
      {
        page: pageSchema,
        perPage: perPageSchema,
        clientId: idSchema("The Float client ID to filter allocations by."),
        projectId: idSchema("The Float project ID to filter allocations by."),
        phaseId: idSchema("The Float phase ID to filter allocations by."),
        projectTaskId: idSchema("The Float project task ID to filter allocations by."),
        peopleId: idSchema("The Float person ID to filter allocations by."),
        startDate: nonEmptyStringSchema("The schedule start date in YYYY-MM-DD format."),
        endDate: nonEmptyStringSchema("The schedule end date in YYYY-MM-DD format."),
        billable: activeSchema,
        status: allocationStatusSchema,
        tagName: nonEmptyStringSchema("An exact Float tag name to filter allocations by."),
        modifiedSince: nonEmptyStringSchema("A Float modified timestamp or Unix timestamp filter."),
        fields: fieldsSchema,
        expand: s.stringEnum("Use task_days to include calculated allocation dates.", ["task_days"]),
      },
      { optional: listAllocationsOptionalFields },
    ),
    outputSchema: s.object("The response returned when listing Float allocations.", {
      pagination: paginationSchema,
      allocations: s.array("The allocations returned by Float.", allocationSchema),
    }),
  }),
];

export type FloatActionName = "list_accounts" | "list_people" | "list_clients" | "list_projects" | "list_allocations";
