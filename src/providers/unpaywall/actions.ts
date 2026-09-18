import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "unpaywall";
const articleSchema = s.looseObject("An Unpaywall DOI object. Additional fields may be added by Unpaywall over time.");

export const unpaywallActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_doi",
    operationType: "read",
    description: "Retrieve Unpaywall open-access metadata for one DOI.",
    requiredScopes: [],
    inputSchema: s.object("The DOI to look up.", {
      doi: s.nonEmptyString("The DOI identifier to retrieve, with or without a https://doi.org prefix."),
    }),
    outputSchema: s.object("The matching Unpaywall DOI record.", {
      record: articleSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_articles",
    operationType: "read",
    description: "Search Unpaywall articles by title text.",
    requiredScopes: [],
    inputSchema: s.object(
      "The Unpaywall article search query and optional page filters.",
      {
        query: s.nonEmptyString("The title text to search for."),
        page: s.integer("The one-based result page to retrieve. Each page contains up to 50 results.", {
          minimum: 1,
        }),
        isOa: s.boolean("Whether to return only articles that Unpaywall identifies as open access."),
      },
      { optional: ["page", "isOa"] },
    ),
    outputSchema: s.object("A page of Unpaywall article search results.", {
      page: s.integer("The one-based page requested from Unpaywall."),
      elapsedSeconds: s.number("The search duration in seconds reported by Unpaywall."),
      results: s.array(
        "The article search results returned for this page.",
        s.looseObject("An Unpaywall search result containing a score and DOI response object."),
      ),
    }),
  }),
];
