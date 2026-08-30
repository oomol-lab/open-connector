import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "cats" as const;

function defineAction<TName extends string>(
  input: Omit<Parameters<typeof defineProviderAction<TName>>[1], "providerPermissions"> & {
    service: typeof service;
    providerPermissions?: string[];
  },
): ProviderActionDefinition<TName> {
  const { service: _service, ...action } = input;
  return defineProviderAction(service, action);
}

const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });
const nonEmptyString = (description: string) => s.string(description, { minLength: 1 });

const paginationInputSchema = s.object(
  "Pagination parameters for CATS list endpoints.",
  {
    page: positiveInteger("The page number to request. CATS defaults to page 1."),
    perPage: s.integer("The number of results to request per page, from 1 to 100.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  { optional: ["page", "perPage"] },
);

const searchInputSchema = s.object(
  "Search parameters for CATS search endpoints.",
  {
    query: nonEmptyString("The search string to match against CATS records."),
    page: positiveInteger("The page number to request. CATS defaults to page 1."),
    perPage: s.integer("The number of results to request per page, from 1 to 100.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  { optional: ["page", "perPage"] },
);

const idInputSchema = (resourceName: string, fieldName: string) =>
  s.object(`Request parameters for fetching one CATS ${resourceName}.`, {
    [fieldName]: positiveInteger(`The CATS ${resourceName} ID.`),
  });

const rawPayloadSchema = s.unknown("The raw CATS response payload.");
const recordSchema = (description: string) => s.looseObject(description);

const paginationOutputSchema = s.object(
  "CATS pagination metadata parsed from response body or headers.",
  {
    page: positiveInteger("The current result page."),
    perPage: positiveInteger("The number of records returned per page."),
    total: s.nonNegativeInteger("The total number of records available."),
    totalPages: s.nonNegativeInteger("The total number of pages available."),
  },
  { optional: ["page", "perPage", "total", "totalPages"] },
);

const listOutputSchema = (description: string, fieldName: string, itemDescription: string) =>
  s.object(description, {
    [fieldName]: s.array(itemDescription, recordSchema(itemDescription)),
    pagination: paginationOutputSchema,
    raw: rawPayloadSchema,
  });

const singleOutputSchema = (description: string, fieldName: string, itemDescription: string) =>
  s.object(description, {
    [fieldName]: recordSchema(itemDescription),
    raw: rawPayloadSchema,
  });

export const catsActions: ProviderActionDefinition[] = [
  defineAction({
    service,
    name: "get_site",
    description: "Get information about the CATS site associated with the API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to fetch the CATS site.", {}),
    outputSchema: singleOutputSchema("CATS site response.", "site", "CATS site record."),
  }),
  defineAction({
    service,
    name: "list_candidates",
    description: "List CATS candidates with optional pagination.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("CATS candidates list response.", "candidates", "CATS candidate record."),
  }),
  defineAction({
    service,
    name: "get_candidate",
    description: "Fetch one CATS candidate by candidate ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("candidate", "candidateId"),
    outputSchema: singleOutputSchema("CATS candidate detail response.", "candidate", "CATS candidate record."),
  }),
  defineAction({
    service,
    name: "search_candidates",
    description: "Search CATS candidates by free-text query with optional pagination.",
    requiredScopes: [],
    inputSchema: searchInputSchema,
    outputSchema: listOutputSchema("CATS candidate search response.", "candidates", "CATS candidate record."),
  }),
  defineAction({
    service,
    name: "list_companies",
    description: "List CATS companies with optional pagination.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("CATS companies list response.", "companies", "CATS company record."),
  }),
  defineAction({
    service,
    name: "get_company",
    description: "Fetch one CATS company by company ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("company", "companyId"),
    outputSchema: singleOutputSchema("CATS company detail response.", "company", "CATS company record."),
  }),
  defineAction({
    service,
    name: "search_companies",
    description: "Search CATS companies by free-text query with optional pagination.",
    requiredScopes: [],
    inputSchema: searchInputSchema,
    outputSchema: listOutputSchema("CATS company search response.", "companies", "CATS company record."),
  }),
  defineAction({
    service,
    name: "list_jobs",
    description: "List CATS jobs with optional pagination.",
    requiredScopes: [],
    inputSchema: paginationInputSchema,
    outputSchema: listOutputSchema("CATS jobs list response.", "jobs", "CATS job record."),
  }),
  defineAction({
    service,
    name: "get_job",
    description: "Fetch one CATS job by job ID.",
    requiredScopes: [],
    inputSchema: idInputSchema("job", "jobId"),
    outputSchema: singleOutputSchema("CATS job detail response.", "job", "CATS job record."),
  }),
  defineAction({
    service,
    name: "search_jobs",
    description: "Search CATS jobs by free-text query with optional pagination.",
    requiredScopes: [],
    inputSchema: searchInputSchema,
    outputSchema: listOutputSchema("CATS job search response.", "jobs", "CATS job record."),
  }),
];
