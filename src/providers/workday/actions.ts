import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  workdayProviderPermissions,
  workdayRecruitingReadScopes,
  workdayStaffingReadScopes,
  workdayWorkerProfileReadScopes,
} from "./scopes.ts";

const service = "workday";

const referenceSchema = s.object("A normalized Workday reference.", {
  id: s.nullableString("The Workday identifier of the referenced object."),
  href: s.nullableString("The Workday API URL of the referenced object."),
  descriptor: s.nullableString("The human-readable descriptor returned by Workday."),
});
const personSchema = s.object("A normalized Workday person summary.", {
  id: s.nullableString("The Workday identifier of the person record."),
  descriptor: s.nullableString("The human-readable descriptor of the person record."),
});
const workerTypeSchema = s.object("A normalized Workday worker type summary.", {
  id: s.nullableString("The Workday identifier of the worker type."),
  descriptor: s.nullableString("The human-readable descriptor of the worker type."),
});
const rawSchema = s.looseObject("The raw Workday object payload.");
const workerSchema = s.object(
  "A normalized Workday worker.",
  {
    id: s.nullableString("The Workday identifier of the worker."),
    workerId: s.nullableString("The worker ID assigned inside Workday."),
    descriptor: s.nullableString("The human-readable descriptor of the worker."),
    isManager: s.nullableBoolean("Whether the worker is marked as a manager."),
    businessTitle: s.nullableString("The business title returned for the worker."),
    primaryWorkEmail: s.nullableString("The primary work email address."),
    primaryWorkPhone: s.nullableString("The primary work phone number."),
    primaryWorkAddressText: s.nullableString("The primary work address in text form."),
    dateOfBirth: s.nullableString("The date of birth returned by Workday."),
    yearsOfService: s.nullableString("The years of service value returned by Workday."),
    person: personSchema,
    primaryJob: referenceSchema,
    workerType: workerTypeSchema,
    location: referenceSchema,
    primarySupervisoryOrganization: referenceSchema,
    additionalJobs: s.array("Additional job assignments for the worker.", referenceSchema),
    raw: rawSchema,
  },
  { optional: ["location", "primarySupervisoryOrganization"] },
);
const jobSchema = s.object("A normalized Workday job.", {
  id: s.nullableString("The Workday identifier of the job."),
  descriptor: s.nullableString("The human-readable descriptor of the job."),
  businessTitle: s.nullableString("The business title returned for the job."),
  nextPayPeriodStartDate: s.nullableString("The next pay period start date returned by Workday."),
  worker: referenceSchema,
  jobType: referenceSchema,
  location: referenceSchema,
  jobProfile: referenceSchema,
  supervisoryOrganization: referenceSchema,
  raw: rawSchema,
});
const jobPostingSchema = s.object(
  "A normalized Workday job posting.",
  {
    id: s.nullableString("The Workday identifier of the job posting."),
    descriptor: s.nullableString("The human-readable descriptor of the job posting."),
    jobTitle: s.nullableString("The job title returned for the posting."),
    postingTitle: s.nullableString("The posting title returned for the posting."),
    jobDescription: s.nullableString("The detailed job description, when returned."),
    postingStartDate: s.nullableString("The posting start date returned by Workday."),
    postingEndDate: s.nullableString("The posting end date returned by Workday."),
    location: referenceSchema,
    department: referenceSchema,
    position: referenceSchema,
    postingStatus: referenceSchema,
    jobRequisition: referenceSchema,
    hiringManager: referenceSchema,
    employmentType: referenceSchema,
    experienceLevel: referenceSchema,
    recruiters: s.array("Recruiters assigned to the posting.", referenceSchema),
    raw: rawSchema,
  },
  { optional: ["position", "hiringManager", "employmentType", "experienceLevel"] },
);
const limitField = s.integer("The maximum number of records to return. Workday accepts values from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const offsetField = s.nonNegativeInteger("The zero-based record offset used for pagination.");
const totalField = s.nullableInteger("The total number of matching records when Workday returns it.");
const stringIdArray = (description: string) =>
  s.stringArray(description, { itemDescription: "A Workday identifier string." });

export const workdayActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the current authenticated worker profile from Workday.",
    requiredScopes: workdayWorkerProfileReadScopes,
    providerPermissions: [workdayProviderPermissions.workerProfile],
    inputSchema: s.actionInput({}, [], "No input is required for this action."),
    outputSchema: s.actionOutput(
      {
        worker: workerSchema,
      },
      "The current authenticated Workday worker.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_workers",
    operationType: "read",
    description: "List workers from Workday Staffing with optional search and termination filters.",
    requiredScopes: workdayStaffingReadScopes,
    providerPermissions: [workdayProviderPermissions.staffing],
    inputSchema: s.actionInput(
      {
        limit: limitField,
        offset: offsetField,
        search: s.string("A case-insensitive worker search string accepted by Workday."),
        includeTerminatedWorkers: s.boolean("Whether terminated workers should be included in the result."),
      },
      [],
      "Filter and pagination input for listing workers.",
    ),
    outputSchema: collectionOutput("A Workday worker collection.", "workers", workerSchema),
  }),
  defineProviderAction(service, {
    name: "get_worker",
    operationType: "read",
    description: "Retrieve one worker by Workday worker identifier from the Staffing API.",
    requiredScopes: workdayStaffingReadScopes,
    providerPermissions: [workdayProviderPermissions.staffing],
    inputSchema: s.actionInput(
      {
        workerId: s.nonEmptyString("The Workday worker identifier."),
      },
      ["workerId"],
      "Input for retrieving a worker.",
    ),
    outputSchema: s.actionOutput({ worker: workerSchema }, "A single Workday worker."),
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    operationType: "read",
    description: "List jobs from Workday Staffing.",
    requiredScopes: workdayStaffingReadScopes,
    providerPermissions: [workdayProviderPermissions.staffing],
    inputSchema: s.actionInput(
      {
        limit: limitField,
        offset: offsetField,
      },
      [],
      "Pagination input for listing jobs.",
    ),
    outputSchema: collectionOutput("A Workday job collection.", "jobs", jobSchema),
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Retrieve one job by Workday job identifier from the Staffing API.",
    requiredScopes: workdayStaffingReadScopes,
    providerPermissions: [workdayProviderPermissions.staffing],
    inputSchema: s.actionInput(
      {
        jobId: s.nonEmptyString("The Workday job identifier."),
      },
      ["jobId"],
      "Input for retrieving a job.",
    ),
    outputSchema: s.actionOutput({ job: jobSchema }, "A single Workday job."),
  }),
  defineProviderAction(service, {
    name: "list_job_postings",
    operationType: "read",
    description: "List job postings from Workday Recruiting with optional filters.",
    requiredScopes: workdayRecruitingReadScopes,
    providerPermissions: [workdayProviderPermissions.recruiting],
    inputSchema: s.actionInput(
      {
        limit: limitField,
        offset: offsetField,
        jobSiteIds: stringIdArray("Filter postings by Workday job site identifiers."),
        categoryIds: stringIdArray("Filter postings by Workday category identifiers."),
        jobPostingIds: stringIdArray("Filter postings by Workday job posting identifiers."),
        jobRequisitionIds: stringIdArray("Filter postings by Workday job requisition identifiers."),
      },
      [],
      "Filter and pagination input for listing job postings.",
    ),
    outputSchema: collectionOutput("A Workday job posting collection.", "jobPostings", jobPostingSchema),
  }),
  defineProviderAction(service, {
    name: "get_job_posting",
    operationType: "read",
    description: "Retrieve one job posting by Workday job posting identifier.",
    requiredScopes: workdayRecruitingReadScopes,
    providerPermissions: [workdayProviderPermissions.recruiting],
    inputSchema: s.actionInput(
      {
        jobPostingId: s.nonEmptyString("The Workday job posting identifier."),
      },
      ["jobPostingId"],
      "Input for retrieving a job posting.",
    ),
    outputSchema: s.actionOutput({ jobPosting: jobPostingSchema }, "A single Workday job posting."),
  }),
];

function collectionOutput(
  description: string,
  key: string,
  itemSchema: Record<string, unknown>,
): Record<string, unknown> {
  return s.actionOutput(
    {
      [key]: s.array(`The ${key} returned by Workday.`, itemSchema),
      total: totalField,
      raw: rawSchema,
    },
    description,
  );
}
