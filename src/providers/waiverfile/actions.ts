import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "waiverfile";
const responseDataSchema = s.anyOf("The complete JSON value returned by WaiverFile.", [
  s.looseObject("A WaiverFile response object."),
  s.array("A WaiverFile response collection.", s.looseObject("One WaiverFile response item.")),
]);
const responseSchema = s.object("The normalized WaiverFile response.", {
  data: responseDataSchema,
});

const referenceInputSchema = {
  ...s.object(
    "Input for finding WaiverFile waivers by external reference identifier.",
    {
      referenceId1: s.nonWhitespaceString("The value matched against reference ID field 1."),
      referenceId2: s.nonWhitespaceString("The value matched against reference ID field 2."),
      referenceId3: s.nonWhitespaceString("The value matched against reference ID field 3."),
      referenceIdAny: s.nonWhitespaceString("The value matched against any of the three reference ID fields."),
    },
    { optional: ["referenceId1", "referenceId2", "referenceId3", "referenceIdAny"] },
  ),
  minProperties: 1,
};

export const waiverFileActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_site_details",
    description: "Get details for the connected WaiverFile site.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving WaiverFile site details.", {}),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_waiver_forms",
    description: "List active waiver forms for the connected WaiverFile site.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing active WaiverFile waiver forms.", {}),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "get_waiver",
    description: "Get one signed WaiverFile waiver by its identifier.",
    requiredScopes: [],
    inputSchema: s.object("Input for retrieving one WaiverFile waiver.", {
      waiverId: s.nonWhitespaceString("The WaiverFile waiver identifier."),
    }),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "search_waivers",
    description: "Search signed WaiverFile waivers by text.",
    requiredScopes: [],
    inputSchema: s.object("Input for searching WaiverFile waivers.", {
      terms: s.nonWhitespaceString("The text used to search signed waivers."),
    }),
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_waivers_by_reference",
    description: "List WaiverFile waivers matching one or more external reference identifiers.",
    requiredScopes: [],
    inputSchema: referenceInputSchema,
    outputSchema: responseSchema,
  }),
  defineProviderAction(service, {
    name: "list_upcoming_events",
    description: "List upcoming WaiverFile events within a UTC date range.",
    requiredScopes: [],
    inputSchema: s.object("Input for listing upcoming WaiverFile events.", {
      startDate: s.string("The inclusive UTC range start in ISO 8601 date-time format.", {
        format: "date-time",
      }),
      endDate: s.string("The inclusive UTC range end in ISO 8601 date-time format.", {
        format: "date-time",
      }),
    }),
    outputSchema: responseSchema,
  }),
];
