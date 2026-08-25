import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jazzhr";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const rawPayloadSchema = s.unknown("The raw JazzHR API response payload.");
const rawRecordSchema = s.looseObject("A raw JazzHR record returned by the API.");
const pageSchema = s.positiveInteger(
  "The JazzHR result page to request. JazzHR pages start at 1 and return up to 100 records.",
);
const jazzhrBooleanFilterSchema = s.boolean("Whether this JazzHR boolean filter should match.");
const jobStatusSchema = s.stringEnum("The JazzHR job status filter.", [
  "open",
  "on hold",
  "approved",
  "needs approval",
  "drafting",
  "filled",
  "cancelled",
  "closed",
]);

const listJobsInputSchema = s.actionInput(
  {
    page: pageSchema,
    title: s.string("Filter jobs by title."),
    recruiter: s.string("Filter jobs by recruiter."),
    board_code: s.string("Filter jobs by board code."),
    department: s.string("Filter jobs by department."),
    hiring_lead: s.string("Filter jobs by hiring lead."),
    state: s.string("Filter jobs by state."),
    city: s.string("Filter jobs by city."),
    from_open_date: s.date("Only include jobs opened on or after this date."),
    to_open_date: s.date("Only include jobs opened on or before this date."),
    status: jobStatusSchema,
    confidential: jazzhrBooleanFilterSchema,
    private: jazzhrBooleanFilterSchema,
  },
  [],
  "Filters accepted by JazzHR when listing jobs.",
);

const getJobInputSchema = s.actionInput(
  { job_id: nonEmptyString("The JazzHR job ID.") },
  ["job_id"],
  "Input identifying a JazzHR job.",
);

const applicantRatingSchema = s.integer("Filter applicants by rating from 1 to 5.", {
  minimum: 1,
  maximum: 5,
});
const listApplicantsInputSchema = s.actionInput(
  {
    page: pageSchema,
    name: s.string("Filter applicants by any substring in first or last name."),
    city: s.string("Filter applicants by city."),
    job_id: s.string("Filter applicants by JazzHR job ID."),
    job_title: s.string("Filter applicants by job title."),
    recruiter_id: s.string("Filter applicants by recruiter ID."),
    apply_date: s.date("Filter applicants by exact applied date."),
    from_apply_date: s.date("Only include applicants who applied on or after this date."),
    to_apply_date: s.date("Only include applicants who applied on or before this date."),
    status: s.string("Filter applicants by workflow status ID."),
    rating: applicantRatingSchema,
  },
  [],
  "Filters accepted by JazzHR when listing applicants.",
);

const getApplicantInputSchema = s.actionInput(
  { applicant_id: nonEmptyString("The JazzHR applicant ID.") },
  ["applicant_id"],
  "Input identifying a JazzHR applicant.",
);

const listUsersInputSchema = s.actionInput(
  {
    page: pageSchema,
    name: s.string("Filter users by name."),
    email: s.email("Filter users by email address."),
    type: s.string(
      "Filter users by type, such as Administrator, Manager, User, Recruiter, Employee, Deactivated, or Deleted.",
    ),
  },
  [],
  "Filters accepted by JazzHR when listing users.",
);

const getUserInputSchema = s.actionInput(
  { user_id: nonEmptyString("The JazzHR user ID.") },
  ["user_id"],
  "Input identifying a JazzHR user.",
);

function listOutputSchema(description: string, key: string): JsonSchema {
  return s.actionOutput(
    {
      [key]: s.array(`JazzHR ${key} returned by the API.`, rawRecordSchema),
      raw: rawPayloadSchema,
    },
    description,
  );
}

function singleOutputSchema(description: string, key: string): JsonSchema {
  return s.actionOutput(
    {
      [key]: rawRecordSchema,
      raw: rawPayloadSchema,
    },
    description,
  );
}

export const jazzhrActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_jobs",
    description: "List JazzHR jobs with optional title, owner, location, date, and status filters.",
    inputSchema: listJobsInputSchema,
    outputSchema: listOutputSchema("JazzHR job list.", "jobs"),
  }),
  defineProviderAction(service, {
    name: "get_job",
    description: "Get a single JazzHR job by ID.",
    inputSchema: getJobInputSchema,
    outputSchema: singleOutputSchema("JazzHR job lookup result.", "job"),
  }),
  defineProviderAction(service, {
    name: "list_applicants",
    description: "List JazzHR applicants with optional name, job, date, workflow status, and rating filters.",
    inputSchema: listApplicantsInputSchema,
    outputSchema: listOutputSchema("JazzHR applicant list.", "applicants"),
  }),
  defineProviderAction(service, {
    name: "get_applicant",
    description: "Get a single JazzHR applicant by ID.",
    inputSchema: getApplicantInputSchema,
    outputSchema: singleOutputSchema("JazzHR applicant lookup result.", "applicant"),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List JazzHR users with optional name, email, and type filters.",
    inputSchema: listUsersInputSchema,
    outputSchema: listOutputSchema("JazzHR user list.", "users"),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a single JazzHR user by ID.",
    inputSchema: getUserInputSchema,
    outputSchema: singleOutputSchema("JazzHR user lookup result.", "user"),
  }),
];
