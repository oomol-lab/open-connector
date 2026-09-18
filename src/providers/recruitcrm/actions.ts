import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "recruitcrm" as const;

const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });
const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });

const paginationInputSchema = s.object(
  "Query parameters for listing Recruit CRM records.",
  {
    page: positiveInteger("One-based page number to request from Recruit CRM."),
    limit: positiveInteger("Maximum number of records to return from Recruit CRM."),
  },
  { optional: ["page", "limit"] },
);

const paginationSchema = s.unknown("Pagination metadata returned by Recruit CRM, or null.");
const rawPayloadSchema = s.unknown("The raw Recruit CRM API response.");

const candidateSchema = s.looseObject("A Recruit CRM candidate object.");
const contactSchema = s.looseObject("A Recruit CRM contact object.");
const companySchema = s.looseObject("A Recruit CRM company object.");
const jobSchema = s.looseObject("A Recruit CRM job object.");

const listCandidatesOutputSchema = s.object("A Recruit CRM candidate list response.", {
  candidates: s.array("Candidate records returned by Recruit CRM.", candidateSchema),
  pagination: paginationSchema,
  raw: rawPayloadSchema,
});

const getCandidateInputSchema = s.object("Path parameters for fetching a Recruit CRM candidate.", {
  candidate: nonEmptyString("The Recruit CRM candidate slug or path identifier to retrieve."),
});

const getCandidateOutputSchema = s.object("A Recruit CRM candidate detail response.", {
  candidate: candidateSchema,
  raw: rawPayloadSchema,
});

const listContactsOutputSchema = s.object("A Recruit CRM contact list response.", {
  contacts: s.array("Contact records returned by Recruit CRM.", contactSchema),
  pagination: paginationSchema,
  raw: rawPayloadSchema,
});

const getContactInputSchema = s.object("Path parameters for fetching a Recruit CRM contact.", {
  contact: nonEmptyString("The Recruit CRM contact slug or path identifier to retrieve."),
});

const getContactOutputSchema = s.object("A Recruit CRM contact detail response.", {
  contact: contactSchema,
  raw: rawPayloadSchema,
});

const listCompaniesOutputSchema = s.object("A Recruit CRM company list response.", {
  companies: s.array("Company records returned by Recruit CRM.", companySchema),
  pagination: paginationSchema,
  raw: rawPayloadSchema,
});

const getCompanyInputSchema = s.object("Path parameters for fetching a Recruit CRM company.", {
  company: nonEmptyString("The Recruit CRM company slug or path identifier to retrieve."),
});

const getCompanyOutputSchema = s.object("A Recruit CRM company detail response.", {
  company: companySchema,
  raw: rawPayloadSchema,
});

const listJobsOutputSchema = s.object("A Recruit CRM job list response.", {
  jobs: s.array("Job records returned by Recruit CRM.", jobSchema),
  pagination: paginationSchema,
  raw: rawPayloadSchema,
});

const getJobInputSchema = s.object("Path parameters for fetching a Recruit CRM job.", {
  job: nonEmptyString("The Recruit CRM job slug or path identifier to retrieve."),
});

const getJobOutputSchema = s.object("A Recruit CRM job detail response.", {
  job: jobSchema,
  raw: rawPayloadSchema,
});

export const recruitcrmActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_candidates",
    operationType: "read",
    description: "List candidates from Recruit CRM using the official Recruit CRM API with optional pagination.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listCandidatesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_candidate",
    operationType: "read",
    description: "Fetch one Recruit CRM candidate by slug or path identifier.",
    requiredScopes: [],
    inputSchema: getCandidateInputSchema,
    outputSchema: getCandidateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_contacts",
    operationType: "read",
    description: "List contacts from Recruit CRM using the official Recruit CRM API with optional pagination.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listContactsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_contact",
    operationType: "read",
    description: "Fetch one Recruit CRM contact by slug or path identifier.",
    requiredScopes: [],
    inputSchema: getContactInputSchema,
    outputSchema: getContactOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_companies",
    operationType: "read",
    description: "List companies from Recruit CRM using the official Recruit CRM API with optional pagination.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listCompaniesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_company",
    operationType: "read",
    description: "Fetch one Recruit CRM company by slug or path identifier.",
    requiredScopes: [],
    inputSchema: getCompanyInputSchema,
    outputSchema: getCompanyOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    operationType: "read",
    description: "List jobs from Recruit CRM using the official Recruit CRM API with optional pagination.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listJobsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_job",
    operationType: "read",
    description: "Fetch one Recruit CRM job by slug or path identifier.",
    requiredScopes: [],
    inputSchema: getJobInputSchema,
    outputSchema: getJobOutputSchema,
  }),
];
