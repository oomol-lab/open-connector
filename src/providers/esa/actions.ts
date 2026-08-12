import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { esaReadScopes, esaWriteScopes } from "./scopes.ts";

const service = "esa";

const teamName = s.nonWhitespaceString("The esa team subdomain, optionally including the .esa.io suffix.");
const postNumber = s.positiveInteger("The numeric esa post number.");
const commentId = s.positiveInteger("The numeric esa comment ID.");
const page = s.positiveInteger("Page number, starting at 1.");
const perPage = s.integer("Items per page. esa accepts at most 100.", { minimum: 1, maximum: 100 });
const markdown = s.string("Markdown content. Use four spaces for indentation where required.");
const optionalPage = s.optional(page);
const optionalPerPage = s.optional(perPage);

const paginationFields = {
  prev_page: s.optional(s.nullableInteger("The previous page, or null when this is the first page.")),
  next_page: s.optional(s.nullableInteger("The next page, or null when this is the last page.")),
  total_count: s.optional(s.nonNegativeInteger("Total number of matching items.")),
  page: s.optional(s.positiveInteger("The current page number.")),
  per_page: s.optional(s.positiveInteger("The number of items in this page.")),
  max_per_page: s.optional(s.positiveInteger("The maximum page size accepted by esa.")),
};

const userSchema = s.looseObject(
  {
    id: s.integer("The esa user ID."),
    name: s.string("The user's display name."),
    screen_name: s.string("The user's esa screen name."),
    icon: s.url("The user's icon URL."),
    email: s.email("The user's email address."),
  },
  { description: "An esa user profile." },
);

const postStatsSchema = s.looseObject(
  {
    tasks_count: s.nonNegativeInteger("Number of tasks in the post."),
    done_tasks_count: s.nonNegativeInteger("Number of completed tasks in the post."),
    comments_count: s.nonNegativeInteger("Number of comments on the post."),
    stargazers_count: s.nonNegativeInteger("Number of users who starred the post."),
    watchers_count: s.nonNegativeInteger("Number of users watching the post."),
  },
  { description: "Post counters returned by esa." },
);

const bodyStatsSchema = s.requiredObject("The full post body size before output truncation.", {
  characters: s.nonNegativeInteger("Number of user-perceived characters."),
  lines: s.nonNegativeInteger("Number of newline-separated lines."),
});

const postSchema = s.object(
  {
    url: s.url("The post URL."),
    revision_number: s.nonNegativeInteger("The current revision number."),
    wip: s.stringEnum(["WIP", "Shipped"], { description: "The publication state of the post." }),
    kind: s.string("The esa post kind."),
    category_and_title_and_tags: s.string("The post category, title, and tags."),
    body_md: s.optional(s.string("The post body in Markdown.")),
    body_md_stats: s.optional(bodyStatsSchema),
    created_at: s.optional(s.dateTime("When the post was created.")),
    updated_at: s.optional(s.dateTime("When the post was last updated.")),
    created_by: s.optional(userSchema),
    updated_by: s.optional(userSchema),
    stats: s.optional(postStatsSchema),
    backlinks_count: s.optional(s.nonNegativeInteger("Number of posts that link to this post.")),
  },
  { additionalProperties: true, description: "An esa post shaped for agent use." },
);

const postSummarySchema = s.object(
  {
    number: s.positiveInteger("The esa post number."),
    url: s.url("The post URL."),
    category_and_title_and_tags: s.string("The post category, title, and tags."),
    wip: s.stringEnum(["WIP", "Shipped"], { description: "The publication state of the post." }),
    created_at: s.optional(s.dateTime("When the post was created.")),
    updated_at: s.optional(s.dateTime("When the post was last updated.")),
  },
  { additionalProperties: true, description: "A compact esa post summary." },
);

const commentStatsSchema = s.looseObject(
  {
    stargazers_count: s.nonNegativeInteger("Number of users who starred the comment."),
    star: s.boolean("Whether the authenticated user starred the comment."),
  },
  { description: "Comment counters returned by esa." },
);

const commentSchema = s.object(
  {
    id: s.positiveInteger("The comment ID."),
    post_number: s.positiveInteger("The post number that owns the comment."),
    url: s.url("The comment URL."),
    body_md: s.optional(s.string("The comment body in Markdown.")),
    created_at: s.optional(s.dateTime("When the comment was created.")),
    updated_at: s.optional(s.dateTime("When the comment was last updated.")),
    created_by: s.optional(userSchema),
    stats: s.optional(commentStatsSchema),
    stargazers: s.optional(s.array(userSchema, { description: "Users who starred the comment." })),
  },
  { additionalProperties: true, description: "An esa comment shaped for agent use." },
);

const categorySchema = s.object(
  {
    full_name: s.string("The full category path."),
    count: s.nonNegativeInteger("Number of posts in the category."),
    has_child: s.boolean("Whether the category has child categories."),
  },
  { additionalProperties: true, description: "An esa category summary." },
);

const categoryListSchema = s.looseObject(
  {
    current_category: s.string("The selected category path."),
    categories: s.array(categorySchema, { description: "Categories at the selected level." }),
    parent_categories: s.array(
      s.looseObject(
        {
          current_category: s.string("The parent category path."),
          categories: s.array(categorySchema, { description: "Categories under that parent." }),
        },
        { description: "One parent category level." },
      ),
      { description: "Parent category levels." },
    ),
    readme: postSchema,
    no_category: categorySchema,
    descendant_posts: s.array(postSchema, { description: "Posts in descendant categories." }),
    posts: s.array(postSchema, { description: "Posts directly in the selected category." }),
    ...paginationFields,
  },
  { description: "A category listing returned by esa." },
);

const postListSchema = s.object(
  {
    posts: s.array(postSchema, { description: "Posts returned by esa." }),
    ...paginationFields,
  },
  { additionalProperties: true, description: "A paginated esa post listing." },
);

const postSummaryListSchema = s.object(
  {
    posts: s.array(postSummarySchema, { description: "Post summaries returned by esa." }),
    ...paginationFields,
  },
  { additionalProperties: true, description: "A paginated esa post summary listing." },
);

const commentListSchema = s.object(
  {
    comments: s.array(commentSchema, { description: "Comments returned by esa." }),
    ...paginationFields,
  },
  { additionalProperties: true, description: "A paginated esa comment listing." },
);

const teamSchema = s.looseObject(
  {
    url: s.url("The team URL."),
    name: s.string("The team subdomain."),
    description: s.string("The team description."),
  },
  { description: "An esa team available to the authenticated user." },
);

const teamListSchema = s.object(
  {
    teams: s.array(teamSchema, { description: "Teams available to the authenticated user." }),
    ...paginationFields,
  },
  { additionalProperties: true, description: "A paginated esa team listing." },
);

const tagSchema = s.looseObject(
  {
    name: s.string("The tag name."),
    posts_count: s.nonNegativeInteger("Number of posts carrying the tag."),
  },
  { description: "An esa tag and its usage count." },
);

const tagListSchema = s.object(
  {
    tags: s.array(tagSchema, { description: "Tags used in the team." }),
    ...paginationFields,
  },
  { additionalProperties: true, description: "A paginated esa tag listing." },
);

const memberSchema = s.looseObject(
  {
    id: s.integer("The member's esa user ID."),
    name: s.string("The member's display name."),
    screen_name: s.string("The member's esa screen name."),
    role: s.string("The member's team role."),
  },
  { description: "An esa team member." },
);

const memberListSchema = s.object(
  {
    members: s.array(memberSchema, { description: "Team members returned by esa." }),
    ...paginationFields,
  },
  { additionalProperties: true, description: "A paginated esa team-member listing." },
);

const originalRevisionSchema = s.requiredObject("A post revision used to detect conflicting updates.", {
  bodyMd: markdown,
  number: s.positiveInteger("The original revision number."),
  user: s.nonWhitespaceString("The original revision author's screen name."),
});

const postInput = (properties: Record<string, JsonSchema>, description: string): JsonSchema =>
  s.object({ teamName, ...properties }, { description });

export const esaActions: ActionDefinition[] = [
  readAction(
    "get_teams",
    "List esa teams available to the authenticated user.",
    s.object(
      {
        page: optionalPage,
        perPage: optionalPerPage,
        role: s.optional(s.stringEnum(["member", "owner"], { description: "Optional membership-role filter." })),
      },
      { description: "Team-list input." },
    ),
    teamListSchema,
  ),
  readAction(
    "get_team_stats",
    "Get member, post, comment, star, watch, and activity statistics for an esa team.",
    postInput({}, "Team-statistics input."),
    s.unknownObject("Team statistics returned by esa."),
  ),
  readAction(
    "get_team_tags",
    "List tags used by posts in an esa team with their counts.",
    postInput({ page: optionalPage, perPage: optionalPerPage }, "Team-tag-list input."),
    tagListSchema,
  ),
  readAction(
    "get_team_members",
    "List members of an esa team with their roles and profiles.",
    postInput(
      {
        page: optionalPage,
        perPage: optionalPerPage,
        sort: s.optional(s.stringEnum(["posts_count", "joined", "last_accessed"], { description: "Member sort key." })),
        order: s.optional(s.stringEnum(["asc", "desc"], { description: "Sort direction." })),
      },
      "Team-member-list input.",
    ),
    memberListSchema,
  ),
  readAction(
    "get_post",
    "Get one esa post by number. The body is truncated by default to keep agent context bounded.",
    postInput(
      {
        postNumber,
        truncate: s.optional(
          s.boolean({
            default: true,
            description: "Whether to truncate a long Markdown body. Defaults to true.",
          }),
        ),
      },
      "Post lookup input.",
    ),
    postSchema,
  ),
  readAction(
    "search_posts",
    "Search posts in an esa team with esa query syntax and pagination.",
    postInput(
      {
        query: s.string("esa search query. An empty string lists posts."),
        sort: s.optional(
          s.stringEnum(["updated", "created", "number", "stars", "watches", "comments", "best_match"], {
            description: "Sort key.",
          }),
        ),
        order: s.optional(s.stringEnum(["asc", "desc"], { description: "Sort direction." })),
        page: optionalPage,
        perPage: optionalPerPage,
      },
      "Post-search input.",
    ),
    postListSchema,
  ),
  writeAction(
    "create_post",
    "Create a new esa post with optional Markdown body, tags, category, WIP state, and revision message.",
    postInput(
      {
        name: s.nonWhitespaceString("The post title. A category/title value is split when category is omitted."),
        bodyMd: s.optional(markdown),
        tags: s.optional(s.stringArray("Tags to assign to the post.", { itemDescription: "One tag." })),
        category: s.optional(s.string("Category path such as dev/docs.")),
        wip: s.optional(
          s.boolean({ default: true, description: "Whether to create the post as WIP. Defaults to true." }),
        ),
        message: s.optional(s.string("Optional revision message.")),
      },
      "Post-creation input.",
    ),
    postSchema,
    ["get_post"],
  ),
  writeAction(
    "update_post",
    "Update selected fields of an existing esa post. Use append_post or prepend_post to add Markdown without fetching the body.",
    postInput(
      {
        postNumber,
        name: s.optional(s.string("New post title. A category/title value is split when category is omitted.")),
        bodyMd: s.optional(markdown),
        tags: s.optional(s.stringArray("Replacement tag list.", { itemDescription: "One tag." })),
        category: s.optional(s.string("Replacement category path.")),
        wip: s.optional(s.boolean("Whether the post remains WIP.")),
        message: s.optional(s.string("Optional revision message.")),
        originalRevision: s.optional(originalRevisionSchema),
      },
      "Post-update input.",
    ),
    postSchema,
    ["get_post"],
  ),
  writeAction(
    "append_post",
    "Append Markdown content to an esa post without first fetching its current body.",
    postInput(
      {
        postNumber,
        content: markdown,
        wip: s.optional(s.boolean("WIP state after the append. Defaults to the current state.")),
        message: s.optional(s.string("Optional revision message.")),
      },
      "Post-append input.",
    ),
    postSchema,
    ["get_post"],
  ),
  writeAction(
    "prepend_post",
    "Prepend Markdown content to an esa post without first fetching its current body.",
    postInput(
      {
        postNumber,
        content: markdown,
        wip: s.optional(s.boolean("WIP state after the prepend. Defaults to the current state.")),
        message: s.optional(s.string("Optional revision message.")),
      },
      "Post-prepend input.",
    ),
    postSchema,
    ["get_post"],
  ),
  readAction(
    "get_comment",
    "Get one esa comment by ID, optionally including its stargazers.",
    postInput(
      {
        commentId,
        include: s.optional(s.literal("stargazers", { description: "Include users who starred the comment." })),
      },
      "Comment lookup input.",
    ),
    commentSchema,
  ),
  writeAction(
    "create_comment",
    "Create a Markdown comment on an existing esa post.",
    postInput(
      {
        postNumber,
        bodyMd: markdown,
        user: s.optional(s.nonWhitespaceString("Comment author's screen name. Requires owner permission.")),
      },
      "Comment-creation input.",
    ),
    commentSchema,
    ["get_post_comments"],
  ),
  writeAction(
    "update_comment",
    "Update an existing esa comment.",
    postInput(
      {
        commentId,
        bodyMd: markdown,
        user: s.optional(s.nonWhitespaceString("Comment author's screen name. Requires owner permission.")),
      },
      "Comment-update input.",
    ),
    commentSchema,
    ["get_comment"],
  ),
  writeAction(
    "delete_comment",
    "Permanently delete an esa comment by ID.",
    postInput({ commentId }, "Comment-deletion input."),
    s.requiredObject("Comment deletion result.", {
      success: s.literal(true, { description: "Whether the comment was deleted." }),
      message: s.string("Deletion result message."),
    }),
  ),
  readAction(
    "get_post_backlinks",
    "List posts that link to a specific esa post.",
    postInput({ postNumber, page: optionalPage, perPage: optionalPerPage }, "Post-backlink-list input."),
    postSummaryListSchema,
  ),
  readAction(
    "get_post_comments",
    "List comments on an esa post with pagination.",
    postInput({ postNumber, page: optionalPage, perPage: optionalPerPage }, "Post-comment-list input."),
    commentListSchema,
  ),
  readAction(
    "get_team_comments",
    "List comments in an esa team with pagination.",
    postInput({ page: optionalPage, perPage: optionalPerPage }, "Team-comment-list input."),
    commentListSchema,
  ),
  readAction(
    "get_categories",
    "Get an esa category, its child categories, and optional posts or parents.",
    postInput(
      {
        select: s.string("Category path to retrieve."),
        include: s.optional(
          s.stringEnum(["posts", "parent_categories"], { description: "Additional data to include." }),
        ),
        descendantPosts: s.optional(s.boolean("Include descendant posts when include is posts.")),
        page: optionalPage,
        perPage: optionalPerPage,
      },
      "Category lookup input.",
    ),
    categoryListSchema,
  ),
  readAction(
    "get_top_categories",
    "Get all top-level esa categories for a team.",
    postInput({}, "Top-category-list input."),
    categoryListSchema,
  ),
  readAction(
    "get_all_category_paths",
    "List esa category paths with pagination and optional path filters.",
    postInput(
      {
        page: optionalPage,
        perPage: optionalPerPage,
        prefix: s.optional(s.string("Keep paths beginning with this value.")),
        suffix: s.optional(s.string("Keep paths ending with this value.")),
        match: s.optional(s.string("Keep paths containing this value.")),
        exactMatch: s.optional(s.string("Keep only exactly matching paths.")),
      },
      "Category-path-list input.",
    ),
    s.unknownObject("A paginated esa category-path listing."),
  ),
  writeAction(
    "archive_post",
    "Archive an esa post by moving it to the Archived category.",
    postInput(
      { postNumber, message: s.optional(s.string("Optional archive revision message.")) },
      "Post-archive input.",
    ),
    s.oneOf(
      [
        postSchema,
        s.requiredObject("Result returned when the post is already archived.", {
          message: s.string("Archive result message."),
          category: s.string("The existing Archived category path."),
        }),
      ],
      { description: "Archived post result." },
    ),
    ["get_post"],
  ),
  writeAction(
    "ship_post",
    "Mark an esa post as shipped without changing other fields.",
    postInput({ postNumber }, "Post-shipping input."),
    postSchema,
    ["get_post"],
  ),
  writeAction(
    "duplicate_post",
    "Duplicate an esa post into a new WIP post in the same or another accessible team.",
    postInput(
      {
        postNumber,
        targetTeamName: s.optional(s.nonWhitespaceString("Destination team subdomain. Defaults to the source team.")),
      },
      "Post-duplication input.",
    ),
    postSchema,
    ["get_post"],
  ),
  writeAction(
    "rollback_post_revision",
    "Restore an esa post to a selected revision and create a new revision from it.",
    postInput(
      {
        postNumber,
        revisionNumber: s.positiveInteger("The revision number to restore."),
        wip: s.optional(s.boolean("WIP state after rollback. Defaults to the target revision state.")),
        message: s.optional(s.string("Optional rollback revision message.")),
      },
      "Post-revision-rollback input.",
    ),
    postSchema,
    ["get_post"],
  ),
  readAction(
    "get_search_options_help",
    "Get esa's official search-syntax documentation post.",
    s.object({}, { description: "Search-help input." }),
    postSchema,
  ),
  readAction(
    "get_markdown_syntax_help",
    "Get esa's official Markdown-syntax documentation post.",
    s.object({}, { description: "Markdown-help input." }),
    postSchema,
  ),
  readAction(
    "search_help",
    "Search esa's official documentation team with esa query syntax.",
    s.object(
      {
        query: s.string("esa search query for the official docs team."),
        page: optionalPage,
        perPage: optionalPerPage,
      },
      { description: "Official-documentation search input." },
    ),
    postListSchema,
  ),
  readAction(
    "get_attachment",
    "Get an esa attachment as a local transit file when possible, otherwise return its downloadable URL.",
    postInput(
      {
        url: s.string("A public HTTPS esa attachment URL or an /uploads/... path."),
        forceSignedUrl: s.optional(
          s.boolean({
            default: false,
            description:
              "Skip the transit download and return the resolved URL. Secure esa attachments use a signed URL.",
          }),
        ),
      },
      "Attachment lookup input.",
    ),
    s.object(
      {
        url: s.url("The resolved signed or public attachment URL."),
        file: s.optional(
          s.object(
            {
              fileId: s.string("The local transit-file ID."),
              downloadUrl: s.url("The local transit-file download URL."),
              sizeBytes: s.nonNegativeInteger("Downloaded file size in bytes."),
              name: s.string("Downloaded file name."),
              mimeType: s.string("Downloaded file MIME type."),
            },
            { description: "A downloaded attachment in local transit storage." },
          ),
        ),
      },
      { description: "Attachment result." },
    ),
  ),
  readAction(
    "list_recent_posts",
    "List recently updated esa posts. This is the action equivalent of the esa_recent_posts MCP resource.",
    postInput({ page: optionalPage, perPage: optionalPerPage }, "Recent-posts input."),
    postListSchema,
  ),
  readAction(
    "get_post_summary_prompt",
    "Build the summary prompt for an esa post. The caller supplies the returned prompt to its model.",
    postInput({ postNumber }, "Post-summary-prompt input."),
    s.requiredObject("Post-summary prompt result.", {
      prompt: s.string("A complete prompt containing post metadata and Markdown body."),
    }),
  ),
];

function readAction(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  followUpActions?: string[],
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: esaReadScopes,
    inputSchema,
    outputSchema,
    followUpActions,
  });
}

function writeAction(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  followUpActions?: string[],
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    requiredScopes: esaWriteScopes,
    inputSchema,
    outputSchema,
    followUpActions,
  });
}
