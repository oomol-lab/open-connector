import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bugbug";

const paginationCountField = s.integer("Total number of results available.");
const paginationNextField = s.nullableString("URL for the next page of results, or null when there is no next page.");
const paginationPreviousField = s.nullableString(
  "URL for the previous page of results, or null when there is no previous page.",
);
const pageField = s.positiveInteger("Page number to return.");
const pageSizeField = s.positiveInteger("Number of results to return per page.");
const idField = s.uuid("UUID of the requested BugBug resource.");
const queryField = s.nonEmptyString("Search string used to filter results by name.");

const testStatusField = s.stringEnum("Current BugBug test run status.", [
  "auto_retrying",
  "error",
  "failed",
  "initialized",
  "passed",
  "paused",
  "queued",
  "recording",
  "running",
  "skipped",
  "stopped",
]);

const listOrderingField = s.stringEnum("Field used to sort the list response.", [
  "-created",
  "-name",
  "created",
  "name",
]);
const testRunOrderingField = s.stringEnum("Field used to sort test runs by start time.", ["-started", "started"]);

const testSummarySchema = s.looseObject("BugBug test summary.", {
  id: s.uuid("UUID of the test."),
  name: s.string("Name of the test."),
});

const testDetailsSchema = s.looseObject("BugBug test details.", {
  id: s.uuid("UUID of the test."),
  name: s.string("Name of the test."),
  groups: s.string("Group value returned by BugBug for the test."),
  notes: s.nullableString("Notes configured on the test."),
  screenSizeType: s.stringEnum("Screen size type configured for the test.", ["desktop", "mobile", "custom"]),
});

const suiteSummarySchema = s.looseObject("BugBug suite summary.", {
  id: s.uuid("UUID of the suite."),
  name: s.nullableString("Name of the suite."),
  testsCount: s.integer("Number of tests currently linked to the suite."),
});

const suiteTestSchema = s.looseObject("Suite test entry returned by BugBug.");
const suiteDetailsSchema = s.looseObject("BugBug suite details.", {
  id: s.uuid("UUID of the suite."),
  name: s.nullableString("Name of the suite."),
  testsCount: s.integer("Number of tests currently linked to the suite."),
  tests: s.array("Tests linked to the suite.", suiteTestSchema),
  autoAddNewTests: s.boolean("Whether newly created tests are automatically added to the suite."),
  autoRetry: s.integer("Automatic retry count configured for the suite."),
  notes: s.nullableString("Notes configured on the suite."),
  runInParallel: s.boolean("Whether tests in the suite run in parallel."),
  runProfileId: s.nullable(s.uuid("Run profile UUID used by the suite.")),
});

const profileSummarySchema = s.looseObject("BugBug run profile summary.", {
  id: s.uuid("UUID of the run profile."),
  name: s.string("Name of the run profile."),
  isDefault: s.boolean("Whether this run profile is the default one."),
});

const testRunSummarySchema = s.looseObject("BugBug test run summary.", {
  id: s.uuid("UUID of the test run."),
  name: s.string("Name of the executed test."),
  status: testStatusField,
  runMode: s.string("Run mode used by the test run."),
  started: s.nullableString("Datetime when the test run started."),
  triggeredBy: s.string("Source that triggered the test run."),
  testId: s.nullable(s.uuid("UUID of the executed test.")),
  duration: s.nullableString("Duration string returned by BugBug."),
  browserWidth: s.nullableInteger("Browser width used by the test run."),
  browserHeight: s.nullableInteger("Browser height used by the test run."),
  webappUrl: s.string("BugBug web app URL for the test run."),
});

const testRunStatusSchema = s.looseObject("BugBug test run status.", {
  id: s.uuid("UUID of the test run."),
  modified: s.dateTime("Datetime when the test run status was last modified."),
  status: testStatusField,
  webappUrl: s.string("BugBug web app URL for the test run."),
});

const overrideVariableSchema = s.object(
  "BugBug variable override.",
  {
    key: s.nonEmptyString("Variable key to override for the test run."),
    value: s.nullableString("Variable value to apply for the test run."),
  },
  { optional: ["value"] },
);

function buildPaginatedOutputSchema(itemSchema: JsonSchema, description: string): JsonSchema {
  return s.actionOutput(
    {
      count: paginationCountField,
      next: paginationNextField,
      previous: paginationPreviousField,
      results: s.array("Results returned for the current page.", itemSchema),
    },
    description,
  );
}

const listTestsInputSchema = s.actionInput(
  {
    ordering: listOrderingField,
    page: pageField,
    page_size: pageSizeField,
    query: queryField,
  },
  [],
  "Input payload for listing BugBug tests.",
);

const getTestInputSchema = s.actionInput(
  {
    id: idField,
  },
  ["id"],
  "Input payload for retrieving a BugBug test.",
);

const listSuitesInputSchema = s.actionInput(
  {
    ordering: listOrderingField,
    page: pageField,
    page_size: pageSizeField,
    query: queryField,
  },
  [],
  "Input payload for listing BugBug suites.",
);

const getSuiteInputSchema = s.actionInput(
  {
    id: idField,
  },
  ["id"],
  "Input payload for retrieving a BugBug suite.",
);

const listProfilesInputSchema = s.actionInput(
  {
    page: pageField,
    page_size: pageSizeField,
  },
  [],
  "Input payload for listing BugBug run profiles.",
);

const listTestRunsInputSchema = s.actionInput(
  {
    ordering: testRunOrderingField,
    page: pageField,
    page_size: pageSizeField,
    started_after: s.dateTime("Only include test runs started after this RFC3339 datetime."),
    started_before: s.dateTime("Only include test runs started before this RFC3339 datetime."),
    status: testStatusField,
    test_id: s.uuid("Only include test runs for this test UUID."),
  },
  [],
  "Input payload for listing BugBug test runs.",
);

const runTestInputSchema = s.actionInput(
  {
    testId: s.uuid("UUID of the test to execute."),
    runProfileId: s.nullable(s.uuid("Optional BugBug run profile UUID used for execution.")),
    variables: s.nullable(s.array("Optional variable overrides forwarded to BugBug.", overrideVariableSchema)),
  },
  ["testId"],
  "Input payload for executing a BugBug test.",
);

const getTestRunStatusInputSchema = s.actionInput(
  {
    id: idField,
  },
  ["id"],
  "Input payload for retrieving the current status of a BugBug test run.",
);

export const bugbugActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tests",
    operationType: "read",
    description: "List tests available in the connected BugBug workspace.",
    inputSchema: listTestsInputSchema,
    outputSchema: buildPaginatedOutputSchema(testSummarySchema, "Paginated BugBug test list."),
  }),
  defineProviderAction(service, {
    name: "get_test",
    operationType: "read",
    description: "Retrieve details for a specific BugBug test by ID.",
    inputSchema: getTestInputSchema,
    outputSchema: testDetailsSchema,
  }),
  defineProviderAction(service, {
    name: "list_suites",
    operationType: "read",
    description: "List suites available in the connected BugBug workspace.",
    inputSchema: listSuitesInputSchema,
    outputSchema: buildPaginatedOutputSchema(suiteSummarySchema, "Paginated BugBug suite list."),
  }),
  defineProviderAction(service, {
    name: "get_suite",
    operationType: "read",
    description: "Retrieve details for a specific BugBug suite by ID.",
    inputSchema: getSuiteInputSchema,
    outputSchema: suiteDetailsSchema,
  }),
  defineProviderAction(service, {
    name: "list_profiles",
    operationType: "read",
    description: "List run profiles available for executing BugBug tests.",
    inputSchema: listProfilesInputSchema,
    outputSchema: buildPaginatedOutputSchema(profileSummarySchema, "Paginated BugBug run profile list."),
  }),
  defineProviderAction(service, {
    name: "list_test_runs",
    operationType: "read",
    description: "List historical BugBug test runs with optional filters.",
    inputSchema: listTestRunsInputSchema,
    outputSchema: buildPaginatedOutputSchema(testRunSummarySchema, "Paginated BugBug test run list."),
  }),
  defineProviderAction(service, {
    name: "run_test",
    operationType: "write",
    description: "Execute a BugBug test using the official RunTest request contract.",
    followUpActions: ["bugbug.get_test_run_status"],
    inputSchema: runTestInputSchema,
    outputSchema: testRunStatusSchema,
  }),
  defineProviderAction(service, {
    name: "get_test_run_status",
    operationType: "read",
    description: "Retrieve the current status of a BugBug test run by ID.",
    inputSchema: getTestRunStatusInputSchema,
    outputSchema: testRunStatusSchema,
  }),
];
