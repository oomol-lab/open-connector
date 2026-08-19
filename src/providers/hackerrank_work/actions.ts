import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hackerrank_work";

const idField = s.nonEmptyString("The HackerRank resource identifier.");
const limitField = s.positiveInteger("The maximum number of records to return.");
const offsetField = s.nonNegativeInteger("The zero-based offset used for pagination.");
const additionalFieldsField = s.stringArray(
  "Additional HackerRank fields to request as the additional_fields query parameter.",
  { minItems: 1, itemDescription: "An additional HackerRank field name to request in detail." },
);

const paginationSchema = s.object("Pagination metadata returned by HackerRank list endpoints.", {
  page_total: s.integer("The number of items returned in the current page."),
  offset: s.integer("The zero-based offset for the current page."),
  previous: s.string("The previous page URL returned by HackerRank."),
  next: s.string("The next page URL returned by HackerRank."),
  first: s.string("The first page URL returned by HackerRank."),
  last: s.string("The last page URL returned by HackerRank."),
  total: s.string("The total item count returned by HackerRank for the query."),
});

const testSchema = s.looseRequiredObject(
  "A HackerRank test object.",
  {
    id: idField,
    unique_id: s.string("The public candidate-facing unique identifier for the test."),
    name: s.string("The display name of the test."),
    state: s.string("The current state of the test."),
    duration: s.integer("The test duration in minutes."),
    starttime: s.string("The earliest time when candidates may log in to the test."),
    endtime: s.string("The latest time when new candidate logins are accepted."),
    created_at: s.string("When the test was created."),
    languages: s.stringArray("The languages enabled for the test, when HackerRank returns them."),
    candidate_details: s.array(
      "The candidate detail fields configured for the test.",
      s.unknown("A candidate detail configuration object returned by HackerRank."),
    ),
    tags: s.stringArray("The tags associated with the test."),
  },
  {
    optional: [
      "unique_id",
      "name",
      "state",
      "duration",
      "starttime",
      "endtime",
      "created_at",
      "languages",
      "candidate_details",
      "tags",
    ],
  },
);

const candidateSchema = s.looseRequiredObject(
  "A HackerRank test candidate object.",
  {
    id: idField,
    full_name: s.string("The full name of the candidate."),
    email: s.string("The email address of the candidate."),
    score: s.number("The raw score of the candidate, when available."),
    percentage_score: s.number("The percentage score of the candidate, when available."),
    status: s.integer("The HackerRank candidate status code."),
    integrity_status: s.nullableString("The integrity status summary for the candidate attempt."),
    integrity_summary: s.nullableString("The integrity summary text returned by HackerRank."),
    report_url: s.string("The report URL for the candidate."),
    authenticated_report_url: s.string("The authenticated report URL for the candidate."),
    pdf_url: s.string("The PDF report URL for the candidate."),
    candidate_details: s.array(
      "The custom candidate details returned for the candidate.",
      s.unknown("A candidate detail item returned by HackerRank."),
    ),
    questions: s.unknown("The expanded questions payload, when requested."),
    tags: s.stringArray("The tags associated with the candidate.", {
      itemDescription: "A tag associated with the candidate.",
    }),
  },
  {
    optional: [
      "full_name",
      "email",
      "score",
      "percentage_score",
      "status",
      "integrity_status",
      "integrity_summary",
      "report_url",
      "authenticated_report_url",
      "pdf_url",
      "candidate_details",
      "questions",
      "tags",
    ],
  },
);

export const hackerrankWorkActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_tests",
    description: "List the HackerRank tests available to the authenticated account.",
    inputSchema: s.actionInput(
      {
        limit: limitField,
        offset: offsetField,
      },
      [],
      "Pagination options for listing HackerRank tests.",
    ),
    outputSchema: s.actionOutput(
      {
        tests: s.array("The tests returned by HackerRank.", testSchema),
        pagination: paginationSchema,
      },
      "The list of HackerRank tests plus pagination metadata.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_test",
    description: "Retrieve one HackerRank test by id.",
    inputSchema: s.actionInput(
      {
        id: idField,
        additional_fields: additionalFieldsField,
      },
      ["id"],
      "The HackerRank test identifier and optional additional_fields list.",
    ),
    outputSchema: s.actionOutput({ test: testSchema }, "The requested HackerRank test."),
  }),
  defineProviderAction(service, {
    name: "list_test_candidates",
    description: "List the candidates invited to or associated with a HackerRank test.",
    inputSchema: s.actionInput(
      {
        test_id: idField,
        limit: limitField,
        offset: offsetField,
      },
      ["test_id"],
      "The HackerRank test identifier and pagination options for listing candidates.",
    ),
    outputSchema: s.actionOutput(
      {
        candidates: s.array("The candidates returned by HackerRank.", candidateSchema),
        pagination: paginationSchema,
      },
      "The list of HackerRank test candidates plus pagination metadata.",
    ),
  }),
  defineProviderAction(service, {
    name: "search_test_candidates",
    description: "Search HackerRank test candidates by name or email.",
    inputSchema: s.actionInput(
      {
        test_id: idField,
        search: s.nonEmptyString("The name or email text used to search candidates."),
        limit: limitField,
        offset: offsetField,
      },
      ["test_id", "search"],
      "The search input for HackerRank test candidates.",
    ),
    outputSchema: s.actionOutput(
      {
        candidates: s.array("The candidates returned by the search.", candidateSchema),
        pagination: paginationSchema,
      },
      "The HackerRank candidate search results plus pagination metadata.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_test_candidate",
    description: "Retrieve one HackerRank candidate from a specific test.",
    inputSchema: s.actionInput(
      {
        test_id: idField,
        candidate_id: idField,
        additional_fields: additionalFieldsField,
      },
      ["test_id", "candidate_id"],
      "The identifiers required to fetch one HackerRank test candidate.",
    ),
    outputSchema: s.actionOutput({ candidate: candidateSchema }, "The requested HackerRank test candidate."),
  }),
];
