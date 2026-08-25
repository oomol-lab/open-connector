import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "smartrecruiters" as const;

const idSchema = s.string("The SmartRecruiters resource identifier.", { minLength: 1 });
const pageIdSchema = s.string("The SmartRecruiters pageId cursor returned by a previous page.", {
  minLength: 1,
});
const limitSchema = s.integer("The maximum number of items to return. SmartRecruiters allows up to 100.", {
  minimum: 1,
  maximum: 100,
});
const languageSchema = s.string("The language code for localized SmartRecruiters job content.", {
  minLength: 1,
});
const searchQuerySchema = s.string("The SmartRecruiters full-text search query.", {
  minLength: 1,
});
const dateTimeSchema = s.string("An ISO8601-formatted SmartRecruiters date-time boundary.", {
  minLength: 1,
});
const stringArraySchema = (description: string, itemDescription: string) =>
  s.array(description, s.string(itemDescription, { minLength: 1 }), { minItems: 1 });

const locationSchema = s.looseObject("The SmartRecruiters location object.", {
  country: s.string("The location country returned by SmartRecruiters."),
  countryCode: s.string("The location country code returned by SmartRecruiters."),
  region: s.string("The location region returned by SmartRecruiters."),
  regionCode: s.string("The location region code returned by SmartRecruiters."),
  city: s.string("The location city returned by SmartRecruiters."),
});

const jobSchema = s.looseObject("A SmartRecruiters job returned by the Jobs API.", {
  id: idSchema,
  name: s.string("The SmartRecruiters job name."),
  refNumber: s.string("The SmartRecruiters job reference number."),
  status: s.string("The SmartRecruiters job status."),
  createdOn: s.string("The SmartRecruiters job creation timestamp."),
  updatedOn: s.string("The SmartRecruiters job update timestamp."),
  location: locationSchema,
});

const candidateSchema = s.looseObject("A SmartRecruiters candidate returned by the Candidates API.", {
  id: idSchema,
  firstName: s.string("The candidate first name returned by SmartRecruiters."),
  lastName: s.string("The candidate last name returned by SmartRecruiters."),
  email: s.string("The candidate email address returned by SmartRecruiters."),
  phoneNumber: s.string("The candidate phone number returned by SmartRecruiters."),
  createdOn: s.string("The SmartRecruiters candidate creation timestamp."),
  updatedOn: s.string("The SmartRecruiters candidate update timestamp."),
  location: locationSchema,
});

const listJobsAction = defineProviderAction(service, {
  name: "list_jobs",
  description: "Search SmartRecruiters jobs with optional filters and cursor pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing SmartRecruiters jobs.",
    {
      q: searchQuerySchema,
      limit: limitSchema,
      pageId: pageIdSchema,
      language: languageSchema,
      city: stringArraySchema("The city filters to apply to SmartRecruiters jobs.", "One city filter."),
      department: stringArraySchema(
        "The department label filters to apply to SmartRecruiters jobs.",
        "One department label filter.",
      ),
      updatedAfter: dateTimeSchema,
      lastActivityAfter: dateTimeSchema,
    },
    {
      optional: ["q", "limit", "pageId", "language", "city", "department", "updatedAfter", "lastActivityAfter"],
    },
  ),
  outputSchema: s.object("The SmartRecruiters jobs list response.", {
    jobs: s.array("The SmartRecruiters jobs returned for this page.", jobSchema),
    limit: s.nullable(s.integer("The page size returned by SmartRecruiters.")),
    nextPageId: s.nullable(s.string("The cursor to pass as pageId to retrieve the next page of jobs.")),
    raw: s.looseObject("The raw SmartRecruiters list response.", {}),
  }),
});

const getJobAction = defineProviderAction(service, {
  name: "get_job",
  description: "Get SmartRecruiters job details by job ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for getting one SmartRecruiters job.",
    {
      jobId: idSchema,
      language: languageSchema,
    },
    { optional: ["language"] },
  ),
  outputSchema: s.object("The SmartRecruiters job details response.", {
    job: jobSchema,
  }),
});

const searchCandidatesAction = defineProviderAction(service, {
  name: "search_candidates",
  description: "Search SmartRecruiters candidates with optional filters and cursor pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching SmartRecruiters candidates.",
    {
      q: searchQuerySchema,
      limit: limitSchema,
      pageId: pageIdSchema,
      jobId: stringArraySchema(
        "The SmartRecruiters job IDs used to filter candidate applications.",
        "One SmartRecruiters job ID.",
      ),
      location: stringArraySchema(
        "The location keywords used to filter candidates.",
        "One candidate location keyword.",
      ),
      status: stringArraySchema("The candidate status filters in the context of a job.", "One candidate status value."),
      tag: stringArraySchema("The candidate tag filters to apply.", "One SmartRecruiters candidate tag."),
      updatedAfter: dateTimeSchema,
      subStatus: s.string("The candidate sub-status filter used with a status filter.", {
        minLength: 1,
      }),
    },
    {
      optional: ["q", "limit", "pageId", "jobId", "location", "status", "tag", "updatedAfter", "subStatus"],
    },
  ),
  outputSchema: s.object("The SmartRecruiters candidates search response.", {
    candidates: s.array("The SmartRecruiters candidates returned for this page.", candidateSchema),
    limit: s.nullable(s.integer("The page size returned by SmartRecruiters.")),
    nextPageId: s.nullable(s.string("The cursor to pass as pageId to retrieve the next page of candidates.")),
    raw: s.looseObject("The raw SmartRecruiters search response.", {}),
  }),
});

const getCandidateAction = defineProviderAction(service, {
  name: "get_candidate",
  description: "Get SmartRecruiters candidate details by candidate ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for getting one SmartRecruiters candidate.", {
    candidateId: idSchema,
  }),
  outputSchema: s.object("The SmartRecruiters candidate details response.", {
    candidate: candidateSchema,
  }),
});

export const smartrecruitersActions: ActionDefinition[] = [
  listJobsAction,
  getJobAction,
  searchCandidatesAction,
  getCandidateAction,
];
