import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "manatal";

const nonEmptyString = (description: string, options: { maxLength?: number } = {}) =>
  s.string({ description, minLength: 1, maxLength: options.maxLength });

const idField = (description: string) => s.positiveInteger(description);

const rawResponseSchema = s.unknownObject("Raw Manatal response payload.");
const customFieldsSchema = s.unknownObject("Custom field values defined in Manatal.");
const candidateRecordSchema = s.unknownObject("One Manatal candidate object.");
const jobRecordSchema = s.unknownObject("One Manatal job object.");
const organizationRecordSchema = s.unknownObject("One Manatal organization object.");
const matchRecordSchema = s.unknownObject("One Manatal match object.");

const paginationInput = {
  page: s.positiveInteger("Page number to request. Manatal starts pagination at 1."),
  pageSize: s.positiveInteger("Number of records to return per page."),
};

const paginationOutput = {
  count: s.integer("Total number of matching records reported by Manatal."),
  next: s.nullableString("URL for the next Manatal result page, or null when there is no next page."),
  previous: s.nullableString("URL for the previous Manatal result page, or null when there is no previous page."),
};

const listOutputOptionalKeys = ["count", "next", "previous"];

const dateRangeFilters = {
  createdAtGte: s.dateTime("Return records created at or after this timestamp."),
  createdAtLte: s.dateTime("Return records created at or before this timestamp."),
  updatedAtGte: s.dateTime("Return records updated at or after this timestamp."),
  updatedAtLte: s.dateTime("Return records updated at or before this timestamp."),
};

const candidateSourceTypeSchema = s.stringEnum("Origin of the candidate.", [
  "sourced",
  "applied",
  "referred",
  "agency",
  "other",
]);

const candidateGenderSchema = s.stringEnum("Gender value stored on the candidate.", [
  "male",
  "female",
  "other",
  "unknown",
]);

const jobContractDetailsSchema = s.stringEnum("Contract type for the job.", [
  "full_time",
  "part_time",
  "temporary",
  "freelance",
  "internship",
  "apprenticeship",
  "contractor",
  "consultancy",
]);

const jobStatusSchema = s.stringEnum("Status of the job.", ["active", "on_hold", "won", "lost"]);

const listCandidatesInputSchema = s.object(
  "Filters and pagination for listing Manatal candidates.",
  {
    ...paginationInput,
    id: idField("Return a specific candidate ID."),
    fullName: nonEmptyString("Filter candidates by full name."),
    creatorId: idField("Return candidates created by this Manatal user ID."),
    ownerId: idField("Return candidates owned by this Manatal user ID."),
    sourceType: nonEmptyString("Filter candidates by source type."),
    email: nonEmptyString("Filter candidates by email address."),
    phoneNumber: nonEmptyString("Filter candidates by phone number."),
    gender: nonEmptyString("Filter candidates by gender."),
    birthDateGte: s.date("Return candidates born on or after this date."),
    birthDateLte: s.date("Return candidates born on or before this date."),
    address: nonEmptyString("Filter candidates by address text."),
    latestDegree: nonEmptyString("Filter candidates by latest degree."),
    latestUniversity: nonEmptyString("Filter candidates by latest university."),
    currentCompany: nonEmptyString("Filter candidates by current company."),
    currentPosition: nonEmptyString("Filter candidates by current position."),
    description: nonEmptyString("Filter candidates by description text."),
    externalId: nonEmptyString("Filter candidates by external ID."),
    candidateTags: nonEmptyString("Filter candidates by candidate tag IDs or names."),
    candidateIndustries: nonEmptyString("Filter candidates by candidate industry IDs or names."),
    candidateLocation: nonEmptyString("Filter candidates by location text."),
    ...dateRangeFilters,
  },
  {
    optional: [
      "page",
      "pageSize",
      "id",
      "fullName",
      "creatorId",
      "ownerId",
      "sourceType",
      "email",
      "phoneNumber",
      "gender",
      "birthDateGte",
      "birthDateLte",
      "address",
      "latestDegree",
      "latestUniversity",
      "currentCompany",
      "currentPosition",
      "description",
      "externalId",
      "candidateTags",
      "candidateIndustries",
      "candidateLocation",
      "createdAtGte",
      "createdAtLte",
      "updatedAtGte",
      "updatedAtLte",
    ],
  },
);

const listCandidatesOutputSchema = s.object(
  "Normalized Manatal candidate list response.",
  {
    candidates: s.array("Candidates returned by Manatal.", candidateRecordSchema),
    ...paginationOutput,
    raw: rawResponseSchema,
  },
  { optional: listOutputOptionalKeys },
);

const getCandidateInputSchema = s.object("Identifier for getting a Manatal candidate.", {
  candidateId: idField("ID of the Manatal candidate to retrieve."),
});

const candidateOutputSchema = s.object("Normalized Manatal candidate response.", {
  candidate: candidateRecordSchema,
  raw: rawResponseSchema,
});

const candidateFields = {
  fullName: nonEmptyString("Full name of the candidate.", { maxLength: 255 }),
  externalId: nonEmptyString("ID of the candidate in an external system.", { maxLength: 255 }),
  owner: idField("ID of the owner of the candidate."),
  sourceType: candidateSourceTypeSchema,
  sourceOther: nonEmptyString("Manual source information when sourceType is other.", { maxLength: 255 }),
  consent: s.boolean("Whether the candidate gave permission to use their data."),
  email: s.email("Candidate email address."),
  phoneNumber: nonEmptyString("Candidate phone number.", { maxLength: 255 }),
  gender: candidateGenderSchema,
  birthDate: s.date("Candidate birth date."),
  address: nonEmptyString("Full address of the candidate.", { maxLength: 255 }),
  zipcode: nonEmptyString("Postal code for the candidate address.", { maxLength: 255 }),
  latestDegree: nonEmptyString("Latest degree obtained by the candidate.", { maxLength: 255 }),
  latestUniversity: nonEmptyString("Latest university the candidate graduated from.", { maxLength: 255 }),
  currentCompany: nonEmptyString("Company where the candidate currently works.", { maxLength: 255 }),
  currentDepartment: nonEmptyString("Department where the candidate currently works.", { maxLength: 255 }),
  currentPosition: nonEmptyString("Current position of the candidate.", { maxLength: 255 }),
  description: nonEmptyString("Text description of the candidate."),
  customFields: customFieldsSchema,
};

const candidateFieldKeys = [
  "fullName",
  "externalId",
  "owner",
  "sourceType",
  "sourceOther",
  "consent",
  "email",
  "phoneNumber",
  "gender",
  "birthDate",
  "address",
  "zipcode",
  "latestDegree",
  "latestUniversity",
  "currentCompany",
  "currentDepartment",
  "currentPosition",
  "description",
  "customFields",
];

const createCandidateInputSchema = s.object("Fields for creating a Manatal candidate.", candidateFields, {
  optional: candidateFieldKeys.filter((key) => key !== "fullName"),
});

const updateCandidateInputSchema = s.object(
  "Fields for partially updating a Manatal candidate.",
  {
    candidateId: idField("ID of the Manatal candidate to update."),
    ...candidateFields,
  },
  { optional: candidateFieldKeys },
);

const listJobsInputSchema = s.object(
  "Filters and pagination for listing Manatal jobs.",
  {
    ...paginationInput,
    id: idField("Return a specific job ID."),
    organizationId: idField("Filter jobs by organization ID."),
    positionName: nonEmptyString("Filter jobs by position name."),
    headcount: s.nonNegativeInteger("Filter jobs by required headcount."),
    creatorId: idField("Return jobs created by this Manatal user ID."),
    ownerId: idField("Return jobs owned by this Manatal user ID."),
    address: nonEmptyString("Filter jobs by address text."),
    status: nonEmptyString("Filter jobs by status."),
    frequency: nonEmptyString("Filter jobs by salary frequency."),
    city: nonEmptyString("Filter jobs by city."),
    state: nonEmptyString("Filter jobs by state."),
    contractDetails: nonEmptyString("Filter jobs by contract details."),
    isPublished: s.boolean("Filter jobs by whether they are published."),
    isRemote: s.boolean("Filter jobs by whether they are remote."),
    externalId: nonEmptyString("Filter jobs by external ID."),
    openAtGte: s.dateTime("Return jobs opened at or after this timestamp."),
    openAtLte: s.dateTime("Return jobs opened at or before this timestamp."),
    closeAtGte: s.dateTime("Return jobs closed at or after this timestamp."),
    closeAtLte: s.dateTime("Return jobs closed at or before this timestamp."),
    ...dateRangeFilters,
  },
  {
    optional: [
      "page",
      "pageSize",
      "id",
      "organizationId",
      "positionName",
      "headcount",
      "creatorId",
      "ownerId",
      "address",
      "status",
      "frequency",
      "city",
      "state",
      "contractDetails",
      "isPublished",
      "isRemote",
      "externalId",
      "openAtGte",
      "openAtLte",
      "closeAtGte",
      "closeAtLte",
      "createdAtGte",
      "createdAtLte",
      "updatedAtGte",
      "updatedAtLte",
    ],
  },
);

const listJobsOutputSchema = s.object(
  "Normalized Manatal job list response.",
  {
    jobs: s.array("Jobs returned by Manatal.", jobRecordSchema),
    ...paginationOutput,
    raw: rawResponseSchema,
  },
  { optional: listOutputOptionalKeys },
);

const getJobInputSchema = s.object("Identifier for getting a Manatal job.", {
  jobId: idField("ID of the Manatal job to retrieve."),
});

const jobOutputSchema = s.object("Normalized Manatal job response.", {
  job: jobRecordSchema,
  raw: rawResponseSchema,
});

const jobFields = {
  organization: idField("ID of the organization the job is assigned to."),
  positionName: nonEmptyString("Job title.", { maxLength: 255 }),
  externalId: nonEmptyString("ID of the job in an external system.", { maxLength: 255 }),
  description: nonEmptyString("Description of the job."),
  expectedCloseAt: s.dateTime("Expected date and time when the job will be closed or filled."),
  headcount: s.nonNegativeInteger("Number of people to be hired for the job."),
  salaryMin: nonEmptyString("Minimum salary value for the job."),
  salaryMax: nonEmptyString("Maximum salary value for the job."),
  isSalaryVisible: s.boolean("Whether salary information is displayed to candidates."),
  frequency: nonEmptyString("Salary frequency for the job."),
  currency: nonEmptyString("Currency code for salary values."),
  industry: idField("ID of the industry assigned to the job."),
  owner: idField("ID of the owner of the job."),
  address: nonEmptyString("Address of the office where the job takes place.", { maxLength: 255 }),
  city: nonEmptyString("City of the office where the job takes place.", { maxLength: 255 }),
  state: nonEmptyString("State of the office where the job takes place.", { maxLength: 255 }),
  country: nonEmptyString("Country of the office where the job takes place.", { maxLength: 255 }),
  zipcode: nonEmptyString("Postal code for the job address.", { maxLength: 255 }),
  contractDetails: jobContractDetailsSchema,
  isPublished: s.boolean("Whether the job is published."),
  isRemote: s.boolean("Whether the job is remote."),
  status: jobStatusSchema,
  isPinnedInCareerPage: s.boolean("Whether the job is pinned on the career page."),
  customFields: customFieldsSchema,
};

const jobFieldKeys = [
  "organization",
  "positionName",
  "externalId",
  "description",
  "expectedCloseAt",
  "headcount",
  "salaryMin",
  "salaryMax",
  "isSalaryVisible",
  "frequency",
  "currency",
  "industry",
  "owner",
  "address",
  "city",
  "state",
  "country",
  "zipcode",
  "contractDetails",
  "isPublished",
  "isRemote",
  "status",
  "isPinnedInCareerPage",
  "customFields",
];

const createJobInputSchema = s.object("Fields for creating a Manatal job.", jobFields, {
  optional: jobFieldKeys.filter((key) => key !== "organization" && key !== "positionName"),
});

const updateJobInputSchema = s.object(
  "Fields for partially updating a Manatal job.",
  {
    jobId: idField("ID of the Manatal job to update."),
    ...jobFields,
  },
  { optional: jobFieldKeys },
);

const listOrganizationsInputSchema = s.object(
  "Filters and pagination for listing Manatal organizations.",
  {
    ...paginationInput,
    id: idField("Return a specific organization ID."),
    name: nonEmptyString("Filter organizations by name."),
    creatorId: idField("Return organizations created by this Manatal user ID."),
    ownerId: idField("Return organizations owned by this Manatal user ID."),
    address: nonEmptyString("Filter organizations by address text."),
    website: nonEmptyString("Filter organizations by website."),
    isPublic: s.boolean("Filter organizations by whether they are public."),
    isVisible: s.boolean("Filter organizations by whether they are visible."),
    externalId: nonEmptyString("Filter organizations by external ID."),
    ...dateRangeFilters,
  },
  {
    optional: [
      "page",
      "pageSize",
      "id",
      "name",
      "creatorId",
      "ownerId",
      "address",
      "website",
      "isPublic",
      "isVisible",
      "externalId",
      "createdAtGte",
      "createdAtLte",
      "updatedAtGte",
      "updatedAtLte",
    ],
  },
);

const listOrganizationsOutputSchema = s.object(
  "Normalized Manatal organization list response.",
  {
    organizations: s.array("Organizations returned by Manatal.", organizationRecordSchema),
    ...paginationOutput,
    raw: rawResponseSchema,
  },
  { optional: listOutputOptionalKeys },
);

const getOrganizationInputSchema = s.object("Identifier for getting a Manatal organization.", {
  organizationId: idField("ID of the Manatal organization to retrieve."),
});

const organizationOutputSchema = s.object("Normalized Manatal organization response.", {
  organization: organizationRecordSchema,
  raw: rawResponseSchema,
});

const organizationFields = {
  name: nonEmptyString("Name of the organization.", { maxLength: 255 }),
  externalId: nonEmptyString("ID of the organization in an external system.", { maxLength: 255 }),
  owner: idField("ID of the owner of the organization."),
  address: nonEmptyString("Full address of the organization.", { maxLength: 255 }),
  website: s.url("Website URL for the organization."),
  description: nonEmptyString("Description of the organization."),
  isPublic: s.boolean("Whether the organization is public."),
  isVisible: s.boolean("Whether the organization is visible."),
  customFields: customFieldsSchema,
};

const organizationFieldKeys = [
  "name",
  "externalId",
  "owner",
  "address",
  "website",
  "description",
  "isPublic",
  "isVisible",
  "customFields",
];

const createOrganizationInputSchema = s.object("Fields for creating a Manatal organization.", organizationFields, {
  optional: organizationFieldKeys.filter((key) => key !== "name"),
});

const updateOrganizationInputSchema = s.object(
  "Fields for partially updating a Manatal organization.",
  {
    organizationId: idField("ID of the Manatal organization to update."),
    ...organizationFields,
  },
  { optional: organizationFieldKeys },
);

const matchDateFilters = {
  hiredAtGte: s.dateTime("Return matches hired at or after this timestamp."),
  hiredAtLte: s.dateTime("Return matches hired at or before this timestamp."),
  submittedAtGte: s.dateTime("Return matches submitted at or after this timestamp."),
  submittedAtLte: s.dateTime("Return matches submitted at or before this timestamp."),
  interviewAtGte: s.dateTime("Return matches interviewed at or after this timestamp."),
  interviewAtLte: s.dateTime("Return matches interviewed at or before this timestamp."),
  offerAtGte: s.dateTime("Return matches offered at or after this timestamp."),
  offerAtLte: s.dateTime("Return matches offered at or before this timestamp."),
  droppedAtGte: s.dateTime("Return matches dropped at or after this timestamp."),
  droppedAtLte: s.dateTime("Return matches dropped at or before this timestamp."),
};

const listMatchesInputSchema = s.object(
  "Filters and pagination for listing Manatal matches.",
  {
    ...paginationInput,
    ordering: nonEmptyString("Field used to order Manatal match results."),
    externalId: nonEmptyString("Filter matches by external ID."),
    stageIn: nonEmptyString("Comma-separated Manatal pipeline stage IDs."),
    ...matchDateFilters,
    ...dateRangeFilters,
  },
  {
    optional: [
      "page",
      "pageSize",
      "ordering",
      "externalId",
      "stageIn",
      "hiredAtGte",
      "hiredAtLte",
      "submittedAtGte",
      "submittedAtLte",
      "interviewAtGte",
      "interviewAtLte",
      "offerAtGte",
      "offerAtLte",
      "droppedAtGte",
      "droppedAtLte",
      "createdAtGte",
      "createdAtLte",
      "updatedAtGte",
      "updatedAtLte",
    ],
  },
);

const listMatchesOutputSchema = s.object(
  "Normalized Manatal match list response.",
  {
    matches: s.array("Matches returned by Manatal.", matchRecordSchema),
    ...paginationOutput,
    raw: rawResponseSchema,
  },
  { optional: listOutputOptionalKeys },
);

const getMatchInputSchema = s.object("Identifier for getting a Manatal match.", {
  matchId: idField("ID of the Manatal match to retrieve."),
});

const matchOutputSchema = s.object("Normalized Manatal match response.", {
  match: matchRecordSchema,
  raw: rawResponseSchema,
});

const matchFields = {
  job: idField("ID of the job the candidate is matched with."),
  candidate: idField("ID of the candidate matched to the job."),
  owner: idField("ID of the owner of the match."),
  externalId: nonEmptyString("ID of the match in an external system.", { maxLength: 255 }),
  isActive: s.boolean("Whether the match is still active."),
  hiredAt: s.dateTime("Date and time at which the candidate was hired."),
  submittedAt: s.dateTime("Date and time at which the candidate was added to the job."),
  interviewAt: s.dateTime("Date and time at which the candidate was last interviewed."),
  offerAt: s.dateTime("Date and time at which an offer was made to the candidate."),
  droppedAt: s.dateTime("Date and time at which the candidate was no longer considered."),
  customFields: customFieldsSchema,
};

const matchFieldKeys = [
  "job",
  "candidate",
  "owner",
  "externalId",
  "isActive",
  "hiredAt",
  "submittedAt",
  "interviewAt",
  "offerAt",
  "droppedAt",
  "customFields",
];

const createMatchInputSchema = s.object("Fields for creating a Manatal match.", matchFields, {
  optional: matchFieldKeys.filter((key) => key !== "job" && key !== "candidate"),
});

const updateMatchInputSchema = s.object(
  "Fields for partially updating a Manatal match.",
  {
    matchId: idField("ID of the Manatal match to update."),
    ...matchFields,
  },
  { optional: matchFieldKeys },
);

export const manatalActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_candidates",
    description: "List Manatal candidates with pagination and recruitment profile filters.",
    inputSchema: listCandidatesInputSchema,
    outputSchema: listCandidatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_candidate",
    description: "Retrieve a single Manatal candidate by ID.",
    inputSchema: getCandidateInputSchema,
    outputSchema: candidateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_candidate",
    description: "Create a Manatal candidate using JSON-safe profile fields.",
    inputSchema: createCandidateInputSchema,
    outputSchema: candidateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_candidate",
    description: "Partially update a Manatal candidate by ID.",
    inputSchema: updateCandidateInputSchema,
    outputSchema: candidateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    description: "List Manatal jobs with pagination and job status filters.",
    inputSchema: listJobsInputSchema,
    outputSchema: listJobsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job",
    description: "Retrieve a single Manatal job by ID.",
    inputSchema: getJobInputSchema,
    outputSchema: jobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_job",
    description: "Create a Manatal job using JSON-safe job fields.",
    inputSchema: createJobInputSchema,
    outputSchema: jobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_job",
    description: "Partially update a Manatal job by ID.",
    inputSchema: updateJobInputSchema,
    outputSchema: jobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_organizations",
    description: "List Manatal organizations with pagination and organization filters.",
    inputSchema: listOrganizationsInputSchema,
    outputSchema: listOrganizationsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_organization",
    description: "Retrieve a single Manatal organization by ID.",
    inputSchema: getOrganizationInputSchema,
    outputSchema: organizationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_organization",
    description: "Create a Manatal organization using JSON-safe organization fields.",
    inputSchema: createOrganizationInputSchema,
    outputSchema: organizationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_organization",
    description: "Partially update a Manatal organization by ID.",
    inputSchema: updateOrganizationInputSchema,
    outputSchema: organizationOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_matches",
    description: "List Manatal candidate-job matches with pagination and pipeline filters.",
    inputSchema: listMatchesInputSchema,
    outputSchema: listMatchesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_match",
    description: "Retrieve a single Manatal candidate-job match by ID.",
    inputSchema: getMatchInputSchema,
    outputSchema: matchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_match",
    description: "Create a Manatal candidate-job match using JSON-safe match fields.",
    inputSchema: createMatchInputSchema,
    outputSchema: matchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_match",
    description: "Partially update a Manatal candidate-job match by ID.",
    inputSchema: updateMatchInputSchema,
    outputSchema: matchOutputSchema,
  }),
];
