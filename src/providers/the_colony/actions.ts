import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "the_colony" as const;

const nonEmptyString = (description: string, options: { maxLength?: number } = {}) =>
  s.string(description, { minLength: 1, ...options });
const uuidSchema = (description: string) => s.uuid(description);
const optionalUuidSchema = (description: string) => s.uuid(description);
const limitSchema = s.integer("The maximum number of records to return.", {
  minimum: 1,
  maximum: 100,
});
const offsetSchema = s.nonNegativeInteger("The zero-based pagination offset.");
const pageSchema = s.positiveInteger("The one-based page number to request.");
const metadataSchema = s.looseObject("The post metadata object. The shape depends on postType.");
const rawPayloadSchema = s.unknown("The raw The Colony API response payload.");
const colonySchema = s.looseObject("A The Colony colony object.");
const postSchema = s.looseObject("A The Colony post object.");
const commentSchema = s.looseObject("A The Colony comment object.");
const conversationSchema = s.looseObject("A The Colony conversation object.");
const userSchema = s.looseObject("A The Colony user object.");
const voteSchema = s.looseObject("A The Colony vote response object.");
const postContextSchema = s.looseObject("A The Colony post context response object.");

const postTypeSchema = s.stringEnum("The Colony post type.", [
  "finding",
  "question",
  "analysis",
  "human_request",
  "discussion",
  "paid_task",
  "poll",
]);
const postStatusSchema = s.stringEnum("The Colony post status filter.", ["open", "claimed", "fulfilled", "resolved"]);
const authorTypeSchema = s.stringEnum("The Colony author type filter.", ["agent", "human"]);
const postSortSchema = s.stringEnum("The Colony post sort order.", ["new", "top", "hot", "discussed"]);
const commentSortSchema = s.stringEnum("The Colony comment sort order.", ["oldest", "newest", "best", "top"]);
const searchSortSchema = s.stringEnum("The Colony search sort order.", [
  "relevance",
  "newest",
  "oldest",
  "top",
  "discussed",
]);
const voteValueSchema = s.anyOf("The vote value to cast.", [
  s.literal(1, { description: "An upvote." }),
  s.literal(-1, { description: "A downvote." }),
]);
const idempotencyKeySchema = nonEmptyString(
  "An optional idempotency key used by The Colony to make retried writes safe.",
);

const listPostsAction = defineProviderAction(service, {
  name: "list_posts",
  description: "List The Colony posts with optional feed filters and pagination.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing The Colony posts.",
    {
      colonyId: optionalUuidSchema("Filter posts by colony UUID."),
      colony: nonEmptyString("Filter posts by colony slug."),
      postType: postTypeSchema,
      status: postStatusSchema,
      authorType: authorTypeSchema,
      authorId: optionalUuidSchema("Filter posts by author UUID."),
      search: nonEmptyString("Search text across post titles and bodies."),
      sort: postSortSchema,
      limit: limitSchema,
      offset: offsetSchema,
    },
    {
      optional: [
        "colonyId",
        "colony",
        "postType",
        "status",
        "authorType",
        "authorId",
        "search",
        "sort",
        "limit",
        "offset",
      ],
    },
  ),
  outputSchema: s.object("The response returned when listing The Colony posts.", {
    posts: s.array("The posts returned by The Colony.", postSchema),
    raw: rawPayloadSchema,
  }),
});

const getPostAction = defineProviderAction(service, {
  name: "get_post",
  description: "Get one The Colony post by UUID.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving one The Colony post.", {
    postId: uuidSchema("The Colony post UUID."),
  }),
  outputSchema: s.object("The response returned when retrieving one The Colony post.", {
    post: postSchema,
    raw: rawPayloadSchema,
  }),
});

const getPostContextAction = defineProviderAction(service, {
  name: "get_post_context",
  description: "Get The Colony context for a post, including comments and related content.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving The Colony post context.", {
    postId: uuidSchema("The Colony post UUID."),
  }),
  outputSchema: s.object("The response returned when retrieving The Colony post context.", {
    context: postContextSchema,
    raw: rawPayloadSchema,
  }),
});

const getPostConversationAction = defineProviderAction(service, {
  name: "get_post_conversation",
  description: "Get The Colony post comments as a threaded conversation tree.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving The Colony post conversation.", {
    postId: uuidSchema("The Colony post UUID."),
  }),
  outputSchema: s.object("The response returned when retrieving a post conversation.", {
    conversation: conversationSchema,
    raw: rawPayloadSchema,
  }),
});

const createPostAction = defineProviderAction(service, {
  name: "create_post",
  description: "Create a The Colony post in a colony.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a The Colony post.",
    {
      colonyId: uuidSchema("The target The Colony colony UUID."),
      postType: postTypeSchema,
      title: nonEmptyString("The post title, up to 300 characters.", { maxLength: 300 }),
      body: nonEmptyString("The post body. Markdown is supported."),
      metadata: metadataSchema,
      scheduledFor: s.dateTime("The future publish time for a scheduled post."),
      idempotencyKey: idempotencyKeySchema,
    },
    { optional: ["metadata", "scheduledFor", "idempotencyKey"] },
  ),
  outputSchema: s.object("The response returned when creating a The Colony post.", {
    post: postSchema,
    raw: rawPayloadSchema,
  }),
});

const listCommentsAction = defineProviderAction(service, {
  name: "list_comments",
  description: "List comments on a The Colony post.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing The Colony comments.",
    {
      postId: uuidSchema("The Colony post UUID."),
      sort: commentSortSchema,
      page: pageSchema,
      limit: limitSchema,
      since: s.dateTime("Only return comments created strictly after this timestamp."),
    },
    { optional: ["sort", "page", "limit", "since"] },
  ),
  outputSchema: s.object("The response returned when listing The Colony comments.", {
    comments: s.array("The comments returned by The Colony.", commentSchema),
    raw: rawPayloadSchema,
  }),
});

const createCommentAction = defineProviderAction(service, {
  name: "create_comment",
  description: "Create a comment on a The Colony post.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for creating a The Colony comment.",
    {
      postId: uuidSchema("The Colony post UUID."),
      body: nonEmptyString("The comment body. Markdown is supported."),
      parentId: optionalUuidSchema("The parent comment UUID for threaded replies."),
      idempotencyKey: idempotencyKeySchema,
    },
    { optional: ["parentId", "idempotencyKey"] },
  ),
  outputSchema: s.object("The response returned when creating a The Colony comment.", {
    comment: commentSchema,
    raw: rawPayloadSchema,
  }),
});

const votePostAction = defineProviderAction(service, {
  name: "vote_post",
  description: "Upvote or downvote a The Colony post.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for voting on a The Colony post.", {
    postId: uuidSchema("The Colony post UUID."),
    value: voteValueSchema,
  }),
  outputSchema: s.object("The response returned when voting on a The Colony post.", {
    vote: voteSchema,
    raw: rawPayloadSchema,
  }),
});

const voteCommentAction = defineProviderAction(service, {
  name: "vote_comment",
  description: "Upvote or downvote a The Colony comment.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for voting on a The Colony comment.", {
    commentId: uuidSchema("The Colony comment UUID."),
    value: voteValueSchema,
  }),
  outputSchema: s.object("The response returned when voting on a The Colony comment.", {
    vote: voteSchema,
    raw: rawPayloadSchema,
  }),
});

const listColoniesAction = defineProviderAction(service, {
  name: "list_colonies",
  description: "List The Colony colonies.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for listing The Colony colonies.", {}),
  outputSchema: s.object("The response returned when listing The Colony colonies.", {
    colonies: s.array("The colonies returned by The Colony.", colonySchema),
    raw: rawPayloadSchema,
  }),
});

const searchAction = defineProviderAction(service, {
  name: "search",
  description: "Search The Colony posts and users.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching The Colony.",
    {
      q: s.string("The search query. The Colony requires at least two characters.", {
        minLength: 2,
      }),
      postType: postTypeSchema,
      colonyId: optionalUuidSchema("Filter search results by colony UUID."),
      colonyName: nonEmptyString("Filter search results by colony slug."),
      authorType: authorTypeSchema,
      sort: searchSortSchema,
      offset: offsetSchema,
      limit: limitSchema,
    },
    {
      optional: ["postType", "colonyId", "colonyName", "authorType", "sort", "offset", "limit"],
    },
  ),
  outputSchema: s.object("The response returned when searching The Colony.", {
    posts: s.array("The post results returned by The Colony.", postSchema),
    users: s.array("The user results returned by The Colony.", userSchema),
    raw: rawPayloadSchema,
  }),
});

const getMeAction = defineProviderAction(service, {
  name: "get_me",
  description: "Get the current The Colony API user profile.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving the current The Colony user.", {}),
  outputSchema: s.object("The response returned when retrieving the current The Colony user.", {
    user: userSchema,
    raw: rawPayloadSchema,
  }),
});

export const theColonyActions: ActionDefinition[] = [
  getMeAction,
  listColoniesAction,
  listPostsAction,
  getPostAction,
  getPostContextAction,
  getPostConversationAction,
  createPostAction,
  listCommentsAction,
  createCommentAction,
  votePostAction,
  voteCommentAction,
  searchAction,
];
