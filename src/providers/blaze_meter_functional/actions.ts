import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { blazeMeterResponseEnvelopeSchema, blazeMeterSortSchema } from "../blaze_meter_performance/shared-schemas.ts";

const service = "blaze_meter_functional";

const listMultiTestsInputSchema = s.object(
  "Input for listing BlazeMeter Functional multi-tests.",
  {
    workspaceId: s.positiveInteger("The BlazeMeter workspace ID to list multi-tests from."),
    projectId: s.positiveInteger("The BlazeMeter project ID used to filter multi-tests."),
    skip: s.nonNegativeInteger("The number of multi-tests to skip before returning results."),
    limit: s.positiveInteger("The maximum number of multi-tests to return."),
    sort: blazeMeterSortSchema,
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

export const blazeMeterFunctionalActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_multi_tests",
    description: "List BlazeMeter Functional multi-tests in a workspace.",
    requiredScopes: [],
    inputSchema: listMultiTestsInputSchema,
    outputSchema: blazeMeterResponseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_multi_test",
    description: "Get one BlazeMeter Functional multi-test by collection ID.",
    requiredScopes: [],
    inputSchema: getMultiTestInputSchema,
    outputSchema: blazeMeterResponseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_active_sessions",
    description: "Get the active BlazeMeter sessions for the configured API key.",
    requiredScopes: [],
    inputSchema: s.object("Input for getting active BlazeMeter sessions.", {}),
    outputSchema: blazeMeterResponseEnvelopeSchema,
  }),
];
