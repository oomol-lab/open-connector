import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const requestContext = s.string(
  "Agents must send the user request that triggered this call. Include only necessary conversation context and remove credentials.",
  { minLength: 1 },
);

export const wereadActions: ActionDefinition[] = [
  defineProviderAction("weread", {
    name: "search",
    operationType: "read",
    requiredScopes: [],
    description:
      "Search WeRead. Choose scope explicitly; use the last searchIdx as maxIdx for the next page. Response group scope may differ from request scope.",
    inputSchema: s.object(
      "Parameters for search.",
      {
        context: requestContext,
        keyword: s.string("Search keywords.", { minLength: 1 }),
        scope: {
          ...s.integer(
            "Search type: 0 all, 10 ebooks, 16 web novels, 14 audio, 6 authors, 12 full text, 13 book lists, 2 public accounts, 4 articles.",
          ),
          enum: [0, 10, 16, 14, 6, 12, 13, 2, 4],
        },
        maxIdx: s.integer("Pagination offset from the previous page; initially 0.", { minimum: 0 }),
        count: s.integer("Page size; omit to use the upstream default.", { minimum: 1 }),
      },
      { required: ["keyword", "scope", "context"] },
    ),
    outputSchema: s.looseObject("Search response.", {
      sid: s.string("Search session ID."),
      hasMore: s.integer("Whether another page exists: 1 means yes, 0 means no."),
      results: s.array(
        "Result groups; do not filter groups by the requested scope.",
        s.looseObject("A search result group.", {
          scope: s.integer("Response group type; ebook groups can use 17."),
          books: s.array(
            "Results in this group.",
            s.looseObject("A search result.", {
              searchIdx: s.integer("Pagination offset from the previous page; initially 0.", {
                minimum: 0,
              }),
              bookInfo: s.looseObject("Book metadata, including any upstream links and additional fields.", {
                bookId: s.string("The book ID returned by search or the shelf.", {
                  minLength: 1,
                }),
                title: s.string("Book title."),
                author: s.string("Book author."),
                readerLink: s.string("Use this upstream reader URL to open the book; do not construct a URL."),
                deepLink: s.string("Book details link; use when readerLink is absent."),
              }),
            }),
          ),
        }),
      ),
    }),
  }),
  defineProviderAction("weread", {
    name: "get_book",
    operationType: "read",
    requiredScopes: [],
    description: "Get book details by ID.",
    inputSchema: s.object(
      "Parameters for get_book.",
      { bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }) },
      { required: ["bookId"] },
    ),
    outputSchema: s.looseObject("Book metadata, including any upstream links and additional fields.", {
      bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
      title: s.string("Book title."),
      author: s.string("Book author."),
      readerLink: s.string("Use this upstream reader URL to open the book; do not construct a URL."),
      deepLink: s.string("Book details link; use when readerLink is absent."),
    }),
  }),
  defineProviderAction("weread", {
    name: "list_chapters",
    operationType: "read",
    requiredScopes: [],
    description: "List a book's chapter table of contents.",
    inputSchema: s.object(
      "Parameters for list_chapters.",
      { bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }) },
      { required: ["bookId"] },
    ),
    outputSchema: s.looseObject("Chapter listing.", {
      bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
      synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
      chapters: s.array(
        "Chapters in the book.",
        s.looseObject("Chapter details.", {
          chapterUid: s.integer("The chapter UID returned by list_chapters."),
          title: s.string("Chapter title."),
          chapterIdx: s.integer("Chapter order."),
          level: s.integer("Heading level, starting at 1."),
        }),
      ),
    }),
  }),
  defineProviderAction("weread", {
    name: "get_reading_progress",
    operationType: "read",
    requiredScopes: [],
    description: "Get reading progress. Progress 1 means 1%; completion requires progress 100 and finishTime.",
    inputSchema: s.object(
      "Parameters for get_reading_progress.",
      { bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }) },
      { required: ["bookId"] },
    ),
    outputSchema: s.looseObject("Reading progress response.", {
      bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
      book: s.looseObject("Reading progress and timestamps.", {
        progress: s.integer("Reading percentage from 0 to 100, not a fraction."),
        recordReadingTime: s.number("Accumulated reading time in seconds."),
        finishTime: s.integer("Completion Unix timestamp, present only after finishing."),
        chapterUid: s.integer("The chapter UID returned by list_chapters."),
      }),
    }),
  }),
  defineProviderAction("weread", {
    name: "get_shelf",
    operationType: "read",
    requiredScopes: [],
    description:
      "Read the shelf. Visible entries equal books.length + albums.length + 1 when mp is nonempty; bookCount excludes audio and mp.",
    inputSchema: s.object("Parameters for get_shelf.", {}, { required: [] }),
    outputSchema: s.looseObject("Shelf response.", {
      books: s.array(
        "Ebooks and imported books, excluding audio albums and the mp entry.",
        s.looseObject("Book metadata, including any upstream links and additional fields.", {
          bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
          title: s.string("Book title."),
          author: s.string("Book author."),
          readerLink: s.string("Use this upstream reader URL to open the book; do not construct a URL."),
          deepLink: s.string("Book details link; use when readerLink is absent."),
        }),
      ),
      albums: s.array(
        "Audiobook albums, which also count as shelf entries.",
        s.looseObject("Audio album metadata and listening state.", {}),
      ),
      mp: s.looseObject("Article collection entry; a nonempty object counts as one private shelf entry.", {}),
      archive: s.array("Book list folders.", s.looseObject("Folder name and book IDs.", {})),
      bookCount: s.integer("Ebook count only; not the total shelf count."),
    }),
  }),
  defineProviderAction("weread", {
    name: "list_notebooks",
    operationType: "read",
    requiredScopes: [],
    description:
      "List notebook summaries. Next lastSort is the final book's sort. Total notes include reviewCount + noteCount + bookmarkCount.",
    inputSchema: s.object(
      "Parameters for list_notebooks.",
      {
        count: s.integer("Page size; omit to use the upstream default.", { minimum: 1 }),
        lastSort: s.integer("The last book's sort value from the previous page; omit on the first page."),
      },
      { required: [] },
    ),
    outputSchema: s.looseObject("Notebook summaries and pagination.", {
      totalBookCount: s.integer("Total number of books with notes."),
      totalNoteCount: s.integer("Total highlights, personal reviews and bookmarks combined."),
      hasMore: s.integer("Whether another page exists: 1 means yes, 0 means no."),
      books: s.array(
        "Books with notes.",
        s.looseObject("A notebook summary.", {
          bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
          book: s.looseObject("Book metadata, including any upstream links and additional fields.", {
            bookId: s.string("The book ID returned by search or the shelf.", {
              minLength: 1,
            }),
            title: s.string("Book title."),
            author: s.string("Book author."),
            readerLink: s.string("Use this upstream reader URL to open the book; do not construct a URL."),
            deepLink: s.string("Book details link; use when readerLink is absent."),
          }),
          sort: s.integer("Cursor for the next lastSort request."),
          noteCount: s.integer("Highlight count only, not the total note count."),
          reviewCount: s.integer("Personal thoughts and reviews combined; do not count reviews twice."),
          bookmarkCount: s.integer("Reading-position bookmark count; bookmark content cannot be exported."),
        }),
      ),
    }),
  }),
  defineProviderAction("weread", {
    name: "list_highlights",
    operationType: "read",
    requiredScopes: [],
    description:
      "List personal highlights in a book, excluding reading-position bookmarks. Query list_my_reviews as well to retrieve all exportable note content.",
    inputSchema: s.object(
      "Parameters for list_highlights.",
      { bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }) },
      { required: ["bookId"] },
    ),
    outputSchema: s.looseObject("Personal highlight content.", {
      updated: s.array(
        "Highlights only; upstream filters out type 0 bookmarks.",
        s.looseObject("A personal highlight.", {
          bookmarkId: s.string("Highlight ID."),
          markText: s.string("Highlighted source text."),
          chapterUid: s.integer("The chapter UID returned by list_chapters."),
          createTime: s.integer("Creation Unix timestamp in seconds."),
        }),
      ),
      chapters: s.array("Chapter information used to locate highlights.", s.looseObject("Chapter metadata.", {})),
      book: s.looseObject("Book metadata, including any upstream links and additional fields.", {
        bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
        title: s.string("Book title."),
        author: s.string("Book author."),
        readerLink: s.string("Use this upstream reader URL to open the book; do not construct a URL."),
        deepLink: s.string("Book details link; use when readerLink is absent."),
      }),
    }),
  }),
  defineProviderAction("weread", {
    name: "list_my_reviews",
    operationType: "read",
    requiredScopes: [],
    description:
      "List personal thoughts, chapter comments and book reviews. Continue with the returned synckey while hasMore is 1.",
    inputSchema: s.object(
      "Parameters for list_my_reviews.",
      {
        bookid: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
        synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
        count: s.integer("Page size; omit to use the upstream default.", { minimum: 1 }),
      },
      { required: ["bookid"] },
    ),
    outputSchema: s.looseObject("Personal reviews and pagination.", {
      reviews: s.array(
        "Personal review entries.",
        s.looseObject("Personal review wrapper.", {
          review: s.looseObject("Review details, including conditional abstract, range, content and author fields.", {
            content: s.string("Review text."),
            abstract: s.string("Highlighted source text, when this review refers to a passage."),
            range: s.string("Position range of the source passage, when available."),
          }),
        }),
      ),
      totalCount: s.integer("Total personal review count."),
      hasMore: s.integer("Whether another page exists: 1 means yes, 0 means no."),
      synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
    }),
  }),
  defineProviderAction("weread", {
    name: "get_underline_stats",
    operationType: "read",
    requiredScopes: [],
    description: "Get chapter highlight popularity statistics without source text.",
    inputSchema: s.object(
      "Parameters for get_underline_stats.",
      {
        bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
        chapterUid: s.integer("The chapter UID returned by list_chapters."),
        synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
      },
      { required: ["bookId", "chapterUid"] },
    ),
    outputSchema: s.looseObject("Chapter highlight statistics.", {
      bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
      chapterUid: s.integer("The chapter UID returned by list_chapters."),
      synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
      underlines: s.array(
        "Highlight counts and scores, without text.",
        s.looseObject("Highlight range, count, score and type.", {}),
      ),
    }),
  }),
  defineProviderAction("weread", {
    name: "list_popular_highlights",
    operationType: "read",
    requiredScopes: [],
    description:
      "Get up to 20 popular highlights with source text. The upstream result is fixed-size and does not support pagination.",
    inputSchema: s.object(
      "Parameters for list_popular_highlights.",
      {
        bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
        chapterUid: s.integer("Chapter UID; 0 means all chapters and is the default."),
        synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
      },
      { required: ["bookId"] },
    ),
    outputSchema: s.looseObject("Popular highlights.", {
      synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
      totalCount: s.integer("Total popular highlight count, possibly larger than this fixed-size result."),
      items: s.array(
        "Popular highlight entries.",
        s.looseObject("A popular highlight.", {
          chapterUid: s.integer("The chapter UID returned by list_chapters."),
          range: s.string("Highlight position range for list_highlight_reviews."),
          markText: s.string("Highlighted source text."),
          totalCount: s.integer("Number of readers highlighting this passage."),
        }),
      ),
      chapters: s.array("Chapter information used to locate highlights.", s.looseObject("Chapter metadata.", {})),
    }),
  }),
  defineProviderAction("weread", {
    name: "list_highlight_reviews",
    operationType: "read",
    requiredScopes: [],
    description: "List thoughts on specified highlight ranges, preserving per-range pagination.",
    inputSchema: s.object(
      "Parameters for list_highlight_reviews.",
      {
        bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
        chapterUid: s.integer("The chapter UID returned by list_chapters."),
        reviews: s.array(
          "Highlight ranges and their independent page cursors.",
          s.object(
            "A highlight range query.",
            {
              range: s.string("Position range returned by list_popular_highlights.", {
                minLength: 1,
              }),
              maxIdx: s.integer("Pagination offset from the previous page; initially 0.", {
                minimum: 0,
              }),
              count: s.integer("Page size; values above 20 are truncated by the upstream service.", { minimum: 1 }),
              synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
            },
            { required: ["range"] },
          ),
        ),
      },
      { required: ["bookId", "chapterUid", "reviews"] },
    ),
    outputSchema: s.looseObject("Thoughts for each requested range.", {
      bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
      chapterUid: s.integer("The chapter UID returned by list_chapters."),
      reviews: s.array(
        "Per-range results and cursors.",
        s.looseObject("A range result.", {
          range: s.string("Highlight position range."),
          hasMore: s.integer("Whether another page exists: 1 means yes, 0 means no."),
          maxIdx: s.integer("Pagination offset from the previous page; initially 0.", {
            minimum: 0,
          }),
          synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
          totalCount: s.integer("Total thoughts for this range."),
          pageReviews: s.array(
            "Thoughts on this page.",
            s.looseObject("Thought wrapper.", {
              review: s.looseObject(
                "Review details, including conditional abstract, range, content and author fields.",
                {
                  content: s.string("Review text."),
                  abstract: s.string("Highlighted source text, when this review refers to a passage."),
                  range: s.string("Position range of the source passage, when available."),
                },
              ),
            }),
          ),
        }),
      ),
    }),
  }),
  defineProviderAction("weread", {
    name: "get_review",
    operationType: "read",
    requiredScopes: [],
    description: "Get a single thought or review with optional comments and likes.",
    inputSchema: s.object(
      "Parameters for get_review.",
      {
        reviewId: s.string("Thought or review ID.", { minLength: 1 }),
        commentsCount: s.integer("Number of comments to fetch; default 10.", { minimum: 0 }),
        commentsDirection: {
          ...s.integer("Comment order: 0 descending, 1 ascending."),
          enum: [0, 1],
        },
        likesCount: s.integer("Number of likes to fetch; default 10.", { minimum: 0 }),
        likesDirection: {
          ...s.integer("Like order; only 0 (descending) is documented."),
          enum: [0],
        },
        synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
      },
      { required: ["reviewId"] },
    ),
    outputSchema: s.looseObject("Thought or review details.", {
      reviewId: s.string("Thought or review ID."),
      review: s.looseObject("Review details, including conditional abstract, range, content and author fields.", {
        content: s.string("Review text."),
        abstract: s.string("Highlighted source text, when this review refers to a passage."),
        range: s.string("Position range of the source passage, when available."),
      }),
      htmlContent: s.string("Upstream rich-text HTML."),
      synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
    }),
  }),
  defineProviderAction("weread", {
    name: "get_reading_stats",
    operationType: "read",
    requiredScopes: [],
    description:
      "Get reading statistics for one period. Durations are seconds; annual mode covers only the selected calendar year.",
    inputSchema: s.object(
      "Parameters for get_reading_stats.",
      {
        mode: s.stringEnum("Period: weekly, monthly (default), annually or overall.", [
          "weekly",
          "monthly",
          "annually",
          "overall",
        ]),
        baseTime: s.integer(
          "Unix timestamp in the desired period; 0 selects the current period. Overall always uses 0.",
        ),
      },
      { required: [] },
    ),
    outputSchema: s.looseObject("Reading statistics; fields vary with mode and available data.", {
      baseTime: s.integer("Normalized period start Unix timestamp; 0 for overall."),
      totalReadTime: s.number(
        "Total reading and listening time in seconds for this period; prefer this over summing buckets.",
      ),
      dayAverageReadTime: s.number("Average seconds per calendar day, not per active reading day."),
      readDays: s.integer("Effective reading days, currently days with at least one minute of reading."),
      readTimes: s.record(
        "Bucket start timestamps mapped to reading seconds.",
        s.number("Reading seconds in this bucket."),
      ),
      dailyReadTimes: s.record(
        "Optional daily timestamp-to-seconds map in annual mode.",
        s.number("Reading seconds on this day."),
      ),
      preferTime: s.array(
        "Hourly reading seconds ordered from 06:00 through 05:00 the next day.",
        s.number("Reading seconds in this hour."),
      ),
      preferAuthor: s.array(
        "Preferred authors.",
        s.looseObject("Author preference.", {
          name: s.string("Author name."),
          readTime: s.string("Formatted duration text, not a number of seconds."),
        }),
      ),
      readLongest: s.array(
        "Top books or audio albums by reading time, up to 10 entries.",
        s.looseObject("A reading-time ranking entry.", {
          book: s.looseObject("Book metadata, including any upstream links and additional fields.", {
            bookId: s.string("The book ID returned by search or the shelf.", {
              minLength: 1,
            }),
            title: s.string("Book title."),
            author: s.string("Book author."),
            readerLink: s.string("Use this upstream reader URL to open the book; do not construct a URL."),
            deepLink: s.string("Book details link; use when readerLink is absent."),
          }),
          albumInfo: s.looseObject("Audio album metadata when this is audio content.", {}),
          readTime: s.number("Reading or listening time in seconds for this period."),
        }),
      ),
      readStat: s.array(
        "Upstream reading summary labels and formatted counts.",
        s.looseObject("Summary stat, counts and optional scheme.", {}),
      ),
    }),
  }),
  defineProviderAction("weread", {
    name: "list_book_reviews",
    operationType: "read",
    requiredScopes: [],
    description:
      "List public book reviews. Continue with the last idx and returned synckey. Content is nested at reviews[].review.review.",
    inputSchema: s.object(
      "Parameters for list_book_reviews.",
      {
        bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
        reviewListType: {
          ...s.integer("Filter: 0 all, 1 recommended, 2 negative, 3 newest, 4 average."),
          enum: [0, 1, 2, 3, 4],
        },
        count: s.integer("Page size; omit to use the upstream default.", { minimum: 1 }),
        maxIdx: s.integer("Pagination offset from the previous page; initially 0.", { minimum: 0 }),
        synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
      },
      { required: ["bookId"] },
    ),
    outputSchema: s.looseObject("Public reviews and pagination.", {
      synckey: s.integer("The sync or pagination key returned by the previous response; initially 0."),
      reviewsCnt: s.integer("Total public review count."),
      reviewsHasMore: s.integer("Whether another page exists: 1 means yes, 0 means no."),
      reviews: s.array(
        "Public review entries with two review wrappers.",
        s.looseObject("Public review list entry.", {
          idx: s.integer("Pagination offset from the previous page; initially 0.", {
            minimum: 0,
          }),
          review: s.looseObject("Public review wrapper.", {
            reviewId: s.string("Review ID."),
            review: s.looseObject("Public review body.", {
              content: s.string("Review text."),
              star: s.integer("Rating: 20, 40, 60, 80 and 100 correspond to one through five stars."),
            }),
          }),
        }),
      ),
    }),
  }),
  defineProviderAction("weread", {
    name: "list_recommendations",
    operationType: "read",
    requiredScopes: [],
    description: "List personalized book recommendations. Continue with the last book's searchIdx as maxIdx.",
    inputSchema: s.object(
      "Parameters for list_recommendations.",
      {
        context: requestContext,
        count: s.integer("Page size; omit to use the upstream default.", { minimum: 1 }),
        maxIdx: s.integer("Pagination offset from the previous page; initially 0.", { minimum: 0 }),
      },
      { required: ["context"] },
    ),
    outputSchema: s.looseObject("Personalized recommendations.", {
      books: s.array(
        "Recommended books.",
        s.looseObject("A recommended book.", {
          bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
          title: s.string("Book title."),
          author: s.string("Book author."),
          readerLink: s.string("Use this upstream reader URL to open the book; do not construct a URL."),
          deepLink: s.string("Book details link; use when readerLink is absent."),
          searchIdx: s.integer("Pagination offset from the previous page; initially 0.", {
            minimum: 0,
          }),
          reason: s.string("Recommendation reason."),
        }),
      ),
    }),
  }),
  defineProviderAction("weread", {
    name: "list_similar_books",
    operationType: "read",
    requiredScopes: [],
    description:
      "List similar books. Defaults to count 12 and maxIdx 0; continue with the last idx and returned sessionId.",
    inputSchema: s.object(
      "Parameters for list_similar_books.",
      {
        context: requestContext,
        bookId: s.string("The book ID returned by search or the shelf.", { minLength: 1 }),
        count: s.integer("Page size; omit to use the upstream default.", { minimum: 1 }),
        maxIdx: s.integer("Pagination offset from the previous page; initially 0.", { minimum: 0 }),
        sessionId: s.string("Session ID from the previous page; omit on the first page."),
      },
      { required: ["bookId", "context"] },
    ),
    outputSchema: s.looseObject("Similar book recommendations.", {
      booksimilar: s.looseObject("Similar books and their session.", {
        sessionId: s.string("Session ID to send with the next page."),
        books: s.array(
          "Similar book entries.",
          s.looseObject("A similar book result.", {
            idx: s.integer("Pagination offset from the previous page; initially 0.", {
              minimum: 0,
            }),
            book: s.looseObject("Book result wrapper.", {
              bookInfo: s.looseObject("Book metadata, including any upstream links and additional fields.", {
                bookId: s.string("The book ID returned by search or the shelf.", {
                  minLength: 1,
                }),
                title: s.string("Book title."),
                author: s.string("Book author."),
                readerLink: s.string("Use this upstream reader URL to open the book; do not construct a URL."),
                deepLink: s.string("Book details link; use when readerLink is absent."),
              }),
            }),
          }),
        ),
      }),
    }),
  }),
];
