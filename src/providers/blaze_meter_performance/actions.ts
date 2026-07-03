import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "blaze_meter_performance";

const sortSchema = s.array(
  "Sort fields accepted by BlazeMeter, such as name or -created.",
  s.nonEmptyString("One BlazeMeter sort field. Prefix with - for descending order."),
);

const paginationInputSchema = s.object(
  "Pagination controls accepted by BlazeMeter list endpoints.",
  {
    skip: s.nonNegativeInteger("The number of records to skip before returning results."),
    limit: s.positiveInteger("The maximum number of records to return."),
    sort: sortSchema,
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
    sort: sortSchema,
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
    sort: sortSchema,
  },
  { optional: ["workspaceId", "projectId", "skip", "limit", "sort"] },
);
listTestsInputSchema.anyOf = [{ required: ["workspaceId"] }, { required: ["projectId"] }];

const errorSchema = s.object(
  "The error object returned by BlazeMeter when a request fails.",
  {
    code: s.nullable(s.integer("The numeric BlazeMeter error code.")),
    message: s.nullable(s.string("The BlazeMeter error message.")),
  },
  { optional: ["code", "message"] },
);

const responseEnvelopeSchema = s.actionOutput(
  {
    apiVersion: s.nullable(s.integer("The BlazeMeter API version returned by the endpoint.")),
    requestId: s.nullable(s.string("The BlazeMeter request identifier.")),
    error: s.nullable(errorSchema),
    result: s.unknown("The result payload returned by BlazeMeter."),
    total: s.nullable(s.integer("The total number of matching records when returned.")),
    limit: s.nullable(s.integer("The response limit when returned.")),
    skip: s.nullable(s.integer("The response offset when returned.")),
    hidden: s.nullable(s.integer("The number of hidden records when returned.")),
    raw: s.looseObject("The raw BlazeMeter response object."),
  },
  "A normalized BlazeMeter API v4 response envelope.",
);

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
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_accounts",
    description: "List BlazeMeter accounts available to the configured API key.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_workspaces",
    description: "List BlazeMeter workspaces for an account.",
    requiredScopes: [],
    inputSchema: workspaceFilterInputSchema,
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List BlazeMeter projects for a workspace.",
    requiredScopes: [],
    inputSchema: projectListInputSchema,
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "list_tests",
    description: "List BlazeMeter performance tests by workspace or project.",
    requiredScopes: [],
    inputSchema: listTestsInputSchema,
    outputSchema: responseEnvelopeSchema,
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
    outputSchema: responseEnvelopeSchema,
  }),
];
