import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gist";

export const gistRequiredScopes: string[] = ["gist"];
export const gistOAuthScopes: string[] = ["read:user", ...gistRequiredScopes];

const rawObjectSchema = s.looseObject("A GitHub API object.");
const nullableString = s.nullable(s.string());
const nullableNumber = s.nullable(s.integer());
const nullableBoolean = s.nullable(s.boolean());
const mediaTypeSchema = s.stringEnum("The media type format for the gist content.", ["json", "raw", "base64"]);

const paginationFields = {
  perPage: s.integer("The number of results per page.", { minimum: 1, maximum: 100 }),
  page: s.integer("The page number to retrieve.", { minimum: 1 }),
};

const gistOwnerSchema = s.looseObject(
  {
    login: s.string("The GitHub username of the gist owner."),
    id: s.integer("The numeric user ID."),
    node_id: s.string("The global node ID of the user."),
    avatar_url: s.string("The URL of the user avatar image."),
    html_url: s.string("The HTML URL of the user profile."),
    url: s.string("The API URL of the user."),
    type: s.string("The account type of the user."),
    site_admin: s.boolean("Whether the user is a GitHub site administrator."),
  },
  { description: "A gist owner record." },
);

const gistFileSchema = s.looseObject(
  {
    filename: nullableString,
    type: nullableString,
    language: nullableString,
    raw_url: nullableString,
    size: nullableNumber,
    truncated: nullableBoolean,
    content: nullableString,
    encoding: nullableString,
  },
  { description: "A gist file record." },
);

const gistSummarySchema = s.looseObject(
  {
    id: s.string("The unique identifier of the gist."),
    url: s.string("The API URL of the gist."),
    forks_url: s.string("The API URL for listing gist forks."),
    commits_url: s.string("The API URL for listing gist commits."),
    node_id: s.string("The global node ID of the gist."),
    git_pull_url: s.string("The git pull URL for the gist."),
    git_push_url: s.string("The git push URL for the gist."),
    html_url: s.string("The HTML URL of the gist."),
    files: s.record(gistFileSchema, {
      description: "The files contained in the gist, keyed by filename.",
    }),
    public: s.boolean("Whether the gist is publicly visible."),
    created_at: s.string("The creation timestamp of the gist."),
    updated_at: s.string("The last updated timestamp of the gist."),
    description: nullableString,
    comments: s.integer("The number of comments on the gist."),
    comments_url: s.string("The API URL for listing gist comments."),
    comments_enabled: s.boolean("Whether comments are enabled on the gist."),
    owner: s.nullable(gistOwnerSchema),
    user: s.nullable(rawObjectSchema),
    truncated: s.boolean("Whether the gist content was truncated."),
    forks: s.array("The list of forks for the gist.", rawObjectSchema),
    history: s.array("The commit history of the gist.", rawObjectSchema),
  },
  { description: "A gist summary record." },
);

const gistCommitSchema = s.looseObject(
  {
    version: s.string("The commit SHA of the gist revision."),
    committed_at: s.string("The timestamp when the commit was made."),
    url: s.string("The API URL of the commit."),
    change_status: s.looseObject(
      {
        total: s.integer("The total number of lines changed."),
        additions: s.integer("The number of lines added."),
        deletions: s.integer("The number of lines deleted."),
      },
      { description: "The change statistics for the commit." },
    ),
    user: s.nullable(gistOwnerSchema),
  },
  { description: "A gist commit record." },
);

const gistForkSchema = s.looseObject(
  {
    id: s.string("The unique identifier of the fork."),
    url: s.string("The API URL of the fork."),
    html_url: s.string("The HTML URL of the fork."),
    created_at: s.string("The creation timestamp of the fork."),
    updated_at: s.string("The last updated timestamp of the fork."),
    user: s.nullable(gistOwnerSchema),
    owner: s.nullable(gistOwnerSchema),
    files: s.record(gistFileSchema, {
      description: "The files in the forked gist.",
    }),
  },
  { description: "A gist fork record." },
);

const gistCommentSchema = s.looseObject(
  {
    id: s.integer("The unique identifier of the comment."),
    node_id: s.string("The global node ID of the comment."),
    url: s.string("The API URL of the comment."),
    body: s.string("The body text of the comment."),
    created_at: s.string("The creation timestamp of the comment."),
    updated_at: s.string("The last updated timestamp of the comment."),
    author_association: s.string("The author's association with the gist repository."),
    user: s.nullable(gistOwnerSchema),
  },
  { description: "A gist comment record." },
);

const gistFileCreateInputSchema = s.object("The input for creating a gist file.", {
  content: s.string("The text content for the new gist file."),
});

const gistFileUpdateInputSchema = s.object(
  "The input for updating a gist file.",
  {
    content: s.string("The updated text content for the file."),
    filename: s.nullable(s.string("The new filename for the file.")),
  },
  { optional: ["content", "filename"] },
);

const listGistsInputSchema = s.object(
  "The input payload for listing gists.",
  {
    ...paginationFields,
    since: s.dateTime("The ISO 8601 timestamp to filter gists updated after this time."),
  },
  { optional: ["perPage", "page", "since"] },
);

const gistIdWithOptionalMediaTypeSchema = s.object(
  "The input payload for fetching a gist.",
  {
    gistId: s.nonEmptyString("The gist ID to fetch."),
    mediaType: mediaTypeSchema,
  },
  { optional: ["mediaType"] },
);

function gistsOutput(description: string, itemDescription: string): JsonSchema {
  return s.actionOutput(
    {
      gists: s.array(itemDescription, gistSummarySchema),
    },
    description,
  );
}

function idWithPaginationInput(description: string, gistIdDescription: string): JsonSchema {
  return s.object(
    description,
    {
      gistId: s.nonEmptyString(gistIdDescription),
      ...paginationFields,
    },
    { optional: ["perPage", "page"] },
  );
}

function deletedOutput(description: string): JsonSchema {
  return s.actionOutput(
    {
      deleted: s.literal(true, { description: "Whether the item was deleted successfully." }),
    },
    description,
  );
}

export const gistActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_my_gists",
    description: "List gists visible to the authenticated GitHub user.",
    requiredScopes: gistRequiredScopes,
    inputSchema: listGistsInputSchema,
    outputSchema: gistsOutput(
      "The output payload for listing the current user's gists.",
      "The visible gists for the authenticated user.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_gist",
    description: "Create a new GitHub gist.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object(
      "The input payload for creating a gist.",
      {
        description: s.string("The description to store on the gist."),
        public: s.boolean("Whether the gist should be publicly visible."),
        files: s.record(gistFileCreateInputSchema, {
          description: "The files to create in the gist, keyed by filename.",
        }),
      },
      { required: ["files"], optional: ["description", "public"] },
    ),
    outputSchema: gistSummarySchema,
  }),
  defineProviderAction(service, {
    name: "list_public_gists",
    description: "List recent public GitHub gists.",
    requiredScopes: [],
    inputSchema: listGistsInputSchema,
    outputSchema: gistsOutput("The output payload for listing public gists.", "The public gists returned by GitHub."),
  }),
  defineProviderAction(service, {
    name: "list_starred_gists",
    description: "List gists starred by the authenticated GitHub user.",
    requiredScopes: gistRequiredScopes,
    inputSchema: listGistsInputSchema,
    outputSchema: gistsOutput(
      "The output payload for listing starred gists.",
      "The gists starred by the authenticated user.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_gist",
    description: "Get a GitHub gist by id.",
    requiredScopes: [],
    inputSchema: gistIdWithOptionalMediaTypeSchema,
    outputSchema: gistSummarySchema,
  }),
  defineProviderAction(service, {
    name: "update_gist",
    description: "Update a GitHub gist description or files.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object(
      "The input payload for updating a gist.",
      {
        gistId: s.nonEmptyString("The gist ID to update."),
        description: s.string("The new gist description."),
        files: s.record(s.union([gistFileUpdateInputSchema, { type: "null" }]), {
          description: "Updated file entries keyed by filename. Use null to delete a file.",
        }),
        mediaType: mediaTypeSchema,
      },
      { optional: ["description", "files", "mediaType"] },
    ),
    outputSchema: gistSummarySchema,
  }),
  defineProviderAction(service, {
    name: "delete_gist",
    description: "Delete a GitHub gist.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object("The input payload for deleting a gist.", {
      gistId: s.nonEmptyString("The gist ID to delete."),
    }),
    outputSchema: deletedOutput("The output payload for deleting a gist."),
  }),
  defineProviderAction(service, {
    name: "list_gist_commits",
    description: "List commit history for a GitHub gist.",
    requiredScopes: [],
    inputSchema: idWithPaginationInput(
      "The input payload for listing gist commits.",
      "The gist ID whose revision history should be listed.",
    ),
    outputSchema: s.actionOutput(
      {
        commits: s.array("The commit history entries for the gist.", gistCommitSchema),
      },
      "The output payload for listing gist commits.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_gist_forks",
    description: "List forks for a GitHub gist.",
    requiredScopes: [],
    inputSchema: idWithPaginationInput(
      "The input payload for listing gist forks.",
      "The gist ID whose forks should be listed.",
    ),
    outputSchema: s.actionOutput(
      {
        forks: s.array("The fork records for the gist.", gistForkSchema),
      },
      "The output payload for listing gist forks.",
    ),
  }),
  defineProviderAction(service, {
    name: "fork_gist",
    description: "Fork a GitHub gist.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object("The input payload for forking a gist.", {
      gistId: s.nonEmptyString("The gist ID to fork."),
    }),
    outputSchema: gistSummarySchema,
  }),
  defineProviderAction(service, {
    name: "check_gist_starred",
    description: "Check whether the authenticated GitHub user has starred a gist.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object("The input payload for checking gist star state.", {
      gistId: s.nonEmptyString("The gist ID to inspect."),
    }),
    outputSchema: s.actionOutput(
      {
        starred: s.boolean("Whether the authenticated user has starred the gist."),
      },
      "The output payload for checking gist star state.",
    ),
  }),
  defineProviderAction(service, {
    name: "star_gist",
    description: "Star a GitHub gist.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object("The input payload for starring a gist.", {
      gistId: s.nonEmptyString("The gist ID to star."),
    }),
    outputSchema: s.actionOutput(
      {
        starred: s.literal(true, { description: "Whether the gist is now starred." }),
      },
      "The output payload for starring a gist.",
    ),
  }),
  defineProviderAction(service, {
    name: "unstar_gist",
    description: "Unstar a GitHub gist.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object("The input payload for unstarring a gist.", {
      gistId: s.nonEmptyString("The gist ID to unstar."),
    }),
    outputSchema: s.actionOutput(
      {
        starred: s.literal(false, { description: "Whether the gist is now unstarred." }),
      },
      "The output payload for unstarring a gist.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_gist_revision",
    description: "Get a specific revision of a GitHub gist.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for fetching a gist revision.",
      {
        gistId: s.nonEmptyString("The gist ID that owns the revision."),
        sha: s.nonEmptyString("The commit SHA for the revision to fetch."),
        mediaType: mediaTypeSchema,
      },
      { optional: ["mediaType"] },
    ),
    outputSchema: gistSummarySchema,
  }),
  defineProviderAction(service, {
    name: "list_user_gists",
    description: "List public gists for a GitHub user.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing a user's gists.",
      {
        username: s.nonEmptyString("The GitHub username whose public gists should be listed."),
        ...paginationFields,
        since: s.dateTime("The ISO 8601 timestamp to filter gists updated after this time."),
      },
      { optional: ["perPage", "page", "since"] },
    ),
    outputSchema: gistsOutput(
      "The output payload for listing a user's gists.",
      "The public gists for the requested user.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_gist_comments",
    description: "List comments for a GitHub gist.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for listing gist comments.",
      {
        gistId: s.nonEmptyString("The gist ID whose comments should be listed."),
        ...paginationFields,
        mediaType: mediaTypeSchema,
      },
      { optional: ["perPage", "page", "mediaType"] },
    ),
    outputSchema: s.actionOutput(
      {
        comments: s.array("The comments posted on the gist.", gistCommentSchema),
      },
      "The output payload for listing gist comments.",
    ),
  }),
  defineProviderAction(service, {
    name: "create_gist_comment",
    description: "Create a comment on a GitHub gist.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object(
      "The input payload for creating a gist comment.",
      {
        gistId: s.nonEmptyString("The gist ID to comment on."),
        body: s.nonEmptyString("The comment body text."),
        mediaType: mediaTypeSchema,
      },
      { optional: ["mediaType"] },
    ),
    outputSchema: gistCommentSchema,
  }),
  defineProviderAction(service, {
    name: "get_gist_comment",
    description: "Get a GitHub gist comment by id.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for fetching a gist comment.",
      {
        gistId: s.nonEmptyString("The gist ID that owns the comment."),
        commentId: s.positiveInteger("The numeric gist comment ID."),
        mediaType: mediaTypeSchema,
      },
      { optional: ["mediaType"] },
    ),
    outputSchema: gistCommentSchema,
  }),
  defineProviderAction(service, {
    name: "update_gist_comment",
    description: "Update a GitHub gist comment.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object(
      "The input payload for updating a gist comment.",
      {
        gistId: s.nonEmptyString("The gist ID that owns the comment."),
        commentId: s.positiveInteger("The numeric gist comment ID."),
        body: s.nonEmptyString("The updated comment body text."),
        mediaType: mediaTypeSchema,
      },
      { optional: ["mediaType"] },
    ),
    outputSchema: gistCommentSchema,
  }),
  defineProviderAction(service, {
    name: "delete_gist_comment",
    description: "Delete a GitHub gist comment.",
    requiredScopes: gistRequiredScopes,
    inputSchema: s.object("The input payload for deleting a gist comment.", {
      gistId: s.nonEmptyString("The gist ID that owns the comment."),
      commentId: s.positiveInteger("The numeric gist comment ID."),
    }),
    outputSchema: deletedOutput("The output payload for deleting a gist comment."),
  }),
];
