import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "the_swarm";

const nonEmptyStringSchema = (description: string) => s.string({ minLength: 1, pattern: "\\S", description });
const nonEmptyStringArraySchema = (description: string, itemDescription: string) =>
  s.array(description, nonEmptyStringSchema(itemDescription), { minItems: 1, maxItems: 1000 });

const linkedinIdArraySchema = s.array(
  "LinkedIn numeric identifiers accepted by The Swarm.",
  s.integer("One LinkedIn numeric identifier."),
  { minItems: 1, maxItems: 1000 },
);

const searchLimitSchema = s.integer(
  "The maximum number of results to return. Use exactly 1000 when stablePagination is true.",
  {
    minimum: 0,
    maximum: 1000,
  },
);

const paginationTokenSchema = nonEmptyStringSchema(
  "The pagination token returned by a previous The Swarm search response.",
);
const elasticsearchQuerySchema = s.looseObject("The Elasticsearch Query DSL query object sent to The Swarm.");
const rawRecordSchema = s.looseObject("The raw record returned by The Swarm.");

const searchOutputSchema = s.object("The normalized The Swarm search response.", {
  ids: s.array("The matching The Swarm identifiers.", s.string("One matching identifier.")),
  totalCount: s.nonNegativeInteger("The total number of records matching the query."),
  paginationToken: s.nullable(s.string("The pagination token for the next request when more results are available.")),
  raw: s.looseObject("The raw search response returned by The Swarm."),
});

const profileFieldSchema = s.stringEnum("The profile sections to include in fetch results.", [
  "profile_info",
  "tags",
  "lists",
]);

const companyFieldSchema = s.stringEnum("The company sections to include in fetch results.", ["company_info", "tags"]);

export const theSwarmActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_credit_usage",
    operationType: "read",
    description: "Get the current The Swarm API credit usage for the authenticated team.",
    inputSchema: s.object("The input payload for getting The Swarm credit usage.", {}),
    outputSchema: s.object("The normalized The Swarm credit usage response.", {
      usage: s.nonNegativeInteger("The number of credits consumed in the current billing period."),
      raw: s.looseObject("The raw credit usage response returned by The Swarm."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_profiles",
    operationType: "read",
    description: "Search The Swarm profiles with an Elasticsearch Query DSL query and return profile IDs.",
    inputSchema: s.object(
      "The input payload for searching The Swarm profiles. When stablePagination is true, limit must be 1000.",
      {
        query: elasticsearchQuerySchema,
        limit: searchLimitSchema,
        paginationToken: paginationTokenSchema,
        stablePagination: s.boolean(
          "Whether The Swarm should keep pagination stable while retrieving large result sets.",
        ),
        inNetworkOnly: s.boolean("Whether to restrict results to profiles connected to your team's network."),
      },
      { optional: ["limit", "paginationToken", "stablePagination", "inNetworkOnly"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "fetch_profiles",
    operationType: "read",
    description: "Fetch The Swarm profile records by profile IDs or LinkedIn identifiers.",
    inputSchema: s.object(
      "The input payload for fetching The Swarm profiles. At least one profile identifier array is required.",
      {
        ids: nonEmptyStringArraySchema("The Swarm profile IDs to fetch.", "One The Swarm profile ID."),
        linkedinNames: nonEmptyStringArraySchema(
          "LinkedIn profile URL slugs to fetch.",
          "One LinkedIn profile URL slug.",
        ),
        linkedinIds: linkedinIdArraySchema,
        linkedinEntityIds: nonEmptyStringArraySchema(
          "LinkedIn alphanumeric entity IDs to fetch.",
          "One LinkedIn alphanumeric entity ID.",
        ),
        fields: s.array("Profile sections to include in the response.", profileFieldSchema, { minItems: 1 }),
      },
      { optional: ["ids", "linkedinNames", "linkedinIds", "linkedinEntityIds", "fields"] },
    ),
    outputSchema: s.object("The normalized The Swarm fetch profiles response.", {
      profiles: s.array("The profile records returned by The Swarm.", rawRecordSchema),
      notFound: s.array("The profile identifiers The Swarm did not find.", s.string("One missing identifier.")),
      raw: s.looseObject("The raw fetch profiles response returned by The Swarm."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_companies",
    operationType: "read",
    description: "Search The Swarm companies with an Elasticsearch Query DSL query and return company IDs.",
    inputSchema: s.object(
      "The input payload for searching The Swarm companies. When stablePagination is true, limit must be 1000.",
      {
        query: elasticsearchQuerySchema,
        limit: searchLimitSchema,
        paginationToken: paginationTokenSchema,
        stablePagination: s.boolean(
          "Whether The Swarm should keep pagination stable while retrieving large result sets.",
        ),
      },
      { optional: ["limit", "paginationToken", "stablePagination"] },
    ),
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "fetch_companies",
    operationType: "read",
    description: "Fetch The Swarm company records by company IDs or LinkedIn company identifiers.",
    inputSchema: s.object(
      "The input payload for fetching The Swarm companies. At least one company identifier array is required.",
      {
        ids: nonEmptyStringArraySchema("The Swarm company IDs to fetch.", "One The Swarm company ID."),
        linkedinNames: nonEmptyStringArraySchema("LinkedIn company slugs to fetch.", "One LinkedIn company slug."),
        linkedinIds: linkedinIdArraySchema,
        fields: s.array("Company sections to include in the response.", companyFieldSchema, { minItems: 1 }),
      },
      { optional: ["ids", "linkedinNames", "linkedinIds", "fields"] },
    ),
    outputSchema: s.object("The normalized The Swarm fetch companies response.", {
      companies: s.array("The company records returned by The Swarm.", rawRecordSchema),
      notFound: s.array("The company identifiers The Swarm did not find.", s.string("One missing identifier.")),
      raw: s.looseObject("The raw fetch companies response returned by The Swarm."),
    }),
  }),
];
