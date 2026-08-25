import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gem";

const objectIdSchema = (description: string) => s.nonEmptyString(description);
const unixTimestampSchema = (description: string) => s.positiveInteger(description);
const sortSchema = s.stringEnum("The sort direction for Gem results.", ["asc", "desc"]);
const pageSchema = s.positiveInteger("The 1-indexed page number to request.");
const pageSizeSchema = s.integer("The number of records to return per page, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const emailFilterSchema = s.string("Filter records by email address.", {
  format: "email",
  minLength: 1,
  maxLength: 255,
});
const upstreamObjectSchema = s.unknownObject("A Gem object returned by the API.");
const paginationSchema = s.looseObject("Pagination metadata parsed from the Gem X-Pagination response header.", {
  total: s.integer("Total number of records across all pages."),
  total_pages: s.integer("Total number of pages."),
  first_page: s.integer("First available page."),
  last_page: s.integer("Last available page."),
  page: s.integer("Current page number."),
  previous_page: s.nullableInteger("Previous page number, when present."),
  next_page: s.nullableInteger("Next page number, when present."),
});

const paginatedInputProperties = {
  page: pageSchema,
  page_size: pageSizeSchema,
};
const paginatedInputOptional = ["page", "page_size"] as const;

const createdRangeProperties = {
  created_after: unixTimestampSchema("Only return records created after this Unix timestamp in seconds."),
  created_before: unixTimestampSchema("Only return records created before this Unix timestamp in seconds."),
  sort: sortSchema,
};
const createdRangeOptional = ["created_after", "created_before", "sort"] as const;

export const gemActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_users",
    description: "List Gem users visible to the current API key.",
    inputSchema: s.object(
      "Input parameters for listing Gem users.",
      {
        email: emailFilterSchema,
        ...paginatedInputProperties,
      },
      { optional: ["email", ...paginatedInputOptional] },
    ),
    outputSchema: s.object(
      "The response returned when listing Gem users.",
      {
        users: s.array("Gem users returned for the requested page.", upstreamObjectSchema),
        pagination: paginationSchema,
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_candidates",
    description: "List candidates in Gem CRM.",
    inputSchema: s.object(
      "Input parameters for listing Gem candidates.",
      {
        ...createdRangeProperties,
        created_by: objectIdSchema("Only return candidates added to Gem by this user ID."),
        email: emailFilterSchema,
        linked_in_handle: s.string("Only return candidates with this LinkedIn handle.", {
          minLength: 1,
          maxLength: 255,
        }),
        updated_after: unixTimestampSchema("Only return candidates updated after this Unix timestamp in seconds."),
        updated_before: unixTimestampSchema("Only return candidates updated before this Unix timestamp in seconds."),
        candidate_ids: s.array(
          "Candidate IDs to include. Gem accepts at most 20 IDs.",
          objectIdSchema("A Gem candidate ID."),
          { minItems: 1, maxItems: 20 },
        ),
        ...paginatedInputProperties,
      },
      {
        optional: [
          ...createdRangeOptional,
          "created_by",
          "email",
          "linked_in_handle",
          "updated_after",
          "updated_before",
          "candidate_ids",
          ...paginatedInputOptional,
        ],
      },
    ),
    outputSchema: s.object(
      "The response returned when listing Gem candidates.",
      {
        candidates: s.array("Gem candidates returned for the requested page.", upstreamObjectSchema),
        pagination: paginationSchema,
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_candidate",
    description: "Get one Gem candidate by ID.",
    inputSchema: s.object("Input parameters for getting a Gem candidate.", {
      candidate_id: objectIdSchema("The Gem candidate ID."),
    }),
    outputSchema: s.object("The response returned when getting a Gem candidate.", {
      candidate: upstreamObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_projects",
    description: "List projects in Gem CRM.",
    inputSchema: s.object(
      "Input parameters for listing Gem projects.",
      {
        ...createdRangeProperties,
        user_id: objectIdSchema("Only return projects owned by this user ID."),
        readable_by: objectIdSchema("Only return projects this user ID can read."),
        writable_by: objectIdSchema("Only return projects this user ID can update."),
        is_archived: s.boolean("Whether to return archived projects."),
        ...paginatedInputProperties,
      },
      {
        optional: [
          ...createdRangeOptional,
          "user_id",
          "readable_by",
          "writable_by",
          "is_archived",
          ...paginatedInputOptional,
        ],
      },
    ),
    outputSchema: s.object(
      "The response returned when listing Gem projects.",
      {
        projects: s.array("Gem projects returned for the requested page.", upstreamObjectSchema),
        pagination: paginationSchema,
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_project",
    description: "Get one Gem project by ID.",
    inputSchema: s.object("Input parameters for getting a Gem project.", {
      project_id: objectIdSchema("The Gem project ID."),
    }),
    outputSchema: s.object("The response returned when getting a Gem project.", {
      project: upstreamObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_project_candidates",
    description: "List candidate memberships in a Gem project.",
    inputSchema: s.object(
      "Input parameters for listing candidates in a Gem project.",
      {
        project_id: objectIdSchema("The Gem project ID."),
        added_after: unixTimestampSchema("Only return memberships added after this Unix timestamp in seconds."),
        added_before: unixTimestampSchema("Only return memberships added before this Unix timestamp in seconds."),
        sort: sortSchema,
        ...paginatedInputProperties,
      },
      { optional: ["added_after", "added_before", "sort", ...paginatedInputOptional] },
    ),
    outputSchema: s.object(
      "The response returned when listing candidates in a Gem project.",
      {
        project_candidates: s.array(
          "Gem project candidate memberships returned for the requested page.",
          upstreamObjectSchema,
        ),
        pagination: paginationSchema,
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_sequences",
    description: "List outreach sequences in Gem.",
    inputSchema: s.object(
      "Input parameters for listing Gem sequences.",
      {
        ...createdRangeProperties,
        user_id: objectIdSchema("Only return sequences owned by this user ID."),
        ...paginatedInputProperties,
      },
      { optional: [...createdRangeOptional, "user_id", ...paginatedInputOptional] },
    ),
    outputSchema: s.object(
      "The response returned when listing Gem sequences.",
      {
        sequences: s.array("Gem sequences returned for the requested page.", upstreamObjectSchema),
        pagination: paginationSchema,
      },
      { optional: ["pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_sequence",
    description: "Get one Gem sequence by ID.",
    inputSchema: s.object("Input parameters for getting a Gem sequence.", {
      sequence_id: objectIdSchema("The Gem sequence ID."),
    }),
    outputSchema: s.object("The response returned when getting a Gem sequence.", {
      sequence: upstreamObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_custom_fields",
    description: "List custom fields configured in Gem.",
    inputSchema: s.object(
      "Input parameters for listing Gem custom fields.",
      {
        ...createdRangeProperties,
        project_id: objectIdSchema("Only return project-scoped fields for this Gem project ID."),
        scope: s.stringEnum("The custom field scope to return.", ["team", "project"]),
        is_hidden: s.boolean("Whether to return hidden custom fields."),
        name: s.nonEmptyString("Filter custom fields by name."),
        ...paginatedInputProperties,
      },
      {
        optional: [...createdRangeOptional, "project_id", "scope", "is_hidden", "name", ...paginatedInputOptional],
      },
    ),
    outputSchema: s.object(
      "The response returned when listing Gem custom fields.",
      {
        custom_fields: s.array("Gem custom fields returned for the requested page.", upstreamObjectSchema),
        pagination: paginationSchema,
      },
      { optional: ["pagination"] },
    ),
  }),
];
