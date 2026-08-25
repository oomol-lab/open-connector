import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "certn";

const uuidSchema = s.uuid("Certn UUID.");
const pageSchema = s.positiveInteger("One-based page number to request from Certn.");
const pageSizeSchema = s.positiveInteger(
  "Number of results to return per page. Certn defaults to 10 and allows at most 100.",
  {
    maximum: 100,
  },
);
const uuidArraySchema = (description: string) => s.array(description, uuidSchema, { minItems: 1 });
const stringArraySchema = (description: string, itemDescription: string) =>
  s.array(description, s.string({ description: itemDescription, minLength: 1 }), { minItems: 1 });

const paginationSchema = s.looseObject("Certn pagination metadata.", {
  result_count: s.integer("Total number of results."),
  page_count: s.integer("Total number of pages."),
  page_size: s.integer("Number of results per page."),
  current_page: s.integer("Current page number."),
  next_page: s.nullable(s.integer("Next page number, when available.")),
  previous_page: s.nullable(s.integer("Previous page number, when available.")),
  count: s.integer("Total number of results for legacy paginated endpoints."),
  next: s.nullable(s.string("Next page URL, when available.")),
  previous: s.nullable(s.string("Previous page URL, when available.")),
});

const caseSchema = s.looseObject("Certn case object.");
const userSchema = s.looseObject("Certn user object.");
const groupSchema = s.looseObject("Certn group object.");
const packageSchema = s.looseObject("Certn package object.");
const eventSchema = s.looseObject("Certn event object.");
const tagSchema = s.looseObject("Certn tag object.");
const questionnaireSchema = s.looseObject("Certn questionnaire template object.");

const listCasesInputSchema = s.object(
  "Filters and pagination for listing Certn cases.",
  {
    page: pageSchema,
    pageSize: pageSizeSchema,
    emailAddress: s.email("Filter cases by applicant email address."),
    groupIds: uuidArraySchema("Filter cases by one or more Certn group UUIDs."),
    overallStatuses: stringArraySchema(
      "Filter cases by one or more Certn overall status values.",
      "Certn case overall status value.",
    ),
    tags: stringArraySchema("Filter cases by one or more Certn tag values.", "Certn tag value."),
    checkTypes: stringArraySchema(
      "Filter cases by one or more Certn versioned check type identifiers.",
      "Certn versioned check type identifier.",
    ),
  },
  {
    optional: ["page", "pageSize", "emailAddress", "groupIds", "overallStatuses", "tags", "checkTypes"],
  },
);

const getByIdInputSchema = s.object("Certn UUID lookup parameters.", {
  id: uuidSchema,
});

const listUsersInputSchema = s.object(
  "Filters and pagination for listing Certn users.",
  {
    page: pageSchema,
    pageSize: pageSizeSchema,
    email: s.email("Filter users by email address."),
    fullName: s.string("Filter users by full name.", { minLength: 1 }),
    groupIds: uuidArraySchema("Filter users by one or more Certn group UUIDs."),
    id: uuidSchema,
    isActive: s.boolean("Whether to return active or inactive users."),
    roles: stringArraySchema("Filter users by one or more Certn portal roles.", "Certn role."),
  },
  { optional: ["page", "pageSize", "email", "fullName", "groupIds", "id", "isActive", "roles"] },
);

const listGroupsInputSchema = s.object(
  "Filters and pagination for listing Certn groups.",
  {
    page: pageSchema,
    pageSize: pageSizeSchema,
    id: uuidSchema,
    isActive: s.boolean("Whether to return active or inactive groups."),
    name: s.string("Filter groups by name.", { minLength: 1 }),
    parentId: uuidSchema,
  },
  { optional: ["page", "pageSize", "id", "isActive", "name", "parentId"] },
);

const listPackagesInputSchema = s.object(
  "Filters and pagination for listing Certn packages.",
  {
    page: pageSchema,
    pageSize: pageSizeSchema,
    isActive: s.boolean("Whether to return active or inactive packages."),
    permissiblePurposes: stringArraySchema(
      "Filter packages by one or more permissible purpose values.",
      "Certn permissible purpose value.",
    ),
  },
  { optional: ["page", "pageSize", "isActive", "permissiblePurposes"] },
);

const listEventsInputSchema = s.object(
  "Filters and pagination for listing Certn events.",
  {
    page: pageSchema,
    lastProcessedEventId: uuidSchema,
  },
  { optional: ["page", "lastProcessedEventId"] },
);

const listTagsInputSchema = s.object(
  "Filters and pagination for listing Certn tags.",
  {
    page: pageSchema,
    pageSize: pageSizeSchema,
    id: uuidSchema,
    isActive: s.boolean("Whether to return active or inactive tags."),
    name: s.string("Filter tags by name.", { minLength: 1 }),
  },
  { optional: ["page", "pageSize", "id", "isActive", "name"] },
);

const listQuestionnairesInputSchema = s.object(
  "Pagination for listing Certn questionnaire templates.",
  {
    page: pageSchema,
    pageSize: pageSizeSchema,
  },
  { optional: ["page", "pageSize"] },
);

const paginatedCasesOutputSchema = s.object("Paginated Certn cases.", {
  cases: s.array("Certn cases returned by the API.", caseSchema),
  pagination: paginationSchema,
});
const caseOutputSchema = s.object("Certn case details.", {
  case: s.nullable(caseSchema),
});
const paginatedUsersOutputSchema = s.object("Paginated Certn users.", {
  users: s.array("Certn users returned by the API.", userSchema),
  pagination: paginationSchema,
});
const userOutputSchema = s.object("Certn user details.", {
  user: s.nullable(userSchema),
});
const paginatedGroupsOutputSchema = s.object("Paginated Certn groups.", {
  groups: s.array("Certn groups returned by the API.", groupSchema),
  pagination: paginationSchema,
});
const groupOutputSchema = s.object("Certn group details.", {
  group: s.nullable(groupSchema),
});
const paginatedPackagesOutputSchema = s.object("Paginated Certn packages.", {
  packages: s.array("Certn packages returned by the API.", packageSchema),
  pagination: paginationSchema,
});
const paginatedEventsOutputSchema = s.object("Paginated Certn events.", {
  events: s.array("Certn events returned by the API.", eventSchema),
  pagination: paginationSchema,
});
const paginatedTagsOutputSchema = s.object("Paginated Certn tags.", {
  tags: s.array("Certn tags returned by the API.", tagSchema),
  pagination: paginationSchema,
});
const paginatedQuestionnairesOutputSchema = s.object("Paginated Certn questionnaire templates.", {
  questionnaires: s.array("Certn questionnaire templates returned by the API.", questionnaireSchema),
  pagination: paginationSchema,
});

export const certnActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_cases",
    description: "List Certn background-check cases with pagination and optional filters.",
    inputSchema: listCasesInputSchema,
    outputSchema: paginatedCasesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_case",
    description: "Retrieve one Certn background-check case by UUID.",
    inputSchema: getByIdInputSchema,
    outputSchema: caseOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List Certn Client Portal users with pagination and optional filters.",
    inputSchema: listUsersInputSchema,
    outputSchema: paginatedUsersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Retrieve one Certn Client Portal user by UUID.",
    inputSchema: getByIdInputSchema,
    outputSchema: userOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List Certn groups with pagination and optional filters.",
    inputSchema: listGroupsInputSchema,
    outputSchema: paginatedGroupsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_group",
    description: "Retrieve one Certn group by UUID.",
    inputSchema: getByIdInputSchema,
    outputSchema: groupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_packages",
    description: "List Certn check packages with pagination and optional filters.",
    inputSchema: listPackagesInputSchema,
    outputSchema: paginatedPackagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_events",
    description: "List historical Certn events with optional incremental cursor filtering.",
    inputSchema: listEventsInputSchema,
    outputSchema: paginatedEventsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tags",
    description: "List Certn tags with pagination and optional ID filtering.",
    inputSchema: listTagsInputSchema,
    outputSchema: paginatedTagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_questionnaires",
    description: "List Certn questionnaire templates with pagination.",
    inputSchema: listQuestionnairesInputSchema,
    outputSchema: paginatedQuestionnairesOutputSchema,
  }),
];
