import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hub_planner";

const projectStatusSchema = s.stringEnum("The current Hub Planner project status.", [
  "STATUS_ACTIVE",
  "STATUS_ARCHIVED",
  "STATUS_PENDING",
  "STATUS_PLANNED",
  "STATUS_FLOATING",
]);

const resourceStatusSchema = s.stringEnum("The current Hub Planner resource status.", [
  "STATUS_ACTIVE",
  "STATUS_ARCHIVED",
  "STATUS_NON_BOOKABLE",
  "STATUS_PARKED",
]);

const listInputSchema = s.object(
  "Pagination and sorting options for a Hub Planner collection.",
  {
    page: s.nonNegativeInteger("The zero-based page number."),
    limit: s.integer("The maximum number of results to return, from 1 to 1000.", {
      minimum: 1,
      maximum: 1000,
    }),
    sort: s.array(
      "Sort fields in priority order. Prefix a field with - for descending order.",
      s.nonEmptyString("A sortable Hub Planner field, optionally prefixed with -."),
      { minItems: 1 },
    ),
  },
  { optional: ["page", "limit", "sort"] },
);

const projectSchema = s.looseRequiredObject(
  "A project returned by Hub Planner.",
  {
    _id: s.string("The unique project ID."),
    name: s.string("The project name."),
    note: s.string("The project notes."),
    createdDate: s.string("The project creation timestamp."),
    updatedDate: s.string("The project update timestamp."),
    projectCode: s.string("The unique project code."),
    status: s.string("The project status returned by Hub Planner."),
    metadata: s.string("The project metadata value."),
    backgroundColor: s.string("The project display color."),
    start: s.nullable(s.string("The project display start date.")),
    end: s.nullable(s.string("The project display end date.")),
    useProjectDuration: s.boolean("Whether project display dates are enabled."),
    timeEntryEnabled: s.boolean("Whether time entry is enabled for the project."),
    timeEntryLocked: s.boolean("Whether time entry is locked for the project."),
    timeEntryApproval: s.boolean("Whether project time entries require approval."),
    timeEntryNoteRequired: s.boolean("Whether project time entries require notes."),
    budgetHours: s.number("The number of budgeted project hours."),
    budgetCashAmount: s.number("The cash budget amount."),
    budgetCurrency: s.string("The cash budget currency code."),
    resources: s.array("Resource IDs assigned to the project.", s.string("A resource ID.")),
    projectManagers: s.array("Resource IDs assigned as project managers.", s.string("A project manager resource ID.")),
    links: s.looseObject("Provider-defined project links."),
    tags: s.array("Tags assigned to the project.", s.looseObject("A project tag.")),
    customFields: s.array("Custom fields assigned to the project.", s.looseObject("A project custom field.")),
    projectRate: s.looseObject("The project billing-rate configuration."),
  },
  {
    optional: [
      "_id",
      "name",
      "note",
      "createdDate",
      "updatedDate",
      "projectCode",
      "status",
      "metadata",
      "backgroundColor",
      "start",
      "end",
      "useProjectDuration",
      "timeEntryEnabled",
      "timeEntryLocked",
      "timeEntryApproval",
      "timeEntryNoteRequired",
      "budgetHours",
      "budgetCashAmount",
      "budgetCurrency",
      "resources",
      "projectManagers",
      "links",
      "tags",
      "customFields",
      "projectRate",
    ],
  },
);

const resourceSchema = s.looseRequiredObject(
  "A resource returned by Hub Planner.",
  {
    _id: s.string("The unique resource ID."),
    firstName: s.string("The resource first name."),
    lastName: s.string("The resource last name."),
    email: s.string("The resource email address."),
    note: s.string("The resource notes."),
    role: s.string("The resource role."),
    status: s.string("The resource status returned by Hub Planner."),
    metadata: s.string("The resource metadata value."),
    createdDate: s.string("The resource creation timestamp."),
    updatedDate: s.nullable(s.string("The resource update timestamp.")),
    useCustomAvailability: s.boolean("Whether the resource uses custom availability."),
    isProjectManager: s.boolean("Whether the resource can manage projects."),
    calendarIds: s.array("Calendar IDs associated with the resource.", s.string("A calendar ID.")),
    links: s.looseObject("Provider-defined resource links."),
    customFields: s.array("Custom fields assigned to the resource.", s.looseObject("A resource custom field.")),
    resourceRates: s.looseObject("The resource billing-rate configuration."),
  },
  {
    optional: [
      "_id",
      "firstName",
      "lastName",
      "email",
      "note",
      "role",
      "status",
      "metadata",
      "createdDate",
      "updatedDate",
      "useCustomAvailability",
      "isProjectManager",
      "calendarIds",
      "links",
      "customFields",
      "resourceRates",
    ],
  },
);

const getProjectInputSchema = s.requiredObject("Input for retrieving one Hub Planner project.", {
  projectId: s.nonEmptyString("The unique Hub Planner project ID."),
});

const createProjectInputSchema = s.object(
  "Core fields for creating a Hub Planner project.",
  {
    name: s.nonEmptyString("The project name."),
    note: s.string("Free-form project notes."),
    status: projectStatusSchema,
    projectCode: s.nonEmptyString("A unique project code."),
    metadata: s.string("Custom project metadata with at most 255 characters.", {
      maxLength: 255,
    }),
    backgroundColor: s.nonEmptyString("The project display color."),
    useStatusColor: s.boolean("Whether to use the default status color."),
    useProjectDuration: s.boolean("Whether project display dates are enabled."),
    start: s.date("The project display start date in YYYY-MM-DD format."),
    end: s.date("The project display end date in YYYY-MM-DD format."),
    budgetHours: s.number("The number of budgeted project hours.", { minimum: 0 }),
    budgetCashAmount: s.number("The cash budget amount.", { minimum: 0 }),
    budgetCurrency: s.nonEmptyString("The currency code for the cash budget."),
    timeEntryEnabled: s.boolean("Whether time entry is enabled for the project."),
    timeEntryLocked: s.boolean("Whether time entry is locked for the project."),
    timeEntryApproval: s.boolean("Whether project time entries require approval."),
    timeEntryNoteRequired: s.boolean("Whether project time entries require notes."),
    resources: s.array("Resource IDs to assign to the project.", s.nonEmptyString("A Hub Planner resource ID.")),
    projectManagers: s.array(
      "Resource IDs to assign as project managers.",
      s.nonEmptyString("A Hub Planner project manager resource ID."),
    ),
  },
  {
    optional: [
      "note",
      "status",
      "projectCode",
      "metadata",
      "backgroundColor",
      "useStatusColor",
      "useProjectDuration",
      "start",
      "end",
      "budgetHours",
      "budgetCashAmount",
      "budgetCurrency",
      "timeEntryEnabled",
      "timeEntryLocked",
      "timeEntryApproval",
      "timeEntryNoteRequired",
      "resources",
      "projectManagers",
    ],
  },
);

const getResourceInputSchema = s.requiredObject("Input for retrieving one Hub Planner resource.", {
  resourceId: s.nonEmptyString("The unique Hub Planner resource ID."),
});

const createResourceInputSchema = s.object(
  "Core fields for creating a Hub Planner resource.",
  {
    firstName: s.nonEmptyString("The resource first name."),
    lastName: s.string("The resource last name."),
    email: s.email("The unique resource email address."),
    note: s.string("Free-form resource notes."),
    role: s.string("The resource role."),
    status: resourceStatusSchema,
    metadata: s.string("Custom resource metadata with at most 255 characters.", {
      maxLength: 255,
    }),
    sendInviteEmail: s.boolean("Whether to email an invitation to the resource."),
    useCustomAvailability: s.boolean("Whether the resource uses custom availability."),
    calendarIds: s.array(
      "Calendar IDs to associate with the resource.",
      s.nonEmptyString("A Hub Planner calendar ID."),
    ),
  },
  {
    optional: [
      "lastName",
      "email",
      "note",
      "role",
      "status",
      "metadata",
      "sendInviteEmail",
      "useCustomAvailability",
      "calendarIds",
    ],
  },
);

export const hubPlannerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List Hub Planner projects with optional zero-based pagination and sorting.",
    inputSchema: listInputSchema,
    outputSchema: s.requiredObject("Hub Planner project list response.", {
      projects: s.array("Projects returned by Hub Planner.", projectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    operationType: "read",
    description: "Get one Hub Planner project by its unique ID.",
    inputSchema: getProjectInputSchema,
    outputSchema: s.requiredObject("Hub Planner project detail response.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_project",
    operationType: "write",
    description: "Create a Hub Planner project with core scheduling and budget fields.",
    inputSchema: createProjectInputSchema,
    outputSchema: s.requiredObject("Hub Planner project creation response.", {
      project: projectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_resources",
    operationType: "read",
    description: "List Hub Planner resources with optional zero-based pagination and sorting.",
    inputSchema: listInputSchema,
    outputSchema: s.requiredObject("Hub Planner resource list response.", {
      resources: s.array("Resources returned by Hub Planner.", resourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_resource",
    operationType: "read",
    description: "Get one Hub Planner resource by its unique ID.",
    inputSchema: getResourceInputSchema,
    outputSchema: s.requiredObject("Hub Planner resource detail response.", {
      resource: resourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_resource",
    operationType: "write",
    description: "Create a Hub Planner resource and optionally send an invitation email.",
    inputSchema: createResourceInputSchema,
    outputSchema: s.requiredObject("Hub Planner resource creation response.", {
      resource: resourceSchema,
    }),
  }),
];
