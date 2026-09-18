import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "eodhd_apis";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const optionalPositiveInteger = (description: string) => s.positiveInteger(description);
const optionalNonNegativeInteger = (description: string) => s.nonNegativeInteger(description);

const instrumentTypeSchema = s.stringEnum("Security type used to filter EODHD instrument search results.", [
  "all",
  "stock",
  "etf",
  "fund",
  "bond",
  "index",
  "crypto",
]);

const eodPeriodSchema = s.stringEnum("EODHD historical price period.", ["d", "w", "m"]);
const eodFilterSchema = s.stringEnum("EODHD last-value filter for historical price data.", [
  "last_date",
  "last_open",
  "last_high",
  "last_low",
  "last_close",
  "last_volume",
]);

const macroIndicatorSchema = s.stringEnum("Macroeconomic indicator code supported by EODHD.", [
  "real_interest_rate",
  "population_total",
  "population_growth_annual",
  "inflation_consumer_prices_annual",
  "consumer_price_index",
  "gdp_current_usd",
  "gdp_per_capita_usd",
  "gdp_growth_annual",
  "debt_percent_gdp",
  "net_trades_goods_services",
  "inflation_gdp_deflator_annual",
  "agriculture_value_added_percent_gdp",
  "industry_value_added_percent_gdp",
  "services_value_added_percent_gdp",
  "exports_of_goods_services_percent_gdp",
  "imports_of_goods_services_percent_gdp",
  "gross_capital_formation_percent_gdp",
  "net_migration",
  "gni_usd",
  "gni_per_capita_usd",
  "gni_ppp_usd",
  "gni_per_capita_ppp_usd",
  "income_share_lowest_twenty",
  "life_expectancy",
  "fertility_rate",
  "prevalence_hiv_total",
  "co2_emissions_tons_per_capita",
  "surface_area_km",
  "poverty_poverty_lines_percent_population",
  "revenue_excluding_grants_percent_gdp",
  "cash_surplus_deficit_percent_gdp",
  "startup_procedures_register",
  "market_cap_domestic_companies_percent_gdp",
  "mobile_subscriptions_per_hundred",
  "internet_users_per_hundred",
  "high_technology_exports_percent_total",
  "merchandise_trade_percent_gdp",
  "total_debt_service_percent_gni",
  "unemployment_total_percent",
]);

const rawObjectSchema = s.looseObject("The raw object returned by EODHD.");

const searchResultSchema = s.looseObject("An instrument search result returned by EODHD.", {
  Code: s.nullableString("Ticker code returned by EODHD."),
  Exchange: s.nullableString("Exchange code returned by EODHD."),
  Name: s.nullableString("Instrument or company name returned by EODHD."),
  Type: s.nullableString("Instrument type returned by EODHD."),
  Country: s.nullableString("Country returned by EODHD."),
  Currency: s.nullableString("Currency returned by EODHD."),
  ISIN: s.nullableString("ISIN identifier returned by EODHD."),
  previousClose: s.nullableNumber("Previous close value returned by EODHD."),
  previousCloseDate: s.nullableString("Previous close date returned by EODHD."),
});

const exchangeSchema = s.looseObject("A supported exchange returned by EODHD.", {
  Name: s.nullableString("Exchange display name."),
  Code: s.nullableString("Exchange code."),
  OperatingMIC: s.nullableString("Operating market identifier code."),
  Country: s.nullableString("Exchange country."),
  Currency: s.nullableString("Exchange currency."),
  CountryISO2: s.nullableString("ISO 3166-1 alpha-2 country code."),
  CountryISO3: s.nullableString("ISO 3166-1 alpha-3 country code."),
});

const quoteSchema = s.looseObject("A delayed real-time quote returned by EODHD.", {
  code: s.nullableString("Ticker code returned by EODHD."),
  timestamp: s.nullableInteger("Unix timestamp for the quote."),
  gmtoffset: s.nullableInteger("GMT offset reported by EODHD."),
  open: s.nullableNumber("Open price returned by EODHD."),
  high: s.nullableNumber("High price returned by EODHD."),
  low: s.nullableNumber("Low price returned by EODHD."),
  close: s.nullableNumber("Close price returned by EODHD."),
  volume: s.nullableInteger("Volume returned by EODHD."),
  previousClose: s.nullableNumber("Previous close value returned by EODHD."),
  change: s.nullableNumber("Absolute price change returned by EODHD."),
  change_p: s.nullableNumber("Percentage price change returned by EODHD."),
});

const eodRowSchema = s.looseObject("A historical EOD price row returned by EODHD.", {
  date: s.nullableString("Price row date."),
  open: s.nullableNumber("Open price."),
  high: s.nullableNumber("High price."),
  low: s.nullableNumber("Low price."),
  close: s.nullableNumber("Close price."),
  adjusted_close: s.nullableNumber("Adjusted close price."),
  volume: s.nullableInteger("Trading volume."),
});

const idMappingSchema = s.looseObject("A security identifier mapping returned by EODHD.", {
  Code: s.nullableString("Ticker symbol."),
  Exchange: s.nullableString("Exchange code."),
  Name: s.nullableString("Company or instrument name."),
  ISIN: s.nullableString("ISIN identifier."),
  FIGI: s.nullableString("FIGI identifier."),
  LEI: s.nullableString("LEI identifier."),
  CUSIP: s.nullableString("CUSIP identifier."),
  CIK: s.nullableString("CIK identifier."),
});

const macroIndicatorRowSchema = s.looseObject("A macro indicator row returned by EODHD.", {
  CountryCode: s.nullableString("ISO alpha-3 country code."),
  CountryName: s.nullableString("Country name."),
  Indicator: s.nullableString("Indicator display name."),
  Date: s.nullableString("Observation date."),
  Period: s.nullableString("Observation period."),
  Value: s.nullableNumber("Observed indicator value."),
});

const ustYieldRateSchema = s.looseObject("A US Treasury yield rate row returned by EODHD.", {
  date: s.nullableString("Yield rate date."),
  "1_month": s.nullableNumber("One-month constant maturity rate."),
  "2_months": s.nullableNumber("Two-month constant maturity rate."),
  "3_months": s.nullableNumber("Three-month constant maturity rate."),
  "4_months": s.nullableNumber("Four-month constant maturity rate."),
  "6_months": s.nullableNumber("Six-month constant maturity rate."),
  "1_year": s.nullableNumber("One-year constant maturity rate."),
  "2_years": s.nullableNumber("Two-year constant maturity rate."),
  "3_years": s.nullableNumber("Three-year constant maturity rate."),
  "5_years": s.nullableNumber("Five-year constant maturity rate."),
  "7_years": s.nullableNumber("Seven-year constant maturity rate."),
  "10_years": s.nullableNumber("Ten-year constant maturity rate."),
  "20_years": s.nullableNumber("Twenty-year constant maturity rate."),
  "30_years": s.nullableNumber("Thirty-year constant maturity rate."),
});

const userSchema = s.looseRequiredObject("Authenticated EODHD user details.", {
  name: s.nullableString("User name returned by EODHD."),
  email: s.nullableString("User email returned by EODHD."),
  subscriptionType: s.nullableString("Subscription plan type."),
  paymentMethod: s.nullableString("Payment method summary."),
  apiRequests: s.nullableInteger("API requests used in the current period."),
  apiRequestsDate: s.nullableString("Date of the current API request count."),
  dailyRateLimit: s.nullableInteger("Daily API request limit."),
});

const getIdMappingInputSchema = s.object(
  "Input parameters for mapping EODHD security identifiers. At least one identifier filter is required.",
  {
    filterSymbol: nonEmptyString("Ticker symbol filter, such as AAPL.US."),
    filterExchange: nonEmptyString("Exchange code filter, such as US."),
    filterIsin: nonEmptyString("ISIN identifier filter."),
    filterFigi: nonEmptyString("FIGI identifier filter."),
    filterLei: nonEmptyString("LEI identifier filter."),
    filterCusip: nonEmptyString("CUSIP identifier filter."),
    filterCik: nonEmptyString("CIK identifier filter."),
    pageLimit: optionalPositiveInteger("Number of records per page."),
    pageOffset: optionalNonNegativeInteger("Pagination offset."),
  },
  {
    optional: [
      "filterSymbol",
      "filterExchange",
      "filterIsin",
      "filterFigi",
      "filterLei",
      "filterCusip",
      "filterCik",
      "pageLimit",
      "pageOffset",
    ],
  },
);

export const eodhdApisActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_instruments",
    operationType: "read",
    description: "Search EODHD instruments by ticker, company name, or ISIN.",
    inputSchema: s.object(
      "Input parameters for searching EODHD instruments.",
      {
        query: nonEmptyString("Search query such as a ticker, company name, or ISIN."),
        type: instrumentTypeSchema,
        exchange: nonEmptyString("Exchange code used to filter search results."),
        bondsOnly: s.boolean("Whether to return only bond results."),
        limit: optionalPositiveInteger("Maximum number of search results to return."),
      },
      { optional: ["type", "exchange", "bondsOnly", "limit"] },
    ),
    outputSchema: s.object("Search results returned by EODHD.", {
      results: s.array("Instrument search results returned by EODHD.", searchResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_exchanges",
    operationType: "read",
    description: "List exchanges supported by EODHD.",
    inputSchema: s.object("Input parameters for listing EODHD exchanges.", {}),
    outputSchema: s.object("Supported exchanges returned by EODHD.", {
      exchanges: s.array("Supported exchange rows returned by EODHD.", exchangeSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_real_time_quote",
    operationType: "read",
    description: "Get delayed real-time quote data for one or more EODHD symbols.",
    inputSchema: s.object(
      "Input parameters for retrieving delayed real-time EODHD quote data.",
      {
        ticker: nonEmptyString("Primary ticker with exchange code, such as AAPL.US."),
        additionalTickers: s.stringArray("Additional ticker symbols to include in the quote request.", {
          minItems: 1,
          itemDescription: "Additional ticker with exchange code, such as MSFT.US.",
        }),
        exchange: nonEmptyString("Exchange code filter, such as US."),
      },
      { optional: ["additionalTickers", "exchange"] },
    ),
    outputSchema: s.object("Delayed real-time quotes returned by EODHD.", {
      quotes: s.array("Quote rows returned by EODHD.", quoteSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_eod",
    operationType: "read",
    description: "Get historical end-of-day price data for an EODHD ticker.",
    inputSchema: s.object(
      "Input parameters for retrieving EODHD historical end-of-day price rows.",
      {
        ticker: nonEmptyString("Ticker with exchange code, such as AAPL.US."),
        dateFrom: s.date("Inclusive start date in YYYY-MM-DD format."),
        dateTo: s.date("Inclusive end date in YYYY-MM-DD format."),
        period: eodPeriodSchema,
        filter: eodFilterSchema,
      },
      { optional: ["dateFrom", "dateTo", "period", "filter"] },
    ),
    outputSchema: s.object("Historical EOD response returned by EODHD.", {
      rows: s.array("Historical price rows returned by EODHD.", eodRowSchema),
      value: s.nullable(
        s.anyOf("Scalar last-value response returned when an EOD filter is used.", [
          s.string("String scalar returned by EODHD."),
          s.number("Numeric scalar returned by EODHD."),
        ]),
      ),
      raw: s.nullable(rawObjectSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_id_mapping",
    operationType: "read",
    description: "Map between EODHD ticker symbols and security identifiers.",
    inputSchema: getIdMappingInputSchema,
    outputSchema: s.object("Identifier mappings returned by EODHD.", {
      mappings: s.array("Security identifier mappings returned by EODHD.", idMappingSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_macro_indicators",
    operationType: "read",
    description: "Get macroeconomic indicator time series for a country from EODHD.",
    inputSchema: s.object(
      "Input parameters for retrieving EODHD macro indicator data.",
      {
        country: s.string({
          minLength: 3,
          maxLength: 3,
          description: "ISO 3166-1 alpha-3 country code, such as USA.",
        }),
        indicator: macroIndicatorSchema,
      },
      { optional: ["indicator"] },
    ),
    outputSchema: s.object("Macroeconomic indicator rows returned by EODHD.", {
      indicators: s.array("Macro indicator rows returned by EODHD.", macroIndicatorRowSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_ust_yield_rates",
    operationType: "read",
    description: "Get US Treasury yield curve rates from EODHD.",
    inputSchema: s.object(
      "Input parameters for retrieving EODHD US Treasury yield rates.",
      {
        dateFrom: s.date("Inclusive start date in YYYY-MM-DD format."),
        dateTo: s.date("Inclusive end date in YYYY-MM-DD format."),
        filterYear: s.positiveInteger("Year filter for Treasury yield rates."),
        pageLimit: optionalPositiveInteger("Number of records per page."),
        pageOffset: optionalNonNegativeInteger("Pagination offset."),
      },
      { optional: ["dateFrom", "dateTo", "filterYear", "pageLimit", "pageOffset"] },
    ),
    outputSchema: s.object("US Treasury yield rate rows returned by EODHD.", {
      rates: s.array("US Treasury yield curve rows returned by EODHD.", ustYieldRateSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_user_info",
    operationType: "read",
    description: "Get EODHD account details and API usage for the authenticated user.",
    inputSchema: s.object("Input parameters for retrieving the EODHD authenticated user.", {}),
    outputSchema: s.object("Authenticated user details returned by EODHD.", {
      user: userSchema,
    }),
  }),
];
