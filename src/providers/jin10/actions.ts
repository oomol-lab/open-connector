import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "jin10";

const statusMessageSchema = {
  status: s.integer("The Jin10 status code. `200` means the request succeeded."),
  message: s.string("The Jin10 status message or error description."),
};

const codeInputSchema = s.object("Input for selecting a Jin10 quote instrument.", {
  code: s.string("The quote instrument code, such as `XAUUSD`. Use `list_quote_codes` to discover supported codes.", {
    minLength: 1,
  }),
});

const quoteSchema = s.object("A real-time quote returned by Jin10.", {
  code: s.string("The quote instrument code."),
  name: s.string("The quote instrument name."),
  time: s.string("The quote publication time in RFC 3339 format."),
  open: s.string("The opening price."),
  close: s.string("The latest or closing price."),
  high: s.string("The highest price."),
  low: s.string("The lowest price."),
  volume: s.integer("The traded volume."),
  ups_price: s.string("The price change."),
  ups_percent: s.string("The percentage price change."),
});

const klineSchema = s.object("One minute-level K-line returned by Jin10.", {
  time: s.integer("The K-line timestamp in Unix seconds."),
  open: s.string("The opening price."),
  close: s.string("The closing price."),
  high: s.string("The highest price."),
  low: s.string("The lowest price."),
  volume: s.integer("The traded volume."),
});

const flashItemSchema = s.object(
  "A Jin10 flash news item.",
  {
    title: s.string("The flash news title. This may be empty."),
    content: s.string("The flash news body."),
    time: s.string("The flash news publication time."),
    url: s.url("The original flash news URL."),
  },
  { optional: ["title"] },
);

const newsSummarySchema = s.object("A Jin10 news article summary.", {
  id: s.string("The article ID."),
  title: s.string("The article title."),
  introduction: s.string("The article introduction."),
  time: s.string("The article publication time."),
  url: s.url("The original article URL."),
});

const newsDetailSchema = s.object("A Jin10 news article detail.", {
  id: s.string("The article ID."),
  title: s.string("The article title."),
  introduction: s.string("The article introduction."),
  content: s.string("The article body."),
  time: s.string("The article publication time."),
  url: s.url("The original article URL."),
});

const paginatedFlashDataSchema = s.object("A paginated Jin10 flash news result.", {
  items: s.array("Flash news items on this page.", flashItemSchema),
  next_cursor: s.string("The cursor for the next page, or an empty string when there is no page."),
  has_more: s.boolean("Whether more pages are available."),
});

const paginatedNewsDataSchema = s.object("A paginated Jin10 article result.", {
  items: s.array("Article summaries on this page.", newsSummarySchema),
  next_cursor: s.string("The cursor for the next page, or an empty string when there is no page."),
  has_more: s.boolean("Whether more pages are available."),
});

const quoteCodeSchema = s.object("A Jin10 quote instrument code.", {
  code: s.string("The quote instrument code."),
  name: s.string("The quote instrument display name."),
});

const calendarItemSchema = s.object("A Jin10 economic calendar item.", {
  pub_time: s.string("The scheduled publication time."),
  star: s.integer("The importance level."),
  title: s.string("The calendar indicator title."),
  previous: s.nullable(s.string("The previous value.")),
  consensus: s.nullable(s.string("The consensus forecast value.")),
  actual: s.nullable(s.string("The actual published value.")),
  revised: s.nullable(s.string("The revised value.")),
  affect_txt: s.string("The market impact description."),
});

const cursorInputSchema = s.object(
  "Input for reading a cursor-paginated Jin10 list.",
  {
    cursor: s.string("The pagination cursor from `data.next_cursor` of the previous page."),
  },
  { optional: ["cursor"] },
);

const keywordInputSchema = s.object("Input for searching Jin10 content by keyword.", {
  keyword: s.string("The search keyword.", { minLength: 1 }),
});

const keywordCursorInputSchema = s.object(
  "Input for searching Jin10 content with cursor pagination.",
  {
    keyword: s.string("The search keyword.", { minLength: 1 }),
    cursor: s.string("The pagination cursor from `data.next_cursor` of the previous page."),
  },
  { optional: ["cursor"] },
);

const emptyInputSchema = s.object("No input is required.", {});

export const jin10Actions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_quote_codes",
    operationType: "read",
    description: "List quote instrument codes supported by Jin10 from the `quote://codes` MCP resource.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Jin10 quote instrument code list.", {
      data: s.array("Supported quote instrument codes.", quoteCodeSchema),
      ...statusMessageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_quote",
    operationType: "read",
    description: "Get a real-time Jin10 quote for a supported instrument code.",
    requiredScopes: [],
    inputSchema: codeInputSchema,
    outputSchema: s.object("The Jin10 real-time quote response.", {
      data: s.nullable(quoteSchema),
      ...statusMessageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_kline",
    operationType: "read",
    description: "Get minute-level K-line data for a supported Jin10 instrument code.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input for reading Jin10 minute-level K-line data.",
      {
        code: s.string(
          "The quote instrument code, such as `XAUUSD`. Use `list_quote_codes` to discover supported codes.",
          { minLength: 1 },
        ),
        time: s.integer("The start Unix timestamp in seconds, within the last 24 hours."),
        count: s.integer("The number of minute K-lines to return, from 1 to 100.", {
          minimum: 1,
          maximum: 100,
        }),
      },
      { optional: ["time", "count"] },
    ),
    outputSchema: s.object("The Jin10 K-line response.", {
      data: s.nullable(
        s.object("Jin10 K-line data for one instrument.", {
          code: s.string("The quote instrument code."),
          name: s.string("The quote instrument name."),
          klines: s.array("Minute-level K-lines.", klineSchema),
        }),
      ),
      ...statusMessageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_flash",
    operationType: "read",
    description: "List the latest Jin10 flash news items with cursor pagination.",
    requiredScopes: [],
    inputSchema: cursorInputSchema,
    outputSchema: s.object("The Jin10 paginated flash news response.", {
      data: s.nullable(paginatedFlashDataSchema),
      ...statusMessageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_flash",
    operationType: "read",
    description: "Search Jin10 flash news by keyword. The MCP tool returns up to 150 items without pagination.",
    requiredScopes: [],
    inputSchema: keywordInputSchema,
    outputSchema: s.object("The Jin10 flash news search response.", {
      data: s.nullable(
        s.object("Jin10 flash news search results.", {
          items: s.array("Matching flash news items. The upstream MCP tool returns up to 150.", flashItemSchema, {
            maxItems: 150,
          }),
        }),
      ),
      ...statusMessageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_news",
    operationType: "read",
    description: "List the latest Jin10 news articles with cursor pagination.",
    requiredScopes: [],
    inputSchema: cursorInputSchema,
    outputSchema: s.object("The Jin10 paginated article response.", {
      data: s.nullable(paginatedNewsDataSchema),
      ...statusMessageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "search_news",
    operationType: "read",
    description: "Search Jin10 news articles by keyword with cursor pagination.",
    requiredScopes: [],
    inputSchema: keywordCursorInputSchema,
    outputSchema: s.object("The Jin10 article search response.", {
      data: s.nullable(paginatedNewsDataSchema),
      ...statusMessageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_news",
    operationType: "read",
    description: "Get the full details for one Jin10 news article by article ID.",
    requiredScopes: [],
    inputSchema: s.object("Input for reading a Jin10 article detail.", {
      id: s.string("The Jin10 article ID.", { minLength: 1 }),
    }),
    outputSchema: s.object("The Jin10 article detail response.", {
      data: s.nullable(newsDetailSchema),
      ...statusMessageSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_calendar",
    operationType: "read",
    description: "Get Jin10 economic calendar items for the current natural week.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("The Jin10 economic calendar response.", {
      data: s.array("Economic calendar items for the current natural week.", calendarItemSchema),
      ...statusMessageSchema,
    }),
  }),
];

export type Jin10ActionName =
  | "list_quote_codes"
  | "get_quote"
  | "get_kline"
  | "list_flash"
  | "search_flash"
  | "list_news"
  | "search_news"
  | "get_news"
  | "list_calendar";
