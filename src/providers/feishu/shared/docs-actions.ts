import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuDocsProviderScopes = {
  create: "docx:document:create",
  read: "docx:document:readonly",
  write: "docx:document:write_only",
  search: "search:docs:read",
};
const documentIdSchema = s.string("The document ID from a Feishu docx URL, without the URL path or query.", {
  minLength: 1,
});
const documentFormatSchema = s.stringEnum("The document content format.", ["xml", "markdown"]);
const looseDocumentSchema = s.looseRequiredObject(
  "The document payload returned by Feishu.",
  {
    document_id: s.string("The Feishu document ID."),
    revision_id: s.integer("The current document revision ID."),
    title: s.string("The document title."),
    content: s.string("The document content in the requested format."),
    url: s.string("The Feishu URL for the document."),
  },
  {
    optional: ["document_id", "revision_id", "title", "content", "url"],
  },
);
const documentOutputSchema = s.object(
  "A Feishu document operation result.",
  {
    document: {
      ...looseDocumentSchema,
      description: "The returned document payload.",
    },
  },
  {
    optional: [],
  },
);
const taskOutputSchema = s.looseRequiredObject(
  "A Feishu document background task result.",
  {
    taskId: s.string("The task ID used to query the operation status."),
    status: s.string("The current task status."),
    historyVersionId: s.string("The history version involved in the operation."),
    pollAfterMs: s.integer("The recommended delay before checking status again."),
    failedBlockTokens: s.array(
      "Block tokens that failed during a partially successful operation.",
      s.string("A failed block token."),
    ),
  },
  {
    optional: ["taskId", "status", "historyVersionId", "pollAfterMs", "failedBlockTokens"],
  },
);
export function createFeishuDocsActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "create_document",
      operationType: "write",
      description:
        "Create a Feishu document from Docx XML or Markdown content, optionally inside a folder or Wiki node.",
      requiredScopes: [feishuDocsProviderScopes.create],
      providerPermissions: [feishuDocsProviderScopes.create],
      inputSchema: s.object(
        "Provide the content and destination for the new document.",
        {
          content: s.string("The complete document content in the selected format.", {
            minLength: 1,
          }),
          title: s.string(
            "A document title to prepend to the content. For XML, the title is escaped before insertion.",
            { minLength: 1 },
          ),
          format: documentFormatSchema,
          parentToken: s.string("The destination folder token or Wiki node token.", {
            minLength: 1,
          }),
          parentPosition: s.string(
            "A named destination position such as `my_library`; do not combine it with `parentToken`.",
            { minLength: 1 },
          ),
          referenceMap: s.looseObject("A reference map used to preserve rich HTML5-block resources."),
        },
        {
          optional: ["title", "format", "parentToken", "parentPosition", "referenceMap"],
        },
      ),
      outputSchema: documentOutputSchema,
    }),
    defineProviderAction(service, {
      name: "fetch_document",
      operationType: "read",
      description:
        "Fetch a Feishu document as Docx XML or Markdown, with optional structural detail and partial-read selection.",
      requiredScopes: [feishuDocsProviderScopes.read],
      providerPermissions: [feishuDocsProviderScopes.read],
      inputSchema: s.object(
        "Identify the document and choose how much content to fetch.",
        {
          documentId: documentIdSchema,
          format: documentFormatSchema,
          detail: s.stringEnum("The structural detail included in XML output.", ["simple", "with_ids", "full"]),
          lang: s.string("The language used to display cited users, such as `zh-CN`.", {
            minLength: 1,
          }),
          revisionId: s.integer("The document revision ID; omit to read the latest revision.", {
            minimum: 1,
          }),
          scope: s.stringEnum("The portion of the document to read.", [
            "full",
            "outline",
            "range",
            "keyword",
            "section",
          ]),
          startBlockId: s.string("The first block ID for range or section reads.", {
            minLength: 1,
          }),
          endBlockId: s.string("The final block ID for a range read; `-1` means the end of the document.", {
            minLength: 1,
          }),
          keyword: s.string("The query used by keyword reads.", { minLength: 1 }),
          contextBefore: s.integer("The number of top-level sibling blocks to include before a partial match.", {
            minimum: 0,
          }),
          contextAfter: s.integer("The number of top-level sibling blocks to include after a partial match.", {
            minimum: 0,
          }),
          maxDepth: s.integer(
            "The maximum subtree depth; `-1` means unlimited and `0` means the selected block only.",
            { minimum: -1 },
          ),
        },
        {
          optional: [
            "format",
            "detail",
            "lang",
            "revisionId",
            "scope",
            "startBlockId",
            "endBlockId",
            "keyword",
            "contextBefore",
            "contextAfter",
            "maxDepth",
          ],
        },
      ),
      outputSchema: documentOutputSchema,
    }),
    defineProviderAction(service, {
      name: "update_document",
      operationType: "destructive",
      description:
        "Update a Feishu document with a high-level text or block operation instead of manually orchestrating docx block APIs.",
      requiredScopes: [feishuDocsProviderScopes.write, feishuDocsProviderScopes.read],
      providerPermissions: [feishuDocsProviderScopes.write, feishuDocsProviderScopes.read],
      inputSchema: s.object(
        "Identify the document and describe one update operation.",
        {
          documentId: documentIdSchema,
          command: s.stringEnum("The document update operation.", [
            "replace_text",
            "delete_blocks",
            "insert_after",
            "copy_after",
            "replace_block",
            "move_after",
            "overwrite",
            "append",
          ]),
          format: documentFormatSchema,
          content: s.string("The replacement, inserted, or appended document content."),
          pattern: s.string("The text matched by `replace_text`."),
          blockId: s.string("The target block ID, or comma-separated block IDs for `delete_blocks`.", { minLength: 1 }),
          sourceBlockIds: s.array(
            "The source block IDs used by copy or move operations.",
            s.string("A source block ID.", { minLength: 1 }),
            { minItems: 1 },
          ),
          revisionId: s.integer("The base document revision ID; `-1` means the latest revision.", {
            minimum: -1,
          }),
          referenceMap: s.looseObject("A reference map accompanying rich content in supported write operations."),
        },
        {
          optional: ["format", "content", "pattern", "blockId", "sourceBlockIds", "revisionId", "referenceMap"],
        },
      ),
      outputSchema: documentOutputSchema,
    }),
    defineProviderAction(service, {
      name: "search_documents",
      operationType: "read",
      description: "Search Feishu documents, Wiki nodes, spreadsheets, Base apps, files, folders, and slides.",
      requiredScopes: [feishuDocsProviderScopes.search],
      providerPermissions: [feishuDocsProviderScopes.search],
      inputSchema: s.object(
        "Provide a search query, optional document and Wiki filters, and pagination.",
        {
          query: s.string("The search text; it may be empty when filters are provided.", {
            maxLength: 30,
          }),
          docFilter: s.looseObject("The Search v2 document filter, such as folder_tokens, doc_types, or time ranges."),
          wikiFilter: s.looseObject("The Search v2 Wiki filter, such as space_ids, doc_types, or time ranges."),
          pageSize: s.positiveInteger("The number of results to return, from 1 to 20.", {
            maximum: 20,
          }),
          pageToken: s.string("The pagination token returned by a previous search.", {
            minLength: 1,
          }),
        },
        {
          optional: ["query", "docFilter", "wikiFilter", "pageSize", "pageToken"],
        },
      ),
      outputSchema: s.object(
        "A page of matching Feishu resources.",
        {
          results: s.array(
            "The matching resources.",
            s.looseObject("A Search v2 result with title, type, metadata, and URL fields."),
          ),
          total: s.integer("The total number of matches reported by Feishu."),
          hasMore: s.boolean("Whether another page is available."),
          pageToken: s.string("The pagination token for the next page."),
          notice: s.string("An optional search notice returned by Feishu."),
        },
        {
          optional: ["total", "pageToken", "notice"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "list_document_history",
      operationType: "read",
      description: "List historical versions of a Feishu docx document.",
      requiredScopes: [feishuDocsProviderScopes.read],
      providerPermissions: [feishuDocsProviderScopes.read],
      inputSchema: s.object(
        "Identify the document and page through its history.",
        {
          documentId: documentIdSchema,
          pageSize: s.positiveInteger("The number of history entries to return, from 1 to 20.", {
            maximum: 20,
          }),
          pageToken: s.string("The pagination token returned by the previous page.", {
            minLength: 1,
          }),
        },
        {
          optional: ["pageSize", "pageToken"],
        },
      ),
      outputSchema: s.object(
        "A page of document history entries.",
        {
          entries: s.array(
            "The document history entries.",
            s.looseObject("A document history entry returned by Feishu."),
          ),
          hasMore: s.boolean("Whether another page is available."),
          pageToken: s.string("The pagination token for the next page."),
        },
        {
          optional: ["pageToken"],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "revert_document",
      operationType: "destructive",
      description: "Revert a Feishu docx document to a historical version and return the background task state.",
      requiredScopes: [feishuDocsProviderScopes.write, feishuDocsProviderScopes.read],
      providerPermissions: [feishuDocsProviderScopes.write, feishuDocsProviderScopes.read],
      inputSchema: s.object(
        "Identify the document and history version to restore.",
        {
          documentId: documentIdSchema,
          historyVersionId: s.string("The positive history version ID returned by `list_document_history`.", {
            minLength: 1,
          }),
          waitTimeoutMs: s.integer(
            "How long Feishu should wait for the revert before returning, from 0 to 30000 milliseconds.",
            { minimum: 0, maximum: 30000 },
          ),
        },
        {
          optional: ["waitTimeoutMs"],
        },
      ),
      outputSchema: taskOutputSchema,
    }),
    defineProviderAction(service, {
      name: "get_document_revert_status",
      operationType: "read",
      description: "Get the status of a Feishu document history revert task.",
      requiredScopes: [feishuDocsProviderScopes.read],
      providerPermissions: [feishuDocsProviderScopes.read],
      inputSchema: s.object(
        "Identify the document and revert task.",
        {
          documentId: documentIdSchema,
          taskId: s.string("The task ID returned by `revert_document`.", { minLength: 1 }),
        },
        {
          optional: [],
        },
      ),
      outputSchema: taskOutputSchema,
    }),
  ];
}
