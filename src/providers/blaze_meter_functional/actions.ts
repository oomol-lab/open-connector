import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "blaze_meter_functional";

const sortSchema = s.array(
  "Sort fields accepted by BlazeMeter, such as name or -created.",
  s.nonEmptyString("One BlazeMeter sort field. Prefix with - for descending order."),
);

const listMultiTestsInputSchema = s.object(
  "Input for listing BlazeMeter Functional multi-tests.",
  {
    workspaceId: s.positiveInteger("The BlazeMeter workspace ID to list multi-tests from."),
    projectId: s.positiveInteger("The BlazeMeter project ID used to filter multi-tests."),
    skip: s.nonNegativeInteger("The number of multi-tests to skip before returning results."),
    limit: s.positiveInteger("The maximum number of multi-tests to return."),
    sort: sortSchema,
  },
  { optional: ["projectId", "skip", "limit", "sort"] },
);

const getMultiTestInputSchema = s.object(
  "Input for retrieving one BlazeMeter Functional multi-test.",
  {
    collectionId: s.nonNegativeInteger("The BlazeMeter multi-test collection ID to retrieve."),
    populateTests: s.boolean("Whether BlazeMeter should include embedded test objects."),
  },
  { optional: ["populateTests"] },
);

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

export type BlazeMeterFunctionalActionName = "list_multi_tests" | "get_multi_test" | "get_active_sessions";

export const blazeMeterFunctionalActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_multi_tests",
    description: "List BlazeMeter Functional multi-tests in a workspace.",
    requiredScopes: [],
    inputSchema: listMultiTestsInputSchema,
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_multi_test",
    description: "Get one BlazeMeter Functional multi-test by collection ID.",
    requiredScopes: [],
    inputSchema: getMultiTestInputSchema,
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_active_sessions",
    description: "Get the active BlazeMeter sessions for the configured API key.",
    requiredScopes: [],
    inputSchema: s.object("Input for getting active BlazeMeter sessions.", {}),
    outputSchema: responseEnvelopeSchema,
  }),
];
