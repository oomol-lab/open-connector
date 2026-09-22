import type { InvestodayOfficialToolDefinition } from "../official-tool-types.ts";

import { s } from "../../../core/json-schema.ts";
import { investodayCodeDataOutputSchema } from "../official-tool-types.ts";

// 此文件按 2026-09-21 官方 MCP tools/list 审核。
export const researchNewsOfficialTools: readonly InvestodayOfficialToolDefinition[] = [
  {
    name: "list_report_institutions",
    toolName: "list_report_institutions",
    description: "List report institutions data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_report_institutions operation.",
      {
        institutionName: s.withExamples(
          s.nonEmptyString("Research institution name Accepted by Investoday for list_report_institutions."),
          ["高盛"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_report_institutions.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_report_institutions.", { minimum: 1 }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "search_announcements",
    toolName: "list_announcement_vector-search",
    description:
      "Search announcement passages by meaning, optionally filtering by stock, announcement ID and publication dates.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for search_announcements.",
      {
        query: s.nonEmptyString("Natural-language text describing the announcement information to find."),
        stockCode: s.string("Optional stock code."),
        announcementId: s.integer("Optional announcement ID."),
        beginDate: s.string("Publication start date or timestamp, as accepted by Investoday."),
        endDate: s.string("Publication end date or timestamp, as accepted by Investoday."),
        topK: s.integer("Number of matching passages to return."),
      },
      { required: ["query"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_announcements",
    toolName: "list_announcements",
    description: "List announcements data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_announcements operation.",
      {
        beginDate: s.withExamples(
          s.date("Start date in YYYY-MM-DD format Accepted by Investoday for list_announcements.", {
            minLength: 1,
          }),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.date("End date in YYYY-MM-DD format Accepted by Investoday for list_announcements.", {
            minLength: 1,
          }),
          ["2020-01-02"],
        ),
        announcementId: s.withExamples(
          s.integer("Announcement identifier Accepted by Investoday for list_announcements."),
          [9128035],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_announcements.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        title: s.withExamples(s.nonEmptyString("Title keyword Accepted by Investoday for list_announcements."), [
          "贵州茅台利润大涨",
        ]),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_announcements.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for list_announcements."), [
          "000001",
        ]),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_announcement_content",
    toolName: "get_announcement_content",
    description: "Get announcement content data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_announcement_content operation.",
      {
        announcementId: s.withExamples(
          s.integer("Announcement identifier Accepted by Investoday for get_announcement_content."),
          [9128035],
        ),
        contentLength: s.withExamples(
          s.integer("Requested content length Accepted by Investoday for get_announcement_content.", {
            minimum: 1,
            maximum: 2000,
          }),
          [2000],
        ),
      },
      { required: ["announcementId"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_news",
    toolName: "list_news",
    description: "List news data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_news operation.",
      {
        sentiment: s.withExamples(
          s.withEnum(s.integer("Sentiment classification Accepted by Investoday for list_news."), [1, 2, 3, 4, 5]),
          [1],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_news.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        beginTime: s.withExamples(
          s.nonEmptyString("Start time in YYYY-MM-DD HH:mm:ss format Accepted by Investoday for list_news."),
          ["2020-01-01 08:00:00"],
        ),
        endTime: s.withExamples(
          s.nonEmptyString("End time in YYYY-MM-DD HH:mm:ss format Accepted by Investoday for list_news."),
          ["2025-02-01 08:00:00"],
        ),
        title: s.withExamples(s.nonEmptyString("Title keyword Accepted by Investoday for list_news."), ["人工智能"]),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_news.", {
            minimum: 1,
          }),
          [1],
        ),
        newsType: s.withExamples(
          s.withEnum(s.integer("News category Accepted by Investoday for list_news."), [1, 2, 3, 4]),
          [1],
        ),
        newsLevel: s.withExamples(
          s.withEnum(s.integer("News importance level Accepted by Investoday for list_news."), [1, 2]),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_entity_related_news",
    toolName: "list_entity_related_news",
    description: "List entity related news data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_entity_related_news operation.",
      {
        sentiment: s.withExamples(
          s.withEnum(
            s.integer("Sentiment classification Accepted by Investoday for list_entity_related_news."),
            [1, 2, 3, 4, 5],
          ),
          [1],
        ),
        conceptCode: s.withExamples(
          s.nonEmptyString("Concept code Accepted by Investoday for list_entity_related_news."),
          ["CLS81936"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_entity_related_news.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        beginTime: s.withExamples(
          s.nonEmptyString(
            "Start time in YYYY-MM-DD HH:mm:ss format Accepted by Investoday for list_entity_related_news.",
          ),
          ["2020-01-01 08:00:00"],
        ),
        endTime: s.withExamples(
          s.nonEmptyString(
            "End time in YYYY-MM-DD HH:mm:ss format Accepted by Investoday for list_entity_related_news.",
          ),
          ["2025-02-01 08:00:00"],
        ),
        title: s.withExamples(s.nonEmptyString("Title keyword Accepted by Investoday for list_entity_related_news."), [
          "人工智能",
        ]),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_entity_related_news.", { minimum: 1 }),
          [1],
        ),
        newsType: s.withExamples(
          s.withEnum(s.integer("News category Accepted by Investoday for list_entity_related_news."), [1, 2, 3, 4]),
          [1],
        ),
        newsLevel: s.withExamples(
          s.withEnum(s.integer("News importance level Accepted by Investoday for list_entity_related_news."), [1, 2]),
          [1],
        ),
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for list_entity_related_news."), [
          "600839",
        ]),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_entity_related_news."),
          ["370000"],
        ),
        minRelevance: s.withExamples(
          s.integer("Minimum relevance score Accepted by Investoday for list_entity_related_news.", {
            minimum: 1,
            maximum: 5,
          }),
          [1],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "get_report_earnings_forecast_rating",
    toolName: "get_report_earnings_forecast_rating",
    description: "Get report earnings forecast rating data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday get_report_earnings_forecast_rating operation.",
      {
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for get_report_earnings_forecast_rating.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for get_report_earnings_forecast_rating.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for get_report_earnings_forecast_rating."),
          ["000001"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_report_research",
    toolName: "list_report_research",
    description:
      "Find research reports by stock, industry, institution or category, with optional keywords and publication dates.",
    operationType: "read",
    inputSchema: s.requireAnyProperty(
      s.object(
        "Arguments for list_report_research.",
        {
          stockCode: s.nonEmptyString(
            "Stock code; supply at least one stock, industry, institution or category filter.",
          ),
          industryCode: s.nonEmptyString("Shenwan level 2 industry code."),
          industryCodeLv1: s.nonEmptyString("Shenwan level 1 industry code."),
          institutionCode: s.integer("Research institution code."),
          categoryCode: s.stringEnum(
            "Report category: 000100 industry, 000200 company, 000300 fund, 000400 bond, 000500 strategy, 000700 economy, 000800 forex, 000900 futures, 001000 money market, 001100 global market, 001200 capital market, 001210 NEEQ, 001300 Hong Kong, 001400 other, 001500 morning briefing, 001600 warrants, 001700 financial engineering, 001900 non-fund wealth management.",
            [
              "000100",
              "000200",
              "000300",
              "000400",
              "000500",
              "000700",
              "000800",
              "000900",
              "001000",
              "001100",
              "001200",
              "001210",
              "001300",
              "001400",
              "001500",
              "001600",
              "001700",
              "001900",
            ],
          ),
          beginDate: s.date("Publication start date in YYYY-MM-DD format."),
          endDate: s.date("End date in YYYY-MM-DD format."),
          key: s.string("Optional keyword for research reports."),
          pageNum: s.integer("Page number, starting at 1.", { minimum: 1 }),
          pageSize: s.integer("Records per page, from 1 to 500.", { minimum: 1, maximum: 500 }),
        },
        { required: [] },
      ),
      ["stockCode", "industryCode", "industryCodeLv1", "institutionCode", "categoryCode"],
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_report_stock_forecast_ratings",
    toolName: "list_report_stock_forecast_ratings",
    description: "List report stock forecast ratings data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_report_stock_forecast_ratings operation.",
      {
        beginDate: s.withExamples(
          s.nonEmptyString(
            "Start date in YYYY-MM-DD format Accepted by Investoday for list_report_stock_forecast_ratings.",
          ),
          ["2020-01-01"],
        ),
        endDate: s.withExamples(
          s.nonEmptyString(
            "End date in YYYY-MM-DD format Accepted by Investoday for list_report_stock_forecast_ratings.",
          ),
          ["2025-05-01"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_report_stock_forecast_ratings.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_report_stock_forecast_ratings.", {
            minimum: 1,
          }),
          [1],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_report_stock_forecast_ratings."),
          ["000001"],
        ),
      },
      { required: ["stockCode"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_report_vector-search",
    toolName: "list_report_vector-search",
    description: "List report vector search data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_report_vector-search operation.",
      {
        topK: s.withExamples(
          s.integer("Maximum number of best matches to return Accepted by Investoday for list_report_vector-search."),
          [3],
        ),
        beginDate: s.withExamples(
          s.nonEmptyString("Start date in YYYY-MM-DD format Accepted by Investoday for list_report_vector-search."),
          ["2020-01-01"],
        ),
        institutionCode: s.withExamples(
          s.nonEmptyString("Research institution code Accepted by Investoday for list_report_vector-search."),
          ["37"],
        ),
        endDate: s.withExamples(
          s.nonEmptyString("End date in YYYY-MM-DD format Accepted by Investoday for list_report_vector-search."),
          ["2021-01-01"],
        ),
        query: s.withExamples(
          s.nonEmptyString("Natural-language query text Accepted by Investoday for list_report_vector-search."),
          ["新能源汽车"],
        ),
        categoryCode: s.withExamples(
          s.stringEnum("Category code Accepted by Investoday for list_report_vector-search.", [
            "000100",
            "000200",
            "000300",
            "000400",
            "000500",
            "000700",
            "000800",
            "000900",
            "001000",
            "001100",
            "001200",
            "001210",
            "001300",
            "001400",
            "001500",
            "001600",
            "001700",
            "001900",
          ]),
          ["000100"],
        ),
        stockCode: s.withExamples(
          s.nonEmptyString("Stock code Accepted by Investoday for list_report_vector-search."),
          ["002594"],
        ),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_report_vector-search."),
          ["740000"],
        ),
      },
      { required: ["query"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "list_research_sentiment",
    toolName: "list_research_sentiment",
    description: "List research sentiment data from Investoday.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday list_research_sentiment operation.",
      {
        sentiment: s.withExamples(
          s.withEnum(
            s.integer("Sentiment classification Accepted by Investoday for list_research_sentiment."),
            [1, 2, 3, 4, 5],
          ),
          [1],
        ),
        conceptCode: s.withExamples(
          s.nonEmptyString("Concept code Accepted by Investoday for list_research_sentiment."),
          ["CLS81936"],
        ),
        pageSize: s.withExamples(
          s.integer("Number of records per page Accepted by Investoday for list_research_sentiment.", {
            minimum: 1,
            maximum: 500,
          }),
          [10],
        ),
        categoryCode: s.withExamples(
          s.stringEnum("Category code Accepted by Investoday for list_research_sentiment.", [
            "000100",
            "000200",
            "000300",
            "000400",
            "000500",
            "000700",
            "000800",
            "000900",
            "001000",
            "001100",
            "001200",
            "001210",
            "001300",
            "001400",
            "001500",
            "001600",
            "001700",
            "001900",
          ]),
          ["000100"],
        ),
        title: s.withExamples(s.nonEmptyString("Title keyword Accepted by Investoday for list_research_sentiment."), [
          "宏观",
        ]),
        pageNum: s.withExamples(
          s.integer("Page number, starting at 1 Accepted by Investoday for list_research_sentiment.", { minimum: 1 }),
          [1],
        ),
        stockCode: s.withExamples(s.nonEmptyString("Stock code Accepted by Investoday for list_research_sentiment."), [
          "000001",
        ]),
        industryCode: s.withExamples(
          s.nonEmptyString("Industry code Accepted by Investoday for list_research_sentiment."),
          ["370000"],
        ),
        minRelevance: s.withExamples(
          s.integer("Minimum relevance score Accepted by Investoday for list_research_sentiment.", {
            minimum: 1,
            maximum: 6,
          }),
          [1],
        ),
        institutionCode: s.withExamples(
          s.integer("Research institution code Accepted by Investoday for list_research_sentiment."),
          [142],
        ),
        guid: s.withExamples(
          s.nonEmptyString("Globally unique record identifier Accepted by Investoday for list_research_sentiment."),
          ["0236EC2B-2416-455E-BF82-E4ED96E91DB0"],
        ),
        beginTime: s.withExamples(
          s.nonEmptyString(
            "Start time in YYYY-MM-DD HH:mm:ss format Accepted by Investoday for list_research_sentiment.",
          ),
          ["2020-01-01 08:00:00"],
        ),
        endTime: s.withExamples(
          s.nonEmptyString(
            "End time in YYYY-MM-DD HH:mm:ss format Accepted by Investoday for list_research_sentiment.",
          ),
          ["2025-01-02 08:00:00"],
        ),
      },
      { required: [] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
  {
    name: "entity_recognition",
    toolName: "entity_recognition",
    description: "Run the Investoday entity recognition operation.",
    operationType: "read",
    inputSchema: s.object(
      "Arguments for the Investoday entity_recognition operation.",
      {
        input: s.withExamples(
          s.nonEmptyString("Natural-language input to analyze Accepted by Investoday for entity_recognition."),
          ["贵州茅台怎么样？"],
        ),
      },
      { required: ["input"] },
    ),
    outputSchema: investodayCodeDataOutputSchema,
  },
];
