import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "l2s";

const tagArraySchema = s.array(
  "The tags associated with the shortened URL.",
  s.nonEmptyString("One tag associated with the shortened URL."),
);

const responseEnvelopeSchema = s.object("The standard L2S success response envelope.", {
  ok: s.boolean("Whether the L2S request succeeded."),
  response: s.object(
    "The response envelope returned by L2S.",
    {
      message: s.string("The message returned by L2S."),
      data: s.looseObject("The L2S response data payload."),
    },
    { optional: ["data"] },
  ),
});

const upsertUrlSharedFields = {
  url: s.nonEmptyString("The URL to be shortened or stored in L2S."),
  customKey: s.nonEmptyString("Custom key for the shortened URL."),
  utmSource: s.nonEmptyString("UTM source parameter."),
  utmMedium: s.nonEmptyString("UTM medium parameter."),
  utmCampaign: s.nonEmptyString("UTM campaign parameter."),
  utmTerm: s.nonEmptyString("UTM term parameter."),
  utmContent: s.nonEmptyString("UTM content parameter."),
  title: s.nonEmptyString("Title for the shortened URL."),
  tags: tagArraySchema,
};

const upsertOptionalFields = [
  "customKey",
  "utmSource",
  "utmMedium",
  "utmCampaign",
  "utmTerm",
  "utmContent",
  "title",
  "tags",
];

export const l2sActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "shorten_url",
    description: "Create a shortened URL in L2S with optional custom key, UTM tags, and title.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for creating a shortened URL in L2S.", upsertUrlSharedFields, {
      optional: upsertOptionalFields,
    }),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "get_url_details",
    description: "Get the stored details for one shortened URL in L2S.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving one L2S shortened URL.", {
      id: s.nonEmptyString("The L2S URL ID path parameter."),
    }),
    outputSchema: responseEnvelopeSchema,
  }),
  defineProviderAction(service, {
    name: "update_url_details",
    description: "Update the stored details for one shortened URL in L2S.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for updating one L2S shortened URL.",
      {
        id: s.nonEmptyString("The L2S URL ID path parameter."),
        ...upsertUrlSharedFields,
      },
      { optional: upsertOptionalFields },
    ),
    outputSchema: responseEnvelopeSchema,
  }),
];
