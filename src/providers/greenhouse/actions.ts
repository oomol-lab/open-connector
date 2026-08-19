import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "greenhouse";

const trimmedString = (description: string) => s.nonEmptyString(description);
const idSchema = (description: string) =>
  s.anyOf(description, [
    s.integer("Greenhouse numeric identifier."),
    trimmedString("Greenhouse identifier as a string."),
  ]);
const paginationInputFields = {
  perPage: s.integer("Maximum number of records to return in one response.", { minimum: 1, maximum: 500 }),
  page: s.integer("Greenhouse page number to request.", { minimum: 1 }),
  skipCount: s.boolean("Whether to omit the last pagination link for faster list requests."),
};
const timestampFilterFields = {
  createdBefore: trimmedString("Return only records created before this ISO-8601 timestamp."),
  createdAfter: trimmedString("Return only records created at or after this ISO-8601 timestamp."),
  updatedBefore: trimmedString("Return only records updated before this ISO-8601 timestamp."),
  updatedAfter: trimmedString("Return only records updated at or after this ISO-8601 timestamp."),
};
const listJobsInputSchema = s.object(
  "Input for listing Greenhouse jobs.",
  {
    ...paginationInputFields,
    ...timestampFilterFields,
    status: s.stringEnum("Return only jobs with this status.", ["open", "closed", "draft"]),
    requisitionId: trimmedString("Return only jobs matching this requisition ID."),
    openingId: trimmedString("Return only jobs containing this opening ID."),
    departmentId: idSchema("Return only jobs in this Greenhouse department."),
    externalDepartmentId: trimmedString("Return only jobs in the department matching this external department ID."),
  },
  {
    optional: [
      "perPage",
      "page",
      "skipCount",
      "createdBefore",
      "createdAfter",
      "updatedBefore",
      "updatedAfter",
      "status",
      "requisitionId",
      "openingId",
      "departmentId",
      "externalDepartmentId",
    ],
  },
);
const getByIdInputSchema = (description: string, fieldDescription: string) =>
  s.object(description, {
    id: idSchema(fieldDescription),
  });
const listCandidatesInputSchema = s.object(
  "Input for listing Greenhouse candidates.",
  {
    ...paginationInputFields,
    ...timestampFilterFields,
    jobId: idSchema("Return only candidates who have applied to this job."),
    email: trimmedString("Return only candidates with this email address."),
    candidateIds: s.array(
      "Return only candidates with these IDs. Greenhouse accepts up to 50 candidate IDs.",
      idSchema("A Greenhouse candidate ID."),
      { minItems: 1, maxItems: 50 },
    ),
  },
  {
    optional: [
      "perPage",
      "page",
      "skipCount",
      "createdBefore",
      "createdAfter",
      "updatedBefore",
      "updatedAfter",
      "jobId",
      "email",
      "candidateIds",
    ],
  },
);
const listApplicationsInputSchema = s.object(
  "Input for listing Greenhouse applications.",
  {
    ...paginationInputFields,
    candidateId: idSchema("Return only applications for this candidate."),
    jobId: idSchema("Return only applications for this job."),
    status: trimmedString("Return only applications with this Greenhouse status."),
  },
  { optional: ["perPage", "page", "skipCount", "candidateId", "jobId", "status"] },
);
const addCandidateNoteInputSchema = s.object("Input for creating a Greenhouse candidate note.", {
  candidateId: idSchema("The Greenhouse candidate ID that receives the note."),
  onBehalfOfUserId: idSchema("The Greenhouse user ID supplied in the required On-Behalf-Of audit header."),
  body: trimmedString("The note body to add to the candidate activity feed."),
  visibility: s.stringEnum("The Greenhouse note visibility.", ["admin_only", "private", "public"]),
});
const paginationLinksSchema = s.object("Greenhouse pagination links parsed from the Link response header.", {
  next: s.nullable(s.string("URL for the next page, if present.")),
  prev: s.nullable(s.string("URL for the previous page, if present.")),
  last: s.nullable(s.string("URL for the last page, if present.")),
});
const jobSchema = s.looseObject("A Greenhouse job record.", {
  id: s.integer("Greenhouse job ID."),
  name: s.string("Job name."),
  status: s.string("Job status."),
  requisition_id: s.nullable(s.string("Job requisition ID, if present.")),
  created_at: s.string("Timestamp when the job was created."),
  opened_at: s.nullable(s.string("Timestamp when the job was opened, if present.")),
  closed_at: s.nullable(s.string("Timestamp when the job was closed, if present.")),
});
const candidateSchema = s.looseObject("A Greenhouse candidate record.", {
  id: s.integer("Greenhouse candidate ID."),
  first_name: s.nullable(s.string("Candidate first name.")),
  last_name: s.nullable(s.string("Candidate last name.")),
  company: s.nullable(s.string("Candidate company.")),
  title: s.nullable(s.string("Candidate title.")),
  created_at: s.string("Timestamp when the candidate was created."),
  updated_at: s.string("Timestamp when the candidate was last updated."),
});
const applicationSchema = s.looseObject("A Greenhouse application record.", {
  id: s.integer("Greenhouse application ID."),
  candidate_id: s.integer("Greenhouse candidate ID associated with this application."),
  applied_at: s.nullable(s.string("Timestamp when the candidate applied, if present.")),
  rejected_at: s.nullable(s.string("Timestamp when the application was rejected, if present.")),
  status: s.string("Application status."),
});
const noteSchema = s.looseObject("A Greenhouse candidate activity feed note.", {
  id: s.integer("Greenhouse note ID."),
  body: s.string("Greenhouse note body."),
  visibility: s.string("Greenhouse note visibility."),
  created_at: s.string("Timestamp when the note was created."),
});

export const greenhouseActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_jobs",
    description: "List Greenhouse jobs with optional status, department, and timestamp filters.",
    inputSchema: listJobsInputSchema,
    outputSchema: s.object("Greenhouse job list output.", {
      jobs: s.array("Greenhouse jobs returned for the requested page.", jobSchema),
      links: paginationLinksSchema,
      raw: s.unknown("Raw Greenhouse jobs response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_job",
    description: "Retrieve one Greenhouse job by ID.",
    inputSchema: getByIdInputSchema("Input for retrieving one Greenhouse job.", "The job ID."),
    outputSchema: s.object("Greenhouse job output.", {
      job: jobSchema,
      raw: s.unknown("Raw Greenhouse job response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_candidates",
    description: "List Greenhouse candidates with optional job, email, candidate ID, and timestamp filters.",
    inputSchema: listCandidatesInputSchema,
    outputSchema: s.object("Greenhouse candidate list output.", {
      candidates: s.array("Greenhouse candidates returned for the requested page.", candidateSchema),
      links: paginationLinksSchema,
      raw: s.unknown("Raw Greenhouse candidates response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_candidate",
    description: "Retrieve one Greenhouse candidate by ID.",
    inputSchema: getByIdInputSchema("Input for retrieving one Greenhouse candidate.", "The candidate ID."),
    outputSchema: s.object("Greenhouse candidate output.", {
      candidate: candidateSchema,
      raw: s.unknown("Raw Greenhouse candidate response."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_applications",
    description: "List Greenhouse applications with optional candidate, job, and status filters.",
    inputSchema: listApplicationsInputSchema,
    outputSchema: s.object("Greenhouse application list output.", {
      applications: s.array("Greenhouse applications returned for the requested page.", applicationSchema),
      links: paginationLinksSchema,
      raw: s.unknown("Raw Greenhouse applications response."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_application",
    description: "Retrieve one Greenhouse application by ID.",
    inputSchema: getByIdInputSchema("Input for retrieving one Greenhouse application.", "The application ID."),
    outputSchema: s.object("Greenhouse application output.", {
      application: applicationSchema,
      raw: s.unknown("Raw Greenhouse application response."),
    }),
  }),
  defineProviderAction(service, {
    name: "add_candidate_note",
    description: "Create a Greenhouse candidate activity feed note using an explicit On-Behalf-Of audit user.",
    inputSchema: addCandidateNoteInputSchema,
    outputSchema: s.object("Greenhouse candidate note output.", {
      note: noteSchema,
      raw: s.unknown("Raw Greenhouse candidate note response."),
    }),
  }),
];
