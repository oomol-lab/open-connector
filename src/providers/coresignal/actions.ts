import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coresignal";

const companyFilters = {
  name: s.nonEmptyString("Company name or name expression to search for using Coresignal search filters."),
  website: s.nonEmptyString("Company website value to search for, such as example.com or https://www.example.com."),
  exact_website: s.nonEmptyString("Exact company website value to search for."),
  size: s.nonEmptyString("Company size category based on headcount."),
  industry: s.nonEmptyString("Industry value or expression to search for."),
  country: s.nonEmptyString("Country value or expression to search for."),
  location: s.nonEmptyString("Location value or expression to search for."),
  created_at_gte: s.nonEmptyString("Record creation timestamp lower bound using the Coresignal format."),
  created_at_lte: s.nonEmptyString("Record creation timestamp upper bound using the Coresignal format."),
  last_updated_gte: s.nonEmptyString("Record last-updated timestamp lower bound using the Coresignal format."),
  last_updated_lte: s.nonEmptyString("Record last-updated timestamp upper bound using the Coresignal format."),
  deleted: s.boolean("Whether to include deleted or private company records."),
  employees_count_gte: s.nonNegativeInteger("Minimum visible employee count."),
  employees_count_lte: s.nonNegativeInteger("Maximum visible employee count."),
  source_id: s.nonNegativeInteger("Company identifier assigned by the source."),
  founded_year_gte: s.nonNegativeInteger("Minimum company founding year."),
  founded_year_lte: s.nonNegativeInteger("Maximum company founding year."),
  funding_total_rounds_count_gte: s.nonNegativeInteger("Minimum total funding round count."),
  funding_total_rounds_count_lte: s.nonNegativeInteger("Maximum total funding round count."),
  funding_last_round_type: s.nonEmptyString("Last funding round type."),
  funding_last_round_date_gte: s.nonEmptyString("Last funding round date lower bound using the yyyy-mm-dd format."),
  funding_last_round_date_lte: s.nonEmptyString("Last funding round date upper bound using the yyyy-mm-dd format."),
};

const companyFilterKeys = Object.keys(companyFilters);

const companyPreviewRecordSchema = s.looseObject(
  {
    id: s.positiveInteger("Coresignal company ID."),
    name: s.string("Company name."),
    canonical_url: s.string("Most recent company profile URL."),
    website: s.string("Company website."),
    size: s.string("Company size category."),
    industry: s.string("Company industry."),
    headquarters_country_parsed: s.string("Parsed headquarters country."),
    _score: s.number("Search relevance score."),
  },
  { description: "A Base Company preview record." },
);

export const coresignalActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_base_companies",
    description:
      "Search Coresignal Base Company records with documented search filters and return matching company IDs for follow-up collection.",
    inputSchema: s.object(companyFilters, {
      optional: companyFilterKeys,
      description: "Coresignal Base Company search filter request.",
    }),
    outputSchema: s.object(
      {
        ids: s.array("Company IDs matching the search filters.", s.positiveInteger("Company ID.")),
      },
      { required: ["ids"], description: "Coresignal Base Company search ID result." },
    ),
    followUpActions: ["coresignal.collect_base_company"],
  }),
  defineProviderAction(service, {
    name: "preview_base_companies",
    description:
      "Preview top Coresignal Base Company matches with compact company profile fields using documented search filters.",
    inputSchema: s.object(
      {
        ...companyFilters,
        page: s.positiveInteger("Preview result page number."),
      },
      {
        optional: [...companyFilterKeys, "page"],
        description: "Coresignal Base Company search preview request.",
      },
    ),
    outputSchema: s.object(
      {
        records: s.array("Preview records matching the search filters.", companyPreviewRecordSchema),
      },
      { required: ["records"], description: "Coresignal Base Company preview result." },
    ),
  }),
  defineProviderAction(service, {
    name: "collect_base_company",
    description:
      "Collect a Coresignal Base Company record by company ID, profile URL, or shorthand name, optionally selecting specific fields.",
    inputSchema: s.object(
      {
        companyIdentifier: s.anyOf("Company ID, profile URL, or shorthand name to collect.", [
          s.positiveInteger("Coresignal company ID returned by search endpoints."),
          s.nonEmptyString("Coresignal profile URL or shorthand name."),
        ]),
        fields: s.stringArray("Optional list of fields to return from the Base Company record.", {
          minItems: 1,
          itemDescription: "A Base Company field name to request.",
        }),
      },
      {
        required: ["companyIdentifier"],
        description: "Request parameters for collecting a Base Company record.",
      },
    ),
    outputSchema: s.object(
      {
        company: s.looseObject("The raw Base Company record returned by Coresignal."),
      },
      { required: ["company"], description: "Coresignal Base Company collect result." },
    ),
  }),
];
