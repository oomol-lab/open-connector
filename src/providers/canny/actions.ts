import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "canny";

const unknownRecordSchema = s.record("Custom fields associated with the record.", true);
const looseObjectSchema = s.looseObject("A Canny object returned by the API.");
const emptyInputSchema = s.object("The input payload for this action.", {});
const limitField = s.integer("Maximum number of items to return.", { minimum: 1, maximum: 100 });
const skipField = s.nonNegativeInteger("Number of items to skip before returning results.");
const cursorField = s.string("Pagination cursor returned by a previous request.", { minLength: 1 });
const boardIdField = s.nonEmptyString("Unique identifier of the board.");
const postIdField = s.nonEmptyString("Unique identifier of the post.");
const authorIdField = s.nonEmptyString("Unique identifier of the author.");

const companySchema = s.looseObject("Canny company.", {
  id: s.string("Unique identifier of the company."),
  name: s.string("Display name of the company."),
  created: s.string("ISO 8601 timestamp when the company was created."),
  customFields: unknownRecordSchema,
  monthlySpend: s.number("Monthly spend for the company."),
});

const boardSchema = s.looseObject("Canny board.", {
  id: s.string("Unique identifier of the board."),
  created: s.string("ISO 8601 timestamp when the board was created."),
  isPrivate: s.boolean("Whether the board is private."),
  name: s.string("Display name of the board."),
  postCount: s.integer("Number of posts on the board."),
  privateComments: s.boolean("Whether comments are private by default."),
  token: s.string("Public token associated with the board."),
  url: s.string("URL to the board."),
});

const userSchema = s.looseObject("Canny user.", {
  id: s.string("Unique identifier of the user."),
  created: s.string("ISO 8601 timestamp when the user was created."),
  isAdmin: s.boolean("Whether the user is a Canny admin."),
  name: s.string("Display name of the user."),
  alias: s.string("Alias of the user."),
  email: s.string("Email address of the user."),
  userID: s.string("External user ID from the source system."),
  url: s.string("URL to the user in Canny admin."),
  avatarURL: s.string("URL to the user's avatar."),
  companies: s.array("Companies associated with the user.", companySchema),
  customFields: unknownRecordSchema,
  lastActivity: s.string("ISO 8601 timestamp of the user's last activity."),
});

const postSchema = s.looseObject("Canny post.", {
  id: s.string("Unique identifier of the post."),
  title: s.string("Title of the post."),
  details: s.string("Detailed body of the post."),
  created: s.string("ISO 8601 timestamp when the post was created."),
  status: s.string("Current status of the post."),
  score: s.number("Vote score of the post."),
  commentCount: s.integer("Number of comments on the post."),
  url: s.string("URL to the post."),
  eta: s.string("Estimated timeframe for delivery."),
  imageURLs: s.stringArray("Image URLs attached to the post."),
  board: boardSchema,
  author: userSchema,
  category: looseObjectSchema,
  tags: s.array("Tags associated with the post.", looseObjectSchema),
  customFields: unknownRecordSchema,
});

const commentSchema = s.looseObject("Canny comment.", {
  id: s.string("Unique identifier of the comment."),
  created: s.string("ISO 8601 timestamp when the comment was created."),
  value: s.string("Text content of the comment."),
  internal: s.boolean("Whether the comment is internal."),
  private: s.boolean("Whether the comment is private."),
  likeCount: s.integer("Number of likes on the comment."),
  parentID: s.nullableString("Parent comment ID when this is a reply."),
  imageURLs: s.stringArray("Image URLs attached to the comment."),
  author: userSchema,
  board: boardSchema,
  post: postSchema,
});

const userIdentifierFields = {
  id: s.string("Canny user ID.", { minLength: 1 }),
  userID: s.string("External user ID from the source system.", { minLength: 1 }),
  email: s.string("Email address of the user.", { minLength: 1 }),
};

const retrieveBoardInputSchema = s.object("The input payload for this action.", {
  boardID: boardIdField,
});

const listUsersInputSchema = s.object(
  "The input payload for this action.",
  {
    limit: limitField,
    cursor: cursorField,
  },
  { optional: ["limit", "cursor"] },
);

const retrieveUserInputSchema = s.object(
  "The input payload for this action. Exactly one of id, userID, or email is required.",
  userIdentifierFields,
  {
    optional: ["id", "userID", "email"],
  },
);

const createOrUpdateUserInputSchema = s.object(
  "The input payload for this action. At least one of id, userID, or email is required.",
  {
    name: s.string("Display name of the user.", { minLength: 1, maxLength: 50 }),
    alias: s.string("Alias for the user.", { minLength: 1 }),
    created: s.string("ISO 8601 timestamp from the source system.", { minLength: 1 }),
    avatarURL: s.string("Avatar URL for the user.", { minLength: 1 }),
    companies: s.array("Companies associated with the user.", companySchema),
    customFields: unknownRecordSchema,
    ...userIdentifierFields,
  },
  { optional: ["alias", "created", "avatarURL", "companies", "customFields", "id", "userID", "email"] },
);

const listPostsInputSchema = s.object(
  "The input payload for this action.",
  {
    boardID: boardIdField,
    authorID: authorIdField,
    companyID: s.string("Unique identifier of the company.", { minLength: 1 }),
    search: s.string("Search query applied to post titles and bodies.", { minLength: 1 }),
    sort: s.stringEnum("Sort order used when fetching posts.", [
      "newest",
      "oldest",
      "relevance",
      "score",
      "statusChanged",
      "trending",
    ]),
    status: s.string("Comma-separated list of statuses to filter by.", { minLength: 1 }),
    tagIDs: s.stringArray("Tag IDs used to filter posts."),
    limit: limitField,
    skip: skipField,
  },
  { optional: ["boardID", "authorID", "companyID", "search", "sort", "status", "tagIDs", "limit", "skip"] },
);

const retrievePostInputSchema = s.object("The input payload for this action.", {
  postID: postIdField,
});

const createPostInputSchema = s.object(
  "The input payload for this action.",
  {
    boardID: boardIdField,
    title: s.string("Title of the post.", { minLength: 1 }),
    details: s.string("Detailed body of the post.", { minLength: 1 }),
    authorID: authorIdField,
    byID: s.string("Admin authoring the post on behalf of the user.", { minLength: 1 }),
    ownerID: s.string("Owner assigned to the post.", { minLength: 1 }),
    categoryID: s.string("Category assigned to the post.", { minLength: 1 }),
    createdAt: s.string("Original creation time in ISO 8601 format.", { minLength: 1 }),
    eta: s.string("Estimated timeframe for delivery in MM/YYYY.", { minLength: 1 }),
    etaPublic: s.boolean("Whether the ETA should be visible to end users."),
    imageURLs: s.stringArray("Image URLs attached to the post."),
    customFields: unknownRecordSchema,
  },
  { optional: ["byID", "ownerID", "categoryID", "createdAt", "eta", "etaPublic", "imageURLs", "customFields"] },
);

const updatePostInputSchema = s.object(
  "The input payload for this action. At least one mutable field is required.",
  {
    postID: postIdField,
    title: s.string("Updated title of the post.", { minLength: 1 }),
    details: s.string("Updated body of the post.", { minLength: 1 }),
    eta: s.string("Updated ETA in MM/YYYY format.", { minLength: 1 }),
    etaPublic: s.boolean("Whether the ETA should be visible to end users."),
    imageURLs: s.stringArray("Updated image URLs for the post."),
    customFields: unknownRecordSchema,
  },
  { optional: ["title", "details", "eta", "etaPublic", "imageURLs", "customFields"] },
);

const listCommentsInputSchema = s.object(
  "The input payload for this action.",
  {
    postID: postIdField,
    boardID: boardIdField,
    authorID: authorIdField,
    companyID: s.string("Unique identifier of the company.", { minLength: 1 }),
    limit: limitField,
    skip: skipField,
  },
  { optional: ["postID", "boardID", "authorID", "companyID", "limit", "skip"] },
);

const createCommentInputSchema = s.object(
  "The input payload for this action. Either value or imageURLs is required.",
  {
    postID: postIdField,
    authorID: authorIdField,
    value: s.string("Text content of the comment.", { minLength: 1 }),
    parentID: s.string("Parent comment ID when creating a reply.", { minLength: 1 }),
    internal: s.boolean("Whether the comment is internal only."),
    createdAt: s.string("Original creation time in ISO 8601 format.", { minLength: 1 }),
    imageURLs: s.stringArray("Image URLs attached to the comment."),
    shouldNotifyVoters: s.boolean("Whether voters of the post should receive notifications."),
  },
  { optional: ["value", "parentID", "internal", "createdAt", "imageURLs", "shouldNotifyVoters"] },
);

export const cannyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_boards",
    operationType: "read",
    description: "List all Canny boards available to the authenticated workspace.",
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      boards: s.array("Boards returned by the request.", boardSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "retrieve_board",
    operationType: "read",
    description: "Retrieve a single Canny board by board ID.",
    inputSchema: retrieveBoardInputSchema,
    outputSchema: s.object("The output payload for this action.", { board: boardSchema }),
  }),
  defineProviderAction(service, {
    name: "list_users",
    operationType: "read",
    description: "List Canny users with cursor-based pagination.",
    inputSchema: listUsersInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      users: s.array("Users returned by the request.", userSchema),
      hasNextPage: s.boolean("Whether another page is available."),
      cursor: s.string("Cursor for the next page when another page is available."),
    }),
  }),
  defineProviderAction(service, {
    name: "retrieve_user",
    operationType: "read",
    description: "Retrieve a single Canny user by id, userID, or email.",
    inputSchema: retrieveUserInputSchema,
    outputSchema: s.object("The output payload for this action.", { user: userSchema }),
  }),
  defineProviderAction(service, {
    name: "create_or_update_user",
    operationType: "write",
    description: "Create a new Canny user or update an existing one by id, userID, or email.",
    inputSchema: createOrUpdateUserInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      user: s.object("Identifier of the created or updated user.", {
        id: s.string("Unique identifier of the created or updated user."),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "list_posts",
    operationType: "read",
    description: "List Canny posts with optional filtering, search, sorting, and pagination.",
    inputSchema: listPostsInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      posts: s.array("Posts returned by the request.", postSchema),
      hasMore: s.boolean("Whether another page is available."),
    }),
  }),
  defineProviderAction(service, {
    name: "retrieve_post",
    operationType: "read",
    description: "Retrieve a single Canny post by post ID.",
    inputSchema: retrievePostInputSchema,
    outputSchema: s.object("The output payload for this action.", { post: postSchema }),
  }),
  defineProviderAction(service, {
    name: "create_post",
    operationType: "write",
    description: "Create a new Canny post on a board for a specific author.",
    inputSchema: createPostInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      post: s.object(
        "Identifier of the created post.",
        {
          id: s.string("Unique identifier of the created post."),
          url: s.string("URL to the created post."),
        },
        { optional: ["url"] },
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "update_post",
    operationType: "write",
    description: "Update mutable fields on an existing Canny post.",
    inputSchema: updatePostInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      success: s.boolean("Whether the post update succeeded."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_comments",
    operationType: "read",
    description: "List Canny comments with optional filtering and pagination.",
    inputSchema: listCommentsInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      comments: s.array("Comments returned by the request.", commentSchema),
      hasMore: s.boolean("Whether another page is available."),
    }),
  }),
  defineProviderAction(service, {
    name: "create_comment",
    operationType: "write",
    description: "Create a new Canny comment on a post or as a reply to a comment.",
    inputSchema: createCommentInputSchema,
    outputSchema: s.object("The output payload for this action.", {
      comment: s.object("Identifier of the created comment.", {
        id: s.string("Unique identifier of the created comment."),
      }),
    }),
  }),
];
