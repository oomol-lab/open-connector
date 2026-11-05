import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "oomol_rag";
const stableId = (description: string) =>
  s.string(description, { minLength: 1, maxLength: 64, pattern: "^[A-Za-z0-9_-]+$" });
const articleId = stableId("The article identifier. Use the same ID for retries of the same creation intent.");
const title = s.nonWhitespaceString("The article title.", { maxLength: 200 });
const revision = s.integer(
  "The revision returned by get_article or the most recent save. A conflict requires reading and reconciling the latest article, never blindly overwriting it.",
  { minimum: 1 },
);
const content = s.object(
  "Native BlockNote content (format version 3). Read an existing article before editing; preserve unsupported blocks and IDs.",
  {
    type: s.literal("blocknote", { description: "The native document type." }),
    blocks: s.array(
      "BlockNote blocks with type, props, content and children as appropriate. The service validates block types and private asset references.",
      s.looseObject("A native BlockNote block.", {}),
      { maxItems: 20000 },
    ),
  },
);
const articleSchema = s.object(
  "A knowledge article and its independent draft and indexed revisions.",
  {
    id: s.string("The article identifier."),
    title: s.string("The article title."),
    formatVersion: s.integer("The stored editor format version."),
    content: s.looseObject(
      "Stored editor content. Version 3 is BlockNote; older versions may contain a legacy doc. Do not treat legacy content as BlockNote.",
      {},
    ),
    revision: s.integer("The current draft revision."),
    indexedRevision: s.nonNegativeInteger("The revision currently used by retrieval."),
    syncRevision: s.nonNegativeInteger("The revision targeted by the latest publication."),
    syncStatus: s.stringEnum("The index synchronization status.", ["draft", "syncing", "ready", "failed", "uncertain"]),
    syncError: s.string("Synchronization error, when present."),
    sourceFileId: s.string("Original file identifier, for converted articles."),
    sourceFilename: s.string("Original file name."),
    conversionWarnings: s.array("Warnings produced by file conversion.", s.string("A conversion warning.")),
    createdAt: s.dateTime("Creation timestamp."),
    updatedAt: s.dateTime("Last update timestamp."),
  },
  { optional: ["content", "syncError", "sourceFileId", "sourceFilename", "conversionWarnings"] },
);
const articleOutput = s.object("The article state.", { article: articleSchema });
const identityInput = s.object("The article to operate on.", { articleId });

const markdown = s.string(
  "Markdown source to convert to native BlockNote. Supports CommonMark and GFM headings, lists, task lists, tables, links and code. Empty input clears the body. HTML remains literal text; standalone HTTP(S) images become image blocks, inline images become links. Relative or unsafe URLs remain literal text with warnings. No remote content is fetched.",
  { maxLength: 200000 },
);
const markdownSaveId = stableId(
  "Stable save-operation ID. Reuse the same ID and exact payload after an uncertain result.",
);
const markdownOutput = s.object(
  "The saved draft and conversion warnings. Saving does not publish to the knowledge base.",
  {
    article: articleSchema,
    warnings: s.array(
      "Conversion warning codes describing content preserved as text or simplified; review them before publishing.",
      s.string("A conversion warning code."),
    ),
  },
);

export const oomolRagActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_article_from_markdown",
    operationType: "write",
    requiredScopes: [],
    description:
      "Create and save an editable article from Markdown as an unpublished draft. Requires stable articleId and saveId. Creation then saving are two requests: if saving fails, a blank draft may remain; retry the identical IDs and payload to resume. Never overwrites an existing edited article; a revision conflict requires inspection.",
    inputSchema: s.object("The new Markdown article and retry identities.", {
      articleId,
      saveId: markdownSaveId,
      title,
      markdown,
    }),
    outputSchema: markdownOutput,
  }),
  defineProviderAction(service, {
    name: "save_article_markdown",
    operationType: "write",
    requiredScopes: [],
    description:
      "Replace the entire article body and title from Markdown, saving a BlockNote draft at the expected revision. This is full replacement, not append or patch; blocks and private images absent from Markdown are removed from the draft. Read and reconcile before saving; on 409 never blindly retry with a new revision. Does not publish.",
    inputSchema: s.object("A full Markdown replacement of an existing draft.", {
      articleId,
      revision,
      saveId: markdownSaveId,
      title,
      markdown,
    }),
    outputSchema: markdownOutput,
  }),

  defineProviderAction(service, {
    name: "create_article",
    operationType: "write",
    requiredScopes: [],
    description:
      "Create an empty editable knowledge article as a draft. A caller-stable articleId prevents duplicate creation on retries; an existing ID returns its article without overwriting it.",
    inputSchema: s.object("A new article identity and title.", { articleId, title }),
    outputSchema: articleOutput,
  }),
  defineProviderAction(service, {
    name: "list_articles",
    operationType: "read",
    requiredScopes: [],
    description: "List knowledge articles with draft and synchronization metadata, without document bodies.",
    inputSchema: s.object(
      "Pagination options.",
      {
        cursor: s.string("The previous nextCursor."),
        limit: s.integer("Page size.", { minimum: 1, maximum: 100, default: 50 }),
      },
      { optional: ["cursor", "limit"] },
    ),
    outputSchema: s.object("An article page.", {
      articles: s.array("Articles in this page.", articleSchema),
      nextCursor: s.string("Next-page cursor; empty means the end."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_article",
    operationType: "read",
    requiredScopes: [],
    description:
      "Read the full editable article, its format version, revision and knowledge-base synchronization state.",
    inputSchema: identityInput,
    outputSchema: articleOutput,
  }),
  defineProviderAction(service, {
    name: "save_article_draft",
    operationType: "write",
    requiredScopes: [],
    description:
      "Save BlockNote content and title with optimistic revision checking. This only saves a draft; publish_article updates retrieval. Retry an uncertain request with the identical saveId, revision and body.",
    inputSchema: s.object("A versioned article draft.", {
      articleId,
      revision,
      saveId: stableId("Stable save-operation ID; reuse only for retries of this exact save."),
      title,
      content,
    }),
    outputSchema: articleOutput,
  }),
  defineProviderAction(service, {
    name: "publish_article",
    operationType: "write",
    requiredScopes: [],
    description:
      "Publish an exact saved revision to the knowledge base, replacing its previous index asynchronously. Retry uncertain transport outcomes with the same publishId and revision. Stop and inspect failed or uncertain synchronization states.",
    asyncLifecycle: { startActionId: "oomol_rag.publish_article", statusActionId: "oomol_rag.wait_for_article_ready" },
    inputSchema: s.object("The exact revision to publish.", {
      articleId,
      revision,
      publishId: stableId("Stable publication-operation ID; reuse for retries of this publication."),
    }),
    outputSchema: articleOutput,
  }),
  defineProviderAction(service, {
    name: "wait_for_article_ready",
    operationType: "read",
    requiredScopes: [],
    description:
      "Poll the latest article publication once. Ready means its syncRevision is indexed; a newer draft can still be unpublished. Compare syncRevision with your requested revision when tracking a particular publication.",
    asyncLifecycle: { startActionId: "oomol_rag.publish_article", statusActionId: "oomol_rag.wait_for_article_ready" },
    inputSchema: identityInput,
    outputSchema: articleOutput,
  }),
  defineProviderAction(service, {
    name: "delete_article",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Delete an article and exclude its index from retrieval. Underlying index cleanup is asynchronous; any original converted file is preserved.",
    inputSchema: identityInput,
    outputSchema: s.object("Deletion acceptance.", { articleId, deleted: s.boolean("Whether deletion was accepted.") }),
  }),
  defineProviderAction(service, {
    name: "retrieve",
    operationType: "read",
    description: "Retrieve the most relevant text chunks from the current OOMOL team's knowledge base.",
    requiredScopes: [],
    inputSchema: s.object(
      "A semantic knowledge-base retrieval request.",
      {
        query: s.string("The retrieval query.", { minLength: 1, maxLength: 8000 }),
        topK: s.integer("The maximum number of chunks to return.", {
          minimum: 1,
          maximum: 20,
          default: 5,
        }),
        enableReranking: s.nullable(
          s.boolean("Whether to rerank candidate chunks. Omitted or null uses the service default of true."),
        ),
      },
      { optional: ["topK", "enableReranking"] },
    ),
    outputSchema: s.object("Knowledge-base retrieval results.", {
      requestId: s.string("The retrieval request identifier."),
      items: s.array(
        "The relevant text chunks.",
        s.object(
          "A relevant knowledge-base chunk.",
          {
            articleId: s.string("The editable source article identifier, when the hit belongs to an article."),
            fileId: s.string("The source file identifier."),
            filename: s.string("The source file name."),
            text: s.string("The retrieved text chunk."),
            score: s.number("The retrieval relevance score."),
          },
          { optional: ["articleId"] },
        ),
      ),
    }),
  }),
];
