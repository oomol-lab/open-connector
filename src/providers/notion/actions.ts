import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { notionReadScopes, notionWriteScopes } from "./scopes.ts";

const service = "notion";

const notionValue = s.unknown("A Notion API field value.");
const notionObject = s.record(notionValue, { description: "A Notion API object." });
const notionProperties = s.record(notionValue, {
  description: "Notion properties keyed by property name.",
});
const notionRichText = s.array(notionObject, { description: "Notion rich text objects." });
const notionParent = s.record(notionValue, {
  description: "The official Notion parent object.",
});
const pagination = {
  next_cursor: s.nullable(s.string({ description: "Cursor for the next page." })),
  has_more: s.boolean({ description: "Whether more results are available." }),
};

const user = s.looseObject(
  {
    object: s.literal("user", { description: "The Notion object type." }),
    id: s.string({ description: "The Notion user ID." }),
    name: s.nullable(s.string({ description: "The user's display name." })),
    avatar_url: s.nullable(s.string({ description: "The user's avatar URL." })),
    type: s.stringEnum(["person", "bot"], { description: "The user type." }),
    person: s.looseObject({
      email: s.email("The person's email address."),
    }),
    bot: notionObject,
  },
  { description: "A Notion user object." },
);

const page = s.looseObject(
  {
    object: s.literal("page", { description: "The Notion object type." }),
    id: s.string({ description: "The page ID." }),
    created_time: s.dateTime("The time when the page was created."),
    last_edited_time: s.dateTime("The time when the page was last edited."),
    parent: notionParent,
    properties: notionProperties,
    url: s.url("The canonical Notion URL for the page."),
    archived: s.boolean({ description: "Whether the page is archived." }),
    in_trash: s.boolean({ description: "Whether the page is in the trash." }),
  },
  { description: "A Notion page object." },
);

const block = s.looseObject(
  {
    object: s.literal("block", { description: "The Notion object type." }),
    id: s.string({ description: "The block ID." }),
    parent: notionParent,
    type: s.string({ description: "The block type." }),
    has_children: s.boolean({ description: "Whether this block has child blocks." }),
    in_trash: s.boolean({ description: "Whether the block is in the trash." }),
  },
  { description: "A Notion block object." },
);

const database = s.looseObject(
  {
    object: s.literal("database", { description: "The Notion object type." }),
    id: s.string({ description: "The database ID." }),
    title: notionRichText,
    description: notionRichText,
    parent: notionParent,
    url: s.url("The canonical Notion URL for the database."),
    in_trash: s.boolean({ description: "Whether the database is in the trash." }),
  },
  { description: "A Notion database object." },
);

const dataSource = s.looseObject(
  {
    object: s.literal("data_source", { description: "The Notion object type." }),
    id: s.string({ description: "The data source ID." }),
    title: notionRichText,
    properties: notionProperties,
    parent: notionParent,
    url: s.url("The canonical Notion URL for the data source."),
    in_trash: s.boolean({ description: "Whether the data source is in the trash." }),
  },
  { description: "A Notion data source object." },
);

const listOutput = (items: JsonSchema, description: string): JsonSchema =>
  s.object(
    {
      object: s.literal("list", { description: "The Notion object type." }),
      results: s.array(items, { description: "Returned Notion objects." }),
      ...pagination,
    },
    {
      required: ["object", "results", "has_more"],
      additionalProperties: true,
      description,
    },
  );

const idInput = (key: string, description: string): JsonSchema =>
  s.object(
    {
      [key]: s.string({ minLength: 1, description }),
    },
    {
      required: [key],
      description: "The input payload for this action.",
    },
  );

const paginationInput = (idKey?: string, idDescription?: string): JsonSchema =>
  s.object(
    {
      ...(idKey ? { [idKey]: s.string({ minLength: 1, description: idDescription }) } : {}),
      pageSize: s.integer({
        minimum: 1,
        maximum: 100,
        description: "The number of results per page.",
      }),
      startCursor: s.string({ description: "The cursor for pagination." }),
    },
    {
      required: idKey ? [idKey] : [],
      description: "The input payload for this action.",
    },
  );

const richTextArray = (description: string): JsonSchema => s.array(notionObject, { description });

const pageParent = s.oneOf(
  [
    s.object(
      {
        page_id: s.string({ minLength: 1, description: "The parent page ID." }),
        type: s.literal("page_id", { description: "Always page_id." }),
      },
      { required: ["page_id"], description: "Page parent." },
    ),
    s.object(
      {
        data_source_id: s.string({ minLength: 1, description: "The parent data source ID." }),
        type: s.literal("data_source_id", { description: "Always data_source_id." }),
      },
      { required: ["data_source_id"], description: "Data source parent." },
    ),
    s.object(
      {
        workspace: s.literal(true, { description: "Create a private workspace page." }),
      },
      { required: ["workspace"], description: "Workspace parent." },
    ),
  ],
  { description: "The official Notion parent object." },
);

const action = (input: {
  name: string;
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition =>
  defineProviderAction(service, {
    name: input.name,
    description: input.description,
    requiredScopes: input.requiredScopes,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
  });

export const notionActions: ActionDefinition[] = [
  action({
    name: "search",
    description:
      "Search Notion pages and data sources with optional filter, sort, and pagination controls.",
    requiredScopes: notionReadScopes,
    inputSchema: s.object(
      {
        query: s.string({ description: "The search query text." }),
        filter: s.record(notionValue, { description: "The filter object to narrow results." }),
        sort: s.record(notionValue, { description: "The sort object to order results." }),
        pageSize: s.integer({
          minimum: 1,
          maximum: 100,
          description: "The number of results per page.",
        }),
        startCursor: s.string({ description: "The cursor for pagination." }),
      },
      {
        required: ["query"],
        description: "The input payload for this action.",
      },
    ),
    outputSchema: listOutput(s.union([page, dataSource]), "Search results returned by Notion."),
  }),
  action({
    name: "get_page",
    description:
      "Get a Notion page together with its first-level child blocks. This is an aggregate helper over page retrieval plus block-children listing.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("pageId", "The page ID to retrieve."),
    outputSchema: s.object(
      {
        page,
        block_children: listOutput(block, "First-level child blocks."),
      },
      { required: ["page", "block_children"], description: "Page with child block list." },
    ),
  }),
  action({
    name: "create_page",
    description:
      "Create a Notion page under a parent page, data source, or workspace-level private area.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        parent: pageParent,
        parentId: s.string({ description: "Simple parent page ID." }),
        title: s.string({ description: "Simple page title used with parentId." }),
        properties: notionProperties,
        children: s.array(notionObject, { description: "Child blocks to create with the page." }),
        markdown: s.string({ description: "Enhanced Markdown content for the page." }),
        icon: notionObject,
        cover: notionObject,
        template: notionObject,
      },
      { description: "The input payload for this action." },
    ),
    outputSchema: page,
  }),
  action({
    name: "update_page",
    description:
      "Update a Notion page's properties, title, icon, cover, trash status, or locked state.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        pageId: s.string({ minLength: 1, description: "The page ID to update." }),
        title: s.string({ description: "The new page title." }),
        properties: notionProperties,
        icon: notionObject,
        cover: notionObject,
        template: notionObject,
        in_trash: s.boolean({ description: "Whether the page is in the trash." }),
        is_locked: s.boolean({ description: "Whether the page is locked." }),
        erase_content: s.boolean({ description: "Whether to erase page content." }),
      },
      { required: ["pageId"], description: "The input payload for this action." },
    ),
    outputSchema: page,
  }),
  action({
    name: "move_page",
    description: "Move a Notion page under another page or data source.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        pageId: s.string({ minLength: 1, description: "The page ID to move." }),
        parent: pageParent,
      },
      { required: ["pageId", "parent"], description: "The input payload for this action." },
    ),
    outputSchema: page,
  }),
  action({
    name: "append_block",
    description: "Append a single paragraph block to a Notion page.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        pageId: s.string({ minLength: 1, description: "The page ID to append to." }),
        text: s.string({ minLength: 1, description: "Paragraph text content." }),
      },
      { required: ["pageId", "text"], description: "The input payload for this action." },
    ),
    outputSchema: listOutput(block, "Appended block children response."),
  }),
  action({
    name: "retrieve_page",
    description: "Retrieve a Notion page's properties and metadata by page ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("pageId", "The page ID to retrieve."),
    outputSchema: page,
  }),
  action({
    name: "retrieve_page_markdown",
    description: "Retrieve a Notion page or block subtree rendered as enhanced Markdown.",
    requiredScopes: notionReadScopes,
    inputSchema: s.object(
      {
        pageId: s.string({ minLength: 1, description: "The page or block ID." }),
        includeTranscript: s.boolean({
          description: "Whether to include meeting note transcripts.",
        }),
      },
      { required: ["pageId"], description: "The input payload for this action." },
    ),
    outputSchema: notionObject,
  }),
  action({
    name: "update_page_markdown",
    description: "Update a Notion page's content as enhanced Markdown.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        pageId: s.string({ minLength: 1, description: "The page ID to update." }),
        type: s.string({ minLength: 1, description: "Markdown update operation type." }),
        insert_content: notionObject,
        replace_content_range: notionObject,
        update_content: notionObject,
        replace_content: notionObject,
      },
      { required: ["pageId", "type"], description: "The input payload for this action." },
    ),
    outputSchema: notionObject,
  }),
  action({
    name: "retrieve_page_property",
    description: "Retrieve a specific property item from a Notion page.",
    requiredScopes: notionReadScopes,
    inputSchema: s.object(
      {
        pageId: s.string({ minLength: 1, description: "The page ID." }),
        propertyId: s.string({ minLength: 1, description: "The property ID." }),
        pageSize: s.integer({
          minimum: 1,
          maximum: 100,
          description: "The number of property items per page.",
        }),
        startCursor: s.string({ description: "The cursor for pagination." }),
      },
      { required: ["pageId", "propertyId"], description: "The input payload for this action." },
    ),
    outputSchema: notionObject,
  }),
  action({
    name: "list_users",
    description: "List users in the Notion workspace with pagination.",
    requiredScopes: notionReadScopes,
    inputSchema: paginationInput(),
    outputSchema: listOutput(user, "Workspace users returned by Notion."),
  }),
  action({
    name: "retrieve_user",
    description: "Retrieve a Notion user by user ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("userId", "The user ID to retrieve."),
    outputSchema: user,
  }),
  action({
    name: "retrieve_block",
    description: "Retrieve a Notion block by block ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("blockId", "The block ID to retrieve."),
    outputSchema: block,
  }),
  action({
    name: "list_block_children",
    description: "List the direct child blocks under a Notion block with pagination.",
    requiredScopes: notionReadScopes,
    inputSchema: paginationInput("blockId", "The parent block ID."),
    outputSchema: listOutput(block, "Child blocks returned by Notion."),
  }),
  action({
    name: "append_block_children",
    description: "Append raw Notion child blocks to an existing parent block.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        blockId: s.string({ minLength: 1, description: "The parent block ID." }),
        children: s.array(notionObject, { description: "Child block objects to append." }),
        position: notionObject,
      },
      { required: ["blockId", "children"], description: "The input payload for this action." },
    ),
    outputSchema: listOutput(block, "Appended block children response."),
  }),
  action({
    name: "update_block",
    description: "Update a Notion block using raw block fields.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      { blockId: s.string({ minLength: 1, description: "The block ID to update." }) },
      {
        required: ["blockId"],
        additionalProperties: true,
        description: "The input payload for this action.",
      },
    ),
    outputSchema: block,
  }),
  action({
    name: "delete_block",
    description: "Archive a Notion block through the official delete endpoint.",
    requiredScopes: notionWriteScopes,
    inputSchema: idInput("blockId", "The block ID to delete."),
    outputSchema: block,
  }),
  action({
    name: "create_database",
    description: "Create a Notion database container under a parent page or workspace.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        parent: notionParent,
        title: richTextArray("Database title rich text objects."),
        description: richTextArray("Database description rich text objects."),
        is_inline: s.boolean({ description: "Whether the database is inline." }),
        initial_data_source: notionObject,
        icon: notionObject,
        cover: notionObject,
      },
      { required: ["parent"], description: "The input payload for this action." },
    ),
    outputSchema: database,
  }),
  action({
    name: "retrieve_database",
    description: "Retrieve a Notion database's metadata and schema by database ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("databaseId", "The database ID to retrieve."),
    outputSchema: database,
  }),
  action({
    name: "update_database",
    description: "Update a Notion database container.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        databaseId: s.string({ minLength: 1, description: "The database ID to update." }),
        parent: notionParent,
        title: richTextArray("Database title rich text objects."),
        description: richTextArray("Database description rich text objects."),
        is_inline: s.boolean({ description: "Whether the database is inline." }),
        icon: notionObject,
        cover: notionObject,
        in_trash: s.boolean({ description: "Whether the database is in the trash." }),
        is_locked: s.boolean({ description: "Whether the database is locked." }),
      },
      { required: ["databaseId"], description: "The input payload for this action." },
    ),
    outputSchema: database,
  }),
  action({
    name: "create_data_source",
    description: "Create a Notion data source under a parent database.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        parent: notionParent,
        properties: notionProperties,
        title: richTextArray("Data source title rich text objects."),
        icon: notionObject,
      },
      { required: ["parent", "properties"], description: "The input payload for this action." },
    ),
    outputSchema: dataSource,
  }),
  action({
    name: "retrieve_data_source",
    description: "Retrieve a Notion data source by data source ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("dataSourceId", "The data source ID to retrieve."),
    outputSchema: dataSource,
  }),
  action({
    name: "update_data_source",
    description:
      "Update a Notion data source's title, icon, properties schema, parent, or trash status.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.object(
      {
        dataSourceId: s.string({ minLength: 1, description: "The data source ID to update." }),
        title: richTextArray("Data source title rich text objects."),
        description: richTextArray("Data source description rich text objects."),
        icon: notionObject,
        properties: notionProperties,
        parent: notionParent,
        in_trash: s.boolean({ description: "Whether the data source is in the trash." }),
      },
      { required: ["dataSourceId"], description: "The input payload for this action." },
    ),
    outputSchema: dataSource,
  }),
  action({
    name: "query_data_source",
    description:
      "Query a Notion data source with filters, sorts, pagination, and optional property filtering.",
    requiredScopes: notionReadScopes,
    inputSchema: s.object(
      {
        dataSourceId: s.string({ minLength: 1, description: "The data source ID to query." }),
        filter: s.record(notionValue, { description: "The filter object to narrow results." }),
        sorts: s.array(notionObject, { description: "The sorts to apply." }),
        pageSize: s.integer({
          minimum: 1,
          maximum: 100,
          description: "The number of results per page.",
        }),
        startCursor: s.string({ description: "The cursor for pagination." }),
        filterProperties: s.array(s.string({ minLength: 1 }), {
          description: "Property IDs to include.",
        }),
        in_trash: s.boolean({ description: "Whether to query trashed pages." }),
        result_type: s.string({ description: "The Notion result type filter." }),
      },
      { required: ["dataSourceId"], description: "The input payload for this action." },
    ),
    outputSchema: listOutput(page, "Data source query results returned by Notion."),
  }),
  action({
    name: "list_data_source_templates",
    description: "List templates available on a Notion data source.",
    requiredScopes: notionReadScopes,
    inputSchema: paginationInput(
      "dataSourceId",
      "The data source ID whose templates should be listed.",
    ),
    outputSchema: listOutput(notionObject, "Data source templates returned by Notion."),
  }),
];
