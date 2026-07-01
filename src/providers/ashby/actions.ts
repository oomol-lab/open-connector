import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ashby";

const cursorSchema = s.nonEmptyString("Opaque cursor indicating which page of Ashby results to fetch.");
const syncTokenSchema = s.nonEmptyString("Opaque token representing the last successful Ashby incremental sync.");
const limitSchema = s.integer("The maximum number of items to return. The maximum is 100.", {
  minimum: 1,
  maximum: 100,
});
const unixMillisSchema = s.integer("A timestamp in milliseconds since the Unix epoch.");
const jobStatusSchema = s.array(
  "When supplied, only jobs with the provided status values are returned.",
  s.stringEnum("One Ashby job status.", ["Draft", "Open", "Closed", "Archived"]),
  { minItems: 1 },
);
const jobExpandSchema = s.array(
  "Related job objects to expand in Ashby's response.",
  s.stringEnum("One supported Ashby job expansion.", ["location", "openings"]),
  { minItems: 1 },
);
const rawObjectSchema = s.looseObject("The raw object returned by Ashby.");

const pageInfoSchema = s.object("Pagination and sync metadata returned by Ashby.", {
  moreDataAvailable: s.boolean("Whether another page of data is available."),
  nextCursor: s.nullable(s.string("The cursor to use for the next page when available.")),
  syncToken: s.nullable(s.string("The sync token returned after a completed sync when available.")),
});

const apiKeyInfoSchema = s.object("Information about the Ashby API key.", {
  title: s.nullable(s.string("The name of the API key.")),
  createdAt: s.nullable(s.string("The API key creation timestamp returned by Ashby.")),
  scopes: s.array("Permission scopes authorized for the API key.", s.string("One API key scope.")),
  raw: rawObjectSchema,
});

const listInputSchema = s.object(
  "Common Ashby paginated list input.",
  {
    createdAfter: unixMillisSchema,
    cursor: cursorSchema,
    syncToken: syncTokenSchema,
    limit: limitSchema,
  },
  { optional: ["createdAfter", "cursor", "syncToken", "limit"] },
);

const jobListInputSchema = s.object(
  "Input payload for listing Ashby jobs.",
  {
    createdAfter: unixMillisSchema,
    cursor: cursorSchema,
    syncToken: syncTokenSchema,
    limit: limitSchema,
    status: jobStatusSchema,
    openedAfter: unixMillisSchema,
    openedBefore: unixMillisSchema,
    closedAfter: unixMillisSchema,
    closedBefore: unixMillisSchema,
    includeUnpublishedJobPostingsIds: s.boolean("Whether to include unpublished job posting IDs."),
    expand: jobExpandSchema,
  },
  {
    optional: [
      "createdAfter",
      "cursor",
      "syncToken",
      "limit",
      "status",
      "openedAfter",
      "openedBefore",
      "closedAfter",
      "closedBefore",
      "includeUnpublishedJobPostingsIds",
      "expand",
    ],
  },
);

const candidateSearchInputSchema = s.object(
  "Input payload for searching Ashby candidates.",
  {
    email: s.email("The candidate email address to search for."),
    name: s.nonEmptyString("The candidate name to search for."),
  },
  { optional: ["email", "name"] },
);
candidateSearchInputSchema.anyOf = [{ required: ["email"] }, { required: ["name"] }];

export const ashbyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "api_key_info",
    description: "Retrieve information about the Ashby API key used for this connection.",
    requiredScopes: [],
    inputSchema: s.object("Input payload for retrieving Ashby API key information.", {}),
    outputSchema: s.object("Ashby API key information response.", {
      apiKey: apiKeyInfoSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_jobs",
    description: "List Ashby jobs with optional status, timestamp, expansion, pagination, and sync filters.",
    requiredScopes: ["jobsRead"],
    inputSchema: jobListInputSchema,
    outputSchema: s.object("Ashby job list response.", {
      page: pageInfoSchema,
      jobs: s.array("Jobs returned by Ashby.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_candidates",
    description: "List Ashby candidates with optional pagination and incremental sync filters.",
    requiredScopes: ["candidatesRead"],
    inputSchema: listInputSchema,
    outputSchema: s.object("Ashby candidate list response.", {
      page: pageInfoSchema,
      candidates: s.array("Candidates returned by Ashby.", rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "search_candidates",
    description: "Search Ashby candidates by email and/or name for small result sets such as autocomplete.",
    requiredScopes: ["candidatesRead"],
    inputSchema: candidateSearchInputSchema,
    outputSchema: s.object("Ashby candidate search response.", {
      candidates: s.array("Candidates matching the search parameters.", rawObjectSchema),
    }),
  }),
];

export type AshbyActionName = (typeof ashbyActions)[number]["name"];
