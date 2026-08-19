import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ima";

const notePageLimitSchema = (description: string): JsonSchema => s.positiveInteger(description, { maximum: 20 });
const knowledgeBasePageLimitSchema = (description: string): JsonSchema =>
  s.positiveInteger(description, { maximum: 20 });
const knowledgeItemPageLimitSchema = (description: string): JsonSchema =>
  s.positiveInteger(description, { maximum: 50 });

const stringMapSchema = s.record("A string-to-string map returned by IMA.", s.string("One returned string value."));
const notebookTypeSchema = s.stringEnum("The IMA notebook type.", ["user_created", "all_notes", "uncategorized"]);
const noteSortTypeSchema = s.stringEnum("The IMA note sorting mode.", ["modify_time", "create_time", "title", "size"]);
const noteSearchTypeSchema = s.stringEnum("The IMA note search field.", ["title", "content"]);
const noteContentTargetSchema = s.stringEnum("The target content format returned by IMA.", ["plain_text", "json"]);

const noteSchema = s.object("One normalized IMA note summary.", {
  noteId: s.string("The IMA note ID."),
  title: s.nullableString("The note title."),
  summary: s.nullableString("The note summary returned by IMA."),
  createTime: s.nullableInteger("The note creation time as a Unix timestamp in milliseconds."),
  modifyTime: s.nullableInteger("The note modification time as a Unix timestamp in milliseconds."),
  folderId: s.nullableString("The notebook ID that owns the note."),
  folderName: s.nullableString("The notebook name that owns the note."),
  highlightInfo: s.nullable(stringMapSchema),
});

const notebookSchema = s.object("One normalized IMA notebook summary.", {
  folderId: s.string("The IMA notebook folder ID."),
  name: s.nullableString("The notebook name."),
  noteCount: s.nullableInteger("The number of notes in the notebook."),
  createTime: s.nullableInteger("The notebook creation time as a Unix timestamp in milliseconds."),
  modifyTime: s.nullableInteger("The notebook modification time as a Unix timestamp in milliseconds."),
  parentFolderId: s.nullableString("The parent notebook folder ID."),
  folderType: s.nullable(notebookTypeSchema),
});

const knowledgeBaseSchema = s.object("One normalized IMA knowledge base summary.", {
  id: s.string("The IMA knowledge base ID."),
  name: s.nullableString("The knowledge base name."),
  coverUrl: s.nullableString("The knowledge base cover image URL."),
  description: s.nullableString("The knowledge base description."),
  recommendedQuestions: s.array(
    "The recommended questions configured for the knowledge base.",
    s.string("One recommended question returned by IMA."),
  ),
});

const knowledgeItemSchema = s.object("One normalized IMA knowledge-base item.", {
  itemType: s.stringEnum("The normalized item type.", ["knowledge", "folder"]),
  mediaId: s.nullableString("The knowledge media ID when the item is a file."),
  folderId: s.nullableString("The folder ID when the item is a folder."),
  title: s.nullableString("The knowledge title when the item is a file."),
  name: s.nullableString("The folder name when the item is a folder."),
  parentFolderId: s.nullableString("The parent folder ID."),
  fileCount: s.nullableInteger("The number of files in the folder."),
  folderCount: s.nullableInteger("The number of child folders in the folder."),
  isTop: s.nullable(s.boolean("Whether the folder is pinned to the top.")),
  highlightContent: s.nullableString("The highlighted content fragment returned by search."),
});

const urlImportResultSchema = s.object("One normalized IMA URL import result.", {
  url: s.string("The imported URL."),
  retCode: s.integer("The per-URL return code reported by IMA."),
  mediaId: s.nullableString("The created media ID when the import succeeds."),
});

const mediaHeadersSchema = s.record(
  "The HTTP headers required when fetching the original media URL.",
  s.string("One HTTP header value."),
);

const duplicateCheckResultSchema = s.object("One IMA duplicate filename check result.", {
  name: s.string("The checked file name."),
  isRepeated: s.boolean("Whether a file with this name already exists in the target folder."),
});

const mediaInfoSchema = s.object("The normalized IMA media information.", {
  mediaType: s.integer("The IMA media type."),
  url: s.nullableString("The original media URL when IMA can provide one."),
  headers: s.nullable(mediaHeadersSchema),
  notebookId: s.nullableString("The linked IMA note ID when the media is a note."),
  accessible: s.boolean("Whether the media can be accessed through a URL or linked note ID."),
});

const knowledgeBaseIdsSchema = s.array(
  "The unique IMA knowledge-base IDs to fetch.",
  s.nonEmptyString("One unique IMA knowledge base ID."),
  { minItems: 1, maxItems: 20 },
);
knowledgeBaseIdsSchema.uniqueItems = true;

export const imaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_notes",
    description: "Search IMA notes by title or note body text.",
    inputSchema: s.object(
      "The input payload for searching IMA notes.",
      {
        query: s.nonEmptyString("The search keyword."),
        searchType: noteSearchTypeSchema,
        sortType: noteSortTypeSchema,
        start: s.nonNegativeInteger("The zero-based start offset for this search page."),
        limit: notePageLimitSchema("The maximum number of notes to request for this page."),
      },
      { optional: ["searchType", "sortType", "start", "limit"] },
    ),
    outputSchema: s.object("The output payload for searching IMA notes.", {
      notes: s.array("The normalized note search results.", noteSchema),
      isEnd: s.boolean("Whether this page is the last search page."),
      totalHitCount: s.integer("The total number of matched notes."),
      nextStart: s.nullableInteger("The next start offset to use for another page, if any."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_notebooks",
    description: "List IMA note folders for the connected account.",
    inputSchema: s.object(
      "The input payload for listing IMA notebooks.",
      {
        cursor: s.string("The notebook pagination cursor."),
        limit: notePageLimitSchema("The maximum number of notebooks to request."),
      },
      { optional: ["cursor", "limit"] },
    ),
    outputSchema: s.object("The output payload for listing IMA notebooks.", {
      notebooks: s.array("The normalized notebook results.", notebookSchema),
      nextCursor: s.nullableString("The cursor for the next notebook page, if any."),
      isEnd: s.boolean("Whether this notebook page is the last page."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_notes",
    description: "List notes in one IMA notebook or across all notes.",
    inputSchema: s.object(
      "The input payload for listing IMA notes.",
      {
        folderId: s.string("The notebook folder ID to list. Omit it to list across all notes."),
        sortType: noteSortTypeSchema,
        cursor: s.string("The note pagination cursor."),
        limit: notePageLimitSchema("The maximum number of notes to request."),
      },
      { optional: ["folderId", "sortType", "cursor", "limit"] },
    ),
    outputSchema: s.object("The output payload for listing IMA notes.", {
      notes: s.array("The normalized note list results.", noteSchema),
      nextCursor: s.nullableString("The cursor for the next note page, if any."),
      isEnd: s.boolean("Whether this note page is the last page."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_note_content",
    description: "Fetch the plain-text or JSON content for one IMA note.",
    inputSchema: s.object(
      "The input payload for fetching IMA note content.",
      {
        noteId: s.nonEmptyString("The IMA note ID."),
        targetContentFormat: noteContentTargetSchema,
      },
      { optional: ["targetContentFormat"] },
    ),
    outputSchema: s.object("The output payload for fetching IMA note content.", {
      content: s.string("The returned note content."),
      targetContentFormat: noteContentTargetSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "create_note",
    description: "Create a new IMA note from Markdown content.",
    inputSchema: s.object(
      "The input payload for creating an IMA note.",
      {
        content: s.nonEmptyString("The Markdown content to import as a new note."),
        folderId: s.string("The notebook folder ID that should receive the new note."),
        folderName: s.nonEmptyString("The notebook folder name that should receive the new note."),
      },
      { optional: ["folderId", "folderName"] },
    ),
    outputSchema: s.object("The output payload for creating an IMA note.", {
      noteId: s.string("The created IMA note ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "append_note",
    description: "Append Markdown content to an existing IMA note.",
    inputSchema: s.object("The input payload for appending to an IMA note.", {
      noteId: s.nonEmptyString("The target IMA note ID."),
      content: s.nonEmptyString("The Markdown content to append to the note."),
    }),
    outputSchema: s.object("The output payload for appending to an IMA note.", {
      noteId: s.string("The target IMA note ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_knowledge_bases",
    description: "Search IMA knowledge bases by name, or pass an empty query to list accessible knowledge bases.",
    inputSchema: s.object(
      "The input payload for searching IMA knowledge bases.",
      {
        query: s.string("The knowledge-base search query. Use an empty string to list accessible bases."),
        cursor: s.string("The knowledge-base pagination cursor."),
        limit: knowledgeBasePageLimitSchema("The maximum number of knowledge bases to request."),
      },
      { optional: ["cursor", "limit"] },
    ),
    outputSchema: s.object("The output payload for searching IMA knowledge bases.", {
      knowledgeBases: s.array("The normalized knowledge-base search results.", knowledgeBaseSchema),
      nextCursor: s.nullableString("The cursor for the next knowledge-base page, if any."),
      isEnd: s.boolean("Whether this knowledge-base page is the last page."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_knowledge_bases",
    description: "Fetch metadata for one or more IMA knowledge bases.",
    inputSchema: s.object("The input payload for fetching IMA knowledge-base metadata.", {
      knowledgeBaseIds: knowledgeBaseIdsSchema,
    }),
    outputSchema: s.object("The output payload for fetching IMA knowledge-base metadata.", {
      knowledgeBases: s.array("The normalized knowledge-base metadata results.", knowledgeBaseSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_addable_knowledge_bases",
    description: "List the IMA knowledge bases that accept new content.",
    inputSchema: s.object(
      "The input payload for listing addable IMA knowledge bases.",
      {
        cursor: s.string("The addable knowledge-base pagination cursor."),
        limit: knowledgeItemPageLimitSchema("The maximum number of knowledge bases to request."),
      },
      { optional: ["cursor", "limit"] },
    ),
    outputSchema: s.object("The output payload for listing addable IMA knowledge bases.", {
      knowledgeBases: s.array("The normalized addable knowledge-base results.", knowledgeBaseSchema),
      nextCursor: s.nullableString("The cursor for the next addable knowledge-base page, if any."),
      isEnd: s.boolean("Whether this addable knowledge-base page is the last page."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_knowledge_items",
    description: "List files and folders inside one IMA knowledge-base folder.",
    inputSchema: s.object(
      "The input payload for listing IMA knowledge-base items.",
      {
        knowledgeBaseId: s.nonEmptyString("The IMA knowledge base ID."),
        folderId: s.string("The target folder ID inside the knowledge base."),
        cursor: s.string("The knowledge-item pagination cursor."),
        limit: knowledgeItemPageLimitSchema("The maximum number of files and folders to request."),
      },
      { optional: ["folderId", "cursor", "limit"] },
    ),
    outputSchema: s.object("The output payload for listing IMA knowledge-base items.", {
      items: s.array("The normalized files and folders.", knowledgeItemSchema),
      currentPath: s.array("The normalized breadcrumb folders for the current location.", knowledgeItemSchema),
      nextCursor: s.nullableString("The cursor for the next knowledge-item page, if any."),
      isEnd: s.boolean("Whether this knowledge-item page is the last page."),
    }),
  }),
  defineProviderAction(service, {
    name: "search_knowledge_items",
    description: "Search files and folders inside one IMA knowledge base.",
    inputSchema: s.object(
      "The input payload for searching IMA knowledge-base items.",
      {
        knowledgeBaseId: s.nonEmptyString("The IMA knowledge base ID."),
        query: s.nonEmptyString("The search keyword."),
        cursor: s.string("The knowledge-item search cursor."),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.object("The output payload for searching IMA knowledge-base items.", {
      items: s.array("The normalized knowledge-item search results.", knowledgeItemSchema),
      nextCursor: s.nullableString("The cursor for the next knowledge-item search page, if any."),
      isEnd: s.boolean("Whether this knowledge-item search page is the last page."),
    }),
  }),
  defineProviderAction(service, {
    name: "import_urls",
    description: "Import webpages or WeChat article URLs into one IMA knowledge base.",
    inputSchema: s.object(
      "The input payload for importing URLs into an IMA knowledge base.",
      {
        knowledgeBaseId: s.nonEmptyString("The IMA knowledge base ID."),
        folderId: s.string("The target folder ID inside the knowledge base."),
        urls: s.array(
          "The URLs to import into the knowledge base.",
          s.nonEmptyString("One webpage or WeChat article URL."),
          {
            minItems: 1,
            maxItems: 10,
          },
        ),
      },
      { optional: ["folderId"] },
    ),
    outputSchema: s.object("The output payload for importing URLs into an IMA knowledge base.", {
      results: s.array("The per-URL import results.", urlImportResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "add_note_to_knowledge_base",
    description: "Add an existing IMA note into one IMA knowledge base.",
    inputSchema: s.object(
      "The input payload for adding an IMA note into a knowledge base.",
      {
        knowledgeBaseId: s.nonEmptyString("The IMA knowledge base ID."),
        folderId: s.string("The target folder ID inside the knowledge base."),
        noteId: s.nonEmptyString("The IMA note ID to add."),
        title: s.nonEmptyString("The title to use for the knowledge-base item."),
      },
      { optional: ["folderId"] },
    ),
    outputSchema: s.object("The output payload for adding an IMA note into a knowledge base.", {
      mediaId: s.string("The created knowledge-base media ID."),
    }),
  }),
  defineProviderAction(service, {
    name: "check_repeated_names",
    description: "Check whether file names already exist in an IMA knowledge-base folder.",
    inputSchema: s.object(
      "The input payload for checking repeated IMA knowledge-base file names.",
      {
        knowledgeBaseId: s.nonEmptyString("The IMA knowledge base ID."),
        folderId: s.nonEmptyString("The target folder ID inside the knowledge base."),
        files: s.array(
          "The files to check for duplicate names.",
          s.object("One file name and media type to check.", {
            name: s.nonEmptyString("The file name to check."),
            mediaType: s.integer("The IMA media type for this file."),
          }),
          { minItems: 1, maxItems: 2000 },
        ),
      },
      { optional: ["folderId"] },
    ),
    outputSchema: s.object("The output payload for repeated-name checks.", {
      results: s.array("The duplicate check results.", duplicateCheckResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "upload_file_to_knowledge_base",
    description:
      "Upload a file from an HTTP URL into one IMA knowledge base, including duplicate checks, COS upload, and add_knowledge.",
    inputSchema: s.object(
      "The input payload for uploading a file into an IMA knowledge base.",
      {
        knowledgeBaseId: s.nonEmptyString("The IMA knowledge base ID."),
        folderId: s.nonEmptyString("The target folder ID inside the knowledge base."),
        fileUrl: s.url("The HTTP or HTTPS URL whose bytes should be uploaded to IMA."),
        fileName: s.nonEmptyString("The file name to store in IMA, including the extension."),
        contentType: s.nonEmptyString(
          "The MIME type of the file. If omitted, IMA upload type is inferred from fileName.",
        ),
        duplicatePolicy: s.stringEnum("How to handle an existing file with the same name.", ["fail", "keep_both"]),
      },
      { optional: ["folderId", "contentType", "duplicatePolicy"] },
    ),
    outputSchema: s.object("The output payload for an uploaded IMA knowledge-base file.", {
      mediaId: s.string("The created IMA media ID."),
      fileName: s.string("The final uploaded file name."),
      mediaType: s.integer("The IMA media type used for upload."),
      contentType: s.string("The MIME type uploaded to COS."),
      fileSize: s.nonNegativeInteger("The uploaded file size in bytes."),
      duplicate: s.boolean("Whether the original file name was already repeated."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_media_info",
    description: "Get IMA knowledge-base media access information for one media item.",
    inputSchema: s.object("The input payload for fetching IMA media information.", {
      mediaId: s.nonEmptyString("The IMA media ID."),
    }),
    outputSchema: mediaInfoSchema,
  }),
  defineProviderAction(service, {
    name: "get_knowledge_item_original",
    description:
      "Fetch access information for a knowledge-base item and download URL-backed original content through local transit storage when available.",
    inputSchema: s.object(
      "The input payload for retrieving original IMA knowledge-base content.",
      {
        mediaId: s.nonEmptyString("The IMA media ID."),
        fileName: s.nonEmptyString("The preferred transit file name when downloading URL content."),
      },
      { optional: ["fileName"] },
    ),
    outputSchema: s.object("The output payload for original IMA knowledge-base content retrieval.", {
      mediaInfo: mediaInfoSchema,
      content: s.nullableString("The note content when the media item is an IMA note."),
      file: s.nullable(
        s.object("A downloaded original file stored in local transit storage.", {
          fileId: s.string("The local transit file identifier."),
          downloadUrl: s.url("The local URL for downloading the original file."),
          sizeBytes: s.nonNegativeInteger("The downloaded file size in bytes."),
          name: s.string("The transit file name."),
          mimeType: s.string("The MIME type of the downloaded original file."),
        }),
      ),
    }),
  }),
];
