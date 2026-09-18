import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "openpagerank";

const pageRankResultSchema = s.object("A single OpenPageRank lookup result.", {
  domain: s.string("The domain that was queried."),
  statusCode: s.integer("The HTTP-style status code returned for this domain."),
  error: s.string("The error message returned for this domain."),
  pageRankInteger: s.integer("The integer Page Rank score returned by OpenPageRank."),
  pageRankDecimal: s.number("The decimal Page Rank score returned by OpenPageRank."),
  rank: s.nullableString("The rank returned by OpenPageRank, or null when unavailable."),
});

export const openPageRankActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_page_rank",
    operationType: "read",
    description: "Look up OpenPageRank scores for one or more domains and return normalized rank metadata.",
    inputSchema: s.object(
      "Input parameters for looking up OpenPageRank scores.",
      {
        domains: s.array("The list of domains to query in one request.", s.nonEmptyString("One domain name."), {
          minItems: 1,
          maxItems: 100,
        }),
      },
      { required: ["domains"] },
    ),
    outputSchema: s.object("The normalized OpenPageRank lookup result.", {
      statusCode: s.integer("The overall HTTP-style status code returned by OpenPageRank."),
      results: s.array("The per-domain lookup results returned by OpenPageRank.", pageRankResultSchema),
    }),
  }),
];
