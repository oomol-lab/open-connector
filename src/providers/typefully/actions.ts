import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "typefully";

const socialSetIdSchema = s.positiveInteger("The Typefully social set ID.");
const draftIdSchema = s.positiveInteger("The Typefully draft ID.");
const limitSchema = s.integer("Maximum number of items to return.", {
  minimum: 1,
  maximum: 50,
});
const offsetSchema = s.nonNegativeInteger("Number of items to skip before returning results.");
const dateSchema = s.string("Date value accepted by Typefully for filtering.", { minLength: 1 });
const platformSchema = s.stringEnum("A Typefully-supported social platform.", [
  "x",
  "linkedin",
  "mastodon",
  "threads",
  "bluesky",
]);
const draftStatusSchema = s.stringEnum("Draft status used by Typefully.", [
  "draft",
  "scheduled",
  "published",
  "publishing",
  "error",
]);
const tagListSchema = s.array(
  "Tag slugs associated with the draft.",
  s.string("A Typefully tag slug.", { minLength: 1 }),
);

const looseResponseSchema = s.looseObject("The JSON object returned by the Typefully API.");
const paginatedResponseSchema = s.looseRequiredObject("A paginated Typefully list response.", {
  results: s.array("The returned Typefully records.", s.looseObject("A Typefully record.")),
  count: s.integer("Total number of records available."),
  limit: s.integer("Items per page used for this request."),
  offset: s.integer("Current offset used for this request."),
});

const postSchema = s.looseRequiredObject("A post object in a Typefully platform configuration.", {
  text: s.string("Post text for the target platform.", { minLength: 1 }),
});

const platformConfigSchema = s.looseRequiredObject(
  "A Typefully platform configuration used when creating or updating a draft.",
  {
    enabled: s.boolean("Whether this platform is enabled for the draft."),
    posts: s.array("Posts for this platform.", postSchema, { minItems: 1 }),
  },
);

const platformsSchema = {
  ...s.object(
    "Platform configurations keyed by social platform.",
    {
      x: platformConfigSchema,
      linkedin: platformConfigSchema,
      mastodon: platformConfigSchema,
      threads: platformConfigSchema,
      bluesky: platformConfigSchema,
    },
    { optional: ["x", "linkedin", "mastodon", "threads", "bluesky"] },
  ),
  minProperties: 1,
};

const publishAtSchema = s.string(
  "When to publish the draft: now, next-free-slot, or an ISO 8601 datetime with timezone.",
  { minLength: 1 },
);

const createDraftBodySchema = s.object(
  "Request body for creating a Typefully draft.",
  {
    platforms: platformsSchema,
    draft_title: s.string("Internal draft title.", { minLength: 1 }),
    publish_at: publishAtSchema,
    scratchpad_text: s.string("Plain text scratchpad notes for the draft."),
    share: s.boolean("Whether Typefully should generate a public share URL."),
    tags: tagListSchema,
  },
  { optional: ["draft_title", "publish_at", "scratchpad_text", "share", "tags"] },
);

const createDraftInputSchema = s.object("The input payload for creating a Typefully draft.", {
  social_set_id: socialSetIdSchema,
  body: createDraftBodySchema,
});

const updateDraftBodySchema = s.object(
  "Request body for updating a Typefully draft.",
  {
    platforms: platformsSchema,
    draft_title: s.string("Internal draft title.", { minLength: 1 }),
    publish_at: publishAtSchema,
    scratchpad_text: s.string("Plain text scratchpad notes for the draft."),
    share: s.boolean("Whether Typefully should generate a public share URL."),
    tags: tagListSchema,
    force_overwrite_comments: s.boolean(
      "Whether missing comment-thread markers should be accepted and resolved server-side.",
    ),
  },
  {
    optional: [
      "platforms",
      "draft_title",
      "publish_at",
      "scratchpad_text",
      "share",
      "tags",
      "force_overwrite_comments",
    ],
  },
);

const updateDraftInputSchema = s.object(
  "The input payload for updating a Typefully draft.",
  {
    social_set_id: socialSetIdSchema,
    draft_id: draftIdSchema,
    body: updateDraftBodySchema,
    exclude_comment_markers: s.boolean("Whether the returned draft text should omit Typefully comment-thread markers."),
  },
  { optional: ["exclude_comment_markers"] },
);

const listInputSchema = s.object(
  "Pagination input accepted by Typefully list endpoints.",
  {
    limit: limitSchema,
    offset: offsetSchema,
  },
  { optional: ["limit", "offset"] },
);

const listDraftsInputSchema = s.object(
  "The input payload for listing Typefully drafts.",
  {
    social_set_id: socialSetIdSchema,
    limit: limitSchema,
    offset: offsetSchema,
    status: draftStatusSchema,
    platform: platformSchema,
    from_date: dateSchema,
    to_date: dateSchema,
  },
  { optional: ["limit", "offset", "status", "platform", "from_date", "to_date"] },
);

const getDraftInputSchema = s.object(
  "The input payload for retrieving a Typefully draft.",
  {
    social_set_id: socialSetIdSchema,
    draft_id: draftIdSchema,
    exclude_comment_markers: s.boolean("Whether returned draft text should omit Typefully comment-thread markers."),
  },
  { optional: ["exclude_comment_markers"] },
);

const getSocialSetInputSchema = s.object("The input payload for retrieving a Typefully social set.", {
  social_set_id: socialSetIdSchema,
});

const deleteDraftInputSchema = s.object("The input payload for deleting a Typefully draft.", {
  social_set_id: socialSetIdSchema,
  draft_id: draftIdSchema,
});

export const typefullyActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_user",
    operationType: "read",
    description: "Retrieve the Typefully user associated with the current API key.",
    inputSchema: s.object("This action does not require input.", {}),
    outputSchema: looseResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_social_sets",
    operationType: "read",
    description: "List Typefully social sets available to the current API key.",
    inputSchema: listInputSchema,
    outputSchema: paginatedResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_social_set",
    operationType: "read",
    description: "Retrieve details for a Typefully social set.",
    inputSchema: getSocialSetInputSchema,
    outputSchema: looseResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_drafts",
    operationType: "read",
    description: "List Typefully drafts for a social set with optional filters.",
    inputSchema: listDraftsInputSchema,
    outputSchema: paginatedResponseSchema,
  }),
  defineProviderAction(service, {
    name: "create_draft",
    operationType: "write",
    description: "Create a Typefully draft for a social set.",
    inputSchema: createDraftInputSchema,
    outputSchema: looseResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_draft",
    operationType: "read",
    description: "Retrieve a Typefully draft by ID.",
    inputSchema: getDraftInputSchema,
    outputSchema: looseResponseSchema,
  }),
  defineProviderAction(service, {
    name: "update_draft",
    operationType: "write",
    description: "Update a Typefully draft by ID.",
    inputSchema: updateDraftInputSchema,
    outputSchema: looseResponseSchema,
  }),
  defineProviderAction(service, {
    name: "delete_draft",
    operationType: "destructive",
    description: "Delete a Typefully draft by ID.",
    inputSchema: deleteDraftInputSchema,
    outputSchema: s.object("The result returned after deleting a Typefully draft.", {
      deleted: s.boolean("Whether the delete request was accepted by Typefully."),
    }),
  }),
];
