import type { JsonSchema, ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "api_bible";

const contentTypeSchema = s.stringEnum("The content format requested from API.Bible.", ["html", "json", "text"]);

const contentSchema = s.union(
  [
    s.string("The HTML or plain-text content returned by API.Bible."),
    s.array("The structured JSON content blocks returned by API.Bible.", s.looseObject("One structured content block returned by API.Bible.")),
  ],
  { description: "The scripture content returned by API.Bible." },
);

const languageSchema = s.looseObject(
  "The language metadata returned by API.Bible.",
  {
    id: s.nonEmptyString("The ISO language identifier returned by API.Bible."),
    name: s.nonEmptyString("The language display name returned by API.Bible."),
    nameLocal: s.nonEmptyString("The localized language name returned by API.Bible."),
    scriptDirection: s.nonEmptyString("The script direction returned by API.Bible when available."),
  },
);

const bibleSchema = s.looseObject(
  "One Bible version returned by API.Bible.",
  {
    id: s.nonEmptyString("The Bible identifier returned by API.Bible."),
    abbreviation: s.nonEmptyString("The Bible abbreviation returned by API.Bible."),
    abbreviationLocal: s.nonEmptyString("The localized Bible abbreviation returned by API.Bible."),
    description: s.nonEmptyString("The Bible description returned by API.Bible."),
    language: languageSchema,
    name: s.nonEmptyString("The Bible display name returned by API.Bible."),
    nameLocal: s.nonEmptyString("The localized Bible name returned by API.Bible."),
  },
);

const bookSchema = s.looseObject(
  "One book returned by API.Bible.",
  {
    id: s.nonEmptyString("The book identifier returned by API.Bible."),
    bibleId: s.nonEmptyString("The Bible identifier associated with the book."),
    abbreviation: s.nonEmptyString("The book abbreviation returned by API.Bible."),
    name: s.nonEmptyString("The book display name returned by API.Bible."),
    nameLong: s.nonEmptyString("The long book name returned by API.Bible."),
  },
);

const chapterSummarySchema = s.looseObject(
  "One chapter summary returned by API.Bible.",
  {
    id: s.nonEmptyString("The chapter identifier returned by API.Bible."),
    bibleId: s.nonEmptyString("The Bible identifier associated with the chapter."),
    bookId: s.nonEmptyString("The book identifier associated with the chapter."),
    number: s.nonEmptyString("The chapter number returned by API.Bible."),
    reference: s.nonEmptyString("The human-readable chapter reference returned by API.Bible."),
  },
);

const verseSummarySchema = s.looseObject(
  "One verse summary returned by API.Bible.",
  {
    id: s.nonEmptyString("The verse identifier returned by API.Bible."),
    orgId: s.nonEmptyString("The organization-specific verse identifier returned by API.Bible."),
    bibleId: s.nonEmptyString("The Bible identifier associated with the verse."),
    bookId: s.nonEmptyString("The book identifier associated with the verse."),
    chapterId: s.nonEmptyString("The chapter identifier associated with the verse."),
    reference: s.nonEmptyString("The human-readable verse reference returned by API.Bible."),
  },
);

const metaSchema = s.looseObject(
  "The response metadata returned by API.Bible.",
  {
    fumsId: s.nonEmptyString("The FUMS tracking identifier returned by API.Bible."),
    fums: s.nonEmptyString("The FUMS embed snippet returned by API.Bible."),
    fumsJs: s.nonEmptyString("The inline FUMS JavaScript returned by API.Bible."),
    fumsJsInclude: s.nonEmptyString("The FUMS JavaScript include URL returned by API.Bible."),
    fumsNoScript: s.nonEmptyString("The FUMS noscript snippet returned by API.Bible."),
  },
);

const chapterSchema = s.looseObject(
  "One chapter payload returned by API.Bible.",
  {
    id: s.nonEmptyString("The chapter identifier returned by API.Bible."),
    bibleId: s.nonEmptyString("The Bible identifier associated with the chapter."),
    bookId: s.nonEmptyString("The book identifier associated with the chapter."),
    number: s.nonEmptyString("The chapter number returned by API.Bible."),
    reference: s.nonEmptyString("The human-readable chapter reference returned by API.Bible."),
    verseCount: s.integer("The verse count returned by API.Bible."),
    content: contentSchema,
    copyright: s.nonEmptyString("The copyright string returned by API.Bible."),
  },
);

const verseSchema = s.looseObject(
  "One verse payload returned by API.Bible.",
  {
    id: s.nonEmptyString("The verse identifier returned by API.Bible."),
    orgId: s.nonEmptyString("The organization-specific verse identifier returned by API.Bible."),
    bibleId: s.nonEmptyString("The Bible identifier associated with the verse."),
    bookId: s.nonEmptyString("The book identifier associated with the verse."),
    chapterId: s.nonEmptyString("The chapter identifier associated with the verse."),
    reference: s.nonEmptyString("The human-readable verse reference returned by API.Bible."),
    verseCount: s.integer("The verse count returned by API.Bible."),
    content: contentSchema,
    copyright: s.nonEmptyString("The copyright string returned by API.Bible."),
  },
);

const passageSchema = s.looseObject(
  "One passage payload returned by API.Bible.",
  {
    id: s.nonEmptyString("The passage identifier returned by API.Bible."),
    orgId: s.nonEmptyString("The organization-specific passage identifier returned by API.Bible."),
    bibleId: s.nonEmptyString("The Bible identifier associated with the passage."),
    reference: s.nonEmptyString("The human-readable passage reference returned by API.Bible."),
    verseCount: s.integer("The verse count returned by API.Bible."),
    content: contentSchema,
    copyright: s.nonEmptyString("The copyright string returned by API.Bible."),
  },
);

const searchVerseSchema = s.looseObject(
  "One verse search result returned by API.Bible.",
  {
    id: s.nonEmptyString("The verse identifier returned by API.Bible search."),
    orgId: s.nonEmptyString("The organization-specific verse identifier returned by API.Bible."),
    bibleId: s.nonEmptyString("The Bible identifier associated with the verse."),
    bookId: s.nonEmptyString("The book identifier associated with the verse."),
    chapterId: s.nonEmptyString("The chapter identifier associated with the verse."),
    reference: s.nonEmptyString("The human-readable verse reference returned by API.Bible."),
    text: s.nonEmptyString("The verse text returned by API.Bible search when present."),
  },
);

const searchPassageSchema = s.looseObject(
  "One passage search result returned by API.Bible.",
  {
    id: s.nonEmptyString("The passage identifier returned by API.Bible search."),
    orgId: s.nonEmptyString("The organization-specific passage identifier returned by API.Bible."),
    bibleId: s.nonEmptyString("The Bible identifier associated with the passage."),
    reference: s.nonEmptyString("The human-readable passage reference returned by API.Bible."),
    content: contentSchema,
  },
);

const displayOptionsSchema: Record<string, JsonSchema> = {
  parallels: s.nonEmptyString(
    "A comma-separated list of Bible identifiers used for parallel content comparison.",
  ),
  contentType: contentTypeSchema,
  includeNotes: s.boolean({ description: "Whether to include footnotes in the returned content.", default: false }),
  includeTitles: s.boolean({ description: "Whether to include section titles in the returned content.", default: true }),
  includeVerseSpans: s.boolean({
    description: "Whether to include verse span wrappers in the returned content.",
    default: false,
  }),
  includeVerseNumbers: s.boolean({
    description: "Whether to include verse numbers in the returned content.",
    default: true,
  }),
  includeChapterNumbers: s.boolean({
    description: "Whether to include chapter numbers in the returned content.",
    default: false,
  }),
  useOrgId: s.boolean({
    description:
      "Whether the supplied identifier should match the upstream organization-specific identifier.",
    default: false,
  }),
};

export const apiBibleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_bibles",
    description:
      "List Bible versions from API.Bible with optional language, abbreviation, or name filters.",
    inputSchema: s.object(
      "Input parameters for listing Bible versions from API.Bible.",
      {
        language: s.nonEmptyString("The ISO language code used to filter Bible versions."),
        abbreviation: s.nonEmptyString("The Bible abbreviation used to filter Bible versions."),
        name: s.nonEmptyString("The Bible name filter used to narrow the result set."),
      },
      { optional: ["language", "abbreviation", "name"] },
    ),
    outputSchema: s.object("The Bible version list returned by API.Bible.", {
      bibles: s.array("The Bible versions returned by API.Bible.", bibleSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_books",
    description: "List books for one Bible version from API.Bible.",
    inputSchema: s.object(
      "Input parameters for listing books from one Bible version.",
      {
        bibleId: s.nonEmptyString("The Bible identifier used to list books."),
      },
      { required: ["bibleId"] },
    ),
    outputSchema: s.object("The book list returned by API.Bible.", {
      books: s.array("The books returned by API.Bible.", bookSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_chapters",
    description: "List chapters for one book in one Bible version from API.Bible.",
    inputSchema: s.object(
      "Input parameters for listing chapters from one book.",
      {
        bibleId: s.nonEmptyString("The Bible identifier used to list chapters."),
        bookId: s.nonEmptyString("The book identifier used to list chapters."),
      },
      { required: ["bibleId", "bookId"] },
    ),
    outputSchema: s.object("The chapter list returned by API.Bible.", {
      chapters: s.array("The chapters returned by API.Bible.", chapterSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_chapter",
    description: "Retrieve one chapter with configurable display options from API.Bible.",
    inputSchema: displayInput("Input parameters for retrieving one chapter from API.Bible.", {
      bibleId: s.nonEmptyString("The Bible identifier used to retrieve the chapter."),
      chapterId: s.nonEmptyString("The chapter identifier used to retrieve the chapter."),
    }),
    outputSchema: s.object(
      "The chapter response returned by API.Bible.",
      {
        chapter: chapterSchema,
        meta: metaSchema,
      },
      { optional: ["meta"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_verses",
    description: "List verses for one chapter in one Bible version from API.Bible.",
    inputSchema: s.object(
      "Input parameters for listing verses from one chapter.",
      {
        bibleId: s.nonEmptyString("The Bible identifier used to list verses."),
        chapterId: s.nonEmptyString("The chapter identifier used to list verses."),
      },
      { required: ["bibleId", "chapterId"] },
    ),
    outputSchema: s.object("The verse list returned by API.Bible.", {
      verses: s.array("The verses returned by API.Bible.", verseSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_verse",
    description: "Retrieve one verse with configurable display options from API.Bible.",
    inputSchema: displayInput("Input parameters for retrieving one verse from API.Bible.", {
      bibleId: s.nonEmptyString("The Bible identifier used to retrieve the verse."),
      verseId: s.nonEmptyString("The verse identifier used to retrieve the verse."),
    }),
    outputSchema: s.object(
      "The verse response returned by API.Bible.",
      {
        verse: verseSchema,
        meta: metaSchema,
      },
      { optional: ["meta"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_passage",
    description: "Retrieve one passage with configurable display options from API.Bible.",
    inputSchema: displayInput("Input parameters for retrieving one passage from API.Bible.", {
      bibleId: s.nonEmptyString("The Bible identifier used to retrieve the passage."),
      passageId: s.nonEmptyString("The passage identifier used to retrieve the passage."),
    }),
    outputSchema: s.object(
      "The passage response returned by API.Bible.",
      {
        passage: passageSchema,
        meta: metaSchema,
      },
      { optional: ["meta"] },
    ),
  }),
  defineProviderAction(service, {
    name: "search_scripture",
    description:
      "Search scripture within one Bible version from API.Bible and preserve whether the result is verse-based or passage-based.",
    inputSchema: s.object(
      "Input parameters for searching scripture from API.Bible.",
      {
        bibleId: s.nonEmptyString("The Bible identifier used for the search request."),
        query: s.nonEmptyString("The keyword or passage reference query sent to API.Bible search."),
        limit: s.nonNegativeInteger("The maximum number of results returned by API.Bible."),
        offset: s.nonNegativeInteger("The number of results skipped before the response page."),
      },
      { required: ["bibleId", "query"] },
    ),
    outputSchema: s.object(
      "The normalized scripture search result returned by API.Bible.",
      {
        query: s.nonEmptyString("The query echoed back by API.Bible search."),
        limit: s.integer("The result limit returned by API.Bible search."),
        offset: s.integer("The result offset returned by API.Bible search."),
        total: s.integer("The total number of matches returned by API.Bible."),
        resultType: s.stringEnum("Whether API.Bible search returned verse results or passage results.", [
          "verses",
          "passages",
        ]),
        verses: s.array("The verse results returned by API.Bible.", searchVerseSchema),
        passages: s.array("The passage results returned by API.Bible.", searchPassageSchema),
        meta: metaSchema,
      },
      { optional: ["meta"] },
    ),
  }),
];

export type ApiBibleActionName = (typeof apiBibleActions)[number]["name"];

function displayInput(description: string, requiredFields: Record<string, JsonSchema>): JsonSchema {
  return s.object(description, { ...requiredFields, ...displayOptionsSchema }, { required: Object.keys(requiredFields) });
}
