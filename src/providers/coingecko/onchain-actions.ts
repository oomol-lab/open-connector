import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "coingecko";
function resource(attributes: JsonSchema) {
  return s.object(
    "GeckoTerminal JSON:API resource.",
    {
      id: s.string("Resource identifier."),
      type: s.string("Resource type."),
      attributes,
      relationships: s.looseObject("Related resource identifiers, such as tokens, pools, networks and DEXes.", {}),
    },
    { additionalProperties: true, optional: ["relationships"] },
  );
}
function envelope(data: JsonSchema) {
  return s.object(
    "GeckoTerminal response with original related resources and metadata.",
    {
      data,
      included: s.array(
        "Related resources requested using include.",
        resource(s.looseObject("Included resource attributes.", {})),
      ),
      meta: s.looseObject("Additional upstream response metadata.", {}),
      links: s.looseObject("Upstream response links, when provided.", {}),
    },
    { additionalProperties: true, optional: ["included", "meta", "links"] },
  );
}
const networkResource = resource(
  s.looseObject("Network identifiers and names.", {
    name: s.string("Network name."),
    coingecko_asset_platform_id: s.nullable(
      s.string("Corresponding CoinGecko asset platform ID, distinct from the onchain network ID."),
    ),
  }),
);
const poolResource = resource(
  s.object(
    "Pool prices, liquidity and activity; decimal strings are preserved.",
    {
      address: s.string("Pool contract address."),
      name: s.string("Pool name."),
      pool_created_at: s.nullable(s.string("Pool creation time.")),
      base_token_price_usd: s.nullable(s.string("Base token USD price as a decimal string.")),
      quote_token_price_usd: s.nullable(s.string("Quote token USD price as a decimal string.")),
      reserve_in_usd: s.nullable(s.string("Pool reserve value in USD as a decimal string.")),
      fdv_usd: s.nullable(s.string("Fully diluted valuation in USD as a decimal string.")),
      market_cap_usd: s.nullable(
        s.string("Verified market capitalization in USD; may be null and is never replaced with FDV."),
      ),
      volume_usd: s.record("USD trading volume by timeframe.", s.nullable(s.string("USD volume as a decimal string."))),
      price_change_percentage: s.record(
        "Price percentage changes by timeframe.",
        s.nullable(s.string("Percentage change as a decimal string.")),
      ),
      transactions: s.record("Trade counts by timeframe.", s.looseObject("Buy, sell, buyer and seller counts.", {})),
    },
    { additionalProperties: true, required: ["address", "name"] },
  ),
);
const tokenResource = resource(
  s.object(
    "Token market attributes from GeckoTerminal.",
    {
      address: s.string("Token contract address."),
      name: s.string("Token name."),
      symbol: s.string("Token symbol."),
      decimals: s.integer("Token decimal precision."),
      coingecko_coin_id: s.nullable(s.string("CoinGecko coin ID if the token is listed.")),
      total_supply: s.nullable(s.string("Raw total token supply as a decimal string.")),
      normalized_total_supply: s.nullable(s.string("Total supply adjusted for token decimals.")),
      price_usd: s.nullable(s.string("Token USD price from the upstream selected pool as a decimal string.")),
      fdv_usd: s.nullable(s.string("Fully diluted valuation in USD as a decimal string.")),
      market_cap_usd: s.nullable(
        s.string("Verified market capitalization in USD; may be null and is never replaced with FDV."),
      ),
      total_reserve_in_usd: s.nullable(
        s.string("USD value of this token's reserves across pools, not the sum of both sides of every pool."),
      ),
      volume_usd: s.record("USD trading volume by timeframe.", s.nullable(s.string("USD volume as a decimal string."))),
    },
    { additionalProperties: true, required: ["address", "name", "symbol"] },
  ),
);
const tokenInfoResource = resource(
  s.object(
    "Token metadata and upstream verification signals; availability varies by network.",
    {
      address: s.string("Token contract address."),
      name: s.string("Token name."),
      symbol: s.string("Token symbol."),
      coingecko_coin_id: s.nullable(s.string("CoinGecko coin ID if the token is listed.")),
      websites: s.array(
        "Project website URLs supplied by upstream metadata.",
        s.string("Project website URL; not fetched by the connector."),
      ),
      description: s.nullable(s.string("Upstream token description.")),
      gt_score: s.nullable(s.number("GeckoTerminal score, not a safety guarantee.")),
      gt_verified: s.boolean("Whether GeckoTerminal marks this token as verified."),
      holders: s.nullable(
        s.looseObject("Available holder counts and distribution, which may include exchange and treasury wallets.", {}),
      ),
      mint_authority: s.nullable(s.string("Upstream mint authority status.")),
      freeze_authority: s.nullable(s.string("Upstream freeze authority status.")),
      is_honeypot: s.anyOf("Upstream honeypot signal; unknown is not equivalent to false.", [
        s.boolean("Detected honeypot status."),
        s.string("Unknown or other upstream signal."),
        { type: "null", description: "Unavailable upstream signal." },
      ]),
      developer_address: s.nullable(s.string("Developer wallet address when available.")),
      developer_holding_percentage: s.nullable(s.string("Developer percentage of total supply as a decimal string.")),
    },
    { additionalProperties: true, required: ["address", "name", "symbol"] },
  ),
);
const tradeResource = resource(
  s.object(
    "Recent pool trade, preserving original token amounts and prices.",
    {
      block_number: s.integer("Block number."),
      tx_hash: s.string("Transaction hash."),
      tx_from_address: s.string("Transaction sender address."),
      from_token_address: s.string("Sent token contract address."),
      to_token_address: s.string("Received token contract address."),
      from_token_amount: s.string("Sent token amount as a decimal string."),
      to_token_amount: s.string("Received token amount as a decimal string."),
      volume_in_usd: s.string("Trade volume in USD as a decimal string."),
      block_timestamp: s.string("Trade block time as an ISO timestamp."),
      kind: s.string("Trade direction, buy or sell, relative to the requested token."),
    },
    { additionalProperties: true },
  ),
);
const poolOhlcvOutput = envelope(
  resource(
    s.looseObject("OHLCV response attributes.", {
      ohlcv_list: s.array(
        "Pool candles, retaining the upstream order and empty-interval behavior.",
        s.tuple(
          [
            s.integer("Candle timestamp in UNIX seconds."),
            s.number("Opening price."),
            s.number("Highest price."),
            s.number("Lowest price."),
            s.number("Closing price."),
            s.number("Candle trading volume."),
          ],
          { description: "UNIX seconds, open, high, low, close and volume." },
        ),
      ),
    }),
  ),
);

const listOnchainNetworksInput = s.object(
  "Input parameters for list_onchain_networks.",
  {
    page: s.integer("Page through results. \nDefault value: 1", { minimum: 1 }),
  },
  { required: [] },
);

const searchOnchainPoolsInput = s.object(
  "Input parameters for search_onchain_pools.",
  {
    query: s.nonEmptyString(
      "Search query: pool contract address, token name, token symbol, or token contract address.",
    ),
    network: s.nonEmptyString(
      "GeckoTerminal network ID, such as eth. Use list_onchain_networks; this is not a CoinGecko asset platform ID.",
    ),
    include: s.nonEmptyString(
      "Attributes to include, comma-separated if more than one. \nAvailable values: `base_token`, `quote_token`, `dex`",
    ),
    page: s.integer("Page through results. \nDefault value: 1", { minimum: 1 }),
  },
  { required: [] },
);

const getOnchainTokenInput = s.object(
  "Input parameters for get_onchain_token.",
  {
    network: s.nonEmptyString(
      "GeckoTerminal network ID, such as eth. Use list_onchain_networks; this is not a CoinGecko asset platform ID.",
    ),
    token_address: s.nonEmptyString("Token contract address."),
    include: s.stringEnum("Attributes to include.", ["top_pools"]),
    include_composition: s.boolean("Include pool composition. \nDefault: `false`"),
    include_inactive_source: s.boolean(
      "Include token data from inactive pools using the most recent swap. \nDefault: `false`",
    ),
  },
  { required: ["network", "token_address"] },
);

const getOnchainTokenInfoInput = s.object(
  "Input parameters for get_onchain_token_info.",
  {
    network: s.nonEmptyString(
      "GeckoTerminal network ID, such as eth. Use list_onchain_networks; this is not a CoinGecko asset platform ID.",
    ),
    token_address: s.nonEmptyString("Token contract address."),
  },
  { required: ["network", "token_address"] },
);

const listTokenPoolsInput = s.object(
  "Input parameters for list_token_pools.",
  {
    network: s.nonEmptyString(
      "GeckoTerminal network ID, such as eth. Use list_onchain_networks; this is not a CoinGecko asset platform ID.",
    ),
    token_address: s.nonEmptyString("Token contract address."),
    include: s.nonEmptyString(
      "Attributes to include, comma-separated if more than one. \nAvailable values: `base_token`, `quote_token`, `dex`",
    ),
    include_inactive_source: s.boolean(
      "Include tokens from inactive pools using the most recent swap. \nDefault: `false`",
    ),
    page: s.integer("Page through results. \nDefault value: 1", { minimum: 1 }),
    sort: s.stringEnum("Sort the pools by field. \nDefault: `h24_volume_usd_liquidity_desc`", [
      "h24_volume_usd_liquidity_desc",
      "h24_tx_count_desc",
      "h24_volume_usd_desc",
    ]),
    include_gt_community_data: s.boolean(
      "Include GeckoTerminal community data (sentiment votes, suspicious reports). \nDefault: `false`",
    ),
  },
  { required: ["network", "token_address"] },
);

const getOnchainPoolInput = s.object(
  "Input parameters for get_onchain_pool.",
  {
    network: s.nonEmptyString(
      "GeckoTerminal network ID, such as eth. Use list_onchain_networks; this is not a CoinGecko asset platform ID.",
    ),
    pool_address: s.nonEmptyString("Pool address."),
    include: s.nonEmptyString(
      "Attributes to include, comma-separated if more than one. \nAvailable values: `base_token`, `quote_token`, `dex`",
    ),
    include_volume_breakdown: s.boolean("Include volume breakdown. \nDefault: `false`"),
    include_composition: s.boolean("Include pool composition. \nDefault: `false`"),
  },
  { required: ["network", "pool_address"] },
);

const getPoolOhlcvInput = s.object(
  "Input parameters for get_pool_ohlcv.",
  {
    network: s.nonEmptyString(
      "GeckoTerminal network ID, such as eth. Use list_onchain_networks; this is not a CoinGecko asset platform ID.",
    ),
    pool_address: s.nonEmptyString("Pool contract address."),
    timeframe: s.stringEnum("Timeframe of the OHLCV chart.", ["day", "hour", "minute", "second"]),
    aggregate: {
      type: "integer",
      enum: [1, 4, 5, 12, 15, 30],
      description:
        "Time period to aggregate each OHLCV. \nAvailable values (day): `1` \nAvailable values (hour): `1`, `4`, `12` \nAvailable values (minute): `1`, `5`, `15` \nAvailable values (second): `1`, `15`, `30` \nDefault value: 1",
    },
    before_timestamp: s.integer("Return OHLCV data before this timestamp (integer seconds since epoch).", {
      minimum: 0,
    }),
    limit: s.integer("Number of OHLCV results to return, maximum 1000. \nDefault value: 100", {
      minimum: 1,
      maximum: 1000,
    }),
    currency: s.stringEnum("Return OHLCV in USD or quote token. \nDefault: `usd`", ["usd", "token"]),
    token: s.nonEmptyString(
      "Return OHLCV for token, use this to invert the chart. \nAvailable values: `base`, `quote`, or token address. \nDefault: `base`",
    ),
    include_empty_intervals: s.boolean("Include empty intervals with no trade data. \nDefault: `false`"),
  },
  { required: ["network", "pool_address", "timeframe"] },
);

const listPoolTradesInput = s.object(
  "Input parameters for list_pool_trades.",
  {
    network: s.nonEmptyString(
      "GeckoTerminal network ID, such as eth. Use list_onchain_networks; this is not a CoinGecko asset platform ID.",
    ),
    pool_address: s.nonEmptyString("Pool contract address."),
    trade_volume_in_usd_greater_than: s.number(
      "Filter trades by trade volume in USD greater than this value. \nDefault value: 0",
      { minimum: 0 },
    ),
    token: s.nonEmptyString(
      "Return trades for token, use this to invert the chart. \nAvailable values: `base`, `quote`, or token address. \nDefault: `base`",
    ),
  },
  { required: ["network", "pool_address"] },
);

export const coingeckoOnchainActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_onchain_networks",
    operationType: "read",
    description:
      "List a page of GeckoTerminal network IDs and their CoinGecko asset platform mappings. Use network IDs such as eth for onchain actions.",
    requiredScopes: [],
    inputSchema: listOnchainNetworksInput,
    outputSchema: envelope(s.array("Networks in the requested page.", networkResource)),
  }),
  defineProviderAction(service, {
    name: "search_onchain_pools",
    operationType: "read",
    description:
      "Search DEX pools by pool address, token address, name or symbol, optionally filtered by network. Returns up to 20 pools per page; pages beyond 10 require Analyst or above.",
    requiredScopes: [],
    inputSchema: searchOnchainPoolsInput,
    outputSchema: envelope(s.array("Pools matching the search.", poolResource)),
  }),
  defineProviderAction(service, {
    name: "get_onchain_token",
    operationType: "read",
    description:
      "Get token price, supply, volume and token reserve value across pools, with optional top pools. Prices follow the upstream selected pool; unavailable market capitalization remains null.",
    requiredScopes: [],
    inputSchema: getOnchainTokenInput,
    outputSchema: envelope(tokenResource),
  }),
  defineProviderAction(service, {
    name: "get_onchain_token_info",
    operationType: "read",
    description:
      "Get token project metadata and available GeckoTerminal verification, holder and authority signals. Field availability varies by network and does not constitute a safety assessment.",
    requiredScopes: [],
    inputSchema: getOnchainTokenInfoInput,
    outputSchema: envelope(tokenInfoResource),
  }),
  defineProviderAction(service, {
    name: "list_token_pools",
    operationType: "read",
    description:
      "List up to 20 pools for a token per page, with sorting and related resources. The default sort combines 24-hour volume and liquidity; pages beyond 10 require Analyst or above.",
    requiredScopes: [],
    inputSchema: listTokenPoolsInput,
    outputSchema: envelope(s.array("Pools for the requested token.", poolResource)),
  }),
  defineProviderAction(service, {
    name: "get_onchain_pool",
    operationType: "read",
    description:
      "Get prices, reserves and activity for one explicitly selected DEX pool, with optional token and DEX resources, composition and volume breakdown.",
    requiredScopes: [],
    inputSchema: getOnchainPoolInput,
    outputSchema: envelope(poolResource),
  }),
  defineProviderAction(service, {
    name: "get_pool_ohlcv",
    operationType: "read",
    description:
      "Get OHLCV candles for an explicit pool and token direction. Timestamps are UNIX seconds. Empty intervals are omitted unless requested. Each request covers at most six months; accessible history depends on plan and pool tracking. Second timeframes require eligible paid access.",
    requiredScopes: [],
    inputSchema: {
      ...getPoolOhlcvInput,
      allOf: [
        {
          if: { properties: { timeframe: { const: "day" } } },
          then: { properties: { aggregate: { enum: [1] } } },
        },
        {
          if: { properties: { timeframe: { const: "hour" } } },
          then: { properties: { aggregate: { enum: [1, 4, 12] } } },
        },
        {
          if: { properties: { timeframe: { const: "minute" } } },
          then: { properties: { aggregate: { enum: [1, 5, 15] } } },
        },
        {
          if: { properties: { timeframe: { const: "second" } } },
          then: { properties: { aggregate: { enum: [1, 15, 30] } } },
        },
      ],
    },
    outputSchema: poolOhlcvOutput,
  }),
  defineProviderAction(service, {
    name: "list_pool_trades",
    operationType: "read",
    description:
      "List the latest 300 trades within the past 24 hours for a pool, optionally filtered by USD volume and token direction. This is not complete transaction history or a complete capital-flow dataset.",
    requiredScopes: [],
    inputSchema: listPoolTradesInput,
    outputSchema: envelope(s.array("Recent pool trades, limited by upstream retention.", tradeResource)),
  }),
];
