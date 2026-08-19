import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "klaviyo";

const rawResourceSchema = s.looseObject("A raw Klaviyo JSON:API resource object.");
const rawLinksSchema = s.looseObject("Raw Klaviyo pagination or resource links.");
const rawMetaSchema = s.looseObject("Raw Klaviyo response metadata.");
const rawPropertiesSchema = s.looseObject("Arbitrary event or profile properties forwarded to Klaviyo.");

const paginationInputSchema = {
  filter: s.nonEmptyString('A Klaviyo filter expression, such as equals(email,"ada@example.com").'),
  sort: s.nonEmptyString("A Klaviyo sort expression, such as -created or updated."),
  pageSize: s.integer("The maximum number of resources to return.", { minimum: 1, maximum: 100 }),
  pageCursor: s.nonEmptyString("The Klaviyo page cursor from a previous response."),
};

const collectionOutputSchema = (description: string, itemDescription: string) =>
  s.object(
    description,
    {
      data: s.array(itemDescription, rawResourceSchema),
      links: s.nullable(rawLinksSchema),
      meta: s.nullable(rawMetaSchema),
      raw: s.looseObject("The raw Klaviyo JSON:API response payload."),
    },
    { optional: ["links", "meta", "raw"] },
  );

const resourceOutputSchema = (description: string, fieldName: string) =>
  s.object(
    description,
    {
      [fieldName]: s.nullable(rawResourceSchema),
      raw: s.looseObject("The raw Klaviyo JSON:API response payload."),
    },
    { optional: ["raw"] },
  );

const profileIdentifierSchema = s.object(
  "Profile identifiers for finding or creating the event profile.",
  {
    id: s.nonEmptyString("The Klaviyo profile ID."),
    email: s.email("The profile email address."),
    phoneNumber: s.nonEmptyString("The profile phone number in E.164 format when available."),
    externalId: s.nonEmptyString("An external identifier associated with the profile."),
    anonymousId: s.nonEmptyString("The anonymous profile identifier."),
  },
  { optional: ["id", "email", "phoneNumber", "externalId", "anonymousId"] },
);

export const klaviyoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_account",
    description: "Validate a Klaviyo private API key by reading account metadata.",
    requiredScopes: ["accounts:read"],
    inputSchema: s.object("No input is required to validate a Klaviyo account.", {}),
    outputSchema: resourceOutputSchema("Klaviyo account metadata for the connected private API key.", "account"),
  }),
  defineProviderAction(service, {
    name: "list_profiles",
    description: "List Klaviyo profiles with optional filtering, sorting, and cursor pagination.",
    requiredScopes: ["profiles:read"],
    inputSchema: s.object("Input for listing Klaviyo profiles.", paginationInputSchema, {
      optional: ["filter", "sort", "pageSize", "pageCursor"],
    }),
    outputSchema: collectionOutputSchema("Klaviyo profiles and pagination metadata.", "Klaviyo profile resources."),
  }),
  defineProviderAction(service, {
    name: "get_profile",
    description: "Get one Klaviyo profile by profile ID.",
    requiredScopes: ["profiles:read"],
    inputSchema: s.object("Input for retrieving one Klaviyo profile.", {
      profileId: s.nonEmptyString("The Klaviyo profile ID."),
    }),
    outputSchema: resourceOutputSchema("The requested Klaviyo profile.", "profile"),
  }),
  defineProviderAction(service, {
    name: "list_campaigns",
    description: "List Klaviyo campaigns with the required channel filter plus optional sorting and cursor pagination.",
    requiredScopes: ["campaigns:read"],
    inputSchema: s.object(
      "Input for listing Klaviyo campaigns.",
      {
        channel: s.stringEnum("The campaign message channel to list.", ["email", "sms", "mobile_push"]),
        filter: s.nonEmptyString(
          "Additional Klaviyo campaign filter expression appended to the required channel filter.",
        ),
        sort: s.nonEmptyString("A Klaviyo sort expression for campaigns."),
        pageSize: s.integer("The maximum number of campaigns to return.", { minimum: 1, maximum: 100 }),
        pageCursor: s.nonEmptyString("The Klaviyo page cursor from a previous campaign response."),
      },
      { optional: ["filter", "sort", "pageSize", "pageCursor"] },
    ),
    outputSchema: collectionOutputSchema("Klaviyo campaigns and pagination metadata.", "Klaviyo campaign resources."),
  }),
  defineProviderAction(service, {
    name: "get_campaign",
    description: "Get one Klaviyo campaign by campaign ID.",
    requiredScopes: ["campaigns:read"],
    inputSchema: s.object("Input for retrieving one Klaviyo campaign.", {
      campaignId: s.nonEmptyString("The Klaviyo campaign ID."),
    }),
    outputSchema: resourceOutputSchema("The requested Klaviyo campaign.", "campaign"),
  }),
  defineProviderAction(service, {
    name: "list_events",
    description: "List Klaviyo events with optional filtering, sorting, and cursor pagination.",
    requiredScopes: ["events:read"],
    inputSchema: s.object("Input for listing Klaviyo events.", paginationInputSchema, {
      optional: ["filter", "sort", "pageSize", "pageCursor"],
    }),
    outputSchema: collectionOutputSchema("Klaviyo events and pagination metadata.", "Klaviyo event resources."),
  }),
  defineProviderAction(service, {
    name: "create_event",
    description: "Create a Klaviyo event for a profile using a metric name and JSON event properties.",
    requiredScopes: ["events:write", "profiles:write"],
    inputSchema: s.object(
      "Input for creating a Klaviyo event.",
      {
        metricName: s.nonEmptyString("The metric name to track, such as Viewed Product."),
        profile: profileIdentifierSchema,
        properties: rawPropertiesSchema,
        time: s.dateTime("The event time as an ISO 8601 timestamp."),
        value: s.number("The monetary value associated with the event."),
        uniqueId: s.nonEmptyString("A unique event ID used by Klaviyo for de-duplication."),
      },
      { optional: ["properties", "time", "value", "uniqueId"] },
    ),
    outputSchema: s.object("The event creation status.", {
      accepted: s.boolean("Whether Klaviyo accepted the event creation request."),
    }),
  }),
];
