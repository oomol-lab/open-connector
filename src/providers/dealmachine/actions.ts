import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dealmachine";

const sourceTypeSchema = s.stringEnum("The record family whose metadata should be returned.", ["properties", "people"]);
const searchContactAudienceSchema = s.stringEnum(
  "The relationship group used to select contacts associated with matching properties.",
  ["owners", "owners_and_family", "renters", "residents", "none"],
);
const countContactAudienceSchema = s.stringEnum(
  "The relationship group used to select contacts included in the count.",
  ["owners", "owners_and_family", "renters", "residents"],
);
const propertyContactAudienceSchema = s.stringEnum(
  "The relationship group used to select contacts associated with the property.",
  ["owners", "owners_and_family", "renters", "residents", "all", "none"],
);
const locationSchema = s.oneOf(
  [
    s.object("A state, county, city, or ZIP area included in the property search.", {
      type: s.stringEnum("The named geographic area type.", ["state", "county", "city", "zip_code"]),
      code: s.nonEmptyString("The state, county, city, or ZIP identifier for the location."),
    }),
    s.object("A radius area included in the property search.", {
      type: s.literal("radius", { description: "The radius geographic area type." }),
      latitude: s.number("The center latitude for a radius search."),
      longitude: s.number("The center longitude for a radius search."),
      radius_miles: s.number("The radius in miles for a radius search.", { exclusiveMinimum: 0 }),
    }),
    s.object("A polygon area included in the property search.", {
      type: s.literal("polygon", { description: "The polygon geographic area type." }),
      coordinates: s.array(
        "The boundary points for a polygon search as longitude and latitude pairs.",
        s.tuple([s.number("The longitude coordinate."), s.number("The latitude coordinate.")], {
          description: "A longitude and latitude coordinate pair.",
        }),
        { minItems: 3 },
      ),
    }),
  ],
  { description: "A geographic area included in the property search." },
);
const filterSchema = s.object(
  "A DealMachine filter applied to the search.",
  {
    filter_id: s.nonEmptyString("The filter slug returned by list_filters."),
    operator: s.nonEmptyString("An operator allowed by the selected filter."),
    value: s.unknown("The filter value in the shape required by the selected operator."),
  },
  { optional: ["operator"] },
);
const listConditionSchema = s.object("Property list IDs used to include or exclude records.", {
  property_list_ids: s.array(
    "The DealMachine property list IDs.",
    s.positiveInteger("A DealMachine property list ID."),
    { minItems: 1 },
  ),
});
const searchCriteriaProperties = {
  locations: s.array("The geographic areas included in the search.", locationSchema, {
    minItems: 1,
    maxItems: 15,
  }),
  filters: s.array("The property or people filters combined with AND logic.", filterSchema),
  include_lists: listConditionSchema,
  exclude_lists: listConditionSchema,
  exclude_previously_exported: s.unknown("Whether or how to exclude records previously exported by the organization."),
  anchor: s.stringEnum("The primary entity represented by each result.", ["properties", "people"]),
  contact_audience: searchContactAudienceSchema,
};
const searchCriteriaOptional = [
  "locations",
  "filters",
  "include_lists",
  "exclude_lists",
  "exclude_previously_exported",
  "anchor",
  "contact_audience",
];
const countPropertiesInputSchema = s.object(
  "The filters and geographic criteria used to count matching properties or people.",
  {
    ...searchCriteriaProperties,
    contact_audience: countContactAudienceSchema,
  },
  { optional: searchCriteriaOptional },
);
const searchPropertiesInputSchema = s.object(
  "The filters, fields, and pagination used to search DealMachine property data.",
  {
    ...searchCriteriaProperties,
    bigquery_data_environment: s.integer("The Query Builder dataset environment identifier.", {
      minimum: 1,
      maximum: 3,
    }),
    fields: s.stringArray("The property and people field IDs to include in each result.", {
      itemDescription: "A field ID returned by list_fields.",
    }),
    page: s.positiveInteger("The one-based results page to return."),
    per_page: s.integer("The maximum number of results to return per page.", {
      minimum: 1,
      maximum: 250,
    }),
    sort: s.array(
      "The fields used to sort results in priority order.",
      s.object("One property search sort rule.", {
        field_id: s.nonEmptyString("A sortable field ID returned by list_fields."),
        direction: s.stringEnum("The sort direction.", ["asc", "desc"]),
      }),
      { minItems: 1 },
    ),
    estimate_cost: s.boolean("Whether to return a credit estimate without returning records or consuming credits."),
  },
  {
    optional: [
      ...searchCriteriaOptional,
      "bigquery_data_environment",
      "fields",
      "page",
      "per_page",
      "sort",
      "estimate_cost",
    ],
  },
);

const paginationSchema = s.object("Pagination metadata returned by DealMachine.", {
  page: s.integer("The current one-based page number."),
  per_page: s.integer("The number of entries requested per page."),
  total_results: s.integer("The total number of matching entries."),
  total_pages: s.integer("The total number of available pages."),
  has_next_page: s.boolean("Whether another page follows this page."),
  has_previous_page: s.boolean("Whether a page precedes this page."),
});
const discoveryQueryProperties = {
  source_type: sourceTypeSchema,
  search: s.nonEmptyString("Text used to search metadata names and descriptions."),
  page: s.positiveInteger("The one-based results page to return."),
  per_page: s.integer("The maximum number of metadata entries to return per page.", {
    minimum: 1,
    maximum: 250,
  }),
};
const discoveryQueryOptional = ["source_type", "search", "page", "per_page"];
const filterDiscoveryQuerySchema = s.object(
  "The optional filters and pagination for a DealMachine filter discovery request.",
  discoveryQueryProperties,
  { optional: discoveryQueryOptional },
);
const fieldDiscoveryQuerySchema = s.object(
  "The optional filters and pagination for a DealMachine field discovery request.",
  {
    ...discoveryQueryProperties,
    group_id: s.nonEmptyString("The field group ID used to limit returned fields."),
  },
  { optional: [...discoveryQueryOptional, "group_id"] },
);
const discoveryOutputSchema = s.object("A page of DealMachine field or filter metadata.", {
  data: s.array(
    "The returned metadata entries.",
    s.looseRequiredObject("One DealMachine field or filter metadata entry.", {}),
  ),
  pagination: paginationSchema,
});
const accountOutputSchema = s.object("The connected DealMachine account details.", {
  organization: s.looseRequiredObject("The DealMachine organization associated with the key.", {
    id: s.integer("The organization ID."),
    name: s.string("The organization name."),
    createdAt: s.string("The organization creation timestamp."),
  }),
  user: s.looseRequiredObject("The identity represented by the credential.", {
    id: s.nullableInteger("The user ID, or null for an organization API key."),
    authType: s.string("The upstream authentication type."),
  }),
  plan: s.looseRequiredObject("The organization's current DealMachine plan and credit details.", {
    name: s.string("The DealMachine plan name."),
    is_paid: s.boolean("Whether the organization has a paid plan."),
  }),
});
const propertyOutputSchema = s.object("A property response returned by DealMachine.", {
  data: s.looseRequiredObject("The DealMachine property and any requested dynamic fields.", {
    dm_property_id: s.string("The DealMachine property ID."),
    full_address: s.string("The complete formatted property address."),
  }),
  credits: s.looseRequiredObject("The credits consumed by this property lookup.", {}),
});
const countOutputSchema = s.object("The entity counts matching the property search criteria.", {
  total_properties: s.integer("The number of matching properties."),
  total_people: s.integer("The number of matching people."),
  total_results: s.integer("The count for the selected anchor entity."),
});
const searchOutputSchema = s.looseRequiredObject(
  "The DealMachine property search results or cost estimate.",
  {
    data: s.optional(
      s.array(
        "The returned property- or people-anchored records.",
        s.looseRequiredObject("One property or person record with requested dynamic fields.", {}),
      ),
    ),
    totals: s.looseRequiredObject("The total matching property and people counts.", {}),
    pagination: paginationSchema,
    credits: s.optional(s.looseRequiredObject("The credits consumed by this search page.", {})),
    estimated_credits: s.optional(
      s.looseRequiredObject("The estimated credit cost when estimate_cost is enabled.", {}),
    ),
  },
  { optional: ["data", "credits", "estimated_credits"] },
);

export const dealMachineActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account",
    description: "Get the DealMachine organization, authentication identity, and plan details.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to get the connected DealMachine account.", {}),
    outputSchema: accountOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_filters",
    description: "Discover DealMachine property and people filters and their allowed operators.",
    requiredScopes: [],
    inputSchema: filterDiscoveryQuerySchema,
    outputSchema: discoveryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_fields",
    description: "Discover DealMachine property and people fields available for search results.",
    requiredScopes: [],
    inputSchema: fieldDiscoveryQuerySchema,
    outputSchema: discoveryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_property",
    description: "Get one DealMachine property and optionally enrich its fields and contacts.",
    requiredScopes: [],
    inputSchema: s.object(
      "The DealMachine property lookup options.",
      {
        id: s.nonEmptyString("The DealMachine property ID."),
        enrich: s.boolean("Whether to return enriched property data and consume property credits."),
        contact_audience: propertyContactAudienceSchema,
        fields: s.stringArray("The property field IDs to include in the response.", {
          itemDescription: "A property field ID returned by list_fields.",
        }),
      },
      { optional: ["enrich", "contact_audience", "fields"] },
    ),
    outputSchema: propertyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "count_properties",
    description: "Count properties and people matching DealMachine search criteria without consuming data credits.",
    requiredScopes: [],
    inputSchema: countPropertiesInputSchema,
    outputSchema: countOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_properties",
    description: "Search DealMachine property data or estimate the credit cost of a search.",
    requiredScopes: [],
    inputSchema: searchPropertiesInputSchema,
    outputSchema: searchOutputSchema,
  }),
];
