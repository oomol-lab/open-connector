import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "flomo";

const memoTagSchema = s.string("One flomo tag.");
const mcpMemoFileSchema = s.object("A file attached to a flomo memo.", {
  type: s.string("The file type."),
  url: s.url("A short-lived signed download URL for the file."),
});
const mcpMemoSchema = s.object(
  "A flomo memo returned by the MCP server.",
  {
    id: s.string("The flomo memo ID."),
    content: s.string("The memo content in Markdown."),
    created_at: s.string("The memo creation time in ISO 8601 format."),
    updated_at: s.string("The memo update time in ISO 8601 format."),
    from: s.string("The memo source type."),
    tags: s.nullable(s.array("Tags attached to the memo.", memoTagSchema)),
    has_image: s.boolean("Whether the memo contains an image."),
    has_link: s.boolean("Whether the memo contains a link."),
    has_voice: s.boolean("Whether the memo contains a voice attachment."),
    files: s.nullable(s.array("Files attached to the memo.", mcpMemoFileSchema)),
    linked_memos: s.nullable(s.array("IDs of memos linked from this memo.", s.string("One linked memo ID."))),
    word_count: s.integer("The original memo content length in characters."),
    relevance: s.nullable(s.number("The search relevance score returned by flomo.")),
  },
  { optional: ["content", "relevance"] },
);

const flomoMemoSchema = s.object(
  "The memo object created by flomo.",
  {
    creator_id: s.integer("The flomo creator ID that owns the created memo."),
    source: s.string("The flomo source name for the created memo."),
    memo_from: s.string("The flomo memo origin for the created memo."),
    content: s.string("The created memo content rendered as HTML by flomo."),
    tags: s.array("Tags parsed by flomo from the memo content.", memoTagSchema),
    updated_at: s.string("The flomo local timestamp when the memo was last updated."),
    created_at: s.string("The flomo local timestamp when the memo was created."),
    linked_memos: s.array(
      "Linked memo objects detected by flomo.",
      s.unknownObject("One linked memo object returned by flomo."),
    ),
    linked_count: s.integer("The number of linked memos detected by flomo."),
    slug: s.string("The flomo slug for the created memo."),
  },
  { additionalProperties: true },
);

const createMemoOutputSchema = s.object(
  "The flomo incoming webhook JSON response.",
  {
    code: s.integer("The flomo response code. `0` means the memo was recorded."),
    message: s.string("The flomo response message."),
    memo: flomoMemoSchema,
  },
  { required: ["code", "message", "memo"], additionalProperties: true },
);

const mcpMemoListOutputSchema = s.record(s.nullable(s.array("flomo memo records.", mcpMemoSchema)), {
  description: "A flomo MCP object whose values are memo arrays, such as `memos` or daily review groups.",
});
const contentOutputSchema = s.object("A Markdown text response returned by flomo MCP.", {
  content: s.string("The returned Markdown content."),
});
const createMemoInputSchema = s.object(
  "Input for creating a flomo memo. With api_key auth this uses the incoming webhook; with custom_credential auth this calls the flomo MCP memo_create tool.",
  {
    content: s.string("The memo content to publish to flomo.", { minLength: 1 }),
    contentType: s.stringEnum(
      "Set to `markdown` to send flomo webhook `content_type: markdown`; this is mapped to MCP `format` when custom_credential auth is used.",
      ["markdown"],
    ),
    format: s.string("The flomo MCP content format, such as `markdown`."),
  },
  { optional: ["contentType", "format"] },
);

const createMemoMcpOutputSchema = s.object(
  "The memo created by the flomo MCP memo_create tool.",
  {
    id: s.string("The flomo memo ID."),
    content: s.string("The memo content in Markdown."),
    created_at: s.string("The memo creation time in ISO 8601 format."),
    updated_at: s.string("The memo update time in ISO 8601 format."),
    from: s.string("The memo source type."),
    tags: s.nullable(s.array("Tags attached to the memo.", memoTagSchema)),
    has_image: s.boolean("Whether the memo contains an image."),
    has_link: s.boolean("Whether the memo contains a link."),
    has_voice: s.boolean("Whether the memo contains a voice attachment."),
    files: s.nullable(s.array("Files attached to the memo.", mcpMemoFileSchema)),
    linked_memos: s.nullable(s.array("IDs of memos linked from this memo.", s.string("One linked memo ID."))),
    word_count: s.integer("The original memo content length in characters."),
  },
  { optional: ["content"] },
);

const flomoMcpToolDefinitions = [
  {
    name: "memo_update",
    description:
      "Update an existing flomo memo through the flomo Max MCP server. The exact arguments are validated by flomo MCP.",
    inputSchema: s.object(
      "Input for updating an existing flomo memo through flomo MCP.",
      {
        id: s.string("The ID of the memo to update."),
        content: s.string("The updated memo content."),
        format: s.string("The flomo MCP content format, such as `markdown`."),
        local_updated_at: s.string("The expected local update timestamp for conflict checks."),
      },
      { optional: ["content", "format", "local_updated_at"] },
    ),
    outputSchema: createMemoMcpOutputSchema,
  },
  {
    name: "memo_search",
    description:
      "Search flomo memos through the flomo Max MCP server by keywords, tags, time range, or semantic search options.",
    inputSchema: s.object(
      "Input for searching flomo memos through flomo MCP.",
      {
        keywords: s.string("Keywords to search for in memo content."),
        tag: s.string("Only return memos with this tag."),
        start_date: s.string("Only return memos created on or after this date."),
        end_date: s.string("Only return memos created on or before this date."),
        from: s.string("Only return memos from this source type."),
        has_tag: s.nullable(s.boolean("Filter memos by whether they have tags.")),
        limit: s.integer("Maximum number of memos to return."),
      },
      {
        optional: ["keywords", "tag", "start_date", "end_date", "from", "has_tag", "limit"],
      },
    ),
    outputSchema: mcpMemoListOutputSchema,
  },
  {
    name: "memo_batch_get",
    description: "Fetch multiple flomo memos through the flomo Max MCP server in a single tool call.",
    inputSchema: s.object(
      "Input for fetching flomo memos by ID through flomo MCP.",
      {
        id: s.string("One memo ID to fetch."),
        ids: s.oneOf([s.array("Memo IDs to fetch.", s.string("One memo ID.")), s.string("Memo IDs to fetch.")], {
          description: "Memo IDs to fetch, as an array or comma-separated string.",
        }),
      },
      { optional: ["id", "ids"] },
    ),
    outputSchema: mcpMemoListOutputSchema,
  },
  {
    name: "memo_recommended",
    description: "Find flomo memos related to a target memo through the flomo Max MCP server.",
    inputSchema: s.object(
      "Input for finding memos related to a target flomo memo.",
      {
        id: s.string("The target memo ID."),
        limit: s.integer("Maximum number of related memos to return."),
        no_same_tag: s.boolean("Whether to exclude memos that share the same tag."),
      },
      { optional: ["limit", "no_same_tag"] },
    ),
    outputSchema: mcpMemoListOutputSchema,
  },
  {
    name: "tag_tree",
    description: "Fetch the flomo tag tree through the flomo Max MCP server.",
    inputSchema: s.object(
      "Input for fetching a flomo tag tree.",
      {
        prefix: s.string("Only return tags under this prefix."),
        depth: s.integer("Maximum tag tree depth to return."),
      },
      { optional: ["prefix", "depth"] },
    ),
    outputSchema: s.unknownObject("The flomo tag tree returned by MCP."),
  },
  {
    name: "tag_search",
    description: "Search flomo tags through the flomo Max MCP server.",
    inputSchema: s.object(
      "Input for searching flomo tags.",
      {
        keywords: s.string("Keywords to search for in tag names."),
        limit: s.integer("Maximum number of tags to return."),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.record(
      s.nullable(
        s.array(
          "flomo tags returned by MCP.",
          s.object("One flomo tag.", {
            name: s.string("The tag name."),
          }),
        ),
      ),
      { description: "A flomo MCP object whose values are tag arrays." },
    ),
  },
  {
    name: "tag_rename",
    description: "Rename flomo tags through the flomo Max MCP server and update associated memos.",
    inputSchema: s.object(
      "Input for renaming a flomo tag.",
      {
        old_tag: s.string("The existing tag name to rename."),
        new_tag: s.string("The new tag name."),
        max_memos: s.integer("Maximum number of associated memos to update."),
      },
      { optional: ["new_tag", "max_memos"] },
    ),
    outputSchema: s.object(
      "The result of renaming a flomo tag.",
      {
        old_tag: s.string("The previous tag name."),
        new_tag: s.string("The new tag name."),
        matched_memos: s.integer("The number of matching memos."),
        updated_memos: s.integer("The number of updated memos."),
        updated_tags: s.integer("The number of updated tag records."),
        notify_settings_job_enqueued: s.boolean("Whether a notification-settings update job was enqueued."),
        warnings: s.nullable(s.array("Warnings returned by flomo.", s.string("One warning message."))),
      },
      { optional: ["warnings"] },
    ),
  },
  {
    name: "memory_user",
    description: "Read the generated flomo memory user profile through the flomo Max MCP server.",
    inputSchema: s.object("Input for reading the flomo memory user profile.", {}),
    outputSchema: contentOutputSchema,
  },
  {
    name: "memory_context",
    description: "Read the generated flomo memory context through the flomo Max MCP server.",
    inputSchema: s.object("Input for reading the flomo memory context.", {}),
    outputSchema: contentOutputSchema,
  },
  {
    name: "get_daily_review",
    description: "Fetch flomo daily review content through the flomo Max MCP server.",
    inputSchema: s.object("Input for fetching the flomo daily review.", {}),
    outputSchema: mcpMemoListOutputSchema,
  },
  {
    name: "get_format_guide",
    description: "Fetch flomo memo formatting guidance through the flomo Max MCP server.",
    inputSchema: s.object("Input for fetching the flomo memo format guide.", {}),
    outputSchema: contentOutputSchema,
  },
  {
    name: "get_tag_guide",
    description: "Fetch flomo tag usage guidance through the flomo Max MCP server.",
    inputSchema: s.object("Input for fetching the flomo tag guide.", {}),
    outputSchema: contentOutputSchema,
  },
];

export const flomoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_memo",
    description: "Create a flomo memo by sending markdown or plain text to the incoming webhook.",
    requiredScopes: [],
    inputSchema: createMemoInputSchema,
    outputSchema: s.anyOf(
      "The response from creating a flomo memo through either the webhook API or the flomo MCP server.",
      [createMemoOutputSchema, createMemoMcpOutputSchema],
    ),
  }),
  ...flomoMcpToolDefinitions.map((tool) =>
    defineProviderAction(service, {
      name: tool.name,
      description: tool.description,
      requiredScopes: [],
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
    }),
  ),
];

export type FlomoActionName =
  | "create_memo"
  | "memo_update"
  | "memo_search"
  | "memo_batch_get"
  | "memo_recommended"
  | "tag_tree"
  | "tag_search"
  | "tag_rename"
  | "memory_user"
  | "memory_context"
  | "get_daily_review"
  | "get_format_guide"
  | "get_tag_guide";

export type FlomoMcpToolName = Exclude<FlomoActionName, "create_memo">;
