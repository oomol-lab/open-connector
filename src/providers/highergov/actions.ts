import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "highergov";

const pageNumberSchema = s.integer("The result page number, starting from 1.", { minimum: 1 });
const pageSizeSchema = s.integer("The number of records to return, from 1 through 100.", {
  minimum: 1,
  maximum: 100,
});

const paginatedOutputSchema = s.requiredObject("A paginated response returned by HigherGov.", {
  results: s.array(
    "The records returned for the requested page.",
    s.looseObject("A HigherGov result record whose fields depend on the requested API family."),
  ),
  meta: s.requiredObject("Pagination metadata returned by HigherGov.", {
    pagination: s.requiredObject("The current pagination state.", {
      page: s.integer("The current page number."),
      pages: s.integer("The total number of result pages."),
      count: s.integer("The total number of matching records."),
    }),
  }),
  links: s.requiredObject("Credential-free pagination links returned by HigherGov.", {
    first: s.nullable(s.url("The first-page URL, or null when unavailable.")),
    last: s.nullable(s.url("The last-page URL, or null when unavailable.")),
    next: s.nullable(s.url("The next-page URL, or null when there is no next page.")),
    prev: s.nullable(s.url("The previous-page URL, or null when there is no previous page.")),
  }),
});

const listOpportunitiesAction = defineProviderAction(service, {
  name: "list_opportunities",
  operationType: "read",
  description:
    "List HigherGov federal contract, DIBBS, grant, and state or local opportunities using documented filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters and pagination options for listing HigherGov opportunities.",
    {
      agency_key: s.integer("The HigherGov agency key to filter by."),
      captured_date: s.date("Return opportunities captured on or after this date."),
      opp_key: s.string("The HigherGov opportunity key to retrieve."),
      ordering: s.stringEnum("The field and direction used to order results.", [
        "-captured_date",
        "-due_date",
        "-posted_date",
        "captured_date",
        "due_date",
        "posted_date",
      ]),
      page_number: pageNumberSchema,
      page_size: pageSizeSchema,
      posted_date: s.date("Return opportunities posted on or after this date."),
      search_id: s.string("The HigherGov saved search ID to apply."),
      source_id: s.string("The source opportunity ID to filter by."),
      source_type: s.string("One source type or a comma-separated list of source types such as sam,sled."),
      version_key: s.string("The HigherGov opportunity version key to retrieve."),
    },
    {
      optional: [
        "agency_key",
        "captured_date",
        "opp_key",
        "ordering",
        "page_number",
        "page_size",
        "posted_date",
        "search_id",
        "source_id",
        "source_type",
        "version_key",
      ],
    },
  ),
  outputSchema: paginatedOutputSchema,
});

const listContractsAction = defineProviderAction(service, {
  name: "list_contracts",
  operationType: "read",
  description: "List HigherGov federal prime contract awards using documented award filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters and pagination options for listing HigherGov federal contracts.",
    {
      award_id: s.string("The government award ID to filter by."),
      awardee_key: s.integer("The HigherGov awardee key to filter by."),
      awardee_key_parent: s.integer("The parent-level HigherGov awardee key to filter by."),
      awardee_uei: s.string("The awardee Unique Entity Identifier to filter by."),
      awardee_uei_parent: s.string("The parent awardee Unique Entity Identifier to filter by."),
      awarding_agency_key: s.integer("The HigherGov awarding agency key to filter by."),
      captured_date: s.date("Return contracts captured on or after this date."),
      funding_agency_key: s.integer("The HigherGov funding agency key to filter by."),
      last_modified_date: s.date("Return contracts modified on or after this date."),
      naics_code: s.string("The award NAICS code to filter by."),
      ordering: s.stringEnum("The field and direction used to order results.", [
        "-action_date",
        "-current_total_value_of_award",
        "-last_modified_date",
        "-period_of_performance_potential_end_date",
        "-period_of_performance_start_date",
        "-potential_total_value_of_award",
        "-total_dollars_obligated",
        "action_date",
        "current_total_value_of_award",
        "last_modified_date",
        "period_of_performance_potential_end_date",
        "period_of_performance_start_date",
        "potential_total_value_of_award",
        "total_dollars_obligated",
      ]),
      page_number: pageNumberSchema,
      page_size: pageSizeSchema,
      parent_award_id: s.string("The government award ID of the parent award."),
      psc_code: s.string("The Product Service Code to filter by."),
      search_id: s.string("The HigherGov saved search ID to apply."),
      vehicle_key: s.integer("The HigherGov contract vehicle key to filter by."),
    },
    {
      optional: [
        "award_id",
        "awardee_key",
        "awardee_key_parent",
        "awardee_uei",
        "awardee_uei_parent",
        "awarding_agency_key",
        "captured_date",
        "funding_agency_key",
        "last_modified_date",
        "naics_code",
        "ordering",
        "page_number",
        "page_size",
        "parent_award_id",
        "psc_code",
        "search_id",
        "vehicle_key",
      ],
    },
  ),
  outputSchema: paginatedOutputSchema,
});

const listAgenciesAction = defineProviderAction(service, {
  name: "list_agencies",
  operationType: "read",
  description: "List HigherGov federal, state, and local agencies and their hierarchies.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters and pagination options for listing HigherGov agencies.",
    {
      agency_key: s.integer("The HigherGov agency key to filter by."),
      page_number: pageNumberSchema,
      page_size: pageSizeSchema,
    },
    { optional: ["agency_key", "page_number", "page_size"] },
  ),
  outputSchema: paginatedOutputSchema,
});

const listNaicsCodesAction = defineProviderAction(service, {
  name: "list_naics_codes",
  operationType: "read",
  description: "List HigherGov NAICS industry classification codes and descriptions.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters and pagination options for listing HigherGov NAICS codes.",
    {
      naics_code: s.string("The full or partial NAICS code to filter by."),
      ordering: s.stringEnum("The direction used to order results by NAICS code.", ["-naics_code", "naics_code"]),
      page_number: pageNumberSchema,
      page_size: pageSizeSchema,
    },
    { optional: ["naics_code", "ordering", "page_number", "page_size"] },
  ),
  outputSchema: paginatedOutputSchema,
});

export type HighergovActionName = "list_opportunities" | "list_contracts" | "list_agencies" | "list_naics_codes";

export const highergovActions: ProviderActionDefinition<HighergovActionName>[] = [
  listOpportunitiesAction,
  listContractsAction,
  listAgenciesAction,
  listNaicsCodesAction,
];
