import type { ActionDefinition } from "../../core/types.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  attachableAssetTypeValues,
  bookmarkAssetRefSchema,
  bookmarkReadableContentSchema,
  bookmarkSchema,
  bookmarkSourceValues,
  createdBookmarkSchema,
  cursorFieldFor,
  highlightSchema,
  includeContentField,
  karakeepIdField,
  limitField,
  listSchema,
  manipulatedTagSchema,
  paginatedBookmarksSchema,
  sortOrderField,
  successResultSchema,
  updatedBookmarkSchema,
} from "./schemas.ts";

const service = "karakeep";
const bookmarkReadScopes = ["bookmarks:read"] as const;
const bookmarkWriteScopes = ["bookmarks:readwrite"] as const;
const listReadScopes = ["lists:read"] as const;
const highlightReadScopes = ["highlights:read"] as const;
const assetWriteScopes = ["assets:readwrite"] as const;

const includeContentInputField = s.describe(
  includeContentField,
  "Whether to include the large extracted content of each bookmark, meaning htmlContent on link bookmarks and the extracted text on asset bookmarks. Defaults to false because the payload can be very large. Text bookmarks always return content.text regardless of this flag.",
);

const bookmarkIdField = karakeepIdField("The id of the bookmark.");

const listBookmarksInputSchema = s.object(
  "Filters and pagination for listing bookmarks.",
  {
    archived: s.boolean("Filter by archived status."),
    favourited: s.boolean("Filter by favourited status."),
    sortOrder: s.describe(sortOrderField, "Sort order by creation date. Defaults to desc, meaning newest first."),
    limit: limitField,
    cursor: cursorFieldFor("list_bookmarks", "List cursors are not interchangeable with search_bookmarks cursors."),
    includeContent: includeContentInputField,
  },
  { optional: ["archived", "favourited", "sortOrder", "limit", "cursor", "includeContent"] },
);

const createBookmarkInputSchema = s.object(
  "The bookmark to create. The type field selects the variant and decides which of the other fields are required.",
  {
    type: s.stringEnum(
      "The bookmark variant to create. Use link with url, text with text, or asset with assetType and assetId.",
      ["link", "text", "asset"],
    ),
    url: s.url("The HTTP or HTTPS URL to bookmark. Required when type is link."),
    precrawledArchiveId: karakeepIdField(
      "The id of an already uploaded HTML archive asset that Karakeep should store instead of crawling the URL itself. Only used when type is link.",
    ),
    text: s.string("The note body to store. Required when type is text."),
    assetType: s.stringEnum("The kind of the uploaded asset. Required when type is asset.", ["image", "pdf"]),
    assetId: karakeepIdField("The id of an asset that was already uploaded to Karakeep. Required when type is asset."),
    fileName: s.string("The original file name of the uploaded asset. Only used when type is asset."),
    sourceUrl: s.string("The URL the note or the uploaded file came from. Only used when type is text or asset."),
    title: s.nullable(
      s.string("The user supplied title, or null to let Karakeep use the crawled title.", {
        maxLength: 1000,
      }),
    ),
    archived: s.boolean("Whether the bookmark is archived right away."),
    favourited: s.boolean("Whether the bookmark is favourited right away."),
    note: s.string("A free form note to store on the bookmark."),
    summary: s.string("A summary to store on the bookmark instead of generating one."),
    createdAt: s.dateTime("The creation timestamp to record, in ISO 8601 format. Defaults to the current time."),
    crawlPriority: s.stringEnum("The crawling queue priority for link bookmarks. Use low for bulk imports.", [
      "low",
      "normal",
    ]),
    source: s.stringEnum("How the bookmark was captured. Defaults to api.", bookmarkSourceValues),
  },
  { required: ["type"] },
);

const searchBookmarksInputSchema = s.object(
  "The search query and pagination for searching bookmarks.",
  {
    q: s.nonEmptyString("The search query string."),
    searchMode: s.stringEnum(
      "Search strategy. fts uses full text search, semantic uses bookmark embeddings, and hybrid fuses both. Hybrid falls back to full text search when the query has no free text terms or when embeddings are unavailable. Defaults to fts. semantic and hybrid are only accepted on instances that have semantic search and automatic embedding indexing enabled; elsewhere Karakeep answers 400 Semantic search is not enabled.",
      ["fts", "semantic", "hybrid"],
    ),
    sortOrder: s.stringEnum(
      "Sort order for results. Defaults to relevance. Use asc or desc for date based sorting; semantic and hybrid modes support relevance only.",
      ["asc", "desc", "relevance"],
    ),
    limit: limitField,
    cursor: cursorFieldFor(
      "search_bookmarks",
      "Search cursors encode a result offset and must not be used with list_bookmarks.",
    ),
    includeContent: includeContentInputField,
  },
  { optional: ["searchMode", "sortOrder", "limit", "cursor", "includeContent"] },
);

const checkBookmarkUrlInputSchema = s.requiredObject("The URL to look up.", {
  url: s.url("The HTTP or HTTPS URL to check against the existing bookmarks."),
});

const checkBookmarkUrlOutputSchema = s.looseRequiredObject("Whether the URL is already bookmarked.", {
  bookmarkId: s.nullableString("The id of the existing bookmark, or null when the URL is not bookmarked yet."),
});

const getBookmarkInputSchema = s.object(
  "The bookmark to read.",
  {
    bookmarkId: bookmarkIdField,
    includeContent: includeContentInputField,
  },
  { optional: ["includeContent"] },
);

const updateBookmarkInputSchema = s.object(
  "The bookmark fields to change. Only the fields you provide are changed; passing null clears a nullable field.",
  {
    bookmarkId: bookmarkIdField,
    archived: s.boolean("Whether the bookmark is archived."),
    favourited: s.boolean("Whether the bookmark is favourited."),
    summary: s.nullableString("The stored summary, or null to clear it."),
    note: s.string("The note attached to the bookmark."),
    title: s.nullable(
      s.string("The user supplied title, or null to fall back to the crawled title.", {
        maxLength: 1000,
      }),
    ),
    createdAt: s.dateTime("The creation timestamp to record, in ISO 8601 format."),
    url: s.url("The bookmarked URL. Only applies to link bookmarks."),
    description: s.nullableString("The page description, or null to clear it. Only applies to link bookmarks."),
    author: s.nullableString("The page author, or null to clear it. Only applies to link bookmarks."),
    publisher: s.nullableString("The page publisher, or null to clear it. Only applies to link bookmarks."),
    datePublished: s.nullableString(
      "The publication date in ISO 8601 format, or null to clear it. Only applies to link bookmarks.",
    ),
    dateModified: s.nullableString(
      "The modification date in ISO 8601 format, or null to clear it. Only applies to link bookmarks.",
    ),
    text: s.nonEmptyString(
      "The note body. Only applies to text bookmarks. Karakeep skips null and empty strings here, so the body of a text bookmark cannot be cleared through this action.",
    ),
    assetContent: s.nullableString(
      "The text extracted from the uploaded file, or null to clear it. Only applies to asset bookmarks.",
    ),
  },
  {
    required: ["bookmarkId"],
  },
);

const deleteBookmarkOutputSchema = successResultSchema(
  "The result of deleting the bookmark.",
  "Always true when Karakeep accepted the deletion.",
  { bookmarkId: "The id of the deleted bookmark." },
);

const getBookmarkContentInputSchema = s.object(
  "The bookmark to read and the chunk to return.",
  {
    bookmarkId: bookmarkIdField,
    format: s.stringEnum(
      "The readable representation to render. When omitted together with a cursor the format of the cursor is used, otherwise markdown.",
      ["markdown", "text"],
    ),
    maxChars: s.integer(
      "Maximum number of Unicode characters to return in this chunk. The chunk may end earlier at a paragraph or line boundary. Defaults to 12000.",
      { minimum: 1, maximum: 50_000 },
    ),
    cursor: cursorFieldFor(
      "get_bookmark_content",
      "The cursor is bound to this bookmark, this format and the content version it was issued for.",
    ),
  },
  { optional: ["format", "maxChars", "cursor"] },
);

const summarizeBookmarkOutputSchema = s.object(
  "The summary Karakeep generated for the bookmark.",
  {
    summary: s.nullableString(
      "The generated summary text, or null when the instance answered with the bookmark record before the summary was stored on it.",
    ),
    summarizationStatus: s.nullable(
      s.stringEnum(
        "The AI summarization job status, only returned by instances that answer with the whole bookmark record.",
        ["success", "failure", "pending"],
      ),
    ),
  },
  { optional: ["summarizationStatus"] },
);

const manipulateTagsInputSchema = (verb: string): JsonSchema =>
  s.requiredObject(`The bookmark and the tags to ${verb}.`, {
    bookmarkId: bookmarkIdField,
    tags: s.array(`The tags to ${verb}. Every entry must carry either tagId or tagName.`, manipulatedTagSchema),
  });

const attachTagsOutputSchema = s.looseRequiredObject("The tags that were attached.", {
  attached: s.stringArray("The ids of the tags that are now attached to the bookmark.", {
    itemDescription: "A tag id.",
  }),
});

const detachTagsOutputSchema = s.looseRequiredObject("The tags that were detached.", {
  detached: s.stringArray("The ids of the tags that were removed from the bookmark.", {
    itemDescription: "A tag id.",
  }),
});

const bookmarkOnlyInputSchema = (description: string): JsonSchema =>
  s.requiredObject(description, { bookmarkId: bookmarkIdField });

const getBookmarkListsOutputSchema = s.looseRequiredObject("The lists that contain the bookmark.", {
  lists: s.array("The lists the bookmark belongs to.", listSchema),
});

const getBookmarkHighlightsOutputSchema = s.looseRequiredObject("The highlights stored on the bookmark.", {
  highlights: s.array("The highlights created on the bookmark.", highlightSchema),
});

const attachAssetInputSchema = s.requiredObject("The bookmark and the asset to attach.", {
  bookmarkId: bookmarkIdField,
  assetId: karakeepIdField(
    "The id of an asset that was already uploaded to Karakeep. Sent to Karakeep as the body field id.",
  ),
  assetType: s.stringEnum(
    "The role the asset plays for the bookmark. Karakeep only accepts these roles for attachment; linkHtmlContent, bookmarkAsset, fullPageArchive, avatar and unknown assets are managed by Karakeep itself and cannot be attached.",
    attachableAssetTypeValues,
  ),
});

const replaceAssetInputSchema = s.requiredObject("The asset to replace and its replacement.", {
  bookmarkId: bookmarkIdField,
  assetId: karakeepIdField("The id of the asset that is currently attached and will be replaced."),
  newAssetId: karakeepIdField(
    "The id of a different, already uploaded asset that takes over the role of the replaced asset. It must not equal assetId and should not already belong to another bookmark.",
  ),
});

const replaceAssetOutputSchema = successResultSchema(
  "The result of replacing the asset.",
  "Always true when Karakeep accepted the replacement.",
  {
    bookmarkId: "The id of the bookmark the asset belongs to.",
    assetId: "The id of the asset that was replaced.",
    newAssetId: "The id of the asset that took its place.",
  },
);

const detachAssetInputSchema = s.requiredObject("The bookmark and the asset to detach.", {
  bookmarkId: bookmarkIdField,
  assetId: karakeepIdField("The id of the asset to detach from the bookmark."),
});

const detachAssetOutputSchema = successResultSchema(
  "The result of detaching the asset.",
  "Always true when Karakeep accepted the detachment.",
  {
    bookmarkId: "The id of the bookmark the asset was detached from.",
    assetId: "The id of the detached asset.",
  },
);

export const karakeepBookmarkActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_bookmarks",
    operationType: "read",
    description:
      "List the bookmarks of the connected Karakeep user, optionally filtered by archived or favourited status, sorted by creation date and paged with a cursor. Keep includeContent false unless the extracted page content is really needed, because it can make the response very large; text bookmarks always carry content.text.",
    requiredScopes: bookmarkReadScopes,
    inputSchema: listBookmarksInputSchema,
    outputSchema: paginatedBookmarksSchema,
  }),
  defineProviderAction(service, {
    name: "create_bookmark",
    operationType: "write",
    description:
      "Create a bookmark from a link, a text note or an already uploaded asset. Set type to link and provide url, set type to text and provide text, or set type to asset and provide assetType and assetId. When the same URL is already bookmarked Karakeep does not create a duplicate: it returns the existing bookmark with alreadyExists set to true and re-saves it, which bumps createdAt to now, resets archived to false, and overwrites title, favourited, note and summary with whatever you supplied. Only source rss and source import skip that re-save. check_bookmark_url can reduce accidental duplicate updates, but it is a separate request and cannot prevent another client from creating the URL before this action runs.",
    requiredScopes: bookmarkWriteScopes,
    inputSchema: createBookmarkInputSchema,
    outputSchema: createdBookmarkSchema,
  }),
  defineProviderAction(service, {
    name: "search_bookmarks",
    operationType: "read",
    description:
      "Search the bookmarks of the connected Karakeep user with full text, semantic or hybrid search. Paging uses a search specific cursor that cannot be shared with list_bookmarks. Keep includeContent false unless the extracted page content is really needed, because it can make the response very large; text bookmarks always carry content.text.",
    requiredScopes: bookmarkReadScopes,
    inputSchema: searchBookmarksInputSchema,
    outputSchema: paginatedBookmarksSchema,
  }),
  defineProviderAction(service, {
    name: "check_bookmark_url",
    operationType: "read",
    description:
      "Check whether a URL is already bookmarked and return the id of the existing bookmark, or null when it is not. Useful before calling create_bookmark.",
    requiredScopes: bookmarkReadScopes,
    inputSchema: checkBookmarkUrlInputSchema,
    outputSchema: checkBookmarkUrlOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bookmark",
    operationType: "read",
    description:
      "Get a single bookmark with its tags, content and attached assets. Keep includeContent false unless the extracted page content is really needed, because it can make the response very large; text bookmarks always carry content.text. Use get_bookmark_content to read long article text in chunks.",
    requiredScopes: bookmarkReadScopes,
    inputSchema: getBookmarkInputSchema,
    outputSchema: bookmarkSchema,
  }),
  defineProviderAction(service, {
    name: "update_bookmark",
    operationType: "destructive",
    description:
      "Update a bookmark. Only the fields you send are changed, and sending null clears a nullable field, so existing values are overwritten. Fields that do not belong to the bookmark variant are not ignored: Karakeep rejects the whole request with a 400 such as Attempting to set link attributes for non-link type bookmark and writes nothing, so send only the fields that match the bookmark type.",
    requiredScopes: bookmarkWriteScopes,
    inputSchema: updateBookmarkInputSchema,
    outputSchema: updatedBookmarkSchema,
  }),
  defineProviderAction(service, {
    name: "delete_bookmark",
    operationType: "destructive",
    description: "Permanently delete a bookmark together with its tags, highlights and attached assets.",
    requiredScopes: bookmarkWriteScopes,
    inputSchema: bookmarkOnlyInputSchema("The bookmark to delete."),
    outputSchema: deleteBookmarkOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bookmark_content",
    operationType: "read",
    description:
      "Read the readable content of a bookmark in chunks as markdown or plain text. This is the safe way to read long articles: pass nextCursor back to fetch the following chunk instead of asking for the whole content with includeContent. Karakeep rejects a cursor with CONTENT_CHANGED when the bookmark content changed while paging, in which case restart from the first chunk.",
    requiredScopes: bookmarkReadScopes,
    inputSchema: getBookmarkContentInputSchema,
    outputSchema: bookmarkReadableContentSchema,
  }),
  defineProviderAction(service, {
    name: "summarize_bookmark",
    operationType: "destructive",
    description:
      "Generate an AI summary for a link bookmark and return it. Karakeep saves the generated summary on the bookmark, replacing any summary it already had, and re-indexes the bookmark for search, so this is not a read-only preview. The call blocks while the configured model runs, so it can take a while, and it fails with an invalid input error when the Karakeep instance has no inference provider configured. The current server writes the summary before answering and returns it synchronously, so summary normally carries the finished text. The published OpenAPI spec instead documents the whole bookmark record, so an instance following that shape can answer with summary null; in that case read the bookmark again with get_bookmark until summarizationStatus is success and take the summary from there.",
    requiredScopes: bookmarkWriteScopes,
    inputSchema: bookmarkOnlyInputSchema("The bookmark to summarize."),
    outputSchema: summarizeBookmarkOutputSchema,
  }),
  defineProviderAction(service, {
    name: "attach_tags_to_bookmark",
    operationType: "write",
    description:
      "Attach tags to a bookmark. Reference each tag by tagId, or by tagName to let Karakeep create the tag when it does not exist yet.",
    requiredScopes: bookmarkWriteScopes,
    inputSchema: manipulateTagsInputSchema("attach"),
    outputSchema: attachTagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "detach_tags_from_bookmark",
    operationType: "destructive",
    description:
      "Detach tags from a bookmark. Reference each tag by tagId or by tagName. The tags themselves are kept, only the attachment to this bookmark is removed.",
    requiredScopes: bookmarkWriteScopes,
    inputSchema: manipulateTagsInputSchema("detach"),
    outputSchema: detachTagsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bookmark_lists",
    operationType: "read",
    description: "List the Karakeep lists that contain a bookmark.",
    requiredScopes: listReadScopes,
    inputSchema: bookmarkOnlyInputSchema("The bookmark whose lists are returned."),
    outputSchema: getBookmarkListsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bookmark_highlights",
    operationType: "read",
    description: "List the highlights stored on a bookmark.",
    requiredScopes: highlightReadScopes,
    inputSchema: bookmarkOnlyInputSchema("The bookmark whose highlights are returned."),
    outputSchema: getBookmarkHighlightsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "attach_asset_to_bookmark",
    operationType: "write",
    description:
      "Attach an already uploaded asset to a bookmark, for example a screenshot or a PDF. Upload the file first to obtain an asset id. Only the screenshot, pdf, assetScreenshot, precrawledArchive, bannerImage, video and userUploaded roles can be attached; linkHtmlContent, bookmarkAsset, fullPageArchive, avatar and unknown assets are maintained by Karakeep itself and are rejected with a 400.",
    requiredScopes: assetWriteScopes,
    inputSchema: attachAssetInputSchema,
    outputSchema: bookmarkAssetRefSchema,
  }),
  defineProviderAction(service, {
    name: "replace_asset_on_bookmark",
    operationType: "destructive",
    description:
      "Replace an asset that is attached to a bookmark with a different, already uploaded asset. The replacement must not equal the old asset and should not already belong to another bookmark. The replaced asset and its stored file are permanently deleted, and the new asset takes over its role. The asset being replaced must hold an attachable role, meaning screenshot, pdf, assetScreenshot, precrawledArchive, bannerImage, video or userUploaded; assets Karakeep maintains itself, including linkHtmlContent, bookmarkAsset, fullPageArchive, avatar and unknown, are rejected with a 400.",
    requiredScopes: assetWriteScopes,
    inputSchema: replaceAssetInputSchema,
    outputSchema: replaceAssetOutputSchema,
  }),
  defineProviderAction(service, {
    name: "detach_asset_from_bookmark",
    operationType: "destructive",
    description:
      "Detach an asset from a bookmark. Karakeep deletes the asset record together with the stored file, so the asset id becomes unusable afterwards and the bytes are gone; the bookmark keeps its other assets. Only screenshot, pdf, assetScreenshot, fullPageArchive, precrawledArchive, bannerImage, video and userUploaded assets can be detached; linkHtmlContent, bookmarkAsset, avatar and unknown assets are maintained by Karakeep itself and are rejected with a 400.",
    requiredScopes: assetWriteScopes,
    inputSchema: detachAssetInputSchema,
    outputSchema: detachAssetOutputSchema,
  }),
];
