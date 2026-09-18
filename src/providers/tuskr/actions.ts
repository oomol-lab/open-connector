import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tuskr";
const looseObjectSchema = s.looseObject("Provider-specific object returned by Tuskr.");
const customFieldsSchema = s.looseObject("Custom fields keyed by Tuskr custom field key.");
const identifierSchema = s.nonEmptyString("Tuskr ID, key, name, or email accepted by the API.");
const pageSchema = s.positiveInteger("The 1-based page number to fetch.");
const statusSchema = s.stringEnum(["active", "archived"], {
  description: "Tuskr active or archived status.",
});
const listResponseSchema = s.requiredObject("Paginated Tuskr list response.", {
  rows: s.array("Rows returned by Tuskr.", looseObjectSchema),
  count: s.integer("Number of rows returned in this response."),
  meta: s.object(
    "Tuskr pagination metadata.",
    {
      total: s.integer("Total number of records matching the request."),
      pages: s.integer("Total number of pages matching the request."),
    },
    { optional: ["total", "pages"], additionalProperties: true },
  ),
});
const rawOutputSchema = s.requiredObject("Tuskr object response.", { raw: looseObjectSchema });

const createTestRunInputSchema: JsonSchema = {
  ...s.requiredObject("The input payload for creating a Tuskr test run.", {
    name: s.nonEmptyString("Name of the Tuskr test run to create."),
    project: identifierSchema,
    testCaseInclusionType: s.stringEnum(["ALL", "SPECIFIC"], {
      description: "Which test cases to include in the run.",
    }),
    testCases: s.array("Test case IDs, keys, or names to include.", identifierSchema, {
      minItems: 1,
    }),
    description: s.nonEmptyString("Test run description."),
    deadline: s.date("Test run deadline in YYYY-MM-DD format."),
    assignedTo: identifierSchema,
  }),
  required: ["name", "project", "testCaseInclusionType"],
  if: {
    properties: { testCaseInclusionType: { const: "SPECIFIC" } },
    required: ["testCaseInclusionType"],
  },
  then: { required: ["testCases"] },
};

export const tuskrActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    operationType: "read",
    description: "List Tuskr projects with optional filters.",
    inputSchema: s.object(
      "The input payload for listing Tuskr projects.",
      {
        name: s.nonEmptyString("Project name substring to filter by."),
        status: statusSchema,
        page: pageSchema,
      },
      { optional: ["name", "status", "page"] },
    ),
    outputSchema: listResponseSchema,
  }),
  defineProviderAction(service, {
    name: "create_project",
    operationType: "write",
    description: "Create a Tuskr project.",
    inputSchema: s.object(
      "The input payload for creating a Tuskr project.",
      {
        name: s.nonEmptyString("Name of the Tuskr project to create."),
        team: s.record("Project team members keyed by user email.", s.nonEmptyString("Role name.")),
        status: statusSchema,
        description: s.nonEmptyString("Project description."),
        externalId: s.nonEmptyString("External ID to associate with the project."),
        integrationData: s.nonEmptyString("Integration data to associate with the project."),
        issueUrlTemplate: s.nonEmptyString("Issue URL template for the project."),
        referenceUrlTemplate: s.nonEmptyString("Reference URL template for the project."),
      },
      {
        optional: [
          "team",
          "status",
          "description",
          "externalId",
          "integrationData",
          "issueUrlTemplate",
          "referenceUrlTemplate",
        ],
      },
    ),
    outputSchema: rawOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_test_cases",
    operationType: "read",
    description: "List Tuskr test cases for a project.",
    inputSchema: s.object(
      "The input payload for listing Tuskr test cases.",
      {
        project: identifierSchema,
        testSuite: identifierSchema,
        testSuiteSection: identifierSchema,
        key: s.nonEmptyString("Test case key substring to filter by."),
        testCaseType: identifierSchema,
        name: s.nonEmptyString("Test case name substring to filter by."),
        customFields: customFieldsSchema,
        page: pageSchema,
      },
      {
        optional: ["testSuite", "testSuiteSection", "key", "testCaseType", "name", "customFields", "page"],
      },
    ),
    outputSchema: listResponseSchema,
  }),
  defineProviderAction(service, {
    name: "create_test_case",
    operationType: "write",
    description: "Create a Tuskr test case in a project suite section.",
    inputSchema: s.object(
      "The input payload for creating a Tuskr test case.",
      {
        name: s.nonEmptyString("Name of the Tuskr test case to create."),
        project: identifierSchema,
        testSuite: identifierSchema,
        testSuiteSection: identifierSchema,
        description: s.nonEmptyString("Test case description."),
        testCaseType: identifierSchema,
        estimatedTimeInMinutes: s.nonNegativeInteger("Estimated execution time in minutes."),
        customFields: customFieldsSchema,
      },
      {
        optional: ["description", "testCaseType", "estimatedTimeInMinutes", "customFields"],
      },
    ),
    outputSchema: rawOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_test_runs",
    operationType: "read",
    description: "List Tuskr test runs for a project.",
    inputSchema: s.object(
      "The input payload for listing Tuskr test runs.",
      {
        project: identifierSchema,
        name: s.nonEmptyString("Test run name substring to filter by."),
        key: s.nonEmptyString("Test run key substring to filter by."),
        status: statusSchema,
        assignedTo: identifierSchema,
        page: pageSchema,
      },
      { optional: ["name", "key", "status", "assignedTo", "page"] },
    ),
    outputSchema: listResponseSchema,
  }),
  defineProviderAction(service, {
    name: "create_test_run",
    operationType: "write",
    description: "Create a Tuskr test run.",
    inputSchema: createTestRunInputSchema,
    outputSchema: rawOutputSchema,
  }),
  defineProviderAction(service, {
    name: "add_test_run_results",
    operationType: "write",
    description: "Add the same Tuskr result to multiple test cases in a test run.",
    inputSchema: s.object(
      "The input payload for adding Tuskr results to test cases in a test run.",
      {
        status: s.nonEmptyString("Tuskr result status key, such as PASSED or FAILED."),
        testRun: identifierSchema,
        testCases: s.array("Test case IDs, keys, or names to update.", identifierSchema, { minItems: 1 }),
        assignedTo: identifierSchema,
        comments: s.nonEmptyString("Result comments."),
        timeSpentInMinutes: s.nonNegativeInteger("Time spent in minutes."),
        customFields: customFieldsSchema,
      },
      { optional: ["assignedTo", "comments", "timeSpentInMinutes", "customFields"] },
    ),
    outputSchema: rawOutputSchema,
  }),
];
