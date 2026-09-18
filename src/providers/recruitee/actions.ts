import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "recruitee" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });
const nonNegativeInteger = (description: string) => s.integer(description, { minimum: 0 });
const nullableString = (description: string) => s.nullable(s.string(description));
const nullableBoolean = (description: string) => s.nullable(s.boolean(description));

const offerSummarySchema = s.looseObject("A normalized Recruitee offer summary.", {
  id: positiveInteger("The Recruitee offer ID."),
  title: nullableString("The offer title."),
  slug: nullableString("The URL-friendly offer slug."),
  kind: nullableString("The offer type returned by Recruitee."),
  status: nullableString("The offer status returned by Recruitee."),
  location: nullableString("The offer location text."),
  created_at: nullableString("The ISO 8601 timestamp when the offer was created."),
  updated_at: nullableString("The ISO 8601 timestamp when the offer was last updated."),
  raw: s.looseObject("The raw Recruitee offer object."),
});

const listOffersInputSchema = s.object("No parameters are required to list Recruitee offers.", {});

const listOffersOutputSchema = s.object("A list of Recruitee offers.", {
  offers: s.array("The normalized offers returned by Recruitee.", offerSummarySchema),
  raw: s.looseObject("The raw Recruitee list offers response."),
});

const getOfferInputSchema = s.object("Path parameters for fetching a Recruitee offer.", {
  offerId: positiveInteger("The Recruitee offer ID to retrieve."),
});

const getOfferOutputSchema = s.object("A Recruitee offer detail response.", {
  offer: offerSummarySchema,
  raw: s.looseObject("The raw Recruitee get offer response."),
});

const candidateFilterSchema = s.looseObject("One Recruitee candidate search filter object.");

const searchCandidatesInputSchema = s.object(
  "Query parameters for searching Recruitee candidates.",
  {
    limit: s.integer(
      "Number of candidates to return. Recruitee defaults to 60 and documents 10000 as the maximum single-call limit.",
      { minimum: 1, maximum: 10000 },
    ),
    page: positiveInteger("One-based page number for Recruitee candidate search."),
    sortBy: nonEmptyString("Sort key accepted by Recruitee, such as created_at_desc or candidate_name_asc."),
    filters: s.array("Candidate search filters that will be serialized as filters_json.", candidateFilterSchema),
  },
  { optional: ["limit", "page", "sortBy", "filters"] },
);

const candidateSummarySchema = s.looseObject("A normalized Recruitee candidate summary.", {
  id: positiveInteger("The Recruitee candidate ID."),
  name: nullableString("The candidate name."),
  emails: s.array("Candidate email addresses returned by Recruitee.", s.string("One email.")),
  phones: s.array("Candidate phone numbers returned by Recruitee.", s.string("One phone number.")),
  source: nullableString("The candidate source."),
  created_at: nullableString("The ISO 8601 timestamp when the candidate was created."),
  updated_at: nullableString("The ISO 8601 timestamp when the candidate was last updated."),
  deleted: nullableBoolean("Whether the candidate is deleted, or null when absent."),
  placements: s.array(
    "Candidate placement objects returned by Recruitee.",
    s.looseObject("One Recruitee placement object."),
  ),
  raw: s.looseObject("The raw Recruitee candidate object."),
});

const searchCandidatesOutputSchema = s.object("A Recruitee candidate search response.", {
  candidates: s.array("The normalized candidates returned by Recruitee.", candidateSummarySchema),
  total: nonNegativeInteger("The total number of candidates matching the search."),
  aggregations: s.unknown("The Recruitee aggregations payload, or null when absent."),
  raw: s.looseObject("The raw Recruitee candidate search response."),
});

const createCandidateInputSchema = s.object(
  "Request body for manually creating a Recruitee candidate.",
  {
    name: nonEmptyString("Candidate name."),
    emails: s.array("Candidate email addresses.", s.email("One candidate email address.")),
    phones: s.array("Candidate phone numbers.", nonEmptyString("One candidate phone number.")),
    socialLinks: s.array("Candidate social profile URLs.", s.url("One social profile URL.")),
    links: s.array("Candidate links.", s.url("One candidate link.")),
    coverLetter: s.string("Candidate cover letter text."),
    sources: s.array("Candidate source tags.", nonEmptyString("One source tag.")),
    remoteCvUrl: s.url(
      "URL to a CV or resume file hosted outside Recruitee. Use this instead of multipart file upload.",
    ),
    offers: s.array("Offer IDs to assign the candidate to.", positiveInteger("One offer ID.")),
    offerId: positiveInteger("Single offer ID to assign the candidate to."),
  },
  {
    optional: [
      "emails",
      "phones",
      "socialLinks",
      "links",
      "coverLetter",
      "sources",
      "remoteCvUrl",
      "offers",
      "offerId",
    ],
  },
);

const createCandidateOutputSchema = s.object("A Recruitee create candidate response.", {
  candidate: candidateSummarySchema,
  references: s.array(
    "Reference objects included by Recruitee, such as related offers, stages, and admins.",
    s.looseObject("One Recruitee reference object."),
  ),
  raw: s.looseObject("The raw Recruitee create candidate response."),
});

export const recruiteeActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_offers",
    operationType: "read",
    description:
      "List Recruitee company offers using the official ATS API, optionally filtered by scope and view mode.",
    requiredScopes: [],
    inputSchema: listOffersInputSchema,
    outputSchema: listOffersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_offer",
    operationType: "read",
    description: "Fetch one Recruitee offer by ID using the official ATS API.",
    requiredScopes: [],
    inputSchema: getOfferInputSchema,
    outputSchema: getOfferOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_candidates",
    operationType: "read",
    description: "Search Recruitee candidates with pagination, sorting, and official filters_json filters.",
    requiredScopes: [],
    inputSchema: searchCandidatesInputSchema,
    outputSchema: searchCandidatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_candidate",
    operationType: "write",
    description: "Manually create a Recruitee candidate with JSON fields and optional remote CV URL.",
    requiredScopes: [],
    inputSchema: createCandidateInputSchema,
    outputSchema: createCandidateOutputSchema,
  }),
];
