import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zlibrary";

const bookSchema = s.object(
  "One book record returned by the Z-Library EAPI, normalized to stable field names.",
  {
    id: s.string("The Z-Library book identifier."),
    title: s.string("The book title."),
    author: s.string("The primary author name."),
    year: s.string("The publication year as reported by Z-Library."),
    language: s.string("The book language code."),
    extension: s.string("The file extension, e.g. pdf, epub, mobi."),
    size: s.string("The file size as reported by Z-Library."),
    rating: s.string("The user rating value."),
    quality: s.string("The quality score reported by Z-Library."),
    hash: s.string("The book hash used to build download and metadata URLs."),
    pages: s.string("The page count."),
    isbn: s.string("The ISBN when available."),
    publisher: s.string("The publisher when available."),
    url: s.string("The Z-Library book page URL."),
    cover: s.string("The cover image URL."),
  },
  {
    optional: [
      "year",
      "language",
      "extension",
      "size",
      "rating",
      "quality",
      "pages",
      "isbn",
      "publisher",
      "url",
      "cover",
    ],
  },
);

const bookSearchInputSchema = s.object(
  "The input payload for searching books on Z-Library.",
  {
    message: s.string("The search query, e.g. a title or author name.", { minLength: 1 }),
    limit: s.integer("The maximum number of results to return.", { minimum: 1, maximum: 100 }),
    page: s.integer("The result page number, starting at 1.", { minimum: 1 }),
    yearFrom: s.integer("Only books published in this year or later."),
    yearTo: s.integer("Only books published in this year or earlier."),
    languages: s.array("Only books in these languages.", s.string("One language code, e.g. english.")),
    extensions: s.array("Only books in these file formats.", s.string("One file extension, e.g. pdf.")),
    exact: s.boolean("Require exact phrase matching for the query."),
    order: s.stringEnum("Sort order for the results.", ["popular", "date_created", "date_updated"]),
  },
  { optional: ["limit", "page", "yearFrom", "yearTo", "languages", "extensions", "exact", "order"] },
);

const bookSearchOutputSchema = s.requiredObject("The book search results returned by Z-Library.", {
  books: s.array("The matching books.", bookSchema),
  total: s.integer("The total number of matching books reported by Z-Library."),
});

const bookIdentityInputSchema = s.requiredObject("Identify one book on Z-Library.", {
  id: s.string("The Z-Library book identifier.", { minLength: 1 }),
  hash: s.string("The book hash used to build the metadata URL.", { minLength: 1 }),
});

const bookIdentityOutputSchema = s.requiredObject("The book record returned by Z-Library.", {
  book: bookSchema,
});

const bookDownloadOutputSchema = s.requiredObject("The downloaded book file, uploaded to connector transit storage.", {
  file: s.requiredObject("The downloadable book file.", {
    name: s.string("The file name, sanitized to a safe basename."),
    mimetype: s.string("The file MIME type."),
    downloadUrl: s.string("The local transit URL for downloading the file."),
  }),
});

const downloadLimitsOutputSchema = s.requiredObject(
  "The daily download quota for the authenticated Z-Library account.",
  {
    limits: s.requiredObject("Daily download limits reported by the EAPI profile.", {
      daily_amount: s.integer("Downloads already used today."),
      daily_allowed: s.integer("Total downloads allowed per day."),
      daily_remaining: s.integer("Downloads remaining today."),
    }),
  },
);

export const zlibraryActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_books",
    description: "Search books on Z-Library by keyword with optional year, language, format, and sort filters.",
    requiredScopes: [],
    inputSchema: bookSearchInputSchema,
    outputSchema: bookSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_book_metadata",
    description: "Retrieve the full metadata record for one Z-Library book by id and hash.",
    requiredScopes: [],
    inputSchema: bookIdentityInputSchema,
    outputSchema: bookIdentityOutputSchema,
  }),
  defineProviderAction(service, {
    name: "download_book_to_file",
    description: "Download one book file from Z-Library and upload it to connector transit storage.",
    requiredScopes: [],
    inputSchema: bookIdentityInputSchema,
    outputSchema: bookDownloadOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_download_limits",
    description: "Retrieve the daily download quota for the authenticated Z-Library account.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving download limits.", {}),
    outputSchema: downloadLimitsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_recent_books",
    description: "List the most recently added books on Z-Library.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing recent books.", {}),
    outputSchema: s.requiredObject("The recent books returned by Z-Library.", {
      books: s.array("The recent books.", bookSchema),
    }),
  }),
];
