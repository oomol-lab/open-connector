import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "rootly";

const idOrSlugSchema = s.nonEmptyString("The Rootly resource UUID or slug.");
const includeSchema = s.stringArray("Related Rootly resources to include in the JSON:API response.", {
  minItems: 1,
  itemDescription: "One Rootly include value.",
});
const pageNumberSchema = s.positiveInteger("The page number to request.");
const pageSizeSchema = s.positiveInteger("The number of records to request per page.");
const cursorSchema = s.nonEmptyString("The Rootly cursor from meta.next_cursor.");
const sortSchema = s.nonEmptyString("The Rootly sort expression, such as name or -created_at.");
const dateTimeFilterSchema = s.dateTime("The ISO 8601 timestamp for this filter.");
const jsonApiResourceSchema = s.looseObject("A Rootly JSON:API resource.", {
  id: s.nonEmptyString("The Rootly resource ID."),
  type: s.nonEmptyString("The Rootly resource type."),
  attributes: s.looseObject("The Rootly resource attributes."),
  relationships: s.looseObject("The Rootly resource relationships."),
});
const jsonApiIncludedSchema = s.array(
  "Included Rootly JSON:API resources.",
  s.looseObject("One included Rootly JSON:API resource."),
);
const jsonApiLinksSchema = s.looseObject("Rootly pagination or resource links.");
const jsonApiMetaSchema = s.looseObject("Rootly response metadata.");
const singleResourceOutputSchema = s.object(
  "A Rootly single-resource response.",
  {
    resource: jsonApiResourceSchema,
    included: jsonApiIncludedSchema,
    raw: s.looseObject("The raw Rootly JSON:API response."),
  },
  { optional: ["included"] },
);
const listResourceOutputSchema = s.object(
  "A Rootly list response.",
  {
    resources: s.array("Rootly JSON:API resources.", jsonApiResourceSchema),
    included: jsonApiIncludedSchema,
    links: jsonApiLinksSchema,
    meta: jsonApiMetaSchema,
    raw: s.looseObject("The raw Rootly JSON:API response."),
  },
  { optional: ["included", "links", "meta"] },
);
const emptyInputSchema = s.object("This action does not require input.", {});
const getResourceInputSchema = s.object(
  "Input for retrieving one Rootly resource.",
  {
    id: idOrSlugSchema,
    include: includeSchema,
  },
  { optional: ["include"] },
);
const incidentFilterFields = {
  pageAfter: cursorSchema,
  pageNumber: pageNumberSchema,
  pageSize: pageSizeSchema,
  search: s.nonEmptyString("Search text for Rootly incident filtering."),
  kind: s.nonEmptyString("Rootly incident kind filter."),
  status: s.nonEmptyString("Rootly incident status filter."),
  private: s.boolean("Whether to filter private incidents."),
  userId: s.positiveInteger("Rootly user ID filter."),
  severity: s.nonEmptyString("Rootly severity name filter."),
  severityId: s.nonEmptyString("Rootly severity ID filter."),
  labels: s.nonEmptyString("Comma-separated Rootly label filter."),
  serviceIds: s.nonEmptyString("Comma-separated Rootly service ID filter."),
  serviceNames: s.nonEmptyString("Comma-separated Rootly service name filter."),
  teamIds: s.nonEmptyString("Comma-separated Rootly team ID filter."),
  teamNames: s.nonEmptyString("Comma-separated Rootly team name filter."),
  createdAtGt: dateTimeFilterSchema,
  createdAtGte: dateTimeFilterSchema,
  createdAtLt: dateTimeFilterSchema,
  createdAtLte: dateTimeFilterSchema,
  sort: sortSchema,
};
const configurationFilterFields = {
  include: includeSchema,
  pageNumber: pageNumberSchema,
  pageSize: pageSizeSchema,
  search: s.nonEmptyString("Search text for Rootly filtering."),
  name: s.nonEmptyString("Rootly name filter."),
  slug: s.nonEmptyString("Rootly slug filter."),
  externalId: s.nonEmptyString("Rootly external ID filter."),
  alertBroadcastEnabled: s.boolean("Whether alert broadcast is enabled."),
  incidentBroadcastEnabled: s.boolean("Whether incident broadcast is enabled."),
  createdAtGt: dateTimeFilterSchema,
  createdAtGte: dateTimeFilterSchema,
  createdAtLt: dateTimeFilterSchema,
  createdAtLte: dateTimeFilterSchema,
  sort: sortSchema,
};
const incidentOptional = Object.keys(incidentFilterFields);
const configurationOptional = Object.keys(configurationFilterFields);

export const rootlyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Rootly user associated with the API key.",
    inputSchema: emptyInputSchema,
    outputSchema: singleResourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_incidents",
    description: "List Rootly incidents with common filters and pagination.",
    inputSchema: s.object("Input for listing Rootly incidents.", incidentFilterFields, { optional: incidentOptional }),
    outputSchema: listResourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_incident",
    description: "Retrieve one Rootly incident by UUID or slug.",
    inputSchema: getResourceInputSchema,
    outputSchema: singleResourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_services",
    description: "List Rootly services with common filters and pagination.",
    inputSchema: s.object("Input for listing Rootly services.", configurationFilterFields, {
      optional: configurationOptional,
    }),
    outputSchema: listResourceOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List Rootly teams with common filters and pagination.",
    inputSchema: s.object(
      "Input for listing Rootly teams.",
      {
        ...configurationFilterFields,
        color: s.nonEmptyString("Rootly team color filter."),
      },
      { optional: [...configurationOptional, "color"] },
    ),
    outputSchema: listResourceOutputSchema,
  }),
];
