import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { blazeMeterResponseEnvelopeSchema, blazeMeterSortSchema } from "./shared-schemas.ts";

const service = "blaze_meter_performance";

const paginationInputSchema = s.object(
  "Pagination controls accepted by BlazeMeter list endpoints.",
  {
    skip: s.nonNegativeInteger("The number of records to skip before returning results."),
    limit: s.positiveInteger("The maximum number of records to return."),
    sort: blazeMeterSortSchema,
  },
  { optional: ["skip", "limit", "sort"] },
);

const workspaceFilterInputSchema = s.object(
  "Input for listing BlazeMeter workspaces under an account.",
  {
    accountId: s.positiveInteger("The BlazeMeter account ID to list workspaces from."),
    enabled: s.boolean("Whether to return only enabled or disabled workspaces."),
    textFilter: s.nonEmptyString("A text filter matched against workspace names."),
  },
  { optional: ["enabled", "textFilter"] },
);

const projectListInputSchema = s.object(
  "Input for listing BlazeMeter projects under a workspace.",
  {
    workspaceId: s.positiveInteger("The BlazeMeter workspace ID to list projects from."),
    skip: s.nonNegativeInteger("The number of projects to skip before returning results."),
    limit: s.positiveInteger("The maximum number of projects to return."),
    sort: blazeMeterSortSchema,
  },
  { optional: ["skip", "limit", "sort"] },
);

const listTestsInputSchema: JsonSchema = s.object(
  "Input for listing BlazeMeter performance tests.",
  {
    workspaceId: s.positiveInteger("The BlazeMeter workspace ID used to filter tests."),
    projectId: s.positiveInteger("The BlazeMeter project ID used to filter tests."),
    skip: s.nonNegativeInteger("The number of tests to skip before returning results."),
    limit: s.positiveInteger("The maximum number of tests to return."),
    sort: blazeMeterSortSchema,
  },
  { optional: ["workspaceId", "projectId", "skip", "limit", "sort"] },
);
listTestsInputSchema.anyOf = [{ required: ["workspaceId"] }, { required: ["projectId"] }];

export type BlazeMeterPerformanceActionName =
  | "get_user"
  | "list_accounts"
  | "list_workspaces"
  | "list_projects"
  | "list_tests"
  | "get_test";

export const blazeMeterPerformanceActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_user",
    description: "Get the BlazeMeter user profile associated with the configured API key.",
    requiredScopes: [],
    inputSchema: s.object("Input for getting the current BlazeMeter user.", {}),
    outputSchema: blazeMeterResponseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List BlazeMeter accounts available to the configured API key.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: blazeMeterResponseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List BlazeMeter workspaces for an account.",
    requiredScopes: [],
    inputSchema: workspaceFilterInputSchema,
    outputSchema: blazeMeterResponseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List BlazeMeter projects for a workspace.",
    requiredScopes: [],
    inputSchema: projectListInputSchema,
    outputSchema: blazeMeterResponseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_tests",
    description: "List BlazeMeter performance tests by workspace or project.",
    requiredScopes: [],
    inputSchema: listTestsInputSchema,
    outputSchema: blazeMeterResponseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_test",
    description: "Get one BlazeMeter performance test by ID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        testId: s.positiveInteger("The BlazeMeter test ID to retrieve."),
      },
      ["testId"],
      "Input for retrieving one BlazeMeter performance test.",
    ),
    outputSchema: blazeMeterResponseEnvelopeSchema,
  }),
];
