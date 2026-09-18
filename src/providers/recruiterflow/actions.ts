import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "recruiterflow" as const;

const positiveInteger = (description: string) => s.positiveInteger(description);
const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const rawRecordSchema = s.looseObject("One raw Recruiterflow record returned by the API.");
const rawPayloadSchema = s.unknown("The raw Recruiterflow response payload.");
const totalItemsSchema = s.nullable(s.integer("The total number of matching records when Recruiterflow returns it."));

const listPaginationInputSchema = {
  itemsPerPage: positiveInteger("The number of records to return per page."),
  currentPage: positiveInteger("The page number to return."),
  includeCount: s.boolean("Whether Recruiterflow should include total item counts."),
};

const listJobsAction = defineProviderAction(service, {
  name: "list_jobs",
  operationType: "read",
  description: "List Recruiterflow jobs with optional pagination and inclusion flags.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Recruiterflow jobs.",
    {
      ...listPaginationInputSchema,
      includeNotes: s.boolean("Whether Recruiterflow should include job notes in each record."),
      includeDescription: s.boolean("Whether Recruiterflow should include job descriptions in each record."),
      onlyOpen: s.boolean("Whether to return only open jobs."),
    },
    {
      optional: ["itemsPerPage", "currentPage", "includeCount", "includeNotes", "includeDescription", "onlyOpen"],
    },
  ),
  outputSchema: s.object("The response returned when listing Recruiterflow jobs.", {
    jobs: s.array("The Recruiterflow jobs returned by the API.", rawRecordSchema),
    totalItems: totalItemsSchema,
    totalCurrentOpenings: s.nullable(s.integer("The total number of current openings when Recruiterflow returns it.")),
    raw: rawPayloadSchema,
  }),
});

const getJobAction = defineProviderAction(service, {
  name: "get_job",
  operationType: "read",
  description: "Get one Recruiterflow job by its job ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for retrieving a Recruiterflow job.",
    {
      jobId: positiveInteger("The Recruiterflow job identifier."),
      includeStages: s.boolean("Whether Recruiterflow should include job pipeline stages."),
    },
    { optional: ["includeStages"] },
  ),
  outputSchema: s.object("The response returned when retrieving a Recruiterflow job.", {
    job: rawRecordSchema,
    raw: rawPayloadSchema,
  }),
});

const listCandidatesAction = defineProviderAction(service, {
  name: "list_candidates",
  operationType: "read",
  description: "List Recruiterflow candidates with optional pagination and inclusion flags.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Recruiterflow candidates.",
    {
      ...listPaginationInputSchema,
      includeFiles: s.boolean("Whether Recruiterflow should include candidate file metadata."),
      includeNotes: s.boolean("Whether Recruiterflow should include candidate notes."),
    },
    {
      optional: ["itemsPerPage", "currentPage", "includeCount", "includeFiles", "includeNotes"],
    },
  ),
  outputSchema: s.object("The response returned when listing Recruiterflow candidates.", {
    candidates: s.array("The Recruiterflow candidates returned by the API.", rawRecordSchema),
    totalItems: totalItemsSchema,
    rank: s.nullable(s.looseObject("Recruiterflow candidate rank metadata when returned.")),
    raw: rawPayloadSchema,
  }),
});

const getCandidateAction = defineProviderAction(service, {
  name: "get_candidate",
  operationType: "read",
  description: "Get one Recruiterflow candidate by prospect ID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving a Recruiterflow candidate.", {
    candidateId: positiveInteger("The Recruiterflow candidate or prospect identifier."),
  }),
  outputSchema: s.object("The response returned when retrieving a Recruiterflow candidate.", {
    candidate: rawRecordSchema,
    raw: rawPayloadSchema,
  }),
});

const listUsersAction = defineProviderAction(service, {
  name: "list_users",
  operationType: "read",
  description: "List Recruiterflow users in the connected workspace.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing Recruiterflow users.",
    {
      includeCount: s.boolean("Whether Recruiterflow should include total user counts."),
    },
    { optional: ["includeCount"] },
  ),
  outputSchema: s.object("The response returned when listing Recruiterflow users.", {
    users: s.array("The Recruiterflow users returned by the API.", rawRecordSchema),
    totalItems: totalItemsSchema,
    raw: rawPayloadSchema,
  }),
});

const getUserInputSchema = s.object(
  "The input payload for retrieving a Recruiterflow user.",
  {
    userId: positiveInteger("The Recruiterflow user identifier."),
    email: nonEmptyString("The Recruiterflow user email address."),
  },
  { optional: ["userId", "email"] },
);

const getUserAction = defineProviderAction(service, {
  name: "get_user",
  operationType: "read",
  description: "Get one Recruiterflow user by user ID or email address.",
  requiredScopes: [],
  inputSchema: getUserInputSchema,
  outputSchema: s.object("The response returned when retrieving a Recruiterflow user.", {
    user: rawRecordSchema,
    raw: rawPayloadSchema,
  }),
});

export const recruiterflowActions: ProviderActionDefinition[] = [
  listJobsAction,
  getJobAction,
  listCandidatesAction,
  getCandidateAction,
  listUsersAction,
  getUserAction,
];
