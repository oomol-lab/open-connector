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

const comment = s.looseObject(
  {
    object: s.literal("comment", { description: "The Notion object type." }),
    id: s.string({ description: "The comment ID." }),
    parent: notionParent,
    discussion_id: s.string({ description: "The discussion thread the comment belongs to." }),
    created_time: s.dateTime("The time when the comment was created."),
    last_edited_time: s.dateTime("The time when the comment was last edited."),
    created_by: notionObject,
    rich_text: notionRichText,
  },
  { description: "A Notion comment object." },
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
    idKey
      ? {
          [idKey]: s.string({ minLength: 1, description: idDescription }),
          pageSize: s.integer({
            minimum: 1,
            maximum: 100,
            description: "The number of results per page.",
          }),
          startCursor: s.string({ description: "The cursor for pagination." }),
        }
      : {
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

/**
 * `retrieve_page_markdown`'s output, DECLARED rather than a loose object.
 *
 * Every other notion action forwards Notion's body verbatim under a
 * `notionObject`, which is right for objects whose shape belongs to Notion. A
 * rendered page is different: it is one row a consumer will map columns onto,
 * and a declared schema is what lets a consumer's fingerprint of this action
 * catch an upstream rename at registration instead of at scan time.
 *
 * **Declaring it may not silently narrow it.** This action shipped with the
 * provider — SDK and CLI callers already read the fields Notion's own body
 * carries. So Notion's fields keep NOTION'S names and are forwarded
 * unchanged, and the two fields this action adds are additive. An earlier
 * revision of this schema renamed `unknown_block_ids` to `unknownBlockIds`
 * and dropped `object`/`id`, which would have broken every existing caller on
 * upgrade for no gain: a consumer mapping columns can read a snake_case key
 * as easily as a camelCase one.
 *
 * `additionalProperties: true`, not the `s.object` default: the executor
 * forwards Notion's body with a spread, so keys Notion adds beside the
 * declared ones (`request_id` today, whatever comes next) stay on the wire,
 * and a schema that closed the object would fail validation against the very
 * body it describes.
 */
const notionPageMarkdownSchema = s.object(
  {
    // ---- Notion's own, forwarded verbatim ------------------------------
    // Not required: they are Notion's to send, and declaring them mandatory
    // would turn an upstream omission into a validation failure on a render
    // that is otherwise perfectly usable.
    object: s.string({ description: "Notion's object tag for the rendered result." }),
    id: s.string({ description: "The id Notion echoes for the rendered page, in Notion's own spelling." }),
    markdown: s.string({
      description: "The page rendered as enhanced Markdown. An empty string for a page with no content.",
    }),
    truncated: s.boolean({
      description:
        "Whether the render stopped short of the whole page (Notion renders roughly 20,000 blocks at most). Resubmit the ids in unknown_block_ids to fetch what was left out.",
    }),
    unknown_block_ids: s.array(s.string({ description: "A block id." }), {
      description:
        "Blocks rendered as <unknown>: truncated subtrees, children this grant cannot read, and unsupported block types. Non-empty on many complete pages, so not on its own a sign of a partial render.",
    }),

    // ---- Constructed here, and additive --------------------------------
    // camelCase, matching this provider's convention for fields it builds
    // rather than forwards (see `notionCurrentUserSchema`).
    pageId: s.string({
      description:
        "The page or block id the render was requested for, exactly as given in the input. Notion may spell an id dashed or undashed in its own body, so a consumer joining rows to bindings needs the spelling it asked with.",
    }),
    lastEditedTime: s.dateTime(
      "When the page or block was last edited, read from its own object — the markdown response carries no revision.",
    ),
  },
  {
    required: ["markdown", "truncated", "unknown_block_ids", "pageId", "lastEditedTime"],
    additionalProperties: true,
    description: "A Notion page rendered as Markdown, with its revision and how complete the render was.",
  },
);

/**
 * `get_current_user`'s output. Read off what is stored with the credential,
 * never by calling `GET /users/me` at action time: that endpoint describes
 * the BOT, and the workspace id and owning user it does carry (under `bot`)
 * were already recorded by the validator, next to the OAuth grant's own
 * `workspace_id` and `owner`.
 */
const notionCurrentUserSchema = s.object(
  {
    workspaceId: s.string({ description: "The Notion workspace the grant was issued in." }),
    workspaceName: s.nullable(s.string({ description: "The workspace's display name, when the grant carried one." })),
    userId: s.nullable(
      s.string({ description: "The person who authorized the grant. Null when the grant names no user." }),
    ),
    userName: s.nullable(s.string({ description: "That person's display name, when the grant carried one." })),
    isBot: s.boolean({ description: "Whether the credential resolves to a bot rather than a person." }),
  },
  {
    required: ["workspaceId", "workspaceName", "userId", "userName", "isBot"],
    description: "The workspace and owning user of the connected Notion credential.",
  },
);

const action = (input: {
  name: string;
  operationType: ActionDefinition["operationType"];
  description: string;
  requiredScopes: string[];
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition =>
  defineProviderAction(service, {
    name: input.name,
    operationType: input.operationType,
    description: input.description,
    requiredScopes: input.requiredScopes,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
  });

export const notionActions: ActionDefinition[] = [
  action({
    name: "get_current_user",
    operationType: "read",
    description:
      "The workspace and owning user of the connected Notion credential, read from what was stored with it: the OAuth grant, or the bot object recorded when the credential was validated. Makes no API call. An internal integration answers with its workspace and no user.",
    requiredScopes: [],
    inputSchema: s.object({}),
    outputSchema: notionCurrentUserSchema,
  }),
  action({
    name: "search",
    operationType: "read",
    description: "Search Notion pages and data sources with optional filter, sort, and pagination controls.",
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
    operationType: "read",
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
    operationType: "write",
    description: "Create a Notion page under a parent page, data source, or workspace-level private area.",
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
    operationType: "destructive",
    description: "Update a Notion page's properties, title, icon, cover, trash status, or locked state.",
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
    operationType: "write",
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
    operationType: "write",
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
    operationType: "read",
    description: "Retrieve a Notion page's properties and metadata by page ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("pageId", "The page ID to retrieve."),
    outputSchema: page,
  }),
  action({
    name: "retrieve_page_markdown",
    operationType: "read",
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
    outputSchema: notionPageMarkdownSchema,
  }),
  action({
    name: "update_page_markdown",
    operationType: "write",
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
    operationType: "read",
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
    operationType: "read",
    description: "List users in the Notion workspace with pagination.",
    requiredScopes: notionReadScopes,
    inputSchema: paginationInput(),
    outputSchema: listOutput(user, "Workspace users returned by Notion."),
  }),
  action({
    name: "retrieve_user",
    operationType: "read",
    description: "Retrieve a Notion user by user ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("userId", "The user ID to retrieve."),
    outputSchema: user,
  }),
  action({
    name: "retrieve_block",
    operationType: "read",
    description: "Retrieve a Notion block by block ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("blockId", "The block ID to retrieve."),
    outputSchema: block,
  }),
  action({
    name: "list_block_children",
    operationType: "read",
    description: "List the direct child blocks under a Notion block with pagination.",
    requiredScopes: notionReadScopes,
    inputSchema: paginationInput("blockId", "The parent block ID."),
    outputSchema: listOutput(block, "Child blocks returned by Notion."),
  }),
  action({
    name: "append_block_children",
    operationType: "write",
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
    operationType: "destructive",
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
    operationType: "destructive",
    description: "Archive a Notion block through the official delete endpoint.",
    requiredScopes: notionWriteScopes,
    inputSchema: idInput("blockId", "The block ID to delete."),
    outputSchema: block,
  }),
  action({
    name: "create_database",
    operationType: "write",
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
    operationType: "read",
    description: "Retrieve a Notion database's metadata and schema by database ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("databaseId", "The database ID to retrieve."),
    outputSchema: database,
  }),
  action({
    name: "update_database",
    operationType: "destructive",
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
    operationType: "write",
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
    operationType: "read",
    description: "Retrieve a Notion data source by data source ID.",
    requiredScopes: notionReadScopes,
    inputSchema: idInput("dataSourceId", "The data source ID to retrieve."),
    outputSchema: dataSource,
  }),
  action({
    name: "update_data_source",
    operationType: "destructive",
    description: "Update a Notion data source's title, icon, properties schema, parent, or trash status.",
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
    operationType: "read",
    description: "Query a Notion data source with filters, sorts, pagination, and optional property filtering.",
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
    operationType: "read",
    description: "List templates available on a Notion data source.",
    requiredScopes: notionReadScopes,
    inputSchema: paginationInput("dataSourceId", "The data source ID whose templates should be listed."),
    outputSchema: listOutput(notionObject, "Data source templates returned by Notion."),
  }),
  action({
    name: "list_comments",
    operationType: "read",
    description:
      "List the unresolved comments on a Notion page or block with pagination. Comments on a page's blocks are listed by the block's ID. The integration needs the read comments capability.",
    requiredScopes: notionReadScopes,
    inputSchema: paginationInput("blockId", "The page or block ID whose comments should be listed."),
    outputSchema: listOutput(comment, "Comments returned by Notion."),
  }),
  action({
    name: "create_comment",
    operationType: "write",
    description:
      "Create a Notion comment: on a page or block through parent, or as a reply in an existing discussion through discussion_id. The integration needs the insert comments capability.",
    requiredScopes: notionWriteScopes,
    inputSchema: s.requireExactlyOneProperty(
      s.object(
        {
          parent: notionParent,
          discussion_id: s.string({ minLength: 1, description: "The discussion thread to reply in." }),
          rich_text: richTextArray("The comment body as Notion rich text objects."),
          attachments: s.array(notionObject, { description: "File upload attachments for the comment." }),
          display_name: notionObject,
        },
        { required: ["rich_text"], description: "The input payload for this action." },
      ),
      ["parent", "discussion_id"],
    ),
    outputSchema: comment,
  }),
];
