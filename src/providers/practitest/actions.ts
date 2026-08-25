import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "practitest";

const resourceAttributesSchema = s.looseObject("The attributes returned by PractiTest for this resource.");

const resourceSchema = s.looseObject("A PractiTest JSON:API resource.", {
  id: s.nonEmptyString("The PractiTest resource ID."),
  type: s.nonEmptyString("The PractiTest resource type."),
  attributes: resourceAttributesSchema,
});

const paginationSchema = s.object(
  "Pagination metadata returned by PractiTest.",
  {
    currentPage: s.integer("The current page number."),
    nextPage: s.nullable(s.integer("The next page number, or null on the last page.")),
    previousPage: s.nullable(s.integer("The previous page number, or null on the first page.")),
    totalPages: s.integer("The total number of pages."),
    totalCount: s.integer("The total number of matching resources."),
  },
  { optional: ["nextPage", "previousPage"] },
);

const pageInputFields = {
  page: s.integer("The page number to retrieve, starting from 1.", { minimum: 1 }),
  pageSize: s.integer("The number of resources per page, up to 100.", {
    minimum: 1,
    maximum: 100,
  }),
};

const projectIdInputSchema = s.object("The PractiTest project to retrieve.", {
  projectId: s.nonEmptyString("The PractiTest project ID."),
});

const testIdInputFields = {
  projectId: s.nonEmptyString("The PractiTest project ID."),
  testId: s.nonEmptyString("The PractiTest test ID, not its display ID."),
};

const testTypeSchema = s.stringEnum("The PractiTest test type.", [
  "ScriptedTest",
  "ApiTest",
  "FireCracker",
  "xBotTest",
  "EggplantTest",
  "BDDTest",
]);

const testAttributesFields = {
  name: s.nonEmptyString("The test name."),
  authorId: s.nonEmptyString("The author user ID; omit for a personal token unless impersonation is enabled."),
  description: s.string("The test description."),
  testType: testTypeSchema,
  assignedToId: s.nonEmptyString("The assigned user or group ID."),
  assignedToType: s.stringEnum("The assignee type.", ["user", "group"]),
  plannedExecution: s.dateTime("The planned execution date and time."),
  status: s.nonEmptyString("The test workflow status."),
  version: s.string("The test version."),
  priority: s.string("The test priority."),
  durationEstimate: s.string("The test duration estimate."),
  customFields: s.looseObject("PractiTest custom field keys and values."),
  automatedFields: s.looseObject("PractiTest automation information fields."),
  tags: s.array("Tags assigned to the test.", s.nonEmptyString("A test tag.")),
};

const optionalTestAttributes = [
  "authorId",
  "description",
  "testType",
  "assignedToId",
  "assignedToType",
  "plannedExecution",
  "status",
  "version",
  "priority",
  "durationEstimate",
  "customFields",
  "automatedFields",
  "tags",
];

const testStepSchema = s.object(
  "A step to create with a scripted test.",
  {
    name: s.nonEmptyString("The step name, up to 255 characters.", { maxLength: 255 }),
    description: s.string("The step description."),
    expectedResults: s.string("The expected step results."),
  },
  { optional: ["description", "expectedResults"] },
);

const testOutputSchema = s.object("The test returned by PractiTest.", {
  test: resourceSchema,
});

export const practitestActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List projects available to the connected PractiTest token.",
    requiredScopes: [],
    inputSchema: s.object("Pagination options for the project list.", pageInputFields, {
      optional: ["page", "pageSize"],
    }),
    outputSchema: s.object("A page of PractiTest projects.", {
      projects: s.array("The projects returned for this page.", resourceSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Retrieve a PractiTest project by ID.",
    requiredScopes: [],
    inputSchema: projectIdInputSchema,
    outputSchema: s.object("The project returned by PractiTest.", {
      project: resourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_tests",
    description: "List and filter tests in a PractiTest project.",
    requiredScopes: [],
    inputSchema: s.object(
      "The PractiTest project, filters, relationship option, and pagination settings.",
      {
        projectId: testIdInputFields.projectId,
        ...pageInputFields,
        filterId: s.nonEmptyString("The Test Library filter ID."),
        autoFilterValue: s.string("The first-level auto-filter value."),
        subAutoFilterValue: s.string("The second-level auto-filter value."),
        filterUserId: s.nonEmptyString("The user ID used by current-user filter criteria."),
        displayIds: s.array("Test display IDs to include.", s.nonEmptyString("A test display ID."), { minItems: 1 }),
        nameExact: s.string("An exact, case-sensitive test name."),
        nameLike: s.string("A case-insensitive substring of the test name."),
        relationships: s.boolean("Whether to include linked entities."),
      },
      {
        optional: [
          "page",
          "pageSize",
          "filterId",
          "autoFilterValue",
          "subAutoFilterValue",
          "filterUserId",
          "displayIds",
          "nameExact",
          "nameLike",
          "relationships",
        ],
      },
    ),
    outputSchema: s.object("A page of PractiTest tests.", {
      tests: s.array("The tests returned for this page.", resourceSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_test",
    description: "Retrieve a PractiTest test by ID.",
    requiredScopes: [],
    inputSchema: s.object(
      "The PractiTest test to retrieve.",
      {
        ...testIdInputFields,
        relationships: s.boolean("Whether to include linked entities."),
      },
      { optional: ["relationships"] },
    ),
    outputSchema: testOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_test",
    description: "Create a test in a PractiTest project.",
    requiredScopes: [],
    inputSchema: s.object(
      "The project, attributes, and optional scripted steps for the new test.",
      {
        projectId: testIdInputFields.projectId,
        ...testAttributesFields,
        steps: s.array("Scripted steps to create with the test.", testStepSchema, {
          minItems: 1,
        }),
      },
      { optional: [...optionalTestAttributes, "steps"] },
    ),
    outputSchema: testOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_test",
    description: "Update the documented attributes of a PractiTest test.",
    requiredScopes: [],
    inputSchema: s.requireAnyProperty(
      s.object(
        "The test ID and documented attributes to update.",
        { ...testIdInputFields, ...testAttributesFields },
        { optional: ["name", ...optionalTestAttributes] },
      ),
      ["name", ...optionalTestAttributes],
    ),
    outputSchema: testOutputSchema,
  }),
  defineProviderAction(service, {
    name: "delete_test",
    description: "Permanently delete a test from a PractiTest project.",
    requiredScopes: [],
    inputSchema: s.object("The PractiTest test to delete.", testIdInputFields),
    outputSchema: s.object("Confirmation that the PractiTest test was deleted.", {
      deleted: s.boolean("Whether the test deletion succeeded."),
      testId: s.nonEmptyString("The deleted PractiTest test ID."),
    }),
  }),
];
