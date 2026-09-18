import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hr_partner";

const rawObjectSchema = s.looseObject("Raw HR Partner object payload.");
const rawObjectArraySchema = s.array("Raw HR Partner object records.", rawObjectSchema);

const companyInputSchema = s.object(
  "Options for retrieving HR Partner company information.",
  {
    custom_fields: s.boolean("Whether to include configured company custom field definitions."),
    active_modules: s.boolean("Whether to include enabled HR Partner modules and feature flags."),
  },
  { optional: ["custom_fields", "active_modules"] },
);

const companyOutputSchema = s.requiredObject("The HR Partner company information response.", {
  company: rawObjectSchema,
});

const employeeListProperties = {
  search: s.nonEmptyString("Text to match against employee first or last names."),
  department: s.nonEmptyString("One or more department names separated by commas to filter employees."),
  location: s.nonEmptyString("Location name to filter employees."),
  group: s.nonEmptyString("Group name to filter employees."),
  position: s.nonEmptyString("Position description to filter employees."),
  employment_status: s.nonEmptyString("Employment status to filter employees."),
  gender_identity: s.nonEmptyString("Gender identity value to filter employees."),
  pay_point: s.nonEmptyString("Pay point identifier to filter employees."),
  birth_date_from: s.date("Start birth date filter in yyyy-mm-dd format."),
  birth_date_to: s.date("End birth date filter in yyyy-mm-dd format."),
  start_date_from: s.date("Start employment date filter in yyyy-mm-dd format."),
  start_date_to: s.date("End employment date filter in yyyy-mm-dd format."),
  end_date_from: s.date("Start termination date filter in yyyy-mm-dd format."),
  end_date_to: s.date("End termination date filter in yyyy-mm-dd format."),
  tag: s.nonEmptyString("Single employee tag to filter employees."),
  is_active: s.boolean("Whether to return only active employees."),
  is_terminated: s.boolean("Whether to return only terminated employees."),
  can_logon: s.boolean("Whether to return only employees who can log on."),
  eligible_for_rehire: s.boolean("Whether to return only employees eligible for rehiring."),
  reports_to: s.nonEmptyString("Employee code of the manager to filter by."),
};

const employeeListInputSchema = s.object("Filters for listing employees in HR Partner.", employeeListProperties, {
  optional: Object.keys(employeeListProperties),
});

const employeeListOutputSchema = s.requiredObject("Employees returned by HR Partner.", {
  employees: rawObjectArraySchema,
});

const employeeCodeInputSchema = s.requiredObject("Request parameters for retrieving one employee.", {
  employee_code: s.nonEmptyString("The HR Partner employee code."),
});

const employeeOutputSchema = s.requiredObject("The HR Partner employee response.", {
  employee: rawObjectSchema,
});

const lookupNameSchema = s.stringEnum("The HR Partner lookup file name.", [
  "absence_reasons",
  "absence_statuses",
  "asset_types",
  "benefit_types",
  "benefit_statuses",
  "benefit_providers",
  "departments",
  "dependent_types",
  "education_types",
  "education_statuses",
  "employment_statuses",
  "genders",
  "grievance_types",
  "grievance_statuses",
  "groups",
  "interview_types",
  "locations",
  "paylevels",
  "positions",
  "renewable_types",
  "review_types",
  "review_statuses",
  "scorecards",
  "skill_names",
  "skill_ratings",
  "stages",
  "tags",
  "termination_reasons",
  "training_types",
  "training_statuses",
]);

const lookupInputSchema = s.requiredObject("Request parameters for retrieving a lookup file.", {
  lookup_name: lookupNameSchema,
});

const lookupOutputSchema = s.requiredObject("Lookup records returned by HR Partner.", {
  lookups: rawObjectArraySchema,
});

const jobListProperties = {
  search: s.nonEmptyString("Text to match against job title, summary, or content."),
  department: s.nonEmptyString("Department name to filter jobs."),
  location: s.nonEmptyString("Location name to filter jobs."),
  position: s.nonEmptyString("Position title to filter jobs."),
  employment_status: s.nonEmptyString("Employment status name to filter jobs."),
  publish_at_from: s.date("Start publish date filter in yyyy-mm-dd format."),
  publish_at_to: s.date("End publish date filter in yyyy-mm-dd format."),
  unpublish_date_from: s.date("Start unpublish date filter in yyyy-mm-dd format."),
  unpublish_date_to: s.date("End unpublish date filter in yyyy-mm-dd format."),
  is_active: s.boolean("Whether to return only active job listings."),
  publish_on_internet: s.boolean("Whether to return jobs published on the internet."),
  allow_online_applications: s.boolean("Whether to return jobs that allow online applications."),
  allow_uploads: s.boolean("Whether to return jobs that allow uploads."),
  notify_new_application: s.boolean("Whether to return jobs that notify admins about new applications."),
  response_email: s.email("Response email address to filter jobs."),
};

const jobListInputSchema = s.object("Filters for listing HR Partner job listings.", jobListProperties, {
  optional: Object.keys(jobListProperties),
});

const jobListOutputSchema = s.requiredObject("Job listings returned by HR Partner.", {
  jobs: rawObjectArraySchema,
});

const jobIdInputSchema = s.requiredObject("Request parameters for retrieving one job listing.", {
  job_id: s.nonEmptyString("The HR Partner job listing ID."),
});

const jobOutputSchema = s.requiredObject("The HR Partner job listing response.", {
  job: rawObjectSchema,
});

const applicantListInputSchema = s.object(
  "Filters for listing HR Partner applicants.",
  {
    search: s.nonEmptyString("Text to match against applicant first name, last name, or email."),
  },
  { optional: ["search"] },
);

const applicantListOutputSchema = s.requiredObject("Applicants returned by HR Partner.", {
  applicants: rawObjectArraySchema,
});

const applicantIdInputSchema = s.requiredObject("Request parameters for retrieving one applicant.", {
  applicant_id: s.nonEmptyString("The HR Partner applicant ID or email address."),
});

const applicantOutputSchema = s.requiredObject("The HR Partner applicant response.", {
  applicant: rawObjectSchema,
});

const applicationListInputSchema = s.object(
  "Filters for listing applications for one HR Partner job listing.",
  {
    job_id: s.nonEmptyString("The HR Partner job listing ID."),
    source: s.nonEmptyString("Text to match against the application source field."),
    stage: s.nonEmptyString("Application stage to filter by."),
    submitted_at_from: s.date("Start submitted date filter in yyyy-mm-dd format."),
    submitted_at_to: s.date("End submitted date filter in yyyy-mm-dd format."),
    is_flagged: s.boolean("Whether to return only flagged applications."),
    is_archived: s.boolean("Whether to return only archived applications."),
    is_hired: s.boolean("Whether to return only hired applications."),
    is_read: s.boolean("Whether to return only read applications."),
  },
  {
    optional: [
      "source",
      "stage",
      "submitted_at_from",
      "submitted_at_to",
      "is_flagged",
      "is_archived",
      "is_hired",
      "is_read",
    ],
  },
);

const applicationListOutputSchema = s.requiredObject("Applications returned by HR Partner.", {
  applications: rawObjectArraySchema,
});

const applicationIdInputSchema = s.requiredObject("Request parameters for retrieving one application.", {
  application_id: s.positiveInteger("The HR Partner application ID."),
});

const applicationOutputSchema = s.requiredObject("The HR Partner application response.", {
  application: rawObjectSchema,
});

export const hrPartnerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description:
      "Retrieve basic HR Partner company information, optionally including custom fields and active modules.",
    requiredScopes: [],
    inputSchema: companyInputSchema,
    outputSchema: companyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_employees",
    operationType: "read",
    description:
      "List HR Partner employees with official filters such as search, department, location, status, tags, and employment dates.",
    requiredScopes: [],
    inputSchema: employeeListInputSchema,
    outputSchema: employeeListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_employee",
    operationType: "read",
    description:
      "Retrieve one HR Partner employee by employee code, including detailed contact, address, tag, and custom field data when available.",
    requiredScopes: [],
    inputSchema: employeeCodeInputSchema,
    outputSchema: employeeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_lookups",
    operationType: "read",
    description:
      "Retrieve one HR Partner read-only lookup file such as departments, locations, positions, tags, stages, or training statuses.",
    requiredScopes: [],
    inputSchema: lookupInputSchema,
    outputSchema: lookupOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_job_listings",
    operationType: "read",
    description:
      "List HR Partner recruitment job listings with official filters such as search, department, publish dates, active state, and response email.",
    requiredScopes: [],
    inputSchema: jobListInputSchema,
    outputSchema: jobListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job_listing",
    operationType: "read",
    description:
      "Retrieve one HR Partner recruitment job listing by job ID, including detailed content, custom form, scorecard, and stage data when available.",
    requiredScopes: [],
    inputSchema: jobIdInputSchema,
    outputSchema: jobOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_applicants",
    operationType: "read",
    description: "List HR Partner recruitment applicants, optionally filtered by name or email search text.",
    requiredScopes: [],
    inputSchema: applicantListInputSchema,
    outputSchema: applicantListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_applicant",
    operationType: "read",
    description:
      "Retrieve one HR Partner recruitment applicant by applicant ID or email address, including their job applications when available.",
    requiredScopes: [],
    inputSchema: applicantIdInputSchema,
    outputSchema: applicantOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_applications",
    operationType: "read",
    description:
      "List HR Partner recruitment applications for one job listing with official filters such as source, stage, submitted date, and read flags.",
    requiredScopes: [],
    inputSchema: applicationListInputSchema,
    outputSchema: applicationListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_application",
    operationType: "read",
    description:
      "Retrieve one HR Partner recruitment application by application ID, including applicant, job listing, scorecard, attachment metadata, interviews, and comments when available.",
    requiredScopes: [],
    inputSchema: applicationIdInputSchema,
    outputSchema: applicationOutputSchema,
  }),
];
