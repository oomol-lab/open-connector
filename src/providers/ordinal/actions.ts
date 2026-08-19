import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ordinal";

const uuidSchema = s.uuid("An Ordinal UUID.");
const paginationLimitSchema = s.integer("The maximum number of items to return, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const cursorSchema = s.uuid("The pagination cursor from the previous Ordinal page.");
const uuidListSchema = s.anyOf("One or more Ordinal UUIDs.", [
  s.uuid("A single Ordinal UUID."),
  s.array("Multiple Ordinal UUIDs.", uuidSchema, { minItems: 1 }),
]);
const sortOrderSchema = s.stringEnum("The sort order for Ordinal results.", ["asc", "desc"]);
const postStatusSchema = s.stringEnum("The Ordinal post status.", [
  "Tentative",
  "ToDo",
  "InProgress",
  "ForReview",
  "Blocked",
  "Finalized",
  "Scheduled",
  "Posted",
]);
const postChannelSchema = s.stringEnum("The social channel to filter posts by.", [
  "LinkedIn",
  "Twitter",
  "Instagram",
  "TikTok",
  "YouTubeShorts",
]);
const ideaChannelSchema = s.stringEnum("The social channel to filter ideas by.", [
  "LinkedIn",
  "Twitter",
  "TikTok",
  "YouTubeShorts",
]);
const looseResourceSchema = s.looseObject("A raw Ordinal resource object.");
const emptyInputSchema = s.actionInput({}, [], "No input is required for this Ordinal action.");

const listPostsInputFields = {
  limit: paginationLimitSchema,
  cursor: cursorSchema,
  ids: uuidListSchema,
  status: postStatusSchema,
  channel: postChannelSchema,
  linkedInProfileId: s.uuid("Filter posts by LinkedIn profile ID."),
  xProfileId: s.uuid("Filter posts by X/Twitter profile ID."),
  instagramProfileId: s.uuid("Filter posts by Instagram profile ID."),
  tikTokProfileId: s.uuid("Filter posts by TikTok profile ID."),
  youTubeProfileId: s.uuid("Filter posts by YouTube channel profile ID."),
  labelIds: uuidListSchema,
  publishDateMin: s.dateTime("Only include posts scheduled on or after this datetime."),
  publishDateMax: s.dateTime("Only include posts scheduled on or before this datetime."),
  createdAtMin: s.dateTime("Only include posts created on or after this datetime."),
  createdAtMax: s.dateTime("Only include posts created on or before this datetime."),
  sortBy: s.stringEnum("The post field to sort by.", ["createdAt", "publishAt"]),
  sortOrder: sortOrderSchema,
} satisfies Record<string, JsonSchema>;

const listIdeasInputFields = {
  limit: paginationLimitSchema,
  cursor: cursorSchema,
  ids: uuidListSchema,
  channel: ideaChannelSchema,
  linkedInProfileId: s.uuid("Filter ideas by LinkedIn profile ID."),
  xProfileId: s.uuid("Filter ideas by X/Twitter profile ID."),
  tikTokProfileId: s.uuid("Filter ideas by TikTok profile ID."),
  youTubeProfileId: s.uuid("Filter ideas by YouTube channel profile ID."),
  labelIds: uuidListSchema,
  createdAtMin: s.dateTime("Only include ideas created on or after this datetime."),
  createdAtMax: s.dateTime("Only include ideas created on or before this datetime."),
  sortBy: s.stringEnum("The idea field to sort by.", ["createdAt"]),
  sortOrder: sortOrderSchema,
} satisfies Record<string, JsonSchema>;

const paginatedPostsOutputSchema = s.object("A paginated Ordinal posts response.", {
  posts: s.array("Posts returned by Ordinal.", looseResourceSchema),
  nextCursor: s.nullable(s.string("The cursor for the next page when available.")),
  hasMore: s.boolean("Whether Ordinal reported more posts."),
});

const paginatedIdeasOutputSchema = s.object("A paginated Ordinal ideas response.", {
  ideas: s.array("Ideas returned by Ordinal.", looseResourceSchema),
  nextCursor: s.nullable(s.string("The cursor for the next page when available.")),
  hasMore: s.boolean("Whether Ordinal reported more ideas."),
});

export const ordinalActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_workspace",
    description: "Get details about the current Ordinal workspace.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The current Ordinal workspace.", {
      workspace: looseResourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_scheduling_profiles",
    description: "List Ordinal scheduling profiles connected to the workspace.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Ordinal scheduling profiles response.", {
      profiles: s.array("Scheduling profiles returned by Ordinal.", looseResourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_engagement_profiles",
    description: "List Ordinal engagement-only profiles connected to the workspace.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Ordinal engagement profiles response.", {
      profiles: s.array("Engagement profiles returned by Ordinal.", looseResourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    description: "List users in the current Ordinal workspace.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Ordinal workspace users response.", {
      users: s.array("Users returned by Ordinal.", looseResourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_labels",
    description: "List labels in the current Ordinal workspace.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Ordinal labels response.", {
      labels: s.array("Labels returned by Ordinal.", looseResourceSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_posts",
    description: "List Ordinal posts with pagination and optional filters.",
    inputSchema: s.object("Query parameters for listing Ordinal posts.", listPostsInputFields, {
      optional: Object.keys(listPostsInputFields),
    }),
    outputSchema: paginatedPostsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_post",
    description: "Get a specific Ordinal post by ID.",
    inputSchema: s.object(
      "Input for getting an Ordinal post.",
      {
        id: s.uuid("The Ordinal post ID."),
      },
      { required: ["id"] },
    ),
    outputSchema: s.object("Ordinal post response.", {
      post: looseResourceSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_ideas",
    description: "List Ordinal ideas with pagination and optional filters.",
    inputSchema: s.object("Query parameters for listing Ordinal ideas.", listIdeasInputFields, {
      optional: Object.keys(listIdeasInputFields),
    }),
    outputSchema: paginatedIdeasOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_idea",
    description: "Get a specific Ordinal idea by ID.",
    inputSchema: s.object(
      "Input for getting an Ordinal idea.",
      {
        id: s.uuid("The Ordinal idea ID."),
      },
      { required: ["id"] },
    ),
    outputSchema: s.object("Ordinal idea response.", {
      idea: looseResourceSchema,
    }),
  }),
];
