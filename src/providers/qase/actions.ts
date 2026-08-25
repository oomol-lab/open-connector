import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "qase";
const projectCodeSchema = s.string("The Qase project code.", {
  minLength: 2,
  maxLength: 10,
});
const entityIdSchema = s.integer("The Qase entity ID.", { minimum: 1 });
const looseEntitySchema = (description: string) => s.looseObject(description);
const paginationFields = {
  limit: s.integer("The maximum number of entities to return.", { minimum: 1, maximum: 100 }),
  offset: s.integer("The number of entities to skip.", { minimum: 0, maximum: 100000 }),
};
const pageOutputSchema = (description: string, entityDescription: string) =>
  s.object(description, {
    total: s.nonNegativeInteger("The total number of available entities."),
    filtered: s.nonNegativeInteger("The number of entities matching the current filters."),
    count: s.nonNegativeInteger("The number of entities returned in this page."),
    entities: s.array("The entities returned in this page.", looseEntitySchema(entityDescription)),
  });
export const qaseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_projects",
    description: "List Qase projects accessible to the connected account.",
    requiredScopes: [],
    inputSchema: s.object("Controls project pagination.", paginationFields, {
      optional: ["limit", "offset"],
    }),
    outputSchema: pageOutputSchema("A page of Qase projects.", "A Qase project."),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Retrieve a Qase project by its code.",
    requiredScopes: [],
    inputSchema: s.object("Identifies the Qase project.", { projectCode: projectCodeSchema }),
    outputSchema: s.object("The requested Qase project.", {
      project: looseEntitySchema("The requested Qase project."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_cases",
    description: "List test cases in a Qase project with common filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Selects the Qase test cases to list.",
      {
        projectCode: projectCodeSchema,
        search: s.string("Text used to search test case titles."),
        suiteId: entityIdSchema,
        status: s.string("A comma-separated list of case statuses."),
        priority: s.string("A comma-separated list of case priorities."),
        type: s.string("A comma-separated list of case types."),
        ...paginationFields,
      },
      { optional: ["search", "suiteId", "status", "priority", "type", "limit", "offset"] },
    ),
    outputSchema: pageOutputSchema("A page of Qase test cases.", "A Qase test case."),
  }),
  defineProviderAction(service, {
    name: "get_case",
    description: "Retrieve one test case from a Qase project.",
    requiredScopes: [],
    inputSchema: s.object("Identifies the Qase test case.", {
      projectCode: projectCodeSchema,
      caseId: entityIdSchema,
    }),
    outputSchema: s.object("The requested Qase test case.", {
      testCase: looseEntitySchema("The requested Qase test case."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_case",
    description: "Create a test case in a Qase project.",
    requiredScopes: [],
    inputSchema: s.object(
      "Defines the Qase test case to create.",
      {
        projectCode: projectCodeSchema,
        title: s.string("The test case title.", { minLength: 1, maxLength: 255 }),
        description: s.string("The test case description."),
        preconditions: s.string("Conditions that must be met before the test begins."),
        postconditions: s.string("Conditions expected after the test finishes."),
        suiteId: entityIdSchema,
        isManual: s.boolean("Whether the test case is manual."),
        isToBeAutomated: s.boolean("Whether a manual test case is planned for automation."),
        tags: s.array("Tags to assign to the test case.", s.string("A tag name.")),
      },
      {
        optional: ["description", "preconditions", "postconditions", "suiteId", "isManual", "isToBeAutomated", "tags"],
      },
    ),
    outputSchema: s.object("Identifies the created Qase test case.", {
      caseId: entityIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_runs",
    description: "List test runs in a Qase project with common filters and pagination.",
    requiredScopes: [],
    inputSchema: s.object(
      "Selects the Qase test runs to list.",
      {
        projectCode: projectCodeSchema,
        search: s.string("Text used to search test run titles."),
        status: s.string("A comma-separated list of run statuses."),
        ...paginationFields,
      },
      { optional: ["search", "status", "limit", "offset"] },
    ),
    outputSchema: pageOutputSchema("A page of Qase test runs.", "A Qase test run."),
  }),
  defineProviderAction(service, {
    name: "get_run",
    description: "Retrieve one test run from a Qase project.",
    requiredScopes: [],
    inputSchema: s.object("Identifies the Qase test run.", {
      projectCode: projectCodeSchema,
      runId: entityIdSchema,
    }),
    outputSchema: s.object("The requested Qase test run.", {
      run: looseEntitySchema("The requested Qase test run."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_run",
    description: "Create a test run in a Qase project.",
    requiredScopes: [],
    inputSchema: s.object(
      "Defines the Qase test run to create.",
      {
        projectCode: projectCodeSchema,
        title: s.string("The test run title.", { minLength: 1, maxLength: 255 }),
        description: s.string("The test run description.", { maxLength: 10000 }),
        includeAllCases: s.boolean("Whether the run includes every test case in the project."),
        caseIds: s.array("The test case IDs to include.", entityIdSchema),
        environmentId: entityIdSchema,
        milestoneId: entityIdSchema,
        planId: entityIdSchema,
        tags: s.array("Tags to assign to the test run.", s.string("A tag name.")),
      },
      {
        optional: ["description", "includeAllCases", "caseIds", "environmentId", "milestoneId", "planId", "tags"],
      },
    ),
    outputSchema: s.object("Identifies the created Qase test run.", {
      runId: entityIdSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "complete_run",
    description: "Complete an active test run in a Qase project.",
    requiredScopes: [],
    inputSchema: s.object("Identifies the Qase test run to complete.", {
      projectCode: projectCodeSchema,
      runId: entityIdSchema,
    }),
    outputSchema: s.object("Confirms that the Qase test run was completed.", {
      completed: s.boolean("Whether the test run was completed."),
    }),
  }),
];
