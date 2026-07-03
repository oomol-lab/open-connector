import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "blaze_meter_service_virtualization";

const serviceMockTemplateIdSchema = s.positiveInteger("The BlazeMeter service mock template ID.");
const workspaceIdSchema = s.positiveInteger("The BlazeMeter workspace ID that contains service mock templates.");
const endpointPreferenceSchema = s.stringEnum("The protocol preference for the virtual service endpoint.", [
  "HTTP",
  "HTTPS",
]);
const noMatchingRequestPreferenceSchema = s.stringEnum(
  "The behavior BlazeMeter should use when no mock request matches.",
  ["return404", "bypasslive"],
);

const updateServiceMockTemplateInputSchema: JsonSchema = s.object(
  "Input for updating a BlazeMeter service mock template.",
  {
    workspaceId: workspaceIdSchema,
    templateId: serviceMockTemplateIdSchema,
    name: s.string("The updated service mock template name.", { minLength: 1, pattern: "\\S" }),
    description: s.string("The updated service mock template description.", { minLength: 1, pattern: "\\S" }),
    thinkTime: s.nonNegativeInteger("The synthetic delay between test steps in milliseconds."),
    liveSystemHost: s.string("The live system host URL to forward unmatched requests to.", {
      minLength: 1,
      pattern: "^https?://",
    }),
    liveSystemPort: s.positiveInteger("The live system port number."),
    endpointPreference: endpointPreferenceSchema,
    noMatchingRequestPreference: noMatchingRequestPreferenceSchema,
  },
  {
    optional: [
      "name",
      "description",
      "thinkTime",
      "liveSystemHost",
      "liveSystemPort",
      "endpointPreference",
      "noMatchingRequestPreference",
    ],
  },
);
updateServiceMockTemplateInputSchema.anyOf = [
  "name",
  "description",
  "thinkTime",
  "liveSystemHost",
  "liveSystemPort",
  "endpointPreference",
  "noMatchingRequestPreference",
].map((field) => ({ required: [field] }));

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

export type BlazeMeterServiceVirtualizationActionName =
  | "list_service_mock_templates"
  | "get_service_mock_template"
  | "update_service_mock_template";

export const blazeMeterServiceVirtualizationActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_service_mock_templates",
    description: "List BlazeMeter Service Virtualization service mock templates in a workspace.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
      },
      ["workspaceId"],
      "Input for listing BlazeMeter Service Virtualization service mock templates.",
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_service_mock_template",
    description: "Get one BlazeMeter Service Virtualization service mock template by template ID.",
    requiredScopes: [],
    inputSchema: s.actionInput(
      {
        workspaceId: workspaceIdSchema,
        templateId: serviceMockTemplateIdSchema,
      },
      ["workspaceId", "templateId"],
      "Input for retrieving one BlazeMeter service mock template.",
    ),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "update_service_mock_template",
    description: "Update JSON-safe configuration fields for one BlazeMeter service mock template.",
    requiredScopes: [],
    inputSchema: updateServiceMockTemplateInputSchema,
    outputSchema: responseEnvelopeSchema,
  }),
];
