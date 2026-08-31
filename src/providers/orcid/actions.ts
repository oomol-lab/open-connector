import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "orcid";
const readScope = "orcid.records.read";

const orcidIdSchema = s.nonEmptyString("The ORCID iD in the canonical 0000-0000-0000-0000 format.");
const rawObjectSchema = s.looseObject("The raw ORCID API object.");

export const orcidActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_record",
    description: "Get the public ORCID record for a researcher by ORCID iD.",
    requiredScopes: [readScope],
    inputSchema: s.object("Input parameters for reading an ORCID record.", {
      orcidId: orcidIdSchema,
    }),
    outputSchema: s.object("The public ORCID record response.", {
      orcidId: orcidIdSchema,
      name: s.nullable(s.string("The researcher's public display name.")),
      record: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_works",
    description: "Get the public works summary for a researcher by ORCID iD.",
    requiredScopes: [readScope],
    inputSchema: s.object("Input parameters for reading an ORCID works summary.", {
      orcidId: orcidIdSchema,
    }),
    outputSchema: s.object("The public ORCID works summary response.", {
      orcidId: orcidIdSchema,
      works: s.array("The work groups returned by ORCID.", rawObjectSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_records",
    description: "Search public ORCID records with ORCID's Solr query syntax.",
    requiredScopes: [readScope],
    inputSchema: s.object(
      "Input parameters for searching public ORCID records.",
      {
        query: s.nonEmptyString(
          "A Solr query, such as family-name:Sanchez or affiliation-org-name:Example University.",
        ),
        start: s.integer("The zero-based result offset within the first 10,000 results.", {
          minimum: 0,
          maximum: 9999,
        }),
        rows: s.integer("The number of results to return, up to 1000.", {
          minimum: 1,
          maximum: 1000,
        }),
      },
      { optional: ["start", "rows"] },
    ),
    outputSchema: s.object("The expanded ORCID search response.", {
      total: s.integer("The total number of matching public records."),
      start: s.integer("The zero-based result offset used for this page."),
      rows: s.integer("The requested page size."),
      results: s.array("The expanded public ORCID search results.", rawObjectSchema),
    }),
  }),
];

export const orcidProviderScopes: Record<string, string> = {
  openid: "openid",
};
