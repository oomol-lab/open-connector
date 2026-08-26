import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "indeed";
const readScopes = ["employer_access", "employer.hosted_job"];

const graphQlErrorSchema = s.object(
  {
    message: s.nonEmptyString("Indeed GraphQL error message."),
    path: s.optional(s.array(s.unknown("GraphQL response path segment."))),
    extensions: s.optional(s.object({}, { additionalProperties: true })),
  },
  { additionalProperties: true },
);

const graphQlOutputSchema = s.object({
  data: s.optional(s.nullable(s.object({}, { additionalProperties: true }))),
  errors: s.optional(s.array(graphQlErrorSchema)),
});

const jobFieldsSchema: JsonSchema = s.object(
  {
    id: s.nonEmptyString("Indeed EmployerJob IRI."),
    jobData: s.optional(s.nullable(s.object({}, { additionalProperties: true }))),
    roleData: s.optional(s.nullable(s.object({}, { additionalProperties: true }))),
    managementUrls: s.optional(s.nullable(s.object({}, { additionalProperties: true }))),
  },
  { additionalProperties: true },
);

export const indeedActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    description: "Get the Indeed user and associated employers represented by the OAuth access token.",
    requiredScopes: ["email", "employer_access"],
    providerPermissions: ["email", "employer_access"],
    inputSchema: s.object({}),
    outputSchema: s.object(
      {
        sub: s.nonEmptyString("Indeed user account ID."),
        email: s.optional(s.email("Email address when the email scope was granted.")),
        email_verified: s.optional(s.boolean("Whether Indeed verified the email address.")),
        employers: s.optional(
          s.array(
            s.object({
              id: s.nonEmptyString("Indeed employer ID."),
              name: s.nonEmptyString("Indeed employer name."),
            }),
          ),
        ),
      },
      { additionalProperties: true },
    ),
  }),
  defineProviderAction(service, {
    name: "execute_graphql",
    description: "Execute an approved Indeed Partner GraphQL query or mutation and return its data and errors.",
    requiredScopes: readScopes,
    providerPermissions: readScopes,
    inputSchema: s.object({
      query: s.nonWhitespaceString("GraphQL document to execute."),
      variables: s.optional(s.object({}, { additionalProperties: true })),
      operationName: s.optional(s.nonEmptyString("Operation name when the document contains multiple operations.")),
    }),
    outputSchema: graphQlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "find_employer_jobs",
    description: "List jobs for the employer represented by the OAuth token, with filters and cursor pagination.",
    requiredScopes: readScopes,
    providerPermissions: readScopes,
    inputSchema: s.object({
      legacySourceId: s.optional(s.nonEmptyString("Sponsored Jobs API source ID filter.")),
      jobFeedTypes: s.optional(s.array(s.nonEmptyString("Indeed JobFeedType enum value."), { maxItems: 2 })),
      includeMultiLocationJobs: s.optional(s.boolean("Whether to include multi-location jobs.")),
      jobRequisitionIds: s.optional(s.array(s.nonEmptyString("ATS requisition ID filter."))),
      first: s.optional(s.integer("Maximum jobs to return.", { minimum: 1, maximum: 1000, default: 10 })),
      before: s.optional(s.nonEmptyString("Cursor for backward pagination.")),
      after: s.optional(s.nonEmptyString("Cursor for forward pagination.")),
    }),
    outputSchema: s.object({
      employerJobs: s.array(jobFieldsSchema),
      estimatedTotalResultsCount: s.nonNegativeInteger("Estimated total number of matching jobs."),
      pageInfo: s.object({
        endCursor: s.nullableString("Cursor for the next page."),
        hasNextPage: s.boolean("Whether a next page exists."),
        hasPreviousPage: s.boolean("Whether a previous page exists."),
        startCursor: s.nullableString("Cursor for the previous page."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_job",
    description: "Get one Indeed employer job by its EmployerJob IRI.",
    requiredScopes: readScopes,
    providerPermissions: readScopes,
    inputSchema: s.object({ id: s.nonEmptyString("EmployerJob IRI returned by Indeed.") }),
    outputSchema: s.object({ job: s.nullable(jobFieldsSchema) }),
  }),
  defineProviderAction(service, {
    name: "get_jobs",
    description: "Get multiple Indeed employer jobs by their EmployerJob IRIs.",
    requiredScopes: readScopes,
    providerPermissions: readScopes,
    inputSchema: s.object({ ids: s.array(s.nonEmptyString("EmployerJob IRI returned by Indeed."), { minItems: 1 }) }),
    outputSchema: s.object({ jobs: s.array(s.nullable(jobFieldsSchema)) }),
  }),
  defineProviderAction(service, {
    name: "update_sourced_job_postings",
    description: "Update supported fields on one sourced Indeed job posting.",
    requiredScopes: readScopes,
    providerPermissions: readScopes,
    inputSchema: s.object({
      update: s.object(
        {
          sourcedPostingId: s.nonEmptyString("Sourced posting UUID or EmployerJob IRI."),
          metadata: s.optional(s.object({}, { additionalProperties: true })),
          body: s.optional(s.object({}, { additionalProperties: true })),
        },
        { optional: ["metadata", "body"] },
      ),
    }),
    outputSchema: graphQlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "clear_sourced_job_posting_updates",
    description: "Clear updates previously applied to one sourced Indeed job posting.",
    requiredScopes: readScopes,
    providerPermissions: readScopes,
    inputSchema: s.object({ sourcedPostingId: s.nonEmptyString("Sourced posting UUID or EmployerJob IRI.") }),
    outputSchema: graphQlOutputSchema,
  }),
];
