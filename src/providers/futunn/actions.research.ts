import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const futunnResearchActions: readonly ActionDefinition[] = [
  defineProviderAction("futunn", {
    name: "search_news",
    operationType: "read",
    description: "Search news, announcements and research reports by keyword.",
    requiredScopes: ["quote:read"],
    inputSchema: s.object(
      "Content search options.",
      {
        keyword: s.string("Search keyword, company name, ticker or topic.", { minLength: 1 }),
        size: s.integer("Number of results; default 10, maximum 50.", { minimum: 1, maximum: 50 }),
        type: s.withEnum(
          s.integer("Content type: 1=news/discussion, 2=announcement/topic, 3=report/live stream; omit for all."),
          [1, 2, 3],
        ),
        sortType: s.withEnum(s.integer("Sort: 1=reads/popularity, 2=latest."), [1, 2]),
        language: s.stringEnum("Content language.", ["zh-CN", "zh-HK", "en", "ja"]),
      },
      { optional: ["size", "type", "sortType", "language"] },
    ),
    outputSchema: s.requiredObject("Search results.", {
      items: s.array(
        "Matching content items.",
        s.looseObject("Search result with title, link and timestamp.", {
          title: s.string("Title; news titles may contain em highlight tags."),
          url: s.string("Content link."),
          publish_time: s.integer("Publication timestamp in seconds."),
        }),
      ),
    }),
  }),
  defineProviderAction("futunn", {
    name: "search_community",
    operationType: "read",
    description: "Search community discussions, topics and live streams by keyword.",
    requiredScopes: ["quote:read"],
    inputSchema: s.object(
      "Content search options.",
      {
        keyword: s.string("Search keyword, company name, ticker or topic.", { minLength: 1 }),
        size: s.integer("Number of results; default 10, maximum 50.", { minimum: 1, maximum: 50 }),
        type: s.withEnum(
          s.integer("Content type: 1=news/discussion, 2=announcement/topic, 3=report/live stream; omit for all."),
          [1, 2, 3],
        ),
        sortType: s.withEnum(s.integer("Sort: 1=reads/popularity, 2=latest."), [1, 2]),
        language: s.stringEnum("Content language.", ["zh-CN", "zh-HK", "en", "ja"]),
      },
      { optional: ["size", "type", "sortType", "language"] },
    ),
    outputSchema: s.requiredObject("Search results.", {
      items: s.array(
        "Matching content items.",
        s.looseObject("Search result with title, link and timestamp.", {
          title: s.string("Title; news titles may contain em highlight tags."),
          url: s.string("Content link."),
          publish_time: s.integer("Publication timestamp in seconds."),
        }),
      ),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_security_info",
    operationType: "read",
    description: "Get basic security information, including listing date and lot size.",
    requiredScopes: ["quote:read"],
    inputSchema: s.requiredObject("Security information query.", {
      symbols: s.array(
        "Securities to query, up to 400.",
        s.string("Security code including market prefix, for example HK.00700.", { minLength: 1 }),
        { minItems: 1, maxItems: 400 },
      ),
    }),
    outputSchema: s.requiredObject("Security profiles; unresolved codes may be omitted by the provider.", {
      securities: s.array(
        "Resolved security profiles.",
        s.looseObject("Security profile.", {
          code: s.string("Security code including market prefix, for example HK.00700.", {
            minLength: 1,
          }),
          name: s.string("Security name."),
          lot_size: s.integer("Board lot size or contract multiplier."),
          stock_id: s.integer("Provider security identifier."),
        }),
      ),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_market_state",
    operationType: "read",
    description: "Get trading-session states for a batch of securities.",
    requiredScopes: ["quote:read"],
    inputSchema: s.object(
      "Market state query.",
      {
        symbols: s.array(
          "Securities to query, up to 400.",
          s.string("Security code including market prefix, for example HK.00700.", {
            minLength: 1,
          }),
          { minItems: 1, maxItems: 400 },
        ),
        includePreAfterMarket: s.boolean("Include US pre-market and after-hours sessions."),
        includeOvernight: s.boolean("Include US overnight sessions."),
        includeCryptoBrokers: s.boolean("Expand cryptocurrency records by broker."),
      },
      { optional: ["includePreAfterMarket", "includeOvernight", "includeCryptoBrokers"] },
    ),
    outputSchema: s.requiredObject("Market state results.", {
      states: s.array(
        "States matched to requested securities.",
        s.looseObject("Security market state.", {
          code: s.string("Security code including market prefix, for example HK.00700.", {
            minLength: 1,
          }),
          market_state: s.string("Market state such as open, closed or pre-market."),
          trade_section: s.array(
            "Trading session details.",
            s.looseObject("Provider record with additional fields preserved.", {}),
          ),
        }),
      ),
    }),
  }),
  defineProviderAction("futunn", {
    name: "screen_stocks",
    operationType: "read",
    description: "Screen securities with combined market, financial and technical conditions.",
    requiredScopes: ["quote:read"],
    inputSchema: {
      ...s.object(
        "Stock screening options. Factor IDs and scaling follow https://open.futunn.com/api/quote/screening/stock-screen.",
        {
          screenQueries: s.array("Combined screening conditions.", {
            description: "Exactly one official screening condition branch.",
            oneOf: [
              s.requiredObject("One simple_field_query branch.", {
                simple_field_query: s.looseObject(
                  "Official simple_field_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One plate_query branch.", {
                plate_query: s.looseObject(
                  "Official plate_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One simple_property_query branch.", {
                simple_property_query: s.looseObject(
                  "Official simple_property_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One cumulative_property_query branch.", {
                cumulative_property_query: s.looseObject(
                  "Official cumulative_property_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One financial_property_query branch.", {
                financial_property_query: s.looseObject(
                  "Official financial_property_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One indicator_positional_query branch.", {
                indicator_positional_query: s.looseObject(
                  "Official indicator_positional_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One indicator_pattern_query branch.", {
                indicator_pattern_query: s.looseObject(
                  "Official indicator_pattern_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One featured_property_query branch.", {
                featured_property_query: s.looseObject(
                  "Official featured_property_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One broker_holdings_query branch.", {
                broker_holdings_query: s.looseObject(
                  "Official broker_holdings_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One kline_shape_query branch.", {
                kline_shape_query: s.looseObject(
                  "Official kline_shape_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One option_query branch.", {
                option_query: s.looseObject(
                  "Official option_query payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
            ],
          }),
          retrieveQueries: s.array("Factors to return in matching order.", {
            description: "Exactly one official retrieval factor branch.",
            oneOf: [
              s.requiredObject("One basic_property branch.", {
                basic_property: s.looseObject(
                  "Official basic_property payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One simple_property branch.", {
                simple_property: s.looseObject(
                  "Official simple_property payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One cumulative_property branch.", {
                cumulative_property: s.looseObject(
                  "Official cumulative_property payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One financial_property branch.", {
                financial_property: s.looseObject(
                  "Official financial_property payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One featured_property branch.", {
                featured_property: s.looseObject(
                  "Official featured_property payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One indicator_property branch.", {
                indicator_property: s.looseObject(
                  "Official indicator_property payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One broker_property branch.", {
                broker_property: s.looseObject(
                  "Official broker_property payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One kline_shape_property branch.", {
                kline_shape_property: s.looseObject(
                  "Official kline_shape_property payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
              s.requiredObject("One option_property branch.", {
                option_property: s.looseObject(
                  "Official option_property payload. Preserve provider field IDs, periods and multiplier-scaled ranges.",
                  {},
                ),
              }),
            ],
          }),
          sort: {
            description: "Sort direction and exactly one supported factor.",
            oneOf: [
              s.requiredObject("Sort by simple_property.", {
                direction: s.withEnum(
                  s.integer("1=ascending, 2=descending, 3=absolute ascending, 4=absolute descending."),
                  [1, 2, 3, 4],
                ),
                simple_property: s.looseObject("Official sort factor, including name and any required period.", {}),
              }),
              s.requiredObject("Sort by cumulative_property.", {
                direction: s.withEnum(
                  s.integer("1=ascending, 2=descending, 3=absolute ascending, 4=absolute descending."),
                  [1, 2, 3, 4],
                ),
                cumulative_property: s.looseObject("Official sort factor, including name and any required period.", {}),
              }),
              s.requiredObject("Sort by financial_property.", {
                direction: s.withEnum(
                  s.integer("1=ascending, 2=descending, 3=absolute ascending, 4=absolute descending."),
                  [1, 2, 3, 4],
                ),
                financial_property: s.looseObject("Official sort factor, including name and any required period.", {}),
              }),
              s.requiredObject("Sort by featured_property.", {
                direction: s.withEnum(
                  s.integer("1=ascending, 2=descending, 3=absolute ascending, 4=absolute descending."),
                  [1, 2, 3, 4],
                ),
                featured_property: s.looseObject("Official sort factor, including name and any required period.", {}),
              }),
            ],
          },
          sorts: s.array("Ordered multi-factor sorting; do not combine with sort.", {
            description: "Sort direction and exactly one supported factor.",
            oneOf: [
              s.requiredObject("Sort by simple_property.", {
                direction: s.withEnum(
                  s.integer("1=ascending, 2=descending, 3=absolute ascending, 4=absolute descending."),
                  [1, 2, 3, 4],
                ),
                simple_property: s.looseObject("Official sort factor, including name and any required period.", {}),
              }),
              s.requiredObject("Sort by cumulative_property.", {
                direction: s.withEnum(
                  s.integer("1=ascending, 2=descending, 3=absolute ascending, 4=absolute descending."),
                  [1, 2, 3, 4],
                ),
                cumulative_property: s.looseObject("Official sort factor, including name and any required period.", {}),
              }),
              s.requiredObject("Sort by financial_property.", {
                direction: s.withEnum(
                  s.integer("1=ascending, 2=descending, 3=absolute ascending, 4=absolute descending."),
                  [1, 2, 3, 4],
                ),
                financial_property: s.looseObject("Official sort factor, including name and any required period.", {}),
              }),
              s.requiredObject("Sort by featured_property.", {
                direction: s.withEnum(
                  s.integer("1=ascending, 2=descending, 3=absolute ascending, 4=absolute descending."),
                  [1, 2, 3, 4],
                ),
                featured_property: s.looseObject("Official sort factor, including name and any required period.", {}),
              }),
            ],
          }),
          nextKey: s.string("Opaque next-page cursor; omit for the first page."),
          limit: s.integer("Page size; default 200, maximum 300.", { minimum: 1, maximum: 300 }),
          watchlistStockIds: s.array("Security IDs for watchlist mode 1.", s.integer("Provider security ID.")),
          holdingStockIds: s.array("Security IDs for holdings mode 2.", s.integer("Provider security ID.")),
          userStockListMode: s.withEnum(s.integer("0=all securities, 1=watchlist, 2=holdings."), [0, 1, 2]),
        },
        {
          optional: [
            "retrieveQueries",
            "sort",
            "sorts",
            "nextKey",
            "limit",
            "watchlistStockIds",
            "holdingStockIds",
            "userStockListMode",
          ],
        },
      ),
      not: { required: ["sort", "sorts"] },
    },
    outputSchema: s.requiredObject("Screened securities and pagination.", {
      items: s.array(
        "Matched securities; results align with retrieveQueries and retain provider-scaled values.",
        s.looseObject("Screening result.", {
          code: s.string("Security code including market prefix, for example HK.00700.", {
            minLength: 1,
          }),
          name: s.string("Security name."),
          results: s.array(
            "Returned factor values and type information.",
            s.looseObject("Provider record with additional fields preserved.", {}),
          ),
        }),
      ),
      pagination: s.nullable(
        s.looseObject("Pagination metadata from the response envelope; null when omitted.", {
          has_more: s.boolean("Whether more results are available."),
          next_key: s.string("Opaque next-page cursor; omit for the first page."),
          total: s.integer("Total matching records when provided."),
        }),
      ),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_financial_statements",
    operationType: "read",
    description: "Get financial statements or key metrics by reporting period.",
    requiredScopes: ["quote:read"],
    inputSchema: s.object(
      "Financial statement query.",
      {
        symbol: s.string("Security code including market prefix, for example HK.00700.", {
          minLength: 1,
        }),
        statementType: s.withEnum(
          s.integer("1=income statement, 2=balance sheet, 3=cash flow, 4=key metrics; default 1."),
          [1, 2, 3, 4],
        ),
        financialType: s.integer(
          "Financial period code: 1=Q1, 2=H1, 3=Q3, 4=Q4, 5=cumulative H1, 6=cumulative Q3, 7=annual, 10=latest; defaults vary by endpoint.",
        ),
        currencyCode: s.string("Report currency code, for example USD or CNY; omit for the native currency."),
        nextKey: s.string("Opaque next-page cursor; omit for the first page."),
        limit: s.integer("Page size; default 10, maximum 50.", { minimum: 1, maximum: 50 }),
      },
      { optional: ["statementType", "financialType", "currencyCode", "nextKey", "limit"] },
    ),
    outputSchema: s.requiredObject("Financial reports and pagination.", {
      reports: s.array(
        "Financial reports; empty when no data is available.",
        s.looseObject("Financial report and original accounting metadata.", {
          period_text: s.string("Financial reporting period."),
          currency_code: s.string("Report currency code, for example USD or CNY; omit for the native currency."),
          item_list: s.array(
            "Financial statement fields.",
            s.looseObject("Financial statement field.", {
              field_id: s.integer("Financial field ID."),
              display_name: s.string("Financial field display name."),
              data: s.number("Reported financial value."),
              value_type: s.string("amount for monetary values or percent for percentages."),
              yoy: s.number("Year-over-year percentage change."),
              qoq: s.number("Quarter-over-quarter percentage change."),
            }),
          ),
        }),
      ),
      pagination: s.nullable(
        s.looseObject("Pagination metadata from the response envelope; null when omitted.", {
          has_more: s.boolean("Whether more results are available."),
          next_key: s.string("Opaque next-page cursor; omit for the first page."),
        }),
      ),
      noData: s.boolean("Whether the provider explicitly reported no_data for a valid security."),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_revenue_breakdown",
    operationType: "read",
    description: "Get revenue composition by product, industry, region or business.",
    requiredScopes: ["quote:read"],
    inputSchema: s.object(
      "Revenue composition query.",
      {
        symbol: s.string("Security code including market prefix, for example HK.00700.", {
          minLength: 1,
        }),
        date: s.integer("Financial period end timestamp in seconds; 0 selects the latest period."),
        financialType: s.integer("Financial period selector; default 0."),
        currencyCode: s.string("Report currency code, for example USD or CNY; omit for the native currency."),
      },
      { optional: ["date", "financialType", "currencyCode"] },
    ),
    outputSchema: s.requiredObject("Revenue composition and available reporting periods.", {
      revenue: s.nullable(
        s.looseObject("Revenue breakdown with available period choices.", {
          period: s.string("Financial reporting period."),
          currency_code: s.string("Report currency code, for example USD or CNY; omit for the native currency."),
          breakdown_list: s.array(
            "Revenue composition dimensions and items.",
            s.looseObject("Provider record with additional fields preserved.", {}),
          ),
          screen_date_list: s.array(
            "Available period dates in seconds and financial type codes.",
            s.looseObject("Provider record with additional fields preserved.", {}),
          ),
        }),
      ),
      noData: s.boolean("Whether the provider explicitly reported no_data for a valid security."),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_operational_efficiency",
    operationType: "read",
    description: "Get historical employee counts and per-employee financial metrics.",
    requiredScopes: ["quote:read"],
    inputSchema: s.object(
      "Operational efficiency query.",
      {
        symbol: s.string("Security code including market prefix, for example HK.00700.", {
          minLength: 1,
        }),
        limit: s.integer("Page size; default 10, maximum 100.", { minimum: 1, maximum: 100 }),
        financialType: s.withEnum(
          s.integer("7=annual reports (default), 102=all cumulative quarterly reports."),
          [7, 102],
        ),
        currencyCode: s.string("Report currency code, for example USD or CNY; omit for the native currency."),
        nextKey: s.string("Opaque next-page cursor; omit for the first page."),
      },
      { optional: ["limit", "financialType", "currencyCode", "nextKey"] },
    ),
    outputSchema: s.requiredObject("Operational efficiency results and pagination.", {
      efficiency: s.nullable(
        s.looseObject("Efficiency metrics in the reported currency.", {
          currency_code: s.string("Report currency code, for example USD or CNY; omit for the native currency."),
          item_list: s.array(
            "Reporting-period employee counts and per-employee metrics.",
            s.looseObject("Provider record with additional fields preserved.", {}),
          ),
        }),
      ),
      pagination: s.nullable(
        s.looseObject("Pagination metadata from the response envelope; null when omitted.", {
          has_more: s.boolean("Whether more results are available."),
          next_key: s.string("Opaque next-page cursor; omit for the first page."),
        }),
      ),
      noData: s.boolean("Whether the provider explicitly reported no_data for a valid security."),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_valuation",
    operationType: "read",
    description: "Get PE, PB or PS valuation history and market or sector comparisons.",
    requiredScopes: ["quote:read"],
    inputSchema: s.object(
      "Valuation query.",
      {
        symbol: s.string("Security code including market prefix, for example HK.00700.", {
          minLength: 1,
        }),
        valuationType: s.withEnum(s.integer("1=PE (default), 2=PB, 3=PS."), [1, 2, 3]),
        intervalType: s.withEnum(
          s.integer(
            "History span: 1=3mo, 2=6mo, 3=1yr, 4=3yr, 5=since May 2019, 6=5yr, 7=10yr, 8=2yr, 9=20yr, 10=30yr.",
          ),
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        ),
      },
      { optional: ["valuationType", "intervalType"] },
    ),
    outputSchema: s.requiredObject("Valuation results.", {
      valuation: s.looseObject("Valuation trends, distributions and growth analysis.", {
        trend: s.looseObject("Current, historical and forward valuation metrics.", {}),
        market_distribution: s.looseObject("Provider record with additional fields preserved.", {}),
        plate_distribution: s.looseObject("Provider record with additional fields preserved.", {}),
        profit_growth_rate: s.looseObject("Provider record with additional fields preserved.", {}),
      }),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_capital_flow",
    operationType: "read",
    description: "Get intraday capital flow by order size and trading session.",
    requiredScopes: ["quote:read"],
    inputSchema: s.object(
      "Intraday capital flow query.",
      {
        symbol: s.string("Security code including market prefix, for example HK.00700.", {
          minLength: 1,
        }),
        section: s.stringEnum("Trading session; default NORMAL.", ["NORMAL", "FULL", "PREMARKET", "AFTERHOURS"]),
      },
      { optional: ["section"] },
    ),
    outputSchema: s.requiredObject("Intraday capital flow results.", {
      flows: s.array(
        "Time-ordered capital flow observations.",
        s.looseObject("Capital flow observation.", {
          capital_flow_item_time: s.integer("Observation timestamp in milliseconds."),
          in_flow: s.number("Net inflow in the security local currency; negative means outflow."),
          super_in_flow: s.number("Net inflow from super-large orders."),
          big_in_flow: s.number("Net inflow from large orders."),
          mid_in_flow: s.number("Net inflow from medium orders."),
          sml_in_flow: s.number("Net inflow from small orders."),
        }),
      ),
      lastValidTime: s.nullable(s.integer("Last valid data timestamp in milliseconds.")),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_capital_flow_history",
    operationType: "read",
    description: "Get daily, weekly or monthly capital flows; move end earlier to retrieve preceding data.",
    requiredScopes: ["quote:read"],
    inputSchema: s.object(
      "Historical capital flow query.",
      {
        symbol: s.string("Security code including market prefix, for example HK.00700.", {
          minLength: 1,
        }),
        periodType: s.stringEnum("Aggregation period; default DAY.", ["DAY", "WEEK", "MONTH"]),
        start: s.string("Inclusive date in YYYY-MM-DD format.", { format: "date" }),
        end: s.string("Inclusive date in YYYY-MM-DD format.", { format: "date" }),
        count: s.integer("Maximum observations; default 365, maximum 1000.", {
          minimum: 1,
          maximum: 1000,
        }),
      },
      { optional: ["periodType", "start", "end", "count"] },
    ),
    outputSchema: s.requiredObject("Historical capital flows and pagination.", {
      flows: s.array(
        "Time-ordered capital flow observations.",
        s.looseObject("Capital flow observation.", {
          capital_flow_item_time: s.integer("Observation timestamp in milliseconds."),
          in_flow: s.number("Net inflow in the security local currency; negative means outflow."),
          super_in_flow: s.number("Net inflow from super-large orders."),
          big_in_flow: s.number("Net inflow from large orders."),
          mid_in_flow: s.number("Net inflow from medium orders."),
          sml_in_flow: s.number("Net inflow from small orders."),
        }),
      ),
      pagination: s.nullable(
        s.looseObject("Pagination metadata from the response envelope; null when omitted.", {
          has_more: s.boolean("Whether more results are available."),
        }),
      ),
    }),
  }),
  defineProviderAction("futunn", {
    name: "get_capital_distribution",
    operationType: "read",
    description: "Get current-day capital inflow and outflow distribution by order size.",
    requiredScopes: ["quote:read"],
    inputSchema: s.requiredObject("Capital distribution query.", {
      symbol: s.string("Security code including market prefix, for example HK.00700.", {
        minLength: 1,
      }),
    }),
    outputSchema: s.requiredObject("Capital distribution results.", {
      distribution: s.nullable(
        s.looseObject("Cumulative intraday inflow and outflow in local currency.", {
          capital_in_super: s.number("Inflow for super orders."),
          capital_in_big: s.number("Inflow for big orders."),
          capital_in_mid: s.number("Inflow for mid orders."),
          capital_in_small: s.number("Inflow for small orders."),
          capital_out_super: s.number("Outflow for super orders."),
          capital_out_big: s.number("Outflow for big orders."),
          capital_out_mid: s.number("Outflow for mid orders."),
          capital_out_small: s.number("Outflow for small orders."),
          update_time: s.integer("Update timestamp in milliseconds."),
        }),
      ),
      noData: s.boolean("Whether the provider explicitly reported no_data for a valid security."),
    }),
  }),
];
