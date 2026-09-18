import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coinmarketcap";

const cmcStatusSchema = s.object(
  "CoinMarketCap response status metadata.",
  {
    timestamp: s.nonEmptyString("Timestamp when CoinMarketCap generated the response."),
    error_code: s.integer("CoinMarketCap error code where 0 indicates success."),
    error_message: s.nullableString("Error message returned by CoinMarketCap, or null when the request succeeded."),
    elapsed: s.integer("Time spent by CoinMarketCap processing the request."),
    credit_count: s.integer("API credits consumed by the request."),
    notice: s.string("Additional notice returned by CoinMarketCap when present."),
  },
  { optional: ["error_message", "notice"] },
);
const planSchema = s.object("Plan limits returned by CoinMarketCap.", {
  credit_limit_monthly: s.integer("Monthly credit limit available to the API key."),
  credit_limit_monthly_reset: s.nonEmptyString("Human-readable interval until the monthly credit limit resets."),
  credit_limit_monthly_reset_timestamp: s.nonEmptyString("Timestamp when the monthly credit limit resets."),
  rate_limit_minute: s.integer("Maximum number of requests allowed per minute."),
});
const usageBucketSchema = s.object(
  "Usage metrics for one CoinMarketCap billing bucket.",
  {
    credits_used: s.integer("Credits used within the reported period."),
    credits_left: s.integer("Credits remaining within the reported period."),
    requests_made: s.integer("Requests already made within the reported minute bucket."),
    requests_left: s.integer("Requests remaining within the reported minute bucket."),
  },
  { optional: ["credits_used", "credits_left", "requests_made", "requests_left"] },
);
const platformSchema = s.object("Parent platform information for a token.", {
  id: s.integer("CoinMarketCap platform identifier."),
  name: s.nonEmptyString("Platform name."),
  symbol: s.nonEmptyString("Platform symbol."),
  slug: s.nonEmptyString("Platform slug."),
  token_address: s.nonEmptyString("Token contract address on the platform."),
});
const mapItemSchema = s.object(
  "One asset returned by the CoinMarketCap map endpoint.",
  {
    id: s.integer("CoinMarketCap cryptocurrency identifier."),
    name: s.nonEmptyString("Asset name."),
    symbol: s.nonEmptyString("Asset ticker symbol."),
    slug: s.nonEmptyString("Asset slug."),
    rank: s.nullableInteger("Current market capitalization rank."),
    is_active: s.integer("Whether the asset is active, using CoinMarketCap flags."),
    status: s.integer("Internal CoinMarketCap listing status code."),
    first_historical_data: s.string("Timestamp of the first available historical data point."),
    last_historical_data: s.string("Timestamp of the last available historical data point."),
    platform: s.nullable(platformSchema),
  },
  { optional: ["rank", "status", "first_historical_data", "last_historical_data", "platform"] },
);
const quoteMetricsSchema = s.looseObject("Converted quote metrics keyed by conversion currency.", {
  price: s.nullableNumber("Latest converted price."),
  volume_24h: s.nullableNumber("Rolling 24-hour traded volume."),
  volume_change_24h: s.nullableNumber("Percentage change of the 24-hour traded volume."),
  percent_change_1h: s.nullableNumber("Percentage price change over the past hour."),
  percent_change_24h: s.nullableNumber("Percentage price change over the past 24 hours."),
  percent_change_7d: s.nullableNumber("Percentage price change over the past 7 days."),
  percent_change_30d: s.nullableNumber("Percentage price change over the past 30 days."),
  percent_change_60d: s.nullableNumber("Percentage price change over the past 60 days."),
  percent_change_90d: s.nullableNumber("Percentage price change over the past 90 days."),
  market_cap: s.nullableNumber("Current market capitalization."),
  market_cap_dominance: s.nullableNumber("Percentage dominance of the total market capitalization."),
  fully_diluted_market_cap: s.nullableNumber("Fully diluted market capitalization."),
  tvl: s.nullableNumber("Total value locked when available."),
  last_updated: s.nullableString("Timestamp of the returned quote."),
});
const quoteRecordSchema = s.record("Mapping of conversion currency to quote metrics.", quoteMetricsSchema);
const quotesAssetSchema = s.object(
  "Latest quote payload for one asset.",
  {
    id: s.integer("CoinMarketCap cryptocurrency identifier."),
    name: s.nonEmptyString("Asset name."),
    symbol: s.nonEmptyString("Asset ticker symbol."),
    slug: s.nonEmptyString("Asset slug."),
    cmc_rank: s.integer("Current market capitalization rank."),
    num_market_pairs: s.integer("Number of known market pairs for the asset."),
    circulating_supply: s.nullableNumber("Estimated circulating supply."),
    total_supply: s.nullableNumber("Reported total supply."),
    max_supply: s.nullableNumber("Reported maximum supply."),
    is_active: s.integer("Whether the asset is active."),
    is_fiat: s.integer("Whether the asset is fiat."),
    date_added: s.string("Timestamp when the asset was added to CoinMarketCap."),
    tags: s.nullable(s.array("Classification tags for the asset.", s.string("Tag name."))),
    platform: s.nullable(platformSchema),
    quote: quoteRecordSchema,
  },
  {
    optional: [
      "cmc_rank",
      "num_market_pairs",
      "circulating_supply",
      "total_supply",
      "max_supply",
      "is_active",
      "is_fiat",
      "date_added",
      "tags",
      "platform",
    ],
  },
);
const listingsItemSchema = s.object(
  "One asset returned by the latest listings endpoint.",
  {
    id: s.integer("CoinMarketCap cryptocurrency identifier."),
    name: s.nonEmptyString("Asset name."),
    symbol: s.nonEmptyString("Asset ticker symbol."),
    slug: s.nonEmptyString("Asset slug."),
    cmc_rank: s.integer("Current market capitalization rank."),
    num_market_pairs: s.integer("Number of known market pairs for the asset."),
    circulating_supply: s.nullableNumber("Estimated circulating supply."),
    total_supply: s.nullableNumber("Reported total supply."),
    max_supply: s.nullableNumber("Reported maximum supply."),
    date_added: s.string("Timestamp when the asset was added to CoinMarketCap."),
    tags: s.array("Classification tags for the asset.", s.string("Tag name.")),
    platform: s.nullable(platformSchema),
    quote: quoteRecordSchema,
  },
  {
    optional: [
      "cmc_rank",
      "num_market_pairs",
      "circulating_supply",
      "total_supply",
      "max_supply",
      "date_added",
      "tags",
      "platform",
    ],
  },
);
const globalMetricsDataSchema = s.object(
  "Latest global cryptocurrency market metrics.",
  {
    active_cryptocurrencies: s.integer("Number of active cryptocurrencies tracked by CoinMarketCap."),
    total_cryptocurrencies: s.integer("Total number of cryptocurrencies tracked by CoinMarketCap."),
    active_market_pairs: s.integer("Number of active market pairs."),
    active_exchanges: s.integer("Number of active exchanges."),
    total_exchanges: s.integer("Total number of tracked exchanges."),
    eth_dominance: s.number("Ethereum market cap dominance."),
    btc_dominance: s.number("Bitcoin market cap dominance."),
    eth_dominance_yesterday: s.number("Ethereum market cap dominance reported for yesterday."),
    btc_dominance_yesterday: s.number("Bitcoin market cap dominance reported for yesterday."),
    quote: quoteRecordSchema,
    last_updated: s.string("Timestamp when the global metrics were updated."),
  },
  {
    optional: [
      "active_cryptocurrencies",
      "total_cryptocurrencies",
      "active_market_pairs",
      "active_exchanges",
      "total_exchanges",
      "eth_dominance",
      "btc_dominance",
      "eth_dominance_yesterday",
      "btc_dominance_yesterday",
      "last_updated",
    ],
  },
);
const conversionDataSchema = s.object("Price conversion result.", {
  id: s.integer("CoinMarketCap identifier of the source asset."),
  name: s.nonEmptyString("Source asset name."),
  symbol: s.nonEmptyString("Source asset ticker symbol."),
  amount: s.number("Input amount that was converted."),
  last_updated: s.nonEmptyString("Timestamp of the price used for conversion."),
  quote: s.record(
    "Mapping of target currency to converted quote.",
    s.object("Converted quote.", {
      price: s.number("Converted value for the requested amount."),
      last_updated: s.nonEmptyString("Timestamp of the converted quote."),
    }),
  ),
});

const nonEmpty = (description: string): JsonSchema => s.nonEmptyString(description);
const optionalPositiveInteger = (description: string, maximum?: number): JsonSchema =>
  s.integer(description, maximum === undefined ? { minimum: 1 } : { minimum: 1, maximum });
const optionalNonNegativeNumber = (description: string): JsonSchema => s.number(description, { minimum: 0 });
const identifierChoice = (fields: string[]): JsonSchema[] => fields.map((field) => ({ required: [field] }));
const mutualExclusion = (left: string, right: string): JsonSchema => ({ not: { required: [left, right] } });

const mapInputSchema = s.object(
  "Input parameters for retrieving CoinMarketCap asset mappings.",
  {
    id: nonEmpty("Comma-separated CoinMarketCap asset IDs to filter by."),
    listing_status: nonEmpty("Comma-separated listing statuses to include, such as active or inactive."),
    slug: nonEmpty("Comma-separated asset slugs to filter by."),
    symbol: nonEmpty("Comma-separated asset symbols to filter by."),
    aux: nonEmpty("Comma-separated auxiliary fields to include, such as platform or first_historical_data."),
    sort: s.stringEnum("Field used to sort the response.", ["id", "cmc_rank"]),
    start: optionalPositiveInteger("1-based offset of the first item to return."),
    limit: optionalPositiveInteger("Maximum number of assets to return.", 5000),
  },
  { optional: ["id", "listing_status", "slug", "symbol", "aux", "sort", "start", "limit"] },
);
const quotesLatestInputSchema = s.object(
  "Input parameters for retrieving latest asset quotes. Exactly one of id, symbol, or slug is required.",
  {
    id: nonEmpty("Comma-separated CoinMarketCap asset IDs to query."),
    symbol: nonEmpty("Comma-separated asset symbols to query."),
    slug: nonEmpty("Comma-separated asset slugs to query."),
    convert: nonEmpty("Comma-separated quote currency symbols to convert into."),
    convert_id: nonEmpty("Comma-separated CoinMarketCap IDs of quote currencies to convert into."),
    skip_invalid: s.boolean("Whether invalid identifiers should be silently skipped by CoinMarketCap."),
    aux: nonEmpty("Comma-separated auxiliary asset fields to include."),
  },
  { optional: ["id", "symbol", "slug", "convert", "convert_id", "skip_invalid", "aux"] },
);
quotesLatestInputSchema.oneOf = identifierChoice(["id", "symbol", "slug"]);
quotesLatestInputSchema.allOf = [mutualExclusion("convert", "convert_id")];
const listingsLatestInputSchema = s.object(
  "Input parameters for retrieving the latest cryptocurrency listings.",
  {
    start: optionalPositiveInteger("1-based offset of the first item to return."),
    limit: optionalPositiveInteger("Maximum number of assets to return.", 5000),
    price_min: optionalNonNegativeNumber("Minimum asset price filter."),
    price_max: optionalNonNegativeNumber("Maximum asset price filter."),
    market_cap_min: optionalNonNegativeNumber("Minimum market capitalization filter."),
    market_cap_max: optionalNonNegativeNumber("Maximum market capitalization filter."),
    volume_24h_min: optionalNonNegativeNumber("Minimum 24-hour traded volume filter."),
    volume_24h_max: optionalNonNegativeNumber("Maximum 24-hour traded volume filter."),
    circulating_supply_min: optionalNonNegativeNumber("Minimum circulating supply filter."),
    circulating_supply_max: optionalNonNegativeNumber("Maximum circulating supply filter."),
    percent_change_24h_min: s.number("Minimum 24-hour percentage change filter."),
    percent_change_24h_max: s.number("Maximum 24-hour percentage change filter."),
    convert: nonEmpty("Quote currency symbol to convert the listings into."),
    convert_id: nonEmpty("CoinMarketCap quote currency ID used instead of convert."),
    sort: s.stringEnum("Field used to sort the returned listings.", [
      "market_cap",
      "price",
      "volume_24h",
      "percent_change_24h",
      "name",
    ]),
    sort_dir: s.stringEnum("Sort direction used by CoinMarketCap.", ["asc", "desc"]),
    cryptocurrency_type: s.stringEnum("Asset type filter used by CoinMarketCap.", ["all", "coins", "tokens"]),
    tag: nonEmpty("Comma-separated asset tags to filter by."),
    aux: nonEmpty("Comma-separated auxiliary asset fields to include."),
  },
  {
    optional: [
      "start",
      "limit",
      "price_min",
      "price_max",
      "market_cap_min",
      "market_cap_max",
      "volume_24h_min",
      "volume_24h_max",
      "circulating_supply_min",
      "circulating_supply_max",
      "percent_change_24h_min",
      "percent_change_24h_max",
      "convert",
      "convert_id",
      "sort",
      "sort_dir",
      "cryptocurrency_type",
      "tag",
      "aux",
    ],
  },
);
listingsLatestInputSchema.allOf = [mutualExclusion("convert", "convert_id")];
const globalMetricsInputSchema = s.object(
  "Input parameters for retrieving the latest global market metrics.",
  {
    convert: nonEmpty("Quote currency symbol to convert the metrics into."),
    convert_id: nonEmpty("CoinMarketCap quote currency ID used instead of convert."),
  },
  { optional: ["convert", "convert_id"] },
);
globalMetricsInputSchema.allOf = [mutualExclusion("convert", "convert_id")];
const convertPriceInputSchema = s.object(
  "Input parameters for converting one asset amount into another currency. Exactly one of id or symbol is required.",
  {
    amount: s.number("Amount of the source asset to convert.", { minimum: 0.00000001 }),
    id: s.positiveInteger("CoinMarketCap ID of the source asset."),
    symbol: nonEmpty("Ticker symbol of the source asset."),
    convert: nonEmpty("Target currency symbol used for conversion."),
    convert_id: nonEmpty("CoinMarketCap ID of the target currency used instead of convert."),
    time: nonEmpty("Historical timestamp or date to use for conversion, when supported by the API plan."),
  },
  { optional: ["id", "symbol", "convert", "convert_id", "time"] },
);
convertPriceInputSchema.oneOf = identifierChoice(["id", "symbol"]);
convertPriceInputSchema.allOf = [mutualExclusion("convert", "convert_id")];

export const coinmarketcapActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_key_info",
    operationType: "read",
    description: "Retrieve plan limits and usage details for the current CoinMarketCap API key.",
    inputSchema: s.object({}, { description: "Input parameters for retrieving API key information." }),
    outputSchema: s.object("CoinMarketCap API key information.", {
      status: cmcStatusSchema,
      data: s.object("CoinMarketCap API key details.", {
        plan: planSchema,
        usage: s.object("Current API key usage metrics.", {
          current_minute: usageBucketSchema,
          current_day: usageBucketSchema,
          current_month: usageBucketSchema,
        }),
      }),
    }),
  }),
  defineProviderAction(service, {
    name: "get_cryptocurrency_map",
    operationType: "read",
    description: "Retrieve CoinMarketCap asset IDs, symbols, and slugs for cryptocurrency discovery.",
    inputSchema: mapInputSchema,
    outputSchema: s.object("Asset mapping response returned by CoinMarketCap.", {
      status: cmcStatusSchema,
      data: s.array("Ordered list of CoinMarketCap asset mappings.", mapItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_latest_cryptocurrency_quotes",
    operationType: "read",
    description: "Retrieve the latest quotes for one or more cryptocurrencies by id, symbol, or slug.",
    inputSchema: quotesLatestInputSchema,
    outputSchema: s.object("Latest quote response returned by CoinMarketCap.", {
      status: cmcStatusSchema,
      data: s.record("Mapping of requested identifiers to latest asset quotes.", quotesAssetSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_latest_cryptocurrency_listings",
    operationType: "read",
    description: "Retrieve the latest cryptocurrency listings ordered by CoinMarketCap ranking and filters.",
    inputSchema: listingsLatestInputSchema,
    outputSchema: s.object("Latest listings response returned by CoinMarketCap.", {
      status: cmcStatusSchema,
      data: s.array("Ordered list of latest cryptocurrency listings.", listingsItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_latest_global_metrics_quotes",
    operationType: "read",
    description: "Retrieve the latest global cryptocurrency market metrics and quote aggregates.",
    inputSchema: globalMetricsInputSchema,
    outputSchema: s.object("Latest global market metrics response returned by CoinMarketCap.", {
      status: cmcStatusSchema,
      data: globalMetricsDataSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "convert_price",
    operationType: "read",
    description: "Convert an asset amount into another fiat or cryptocurrency using CoinMarketCap pricing.",
    inputSchema: convertPriceInputSchema,
    outputSchema: s.object("Price conversion response returned by CoinMarketCap.", {
      status: cmcStatusSchema,
      data: conversionDataSchema,
    }),
  }),
];
