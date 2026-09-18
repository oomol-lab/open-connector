import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "checkly";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const checkTypeSchema = s.stringEnum("Checkly check type filter.", [
  "AGENTIC",
  "API",
  "BROWSER",
  "HEARTBEAT",
  "ICMP",
  "MULTI_STEP",
  "TCP",
  "PLAYWRIGHT",
  "TRACEROUTE",
  "URL",
  "DNS",
]);
const statusSchema = s.stringEnum("Current check status filter.", ["passing", "failing", "degraded"]);
const resultTypeSchema = s.stringEnum("Check result type filter.", ["FINAL", "ATTEMPT", "ALL"]);

const accountSchema = s.looseObject("Checkly account details returned by the Public API.", {
  id: nonEmptyString("Checkly account ID."),
  name: s.string("Checkly account name."),
  runtimeId: s.string("Default runtime ID for the Checkly account."),
  plan: s.string("Checkly plan identifier."),
  planDisplayName: s.string("Human-readable Checkly plan name."),
});
const checkSchema = s.looseObject("Checkly check returned by the Public API.", {
  id: s.string("Checkly check ID."),
  checkType: checkTypeSchema,
  name: s.string("Checkly check name."),
  activated: s.boolean("Whether the check is activated."),
  muted: s.boolean("Whether the check is muted."),
});
const checkStatusSchema = s.looseObject("Current Checkly check status.", {
  name: s.string("The name of the check."),
  checkId: s.string("The ID of the check this status belongs to."),
  hasFailures: s.boolean("Whether the check is currently failing."),
  hasErrors: s.boolean("Whether Checkly reported backend errors for this check."),
  isDegraded: s.boolean("Whether the check is currently degraded."),
  lastCheckRunId: s.string("Most recent check run ID."),
});
const resultSchema = s.looseObject("Checkly check result returned by the Public API.", {
  id: s.string("Checkly result ID."),
  name: s.string("The name of the check."),
  checkId: s.string("The ID of the check."),
  hasFailures: s.boolean("Whether any failure occurred during this check run."),
  hasErrors: s.boolean("Whether Checkly reported backend errors for this check run."),
  isDegraded: s.boolean("Whether the check run was degraded."),
  runLocation: s.string("Data center location for this check result."),
  startedAt: s.string("Timestamp when the check run started."),
  stoppedAt: s.string("Timestamp when the check run stopped."),
  resultType: resultTypeSchema,
});

export const checklyActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_account",
    operationType: "read",
    description: "Retrieve details for the Checkly account attached to the API key.",
    inputSchema: s.actionInput({}, [], "Input parameters for retrieving the current Checkly account."),
    outputSchema: s.actionOutput({ account: accountSchema }),
  }),
  defineProviderAction(service, {
    name: "list_checks",
    operationType: "read",
    description: "List Checkly checks with optional type, tag, status, and search filters.",
    inputSchema: s.object(
      "Input parameters for listing Checkly checks.",
      {
        limit: s.integer("Maximum number of checks to return.", { minimum: 1, maximum: 100 }),
        page: s.integer("Page number to retrieve.", { minimum: 1 }),
        apiCheckUrlFilterPattern: nonEmptyString("Filter API checks by a string contained in the checked URL."),
        tag: s.stringArray("Tags used to filter checks.", { minItems: 1, itemDescription: "Tag to match." }),
        checkType: checkTypeSchema,
        search: nonEmptyString("Case-insensitive partial name search."),
        status: statusSchema,
        applyGroupSettings: s.boolean("Whether group settings should be applied to returned checks."),
      },
      {
        optional: [
          "limit",
          "page",
          "apiCheckUrlFilterPattern",
          "tag",
          "checkType",
          "search",
          "status",
          "applyGroupSettings",
        ],
      },
    ),
    outputSchema: s.actionOutput({ checks: s.array("Checks returned by Checkly.", checkSchema) }),
  }),
  defineProviderAction(service, {
    name: "get_check",
    operationType: "read",
    description: "Retrieve one Checkly check by ID.",
    inputSchema: s.object(
      "Input parameters for retrieving one Checkly check.",
      {
        checkId: nonEmptyString("Checkly check identifier."),
        includeDependencies: s.boolean("Whether to include check dependencies in the response."),
        applyGroupSettings: s.boolean("Whether group settings should be applied to the check."),
      },
      { optional: ["includeDependencies", "applyGroupSettings"] },
    ),
    outputSchema: s.actionOutput({ check: checkSchema }),
  }),
  defineProviderAction(service, {
    name: "list_check_statuses",
    operationType: "read",
    description: "List current statuses for Checkly checks.",
    inputSchema: s.actionInput({}, [], "Input parameters for listing Checkly check statuses."),
    outputSchema: s.actionOutput({ statuses: s.array("Current statuses returned by Checkly.", checkStatusSchema) }),
  }),
  defineProviderAction(service, {
    name: "get_check_status",
    operationType: "read",
    description: "Retrieve current status details for one Checkly check.",
    inputSchema: s.actionInput({ checkId: nonEmptyString("Checkly check identifier.") }, ["checkId"]),
    outputSchema: s.actionOutput({ status: checkStatusSchema }),
  }),
  defineProviderAction(service, {
    name: "list_check_results",
    operationType: "read",
    description: "List recent Checkly results for one check.",
    inputSchema: s.object(
      "Input parameters for listing Checkly check results.",
      {
        checkId: nonEmptyString("Checkly check identifier."),
        limit: s.integer("Maximum number of check results to return.", { minimum: 1, maximum: 100 }),
        page: s.integer("Page number to retrieve.", { minimum: 1 }),
        from: nonEmptyString("Lower UNIX timestamp boundary for returned results."),
        to: nonEmptyString("Upper UNIX timestamp boundary for returned results."),
        location: nonEmptyString("Checkly data center location used to filter results."),
        checkType: checkTypeSchema,
        hasFailures: s.boolean("Whether to return only results with failures."),
        resultType: resultTypeSchema,
      },
      { optional: ["limit", "page", "from", "to", "location", "checkType", "hasFailures", "resultType"] },
    ),
    outputSchema: s.actionOutput({ results: s.array("Check results returned by Checkly.", resultSchema) }),
  }),
  defineProviderAction(service, {
    name: "get_check_result",
    operationType: "read",
    description: "Retrieve one Checkly check result by ID.",
    inputSchema: s.actionInput(
      {
        checkId: nonEmptyString("Checkly check identifier."),
        checkResultId: nonEmptyString("Checkly check result identifier."),
      },
      ["checkId", "checkResultId"],
      "Input parameters for retrieving one check result.",
    ),
    outputSchema: s.actionOutput({ result: resultSchema }),
  }),
] satisfies Array<
  ProviderActionDefinition<
    | "get_current_account"
    | "list_checks"
    | "get_check"
    | "list_check_statuses"
    | "get_check_status"
    | "list_check_results"
    | "get_check_result"
  >
>;
