import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "notion_mcp";

const rawSchema = s.string(
  "The untouched text Notion's MCP tool returned, kept beside the typed fields so a changed tool shape can still be read.",
);

const userSchema = s.looseObject("A Notion user as the MCP server reports it. Fields the server omits are absent.", {
  id: s.string("The Notion user ID."),
  name: s.string("The user's display name."),
  email: s.string("The user's email address, when the server reports one."),
  type: s.string("The user type, such as person or bot."),
});

const dateRangeSchema = s.object(
  "A day-precision date range as Notion's search filters take it. Either bound may be omitted.",
  {
    start_date: s.string("The earliest day, inclusive, as YYYY-MM-DD."),
    end_date: s.string("The latest day, inclusive, as YYYY-MM-DD."),
  },
  { optional: ["start_date", "end_date"] },
);

const searchInputSchema = s.object(
  "Arguments for Notion's notion-search tool.",
  {
    query: s.string("Search text. An empty string lists pages by the sort order alone."),
    sort: s.string(
      'Result order. The beta server accepted "relevance" (the default), "last_edited" and "created"; the value is passed through as given. Date sorts need a Business or Enterprise plan; other plans fall back to relevance and say so in notices.',
    ),
    page_size: s.integer("Maximum number of results. Notion allows 1 to 50.", { minimum: 1, maximum: 50 }),
    max_highlight_length: s.nonNegativeInteger(
      "Maximum length of the highlight snippet on each result; 0 turns highlights off.",
    ),
    last_edited_date_range: s.describe(
      dateRangeSchema,
      "Only pages last edited in this day-precision range. Business and Enterprise plans only; other plans drop the filter and name it in notices.",
    ),
    created_date_range: s.describe(dateRangeSchema, "Only pages created in this day-precision range."),
    created_by_user_ids: s.stringArray("Only pages created by these Notion user IDs."),
    edited_by_user_ids: s.stringArray(
      "Only pages edited by these Notion user IDs. Business and Enterprise plans only; other plans drop the filter and name it in notices.",
    ),
    filters: s.unknownObject(
      "Extra filters passed through under the tool's filters argument as given. The typed filters above take precedence over the same keys here.",
    ),
  },
  {
    optional: [
      "query",
      "sort",
      "page_size",
      "max_highlight_length",
      "last_edited_date_range",
      "created_date_range",
      "created_by_user_ids",
      "edited_by_user_ids",
      "filters",
    ],
  },
);

const searchResultSchema = s.looseObject("One search result. Fields the server omits are absent.", {
  id: s.string("The page or data source ID."),
  title: s.string("The result title."),
  url: s.string("The Notion URL of the result."),
  type: s.string("The result type, such as page."),
  timestamp: s.string("The last-edited time the server reports for the result."),
  path: s.string("The breadcrumb path to the result."),
});

const searchOutputSchema = s.object("Notion search results.", {
  type: s.optional(
    s.string(
      'Which search ran, as the server reports it: "workspace_search", or "ai_search" when Notion routed a keyword query to AI search, whose results can come from connected apps such as Slack that fetch_page cannot read.',
    ),
  ),
  results: s.array("Results in the server's order.", searchResultSchema),
  notices: s.array("Server notices as plain text, such as a filter dropped on this plan.", s.string("One notice.")),
  raw: rawSchema,
});

const pageOutputSchema = s.object("A Notion page as notion-fetch returned it.", {
  id: s.string("The requested page ID or URL, echoed back."),
  title: s.optional(s.string("The page title, when the server names one.")),
  url: s.optional(s.string("The Notion URL of the page, when the server names one.")),
  page_last_edited_at: s.optional(s.string("The last-edited time, when the server reports one.")),
  properties: s.optional(s.string("The page's properties block as the server rendered it.")),
  content: s.optional(s.string("The page content as Markdown.")),
  truncated: s.boolean("Whether the server cut the content short."),
  raw: rawSchema,
});

const commentSchema = s.looseObject("One comment. Fields the server omits are absent.", {
  id: s.string("The comment ID."),
  discussion_id: s.string("The discussion thread the comment belongs to."),
  plain_text: s.string("The comment text."),
  created_time: s.string("When the comment was created."),
  created_by: userSchema,
});

const commentsOutputSchema = s.object("Comments on a Notion page, flattened across discussions.", {
  comments: s.array("Comments in the server's order.", commentSchema),
  raw: rawSchema,
});

const toolRestrictionSchema = s.requiredObject("One parameter the plan restricts.", {
  parameter: s.string("The parameter path, such as filters.title_only."),
  reason: s.string(
    "Why the parameter is unavailable, as the server words it. Check it against the value you plan to send: a restriction on several teamspaces still allows one.",
  ),
});

const toolAccessSchema = s.looseObject("Access to one MCP tool on the connected plan.", {
  tool: s.string(
    "The tool's base name as the server keys it, such as search or ai_search: the notion- prefix dropped and hyphens turned into underscores.",
  ),
  status: s.optional(
    s.string(
      "The access status: available, available_with_limit, plan_required, upgrade_required, full_version_required, or not_enabled.",
    ),
  ),
  restricted_parameters: s.array("Parameters the plan restricts, independent of the status.", toolRestrictionSchema),
  upgrade_url: s.optional(s.string("Where a workspace upgrade changes the status.")),
  full_version_url: s.optional(s.string("Where to get the full version of Notion MCP when the tool needs it.")),
  landing_page_url: s.optional(s.string("The plan landing page Notion routes the user through.")),
  landing_page_action: s.optional(s.string("What the landing page offers: start_trial, request_trial, or learn_more.")),
});

const toolAccessOutputSchema = s.object("The plan report from notion-get-tool-access.", {
  tools: s.array("One entry per tool the connection exposes, in the server's order.", toolAccessSchema),
  raw: rawSchema,
});

const createPagesInputSchema = s.object(
  "Arguments for Notion's notion-create-pages tool. Keys this schema does not name pass through as given.",
  {
    pages: s.array(
      "The pages to create; every page in one call shares the parent.",
      s.object(
        "One page.",
        {
          properties: s.unknownObject(
            "Property names to values. Outside a database the only property is title; inside one, the data source's own properties in the spellings notion-fetch shows.",
          ),
          content: s.string("The page body in Notion-flavored Markdown."),
          icon: s.string("An emoji, a Notion icon identifier, or an external image URL."),
          cover: s.string("An external image URL for the cover."),
        },
        { optional: ["properties", "content", "icon", "cover"], additionalProperties: true },
      ),
      { minItems: 1, maxItems: 100 },
    ),
    parent: s.unknownObject(
      "Where the pages go, as the tool takes it: {page_id}, {database_id}, {data_source_id} or {teamspace_id}. Omitted with no creation_mode, the pages are private at the workspace level.",
    ),
    creation_mode: s.stringEnum("draft creates a durable private page; it cannot be combined with a parent.", [
      "draft",
    ]),
    allow_async: s.boolean(
      "Let the server accept the creation for background execution and answer an async task instead of the pages.",
    ),
  },
  { optional: ["parent", "creation_mode", "allow_async"], additionalProperties: true },
);

const createdPageSchema = s.looseObject("One created page as the server named it.", {
  id: s.string("The page ID."),
  url: s.string("The page URL."),
  title: s.string("The page title, when the server names one."),
});

const createPagesOutputSchema = s.object("The created pages.", {
  pages: s.array(
    "The pages the server named, in its order; empty when the answer named none, such as an async task.",
    createdPageSchema,
  ),
  async_task_id: s.optional(
    s.string("The async task ID when the server accepted the creation for background execution."),
  ),
  raw: rawSchema,
});

const updatePageInputSchema = s.object(
  "Arguments for Notion's notion-update-page tool. Keys this schema does not name pass through as given.",
  {
    page_id: s.nonEmptyString("The page to update, by ID."),
    command: s.stringEnum(
      "What to change: the properties, a targeted search-and-replace in the content, the whole content, or an insertion at the start or the end.",
      ["update_properties", "update_content", "replace_content", "insert_content"],
    ),
    properties: s.unknownObject("For update_properties: property names to values; null removes a value."),
    content_updates: s.array(
      "For update_content: search-and-replace operations.",
      s.object(
        "One replacement.",
        {
          old_str: s.nonEmptyString("The existing content to find; it must match the page exactly."),
          new_str: s.string("The replacement."),
          replace_all_matches: s.boolean("Replace every match; off, several matches fail the operation."),
        },
        { optional: ["replace_all_matches"] },
      ),
      { minItems: 1, maxItems: 100 },
    ),
    new_str: s.string("For replace_content: the whole new content in Notion-flavored Markdown."),
    content: s.string("For insert_content: the Markdown to insert."),
    position: s.unknownObject("For insert_content: {type: start} or {type: end}; omitted, the end."),
    allow_deleting_content: s.boolean(
      "Allow a content change to drop child pages and databases it no longer references; off, the server refuses and lists them.",
    ),
    allow_async: s.boolean(
      "Let the server accept the update for background execution and answer an async task instead of the page.",
    ),
  },
  {
    optional: [
      "properties",
      "content_updates",
      "new_str",
      "content",
      "position",
      "allow_deleting_content",
      "allow_async",
    ],
    additionalProperties: true,
  },
);

const updatePageOutputSchema = s.object("The updated page.", {
  page_id: s.string("The requested page ID, echoed back."),
  url: s.optional(s.string("The page URL, when the server names one.")),
  async_task_id: s.optional(
    s.string("The async task ID when the server accepted the update for background execution."),
  ),
  warnings: s.optional(
    s.array(
      "Warnings about changes that were skipped or automatically corrected; omitted for clean updates.",
      s.object(
        "One update warning; additional upstream fields are preserved.",
        {
          code: s.string("Warning code."),
          message: s.string("Explanation of the skipped or corrected change."),
          category: s.string("Markdown parser warning category, when available."),
          autofix: s.boolean("Whether the parser automatically corrected the content."),
        },
        { required: ["code", "message"], additionalProperties: true },
      ),
    ),
  ),
  raw: rawSchema,
});

const createCommentInputSchema = s.object(
  "Arguments for Notion's notion-create-comment tool: a top-level comment on the page, a reply to a comment or a discussion, or a new discussion on selected content. Keys this schema does not name pass through as given.",
  {
    page_id: s.nonEmptyString("The page to comment on, by ID."),
    markdown: s.nonEmptyString("The comment in inline Notion-flavored Markdown."),
    reply_to_comment_id: s.string("A comment ID to reply to."),
    discussion_id: s.string("A discussion ID or URL to reply in."),
    selection_with_ellipsis: s.string(
      "The content to comment on, as the tool takes it: about ten characters from its start, an ellipsis, about ten from its end.",
    ),
  },
  { optional: ["reply_to_comment_id", "discussion_id", "selection_with_ellipsis"], additionalProperties: true },
);

const createCommentOutputSchema = s.object("The created comment.", {
  comment: s.optional(
    s.looseObject("The comment as the server named it.", {
      id: s.string("The comment ID."),
      discussion_id: s.string("The discussion the comment belongs to."),
    }),
  ),
  raw: rawSchema,
});

export const notionMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_self",
    operationType: "read",
    description:
      "Identify the connected Notion user through notion-get-users with user_id self. Returns the user ID, name, and email the server reports.",
    requiredScopes: [],
    inputSchema: s.object({}),
    outputSchema: s.object("The connected user.", {
      user: s.optional(userSchema),
      raw: rawSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description:
      "Search Notion pages through notion-search with optional text, sort, page size, date-range and creator filters. Returns typed results, the search type that ran, the server's notices about dropped filters, and the raw response. Filtering by editor or last-edited date and sorting by date need a Business or Enterprise plan; other plans drop them and name them in notices. When the connection can use AI search, a non-empty keyword query with no exact filter and relevance order runs AI search and can return results from connected apps. Notion allows 30 searches a minute.",
    requiredScopes: [],
    followUpActions: ["notion_mcp.fetch_page", "notion_mcp.list_comments"],
    inputSchema: searchInputSchema,
    outputSchema: searchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "fetch_page",
    operationType: "read",
    description:
      "Read one Notion page through notion-fetch by ID or URL. Returns the title, properties block, Markdown content, a truncated flag, and the raw response.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The page to read.", {
      id: s.nonEmptyString("The Notion page ID or URL."),
    }),
    outputSchema: pageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_comments",
    operationType: "read",
    description:
      "List the comments on one Notion page through notion-get-comments, flattened across discussions. Block-level and resolved discussions are included unless turned off; the server offers no paging.",
    requiredScopes: [],
    inputSchema: s.object(
      "The page whose comments to list.",
      {
        page_id: s.nonEmptyString("The Notion page ID."),
        include_all_blocks: s.boolean("Whether to include comments on every block of the page. Defaults to true."),
        include_resolved: s.boolean("Whether to include resolved discussions. Defaults to true."),
      },
      { optional: ["include_all_blocks", "include_resolved"] },
    ),
    outputSchema: commentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "tool_access",
    operationType: "read",
    description:
      "Report each MCP tool's access status on the connected Notion plan through notion-get-tool-access, keyed by the tool's base name such as search, with the parameters the plan restricts and the reason for each, such as the edited-by search filter below the Business plan.",
    requiredScopes: [],
    inputSchema: s.object({}),
    outputSchema: toolAccessOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_pages",
    operationType: "write",
    description:
      "Create one or more Notion pages through notion-create-pages, under a page, a database, a data source or a teamspace, or as a private draft. Returns the pages the server named, an async task ID when it deferred the work, and the raw response.",
    requiredScopes: [],
    followUpActions: ["notion_mcp.fetch_page", "notion_mcp.update_page"],
    inputSchema: createPagesInputSchema,
    outputSchema: createPagesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "update_page",
    operationType: "write",
    description:
      "Change one Notion page through notion-update-page: its properties, a targeted search-and-replace in its content, its whole content, or an insertion at the start or the end. Returns the page ID, the URL when the server names one, an async task ID when it deferred the work, and the raw response.",
    requiredScopes: [],
    followUpActions: ["notion_mcp.fetch_page"],
    inputSchema: updatePageInputSchema,
    outputSchema: updatePageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_comment",
    operationType: "write",
    description:
      "Comment on a Notion page through notion-create-comment: at the top level, as a reply to a comment or a discussion, or as a new discussion on selected content. Returns the comment the server named and the raw response.",
    requiredScopes: [],
    followUpActions: ["notion_mcp.list_comments"],
    inputSchema: createCommentInputSchema,
    outputSchema: createCommentOutputSchema,
  }),
];
