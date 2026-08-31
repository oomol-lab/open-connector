import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "prospeo";
const raw = s.looseObject("Raw Prospeo API object with upstream fields preserved.");
const searchInput = s.object(
  "Input for Prospeo search.",
  {
    page: s.integer("The 1-indexed result page to fetch.", { minimum: 1 }),
    filters: raw,
  },
  { optional: ["page", "filters"] },
);
const pagination = s.object("The Prospeo pagination summary returned for a search.", {
  total: s.nullableInteger("The total number of matching records when returned by Prospeo."),
  page: s.nullableInteger("The current result page when returned by Prospeo."),
  perPage: s.nullableInteger("The requested result count per page when returned by Prospeo."),
});

export const prospeoActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_information",
    description: "Get Prospeo account credits and subscription information for the API key.",
    inputSchema: s.object("No input is required for Prospeo account information.", {}),
    outputSchema: s.object("The normalized Prospeo account information response.", {
      email: s.nullableString("The account email returned by Prospeo when available."),
      plan: s.nullableString("The account plan returned by Prospeo when available."),
      credits: s.nullable(raw),
      raw,
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_person",
    description: "Enrich one person from a LinkedIn URL or identifying person and company fields.",
    inputSchema: s.looseObject("Input for Prospeo person enrichment."),
    outputSchema: s.object("The normalized Prospeo person enrichment response.", {
      person: s.nullable(raw),
      raw,
    }),
  }),
  defineProviderAction(service, {
    name: "enrich_company",
    description: "Enrich one company from a domain, LinkedIn URL, or identifying company fields.",
    inputSchema: s.looseObject("Input for Prospeo company enrichment."),
    outputSchema: s.object("The normalized Prospeo company enrichment response.", {
      company: s.nullable(raw),
      raw,
    }),
  }),
  defineProviderAction(service, {
    name: "search_people",
    description: "Search Prospeo people with official Prospeo search filters.",
    inputSchema: searchInput,
    outputSchema: s.object("The normalized Prospeo people search response.", {
      people: s.array("People returned by Prospeo.", raw),
      pagination,
      raw,
    }),
  }),
  defineProviderAction(service, {
    name: "search_companies",
    description: "Search Prospeo companies with official Prospeo search filters.",
    inputSchema: searchInput,
    outputSchema: s.object("The normalized Prospeo company search response.", {
      companies: s.array("Companies returned by Prospeo.", raw),
      pagination,
      raw,
    }),
  }),
  defineProviderAction(service, {
    name: "search_suggestions",
    description: "Get Prospeo autocomplete suggestions for supported search filter types.",
    inputSchema: s.looseObject("Input for Prospeo search suggestions. Provide exactly one supported suggestion field."),
    outputSchema: s.looseObject("The normalized Prospeo search suggestions response.", { raw }),
  }),
];
