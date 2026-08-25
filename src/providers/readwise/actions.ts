import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "readwise";

const highlightCategorySchema = s.stringEnum(
  "The Readwise highlight category such as books, articles, tweets, podcasts, or supplemental.",
  ["books", "articles", "tweets", "podcasts", "supplemental"],
);
const iso8601String = s.nonEmptyString("An ISO 8601 datetime string accepted by Readwise.");

const highlightInputSchema = s.object(
  "A highlight object accepted by the Readwise create highlights API.",
  {
    text: s.nonEmptyString("The highlighted text to save in Readwise."),
    title: s.nonEmptyString("The title of the source document or book."),
    author: s.nonEmptyString("The author of the source document or book."),
    category: highlightCategorySchema,
    source_type: s.nonEmptyString(
      "The source type associated with the highlight, such as kindle, pocket, instapaper, or api.",
    ),
    note: s.string("An optional note attached to the highlight."),
    location: s.positiveInteger("The highlight location in the source when available."),
    location_type: s.nonEmptyString("The Readwise location type, such as page or order."),
    highlighted_at: iso8601String,
    url: s.url("The URL of the highlighted source when available."),
  },
  {
    optional: ["author", "category", "source_type", "note", "location", "location_type", "highlighted_at", "url"],
  },
);

const highlightOutputSchema = s.object("A normalized Readwise highlight.", {
  id: s.nullableInteger("The Readwise highlight identifier."),
  text: s.string("The highlighted text."),
  title: s.nullableString("The source title when Readwise returns it."),
  author: s.nullableString("The source author when Readwise returns it."),
  note: s.nullableString("The note attached to the highlight when present."),
  url: s.nullableString("The source URL when present."),
  highlightedAt: s.nullableString("The datetime when the text was highlighted."),
  updatedAt: s.nullableString("The datetime when the highlight was last updated."),
  raw: s.looseObject("The raw highlight object returned by Readwise."),
});

const bookOutputSchema = s.object("A normalized Readwise book or source.", {
  id: s.nullableInteger("The Readwise book identifier."),
  title: s.nullableString("The source title."),
  author: s.nullableString("The source author."),
  category: s.nullableString("The Readwise source category."),
  source: s.nullableString("The source integration or origin returned by Readwise."),
  numHighlights: s.nullableInteger("The number of highlights in the source."),
  updatedAt: s.nullableString("The datetime when the source was last updated."),
  highlights: s.array("Highlights included with this source.", highlightOutputSchema),
  raw: s.looseObject("The raw source object returned by Readwise."),
});

const documentOutputSchema = s.object("A normalized Readwise Reader document.", {
  id: s.nullableString("The Readwise Reader document identifier."),
  url: s.nullableString("The document URL."),
  sourceUrl: s.nullableString("The original source URL when Readwise returns it."),
  title: s.nullableString("The document title."),
  author: s.nullableString("The document author."),
  category: s.nullableString("The Reader category."),
  location: s.nullableString("The Reader location such as new, later, shortlist, archive, or feed."),
  tags: s.array("The document tags returned by Readwise.", s.string("A Reader tag.")),
  createdAt: s.nullableString("The datetime when the document was created."),
  updatedAt: s.nullableString("The datetime when the document was last updated."),
  raw: s.looseObject("The raw document object returned by Readwise."),
});

const nextPageCursorSchema = s.nullableString(
  "The cursor to pass as pageCursor on the next request, or null when there are no more pages.",
);

export const readwiseActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "create_highlights",
    description: "Create one or more highlights in Readwise.",
    inputSchema: s.object("The input payload for creating Readwise highlights.", {
      highlights: s.array("The highlights to create.", highlightInputSchema, { minItems: 1 }),
    }),
    outputSchema: s.object("The response returned after creating Readwise highlights.", {
      books: s.array("The books, articles, or podcasts created or updated by Readwise.", bookOutputSchema),
      raw: s.array(
        "The raw list of books, articles, or podcasts returned by Readwise.",
        s.looseObject("One raw source object returned by Readwise."),
      ),
    }),
  }),
  defineProviderAction(service, {
    name: "export_highlights",
    description: "Export Readwise books and highlights updated after an optional date cursor.",
    inputSchema: s.object(
      "The input payload for exporting Readwise highlights.",
      {
        updatedAfter: iso8601String,
        pageCursor: s.nonEmptyString("The pagination cursor returned by a previous export response."),
      },
      { optional: ["updatedAfter", "pageCursor"] },
    ),
    outputSchema: s.object("The response returned when exporting Readwise highlights.", {
      count: s.nullableInteger("The total number of matching source records when provided."),
      nextPageCursor: nextPageCursorSchema,
      books: s.array("The exported books or sources.", bookOutputSchema),
      raw: s.looseObject("The raw export response returned by Readwise."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_books",
    description: "List Readwise books or sources with optional category and update filters.",
    inputSchema: s.object(
      "The input payload for listing Readwise books.",
      {
        page: s.positiveInteger("The page number to return."),
        pageSize: s.positiveInteger("The number of books to return per page."),
        category: highlightCategorySchema,
        updatedAfter: iso8601String,
        updatedBefore: iso8601String,
      },
      { optional: ["page", "pageSize", "category", "updatedAfter", "updatedBefore"] },
    ),
    outputSchema: s.object("The response returned when listing Readwise books.", {
      count: s.nullableInteger("The total number of matching books when provided."),
      next: s.nullableString("The URL for the next page, or null when there is no next page."),
      previous: s.nullableString("The URL for the previous page, or null when there is no previous page."),
      books: s.array("The books returned by Readwise.", bookOutputSchema),
      raw: s.looseObject("The raw books response returned by Readwise."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_documents",
    description: "List Readwise Reader documents with optional filters and pagination.",
    inputSchema: s.object(
      "The input payload for listing Readwise Reader documents.",
      {
        pageCursor: s.nonEmptyString("The pagination cursor returned by a previous list response."),
        updatedAfter: iso8601String,
        location: s.stringEnum("The Reader location filter such as new, later, shortlist, archive, or feed.", [
          "new",
          "later",
          "shortlist",
          "archive",
          "feed",
        ]),
        category: s.nonEmptyString("The Reader category filter such as article, email, rss, or pdf."),
        tag: s.nonEmptyString("Only return documents with this tag."),
      },
      { optional: ["pageCursor", "updatedAfter", "location", "category", "tag"] },
    ),
    outputSchema: s.object("The response returned when listing Readwise Reader documents.", {
      count: s.nullableInteger("The total number of matching documents when provided."),
      nextPageCursor: nextPageCursorSchema,
      documents: s.array("The Reader documents returned by Readwise.", documentOutputSchema),
      raw: s.looseObject("The raw list response returned by Readwise."),
    }),
  }),
  defineProviderAction(service, {
    name: "save_document",
    description: "Save a URL into Readwise Reader with optional metadata.",
    inputSchema: s.object(
      "The input payload for saving a Readwise Reader document.",
      {
        url: s.url("The URL to save into Readwise Reader."),
        title: s.nonEmptyString("An optional document title."),
        author: s.nonEmptyString("An optional document author."),
        summary: s.nonEmptyString("An optional document summary."),
        shouldCleanHtml: s.boolean("Whether Readwise should clean the saved document HTML."),
        savedUsing: s.nonEmptyString("A label describing the app or workflow that saved the document."),
        tags: s.stringArray("Tags to attach to the saved document.", {
          minItems: 1,
          itemDescription: "A document tag.",
        }),
      },
      { optional: ["title", "author", "summary", "shouldCleanHtml", "savedUsing", "tags"] },
    ),
    outputSchema: s.object("The response returned after saving a Readwise Reader document.", {
      document: documentOutputSchema,
      raw: s.looseObject("The raw save response returned by Readwise."),
    }),
  }),
  defineProviderAction(service, {
    name: "update_document",
    description: "Update the location, tags, or metadata for a Readwise Reader document.",
    inputSchema: s.object(
      "The input payload for updating a Readwise Reader document.",
      {
        documentId: s.nonEmptyString("The Readwise Reader document identifier."),
        location: s.stringEnum("The Reader location to apply to the document.", [
          "new",
          "later",
          "shortlist",
          "archive",
          "feed",
        ]),
        title: s.nonEmptyString("The updated document title."),
        author: s.nonEmptyString("The updated document author."),
        summary: s.nonEmptyString("The updated document summary."),
        tags: s.stringArray("The complete tag list to set on the document.", {
          minItems: 1,
          itemDescription: "A document tag.",
        }),
      },
      { optional: ["location", "title", "author", "summary", "tags"] },
    ),
    outputSchema: s.object("The response returned after updating a Readwise Reader document.", {
      document: documentOutputSchema,
      raw: s.looseObject("The raw update response returned by Readwise."),
    }),
  }),
];
