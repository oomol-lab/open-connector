import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "runscope" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const bucketKeySchema = nonEmptyString("The Runscope bucket key from the API Monitoring project.");
const testIdSchema = s.uuid("The Runscope test UUID.");
const paginationLimitSchema = s.integer("The maximum number of records to return.", {
  minimum: 1,
  maximum: 100,
});
const paginationOffsetSchema = s.nonNegativeInteger("The number of records to skip.");
const resultCountSchema = s.integer("The maximum number of test results to return.", {
  minimum: 1,
  maximum: 50,
});
const unixTimestampSchema = s.number("A Unix timestamp filter accepted by Runscope.");

const metaSchema = s.looseObject("The Runscope response metadata.", {
  status: s.string("The Runscope response status."),
});

const teamSchema = s.looseObject("A Runscope team object.", {
  id: s.string("The team identifier."),
  uuid: s.string("The team UUID."),
  name: s.string("The team name."),
  is_paying_team: s.boolean("Whether this team has a paid plan."),
});

const accountSchema = s.looseObject("A Runscope account object.", {
  id: s.string("The Runscope user identifier."),
  uuid: s.string("The Runscope user UUID."),
  email: s.email("The Runscope user email address."),
  name: s.string("The Runscope user name."),
  created_at: s.integer("The Unix timestamp when the account was created."),
  teams: s.array("Teams associated with the Runscope account.", teamSchema),
});

const bucketSchema = s.looseObject("A Runscope bucket object.", {
  key: s.string("The bucket key."),
  name: s.string("The bucket name."),
  default: s.boolean("Whether this bucket is the default bucket."),
  verify_ssl: s.boolean("Whether SSL verification is enabled for this bucket."),
  tests_count: s.integer("The number of tests in the bucket."),
  team: teamSchema,
  created_at: s.string("The bucket creation time."),
  trigger_url: s.url("The bucket trigger URL."),
  tests_url: s.url("The bucket tests URL."),
  is_private: s.boolean("Whether this bucket is private."),
});

const testSchema = s.looseObject("A Runscope API Monitoring test object.", {
  id: s.string("The test identifier."),
  uuid: s.string("The test UUID."),
  name: s.string("The test name."),
  description: s.string("The test description."),
  default_environment_id: s.string("The default environment UUID for this test."),
  trigger_url: s.url("The test trigger URL."),
  created_at: s.string("The test creation time."),
  last_run: s.looseObject("The most recent Runscope test result."),
});

const environmentSchema = s.looseObject("A Runscope environment object.", {
  id: s.string("The environment UUID."),
  name: s.string("The environment name."),
  test_id: s.nullable(s.string("The owning test UUID, or null for shared environments.")),
  verify_ssl: s.boolean("Whether SSL verification is enabled for this environment."),
  preserve_cookies: s.boolean("Whether Runscope preserves cookies between requests."),
  regions: s.array("Runscope regions enabled for this environment.", s.string("One region ID.")),
  initial_variables: s.record(
    "Initial environment variables keyed by variable name.",
    s.string("One initial environment variable value."),
  ),
  headers: s.record("Default headers keyed by header name.", s.string("One header value.")),
});

const testResultSchema = s.looseObject("A Runscope test result object.", {
  test_run_id: s.string("The test run identifier."),
  test_id: s.string("The test UUID."),
  bucket_key: s.string("The bucket key where the test resides."),
  result: s.stringEnum("The overall test result.", ["pass", "fail"]),
  source: s.string("How the test run was triggered."),
  region: s.string("The region where the test ran."),
  started_at: s.number("The Unix timestamp when the test run started."),
  finished_at: s.number("The Unix timestamp when the test run finished."),
  requests_executed: s.integer("The number of HTTP requests executed."),
  assertions_defined: s.integer("The number of assertions defined."),
  assertions_failed: s.integer("The number of assertions that failed."),
  assertions_passed: s.integer("The number of assertions that passed."),
  environment_id: s.string("The environment UUID used for this test run."),
  environment_name: s.string("The environment name used for this test run."),
  test_name: s.string("The test name."),
  test_run_url: s.url("The URL to view this test run."),
  run_by: s.string("The user who triggered the test run."),
});

const listBucketsInputSchema = s.object(
  "Query parameters for listing Runscope buckets.",
  {
    limit: paginationLimitSchema,
    offset: paginationOffsetSchema,
  },
  { optional: ["limit", "offset"] },
);

const getBucketInputSchema = s.object("Input for retrieving a Runscope bucket.", {
  bucketKey: bucketKeySchema,
});

const listTestsInputSchema = s.object(
  "Path and query parameters for listing Runscope tests.",
  {
    bucketKey: bucketKeySchema,
    limit: paginationLimitSchema,
    offset: paginationOffsetSchema,
  },
  { optional: ["limit", "offset"] },
);

const getTestInputSchema = s.object("Input for retrieving a Runscope test.", {
  bucketKey: bucketKeySchema,
  testId: testIdSchema,
});

const listEnvironmentsInputSchema = s.object("Input for listing shared Runscope environments in a bucket.", {
  bucketKey: bucketKeySchema,
});

const listTestResultsInputSchema = s.object(
  "Path and query parameters for listing Runscope test results.",
  {
    bucketKey: bucketKeySchema,
    testId: testIdSchema,
    count: resultCountSchema,
    before: unixTimestampSchema,
    since: unixTimestampSchema,
  },
  { optional: ["count", "before", "since"] },
);

const accountOutputSchema = s.object("Runscope account response.", {
  account: accountSchema,
  meta: metaSchema,
  raw: s.looseObject("The raw Runscope response envelope."),
});

const listBucketsOutputSchema = s.object("Runscope bucket list response.", {
  buckets: s.array("Buckets returned by Runscope.", bucketSchema),
  meta: metaSchema,
  raw: s.looseObject("The raw Runscope response envelope."),
});

const getBucketOutputSchema = s.object("Runscope bucket response.", {
  bucket: bucketSchema,
  meta: metaSchema,
  raw: s.looseObject("The raw Runscope response envelope."),
});

const listTestsOutputSchema = s.object("Runscope test list response.", {
  tests: s.array("Tests returned by Runscope.", testSchema),
  meta: metaSchema,
  raw: s.looseObject("The raw Runscope response envelope."),
});

const getTestOutputSchema = s.object("Runscope test response.", {
  test: testSchema,
  meta: metaSchema,
  raw: s.looseObject("The raw Runscope response envelope."),
});

const listEnvironmentsOutputSchema = s.object("Runscope shared environment list response.", {
  environments: s.array("Shared environments returned by Runscope.", environmentSchema),
  meta: metaSchema,
  raw: s.looseObject("The raw Runscope response envelope."),
});

const listTestResultsOutputSchema = s.object("Runscope test result list response.", {
  results: s.array("Test results returned by Runscope.", testResultSchema),
  meta: metaSchema,
  raw: s.looseObject("The raw Runscope response envelope."),
});

export const runscopeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    operationType: "read",
    description: "Get details for the authenticated Runscope account.",
    requiredScopes: [],
    inputSchema: s.object("Input for getting the authenticated Runscope account.", {}),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_buckets",
    operationType: "read",
    description: "List Runscope API Monitoring buckets accessible to the authenticated account.",
    requiredScopes: [],
    inputSchema: listBucketsInputSchema,
    outputSchema: listBucketsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bucket",
    operationType: "read",
    description: "Get details for a Runscope API Monitoring bucket.",
    requiredScopes: [],
    inputSchema: getBucketInputSchema,
    outputSchema: getBucketOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_tests",
    operationType: "read",
    description: "List Runscope API Monitoring tests in a bucket.",
    requiredScopes: [],
    inputSchema: listTestsInputSchema,
    outputSchema: listTestsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_test",
    operationType: "read",
    description: "Get details for a Runscope API Monitoring test.",
    requiredScopes: [],
    inputSchema: getTestInputSchema,
    outputSchema: getTestOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_environments",
    operationType: "read",
    description: "List shared Runscope environments in a bucket.",
    requiredScopes: [],
    inputSchema: listEnvironmentsInputSchema,
    outputSchema: listEnvironmentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_test_results",
    operationType: "read",
    description: "List recent Runscope API Monitoring results for a test.",
    requiredScopes: [],
    inputSchema: listTestResultsInputSchema,
    outputSchema: listTestResultsOutputSchema,
  }),
];
