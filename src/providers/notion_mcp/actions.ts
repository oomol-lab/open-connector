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
      'Result order. The beta server accepted "relevance" (the default), "last_edited" and "created"; the value is passed through as given.',
    ),
    page_size: s.integer("Maximum number of results. Notion allows 1 to 50.", { minimum: 1, maximum: 50 }),
    max_highlight_length: s.nonNegativeInteger(
      "Maximum length of the highlight snippet on each result; 0 turns highlights off.",
    ),
    last_edited_date_range: dateRangeSchema,
    created_date_range: dateRangeSchema,
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

const toolAccessSchema = s.looseObject("Access to one MCP tool on the connected plan.", {
  tool: s.string("The tool name."),
  status: s.optional(s.string("The access status the server reports, such as full or restricted.")),
  restricted_parameters: s.array(
    "Parameters the plan restricts, such as filters.edited_by_user_ids.",
    s.string("One restricted parameter path."),
  ),
});

const toolAccessOutputSchema = s.object("The restricted-parameter report from notion-get-tool-access.", {
  tools: s.array("One entry per tool the server reported.", toolAccessSchema),
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
      "Search Notion pages through notion-search with optional text, sort, page size, date-range and creator filters. Returns typed results, the server's notices about dropped filters, and the raw response. Notion allows 30 searches a minute.",
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
      "List the comments on one Notion page through notion-get-comments, flattened across discussions. Resolved threads are included; the server offers no paging.",
    requiredScopes: [],
    inputSchema: s.object(
      "The page whose comments to list.",
      {
        page_id: s.nonEmptyString("The Notion page ID."),
        include_all_blocks: s.boolean("Whether to include comments on every block of the page. Defaults to true."),
      },
      { optional: ["include_all_blocks"] },
    ),
    outputSchema: commentsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "tool_access",
    operationType: "read",
    description:
      "Report which MCP tool parameters the connected Notion plan restricts through notion-get-tool-access, such as the edited-by search filter below the Business plan.",
    requiredScopes: [],
    inputSchema: s.object({}),
    outputSchema: toolAccessOutputSchema,
  }),
];
