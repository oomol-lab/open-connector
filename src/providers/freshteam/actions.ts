import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "freshteam";

export type FreshteamActionName =
  | "list_employees"
  | "get_employee"
  | "list_employee_fields"
  | "list_job_postings"
  | "get_job_posting"
  | "list_job_posting_fields"
  | "list_applicant_fields"
  | "list_candidate_sources"
  | "list_candidate_source_categories";

const positiveIntegerSchema = (description: string) => s.positiveInteger(description);
const pageSchema = positiveIntegerSchema("Page number for the Freshteam list request.");
const upstreamStringSchema = (description: string) => s.nonEmptyString(description);

const employeeStatusSchema = s.stringEnum("Freshteam employee status filter.", ["active", "inactive"]);
const employeeSortSchema = s.stringEnum("Freshteam employee field used for sorting results.", [
  "first_name",
  "last_name",
  "employee_id",
]);
const sortTypeSchema = s.stringEnum("Freshteam sort direction.", ["asc", "desc"]);

const paginationOutputSchema = s.object("Freshteam list pagination details.", {
  page: positiveIntegerSchema("Freshteam page requested."),
  hasMore: s.boolean("Whether another Freshteam page is available."),
  nextPage: s.nullable(s.positiveInteger("Next Freshteam page number when available.")),
  totalPages: s.nullable(s.positiveInteger("Total Freshteam pages reported by the response headers.")),
  totalObjects: s.nullable(s.nonNegativeInteger("Total Freshteam objects reported by the response headers.")),
  link: s.nullable(s.string("Freshteam response Link header, when returned.")),
});

const locationIdsSchema = s.array(
  "Freshteam location identifiers used to filter employee results.",
  positiveIntegerSchema("One Freshteam location identifier."),
  { minItems: 1 },
);

const listEmployeesInputSchema = s.object(
  "Input parameters for listing Freshteam employees.",
  {
    page: pageSchema,
    status: employeeStatusSchema,
    firstName: upstreamStringSchema("First name used to filter Freshteam employees."),
    lastName: upstreamStringSchema("Last name used to filter Freshteam employees."),
    personalEmail: s.email("Personal email address used to filter Freshteam employees."),
    officialEmail: s.email("Official email address used to filter Freshteam employees."),
    employeeType: upstreamStringSchema("Freshteam employee type filter."),
    departmentId: positiveIntegerSchema("Freshteam department identifier filter."),
    businessUnitId: positiveIntegerSchema("Freshteam business unit identifier filter."),
    locationIds: locationIdsSchema,
    reportingManagerId: positiveIntegerSchema("Freshteam employee identifier for the reporting manager filter."),
    updatedSince: s.dateTime("ISO 8601 timestamp used as Freshteam's updated_since filter."),
    sort: employeeSortSchema,
    sortType: sortTypeSchema,
    draft: s.boolean("Whether to return Freshteam draft employees."),
    terminated: s.boolean("Whether to return Freshteam terminated employees."),
    deleted: s.boolean("Whether to return Freshteam deleted employees."),
  },
  {
    optional: [
      "page",
      "status",
      "firstName",
      "lastName",
      "personalEmail",
      "officialEmail",
      "employeeType",
      "departmentId",
      "businessUnitId",
      "locationIds",
      "reportingManagerId",
      "updatedSince",
      "sort",
      "sortType",
      "draft",
      "terminated",
      "deleted",
    ],
  },
);

const employeeSchema = s.looseObject("A Freshteam employee object.");

const employeeIncludeSchema = s.array(
  "Freshteam include tokens for employee details.",
  s.stringEnum("A Freshteam employee include token.", [
    "awards",
    "honors",
    "certificates",
    "licenses",
    "background_verification_details",
    "visas",
    "government_documents",
    "dependents",
    "user_documents",
    "bank_accounts",
    "prev_employments",
    "qualifications",
    "compensation_details",
    "bonuses",
    "stocks",
    "additional_teams",
    "additional_managers",
    "additional_hr_managers",
    "languages",
    "roles",
    "team",
    "branch",
    "business_unit",
    "sub_department",
    "department",
    "reporting_to",
    "hr_incharge",
    "level",
    "shift",
    "user_function",
    "cost_center",
    "user_title",
    "user_suffix_name",
    "user_honorary_suffix",
    "user_professional_suffix",
    "user_academic_suffix",
    "retirement_status",
    "citizenship_status",
    "termination_category",
    "time_off",
  ]),
  { minItems: 1 },
);

const getEmployeeInputSchema = s.object(
  "Input parameters for reading one Freshteam employee.",
  {
    employeeId: positiveIntegerSchema("Freshteam employee identifier."),
    include: employeeIncludeSchema,
  },
  { optional: ["include"] },
);

const listEmployeeFieldsInputSchema = s.object(
  "Input parameters for listing Freshteam employee fields.",
  {
    page: pageSchema,
  },
  { optional: ["page"] },
);

const employeeFieldSchema = s.looseObject("A Freshteam employee field object.");

const listJobPostingsInputSchema = s.object(
  "Input parameters for listing Freshteam job postings.",
  {
    page: pageSchema,
    status: s.stringEnum("Freshteam job posting status filter.", [
      "draft",
      "published",
      "internal",
      "private",
      "on_hold",
      "closed",
    ]),
    title: upstreamStringSchema("Freshteam job posting title filter."),
    type: upstreamStringSchema("Freshteam job posting type filter."),
    departmentId: positiveIntegerSchema("Freshteam department identifier filter."),
    locationId: positiveIntegerSchema("Freshteam location identifier filter."),
    remote: s.boolean("Whether to filter Freshteam job postings by remote status."),
    locationCity: upstreamStringSchema("Freshteam job posting city filter."),
    locationCountry: upstreamStringSchema("Freshteam job posting country code filter."),
  },
  {
    optional: [
      "page",
      "status",
      "title",
      "type",
      "departmentId",
      "locationId",
      "remote",
      "locationCity",
      "locationCountry",
    ],
  },
);

const jobPostingSchema = s.looseObject("A Freshteam job posting object.");

const getJobPostingInputSchema = s.object("Input parameters for reading one Freshteam job posting.", {
  jobPostingId: positiveIntegerSchema("Freshteam job posting identifier."),
});

const listJobPostingFieldsInputSchema = s.object(
  "Input parameters for listing Freshteam job posting fields.",
  {
    page: pageSchema,
  },
  { optional: ["page"] },
);

const jobPostingFieldSchema = s.looseObject("A Freshteam job posting field object.");

const listApplicantFieldsInputSchema = s.object(
  "Input parameters for listing Freshteam applicant fields for one job posting.",
  {
    jobPostingId: positiveIntegerSchema("Freshteam job posting identifier."),
    page: pageSchema,
  },
  { optional: ["page"] },
);

const applicantFieldSchema = s.looseObject("A Freshteam applicant field object.");

const listCandidateSourcesInputSchema = s.object(
  "Input parameters for listing Freshteam candidate sources.",
  {
    page: pageSchema,
  },
  { optional: ["page"] },
);

const candidateSourceSchema = s.looseObject("A Freshteam candidate source object.");

const listCandidateSourceCategoriesInputSchema = s.object(
  "Input parameters for listing Freshteam candidate source categories.",
  {
    page: pageSchema,
  },
  { optional: ["page"] },
);

const candidateSourceCategorySchema = s.looseObject("A Freshteam candidate source category object.");

export const freshteamActions: Array<ProviderActionDefinition<FreshteamActionName>> = [
  defineProviderAction(service, {
    name: "list_employees",
    description: "List Freshteam employees with optional directory filters and pagination.",
    inputSchema: listEmployeesInputSchema,
    outputSchema: s.object("Freshteam employee list response wrapper.", {
      employees: s.array("Freshteam employees returned for the current page.", employeeSchema),
      pagination: paginationOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_employee",
    description: "Get one Freshteam employee by identifier.",
    inputSchema: getEmployeeInputSchema,
    outputSchema: s.object("Freshteam employee response wrapper.", {
      employee: employeeSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_employee_fields",
    description: "List Freshteam employee form fields.",
    inputSchema: listEmployeeFieldsInputSchema,
    outputSchema: s.object("Freshteam employee field list response wrapper.", {
      employeeFields: s.array("Freshteam employee fields returned for the current page.", employeeFieldSchema),
      pagination: paginationOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_job_postings",
    description: "List Freshteam job postings with optional recruiting filters.",
    inputSchema: listJobPostingsInputSchema,
    outputSchema: s.object("Freshteam job posting list response wrapper.", {
      jobPostings: s.array("Freshteam job postings returned for the current page.", jobPostingSchema),
      pagination: paginationOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_job_posting",
    description: "Get one Freshteam job posting by identifier.",
    inputSchema: getJobPostingInputSchema,
    outputSchema: s.object("Freshteam job posting response wrapper.", {
      jobPosting: jobPostingSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_job_posting_fields",
    description: "List Freshteam job posting fields.",
    inputSchema: listJobPostingFieldsInputSchema,
    outputSchema: s.object("Freshteam job posting field list response wrapper.", {
      jobPostingFields: s.array("Freshteam job posting fields returned for the current page.", jobPostingFieldSchema),
      pagination: paginationOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_applicant_fields",
    description: "List Freshteam applicant fields for one job posting.",
    inputSchema: listApplicantFieldsInputSchema,
    outputSchema: s.object("Freshteam applicant field list response wrapper.", {
      applicantFields: s.array("Freshteam applicant fields returned for the current page.", applicantFieldSchema),
      pagination: paginationOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_candidate_sources",
    description: "List Freshteam candidate sources.",
    inputSchema: listCandidateSourcesInputSchema,
    outputSchema: s.object("Freshteam candidate source list response wrapper.", {
      candidateSources: s.array("Freshteam candidate sources returned for the current page.", candidateSourceSchema),
      pagination: paginationOutputSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_candidate_source_categories",
    description: "List Freshteam candidate source categories.",
    inputSchema: listCandidateSourceCategoriesInputSchema,
    outputSchema: s.object("Freshteam candidate source category list response wrapper.", {
      candidateSourceCategories: s.array(
        "Freshteam candidate source categories returned for the current page.",
        candidateSourceCategorySchema,
      ),
      pagination: paginationOutputSchema,
    }),
  }),
];
