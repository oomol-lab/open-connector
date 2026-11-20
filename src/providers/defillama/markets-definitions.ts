import type { DefillamaDefinition } from "./actions.ts";

import { s } from "../../core/json-schema.ts";
import {
  chainsSchema,
  chainSchema,
  coinsSchema,
  decimalsSchema,
  confidenceSchema,
  totalCirculatingSchema,
} from "./shared-schemas.ts";
export const marketsDefinitions: DefillamaDefinition[] = [
  {
    name: "get_stablecoins_stablecoindominance_by_chain",
    description:
      "Get stablecoin dominance per chain along with the info about the larges coin in a chain.  Requires an API plan key.",
    route: {
      path: "/stablecoins/stablecoindominance/{chain}",
      parameters: [
        { name: "chain", in: "path" },
        { name: "stablecoin", in: "query" },
      ],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_stablecoins_stablecoindominance_by_chain.",
      {
        chain: chainSchema,
        stablecoin: s.integer("stablecoin ID, you can get these from /stablecoins"),
      },
      { required: ["chain"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama result.",
      {
        data: s.array(
          "DeFiLlama response.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              date: s.string("date returned by DeFiLlama."),
              totalCirculatingUSD: s.object(
                "totalCirculatingUSD returned by DeFiLlama.",
                {
                  peggedUSD: s.number("peggedUSD returned by DeFiLlama."),
                  peggedVAR: s.number("peggedVAR returned by DeFiLlama."),
                  peggedEUR: s.number("peggedEUR returned by DeFiLlama."),
                },
                { required: [], additionalProperties: true },
              ),
              greatestMcap: s.object(
                "greatestMcap returned by DeFiLlama.",
                {
                  gecko_id: s.string("gecko_id returned by DeFiLlama."),
                  symbol: s.string("symbol returned by DeFiLlama."),
                  mcap: s.number("mcap returned by DeFiLlama."),
                },
                { required: [], additionalProperties: true },
              ),
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: ["data"], additionalProperties: true },
    ),
  },
  {
    name: "get_etfs_snapshot",
    description: "Get ETFs and their metrics (aum, flows, fees...).  Requires an API plan key.",
    route: { path: "/etfs/snapshot", parameters: [], free: null, wrap: true },
    inputSchema: s.object("Parameters for get_etfs_snapshot.", {}, { required: [], additionalProperties: false }),
    outputSchema: s.object(
      "DeFiLlama result.",
      {
        data: s.array(
          "DeFiLlama response.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              ticker: s.string("ETF ticker symbol"),
              timestamp: s.integer("Current timestamp"),
              asset: s.string("Asset name"),
              issuer: s.string("ETF issuer name"),
              etf_name: s.string("Full ETF name"),
              custodian: s.string("Custodian name"),
              pct_fee: s.number("Percentage fee"),
              url: s.string("ETF URL"),
              flows: s.number("Net flows"),
              aum: s.number("Assets under management"),
              volume: s.number("Trading volume"),
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: ["data"], additionalProperties: true },
    ),
  },
  {
    name: "get_etfs_flows",
    description: "Historical Flows at the Asset Level.  Requires an API plan key.",
    route: { path: "/etfs/flows", parameters: [], free: null, wrap: true },
    inputSchema: s.object("Parameters for get_etfs_flows.", {}, { required: [], additionalProperties: false }),
    outputSchema: s.object(
      "DeFiLlama result.",
      {
        data: s.array(
          "DeFiLlama response.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              gecko_id: s.string("CoinGecko ID"),
              day: s.string("Day"),
              total_flow_usd: s.number("Sum of all USD flows per asset"),
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: ["data"], additionalProperties: true },
    ),
  },
  {
    name: "get_fdv_performance_by_period",
    description:
      "Get chart of narratives based on category performance (with individual coins weighted by mcap).  Requires an API plan key.",
    route: {
      path: "/fdv/performance/{period}",
      parameters: [{ name: "period", in: "path" }],
      free: null,
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_fdv_performance_by_period.",
      { period: s.string("One of ['7', '30', 'ytd', '365']", { minLength: 1 }) },
      { required: ["period"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama result.",
      {
        data: s.array(
          "DeFiLlama response.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              "date": s.integer("Date timestamp"),
              "Analytics": s.number("Analytics category performance"),
              "Artificial Intelligence (AI)": s.number("AI category performance"),
              "Bitcoin": s.number("Bitcoin category performance"),
              "Bridge Governance Tokens": s.number("Bridge governance tokens category performance"),
              "Centralized Exchange (CEX) Token": s.number("CEX token category performance"),
              "Data Availability": s.number("Data availability category performance"),
              "Decentralized Finance (DeFi)": s.number("DeFi category performance"),
              "Decentralized Identifier (DID)": s.number("DID category performance"),
              "DePIN": s.number("DePIN category performance"),
              "Ethereum": s.number("Ethereum category performance"),
              "Gaming (GameFi)": s.number("Gaming category performance"),
              "Liquid Staking Governance Tokens": s.number("Liquid staking governance tokens category performance"),
              "Meme": s.number("Meme category performance"),
              "NFT Marketplace": s.number("NFT marketplace category performance"),
              "Oracle": s.number("Oracle category performance"),
              "PolitiFi": s.number("PolitiFi category performance"),
              "Prediction Markets": s.number("Prediction markets category performance"),
              "Real World Assets (RWA)": s.number("RWA category performance"),
              "Rollup": s.number("Rollup category performance"),
              "Smart Contract Platform": s.number("Smart contract platform category performance"),
              "SocialFi": s.number("SocialFi category performance"),
              "Solana": s.number("Solana category performance"),
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: ["data"], additionalProperties: true },
    ),
  },
  {
    name: "get_coins_prices_current_by_coins",
    description:
      "Get current prices of tokens by contract address. The goal of this API is to price as many tokens as possible, including exotic ones that never get traded, which makes them impossible to price by looking at markets.\n\nThe base of our data are prices pulled from coingecko, which is then extended through multiple means:\n- We price all bridged tokens by using the price of the token in it's original chain, so we fetch all bridged versions of USDC on arbitrum, fantom, avax... and price all them using the price for the token on Ethereum, which we know. Right now we support 10 different bridging protocols.\n- We have multiple adapters to price specialized sets of tokens by running custom code:\n  - We price yearn's yToken LPs by checking how much underlying token can be withdrawn for each LP\n  - Aave, compound and euler LP tokens are also priced based on their relationship against underlying tokens\n  - Uniswap, curve, balancer and stargate LPs are priced using the underlying tokens in each pair\n  - GMX's GLP token is priced based on the value of tokens given on withdrawal (which includes calculations based on trader's PnL)\n  \n  - Synthetix tokens are priced using forex prices of the coin they are pegged to\n- For tokens that we haven't been able to price in any other way, we find the pool with most liquidity for each on uniswap, curve and serum and then use the prices provided on those exchanges.\n  \n  Unlike all the other tokens, we can't confirm that these prices are correct, so we only ingest the ones that have sufficient liquidity and, even in that case, we attach a `confidence` value to them that is related to the depth of liquidity and which represents our confidence in the quality of each price. API consumers can choose to filter out prices with low confidence values.\n  \n Our API server is fully open source and we are constantly adding more pricing adapters, extending the amount of tokens we support.\n  \nTokens are queried using {chain}:{address}, where chain is an identifier such as ethereum, bsc, polygon, avax... You can also get tokens by coingecko id by setting `coingecko` as the chain, eg: coingecko:ethereum, coingecko:bitcoin. Examples:\n  - ethereum:0xdF574c24545E5FfEcb9a659c229253D4111d87e1\n  - bsc:0x762539b45a1dcce3d36d080f74d1aed37844b878\n  - coingecko:ethereum\n  - arbitrum:0x4277f8f2c384827b5273592ff7cebd9f2c1ac258\n Available with no_auth or api_key.",
    route: {
      path: "/coins/prices/current/{coins}",
      parameters: [{ name: "coins", in: "path" }],
      free: { baseUrl: "https://coins.llama.fi", path: "/prices/current/{coins}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_coins_prices_current_by_coins.",
      { coins: coinsSchema },
      { required: ["coins"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        coins: s.object(
          "coins returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Data for one token identifier.",
              {
                decimals: decimalsSchema,
                price: s.number("price returned by DeFiLlama."),
                symbol: s.string("symbol returned by DeFiLlama."),
                timestamp: s.number("timestamp returned by DeFiLlama."),
                confidence: confidenceSchema,
              },
              { required: ["price", "symbol", "timestamp"], additionalProperties: true },
            ),
          },
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_coins_prices_historical_by_timestamp_by_coins",
    description:
      "Get historical prices of tokens by contract address. See /prices/current for explanation on how prices are sourced. Available with no_auth or api_key.",
    route: {
      path: "/coins/prices/historical/{timestamp}/{coins}",
      parameters: [
        { name: "coins", in: "path" },
        { name: "timestamp", in: "path" },
      ],
      free: { baseUrl: "https://coins.llama.fi", path: "/prices/historical/{timestamp}/{coins}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_coins_prices_historical_by_timestamp_by_coins.",
      {
        coins: coinsSchema,
        timestamp: s.number("UNIX timestamp of time when you want historical prices"),
      },
      { required: ["coins", "timestamp"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        coins: s.object(
          "coins returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Data for one token identifier.",
              {
                decimals: decimalsSchema,
                price: s.number("price returned by DeFiLlama."),
                symbol: s.string("symbol returned by DeFiLlama."),
                timestamp: s.number("timestamp returned by DeFiLlama."),
                confidence: confidenceSchema,
              },
              { required: ["price", "symbol", "timestamp"], additionalProperties: true },
            ),
          },
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_coins_batch_historical",
    description:
      "Get historical prices for multiple tokens at multiple different timestamps.  Available with no_auth or api_key.",
    route: {
      path: "/coins/batchHistorical",
      parameters: [{ name: "coins", in: "query" }],
      free: { baseUrl: "https://coins.llama.fi", path: "/batchHistorical" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_coins_batch_historical.",
      {
        coins: s.object(
          "object where keys are coins in the form {chain}:{address}, and values are arrays of requested timestamps",
          {},
          {
            required: [],
            additionalProperties: s.array(
              "Requested timestamps for this token.",
              s.integer("Unix timestamp in seconds."),
              { minItems: 1 },
            ),
            minProperties: 1,
          },
        ),
      },
      { required: ["coins"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        coins: s.object(
          "coins returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Data for one token identifier.",
              {
                symbol: s.string("symbol returned by DeFiLlama."),
                prices: s.array(
                  "prices returned by DeFiLlama.",
                  s.object(
                    "Result entry returned by DeFiLlama.",
                    {
                      timestamp: s.number("timestamp returned by DeFiLlama."),
                      price: s.number("price returned by DeFiLlama."),
                      confidence: s.number("confidence returned by DeFiLlama."),
                    },
                    { required: [], additionalProperties: true },
                  ),
                ),
              },
              { required: [], additionalProperties: true },
            ),
          },
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_coins_chart_by_coins",
    description:
      "Get token prices at regular time intervals. Strings accepted by period:\nCan use regular chart candle notion like '4h' etc where:\nW = week, D = day, H = hour, M = minute (not case sensitive)\n Available with no_auth or api_key.",
    route: {
      path: "/coins/chart/{coins}",
      parameters: [
        { name: "coins", in: "path" },
        { name: "start", in: "query" },
        { name: "end", in: "query" },
        { name: "span", in: "query" },
        { name: "period", in: "query" },
      ],
      free: { baseUrl: "https://coins.llama.fi", path: "/chart/{coins}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_coins_chart_by_coins.",
      {
        coins: coinsSchema,
        start: s.number("unix timestamp of earliest data point requested"),
        end: s.number("unix timestamp of latest data point requested"),
        span: s.number("number of data points returned, defaults to 0"),
        period: s.string("duration between data points, defaults to 24 hours"),
      },
      { required: ["coins"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        coins: s.object(
          "coins returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Data for one token identifier.",
              {
                decimals: decimalsSchema,
                confidence: confidenceSchema,
                prices: s.array(
                  "prices returned by DeFiLlama.",
                  s.object(
                    "Result entry returned by DeFiLlama.",
                    {
                      timestamp: s.number("timestamp returned by DeFiLlama."),
                      price: s.number("price returned by DeFiLlama."),
                    },
                    { required: [], additionalProperties: true },
                  ),
                ),
                symbol: s.string("symbol returned by DeFiLlama."),
              },
              { required: ["confidence", "prices", "symbol"], additionalProperties: true },
            ),
          },
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_coins_percentage_by_coins",
    description:
      "Get percentage change in price over time. Strings accepted by period:\nCan use regular chart candle notion like '4h' etc where:\nW = week, D = day, H = hour, M = minute (not case sensitive)\n Available with no_auth or api_key.",
    route: {
      path: "/coins/percentage/{coins}",
      parameters: [
        { name: "coins", in: "path" },
        { name: "timestamp", in: "query" },
        { name: "lookForward", in: "query" },
        { name: "period", in: "query" },
      ],
      free: { baseUrl: "https://coins.llama.fi", path: "/percentage/{coins}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_coins_percentage_by_coins.",
      {
        coins: coinsSchema,
        timestamp: s.number("timestamp of data point requested, defaults to time now"),
        lookForward: s.boolean(
          "whether you want the duration after your given timestamp or not, defaults to false (looking back)",
        ),
        period: s.string("duration between data points, defaults to 24 hours"),
      },
      { required: ["coins"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        coins: s.object(
          "coins returned by DeFiLlama.",
          {},
          { required: [], additionalProperties: s.number("Data for one token identifier.") },
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_coins_prices_first_by_coins",
    description: "Get earliest timestamp price record for coins.  Available with no_auth or api_key.",
    route: {
      path: "/coins/prices/first/{coins}",
      parameters: [{ name: "coins", in: "path" }],
      free: { baseUrl: "https://coins.llama.fi", path: "/prices/first/{coins}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_coins_prices_first_by_coins.",
      { coins: coinsSchema },
      { required: ["coins"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        coins: s.object(
          "coins returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Data for one token identifier.",
              {
                price: s.number("price returned by DeFiLlama."),
                symbol: s.string("symbol returned by DeFiLlama."),
                timestamp: s.number("timestamp returned by DeFiLlama."),
              },
              { required: [], additionalProperties: true },
            ),
          },
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_coins_block_by_chain_by_timestamp",
    description:
      "Get the closest block to a timestamp. Runs binary search over a blockchain's blocks to get the closest one to a timestamp.\nEvery time this is run we add new data to our database, so each query permanently speeds up future queries.\n Available with no_auth or api_key.",
    route: {
      path: "/coins/block/{chain}/{timestamp}",
      parameters: [
        { name: "chain", in: "path" },
        { name: "timestamp", in: "path" },
      ],
      free: { baseUrl: "https://coins.llama.fi", path: "/block/{chain}/{timestamp}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_coins_block_by_chain_by_timestamp.",
      {
        chain: s.string("Chain which you want to get the block from", { minLength: 1 }),
        timestamp: s.integer("UNIX timestamp of the block you are searching for"),
      },
      { required: ["chain", "timestamp"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        height: s.integer("height returned by DeFiLlama.", { minimum: 0 }),
        timestamp: s.integer("timestamp returned by DeFiLlama.", { minimum: 0 }),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_stablecoins_stablecoins",
    description: "List all stablecoins along with their circulating amounts.  Available with no_auth or api_key.",
    route: {
      path: "/stablecoins/stablecoins",
      parameters: [{ name: "includePrices", in: "query" }],
      free: { baseUrl: "https://stablecoins.llama.fi", path: "/stablecoins" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_stablecoins_stablecoins.",
      { includePrices: s.boolean("set whether to include current stablecoin prices") },
      { required: [], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        peggedAssets: s.array(
          "peggedAssets returned by DeFiLlama.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              id: s.string("id returned by DeFiLlama."),
              name: s.string("name returned by DeFiLlama."),
              symbol: s.string("symbol returned by DeFiLlama."),
              pegType: s.string("pegType returned by DeFiLlama."),
              pegMechanism: s.string("pegMechanism returned by DeFiLlama."),
              circulating: s.object(
                "circulating returned by DeFiLlama.",
                { peggedUSD: s.number("peggedUSD returned by DeFiLlama.") },
                { required: [], additionalProperties: true },
              ),
              chains: chainsSchema,
              chainCirculating: s.object(
                "chainCirculating returned by DeFiLlama.",
                {},
                {
                  required: [],
                  additionalProperties: s.object(
                    "Value for this key.",
                    {
                      current: s.object(
                        "current returned by DeFiLlama.",
                        { peggedUSD: s.number("peggedUSD returned by DeFiLlama.") },
                        { required: [], additionalProperties: true },
                      ),
                    },
                    { required: [], additionalProperties: true },
                  ),
                },
              ),
              price: s.number("price returned by DeFiLlama."),
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_stablecoins_stablecoincharts_all",
    description: "Get historical mcap sum of all stablecoins.  Available with no_auth or api_key.",
    route: {
      path: "/stablecoins/stablecoincharts/all",
      parameters: [{ name: "stablecoin", in: "query" }],
      free: { baseUrl: "https://stablecoins.llama.fi", path: "/stablecoincharts/all" },
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_stablecoins_stablecoincharts_all.",
      { stablecoin: s.integer("stablecoin ID, you can get these from /stablecoins") },
      { required: [], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama result.",
      {
        data: s.array(
          "DeFiLlama response.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              date: s.number("date returned by DeFiLlama."),
              totalCirculating: totalCirculatingSchema,
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: ["data"], additionalProperties: true },
    ),
  },
  {
    name: "get_stablecoins_stablecoincharts_by_chain",
    description: "Get historical mcap sum of all stablecoins in a chain.  Available with no_auth or api_key.",
    route: {
      path: "/stablecoins/stablecoincharts/{chain}",
      parameters: [
        { name: "chain", in: "path" },
        { name: "stablecoin", in: "query" },
      ],
      free: { baseUrl: "https://stablecoins.llama.fi", path: "/stablecoincharts/{chain}" },
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_stablecoins_stablecoincharts_by_chain.",
      {
        chain: chainSchema,
        stablecoin: s.integer("stablecoin ID, you can get these from /stablecoins"),
      },
      { required: ["chain"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama result.",
      {
        data: s.array(
          "DeFiLlama response.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              date: s.number("date returned by DeFiLlama."),
              totalCirculating: totalCirculatingSchema,
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: ["data"], additionalProperties: true },
    ),
  },
  {
    name: "get_stablecoins_stablecoin_by_asset",
    description:
      "Get historical mcap and historical chain distribution of a stablecoin.  Available with no_auth or api_key.",
    route: {
      path: "/stablecoins/stablecoin/{asset}",
      parameters: [{ name: "asset", in: "path" }],
      free: { baseUrl: "https://stablecoins.llama.fi", path: "/stablecoin/{asset}" },
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_stablecoins_stablecoin_by_asset.",
      { asset: s.integer("stablecoin ID, you can get these from /stablecoins") },
      { required: ["asset"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        id: s.string("id returned by DeFiLlama."),
        name: s.string("name returned by DeFiLlama."),
        symbol: s.string("symbol returned by DeFiLlama."),
        totalCirculating: s.array(
          "totalCirculating returned by DeFiLlama.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              date: s.number("date returned by DeFiLlama."),
              totalCirculating: s.number("totalCirculating returned by DeFiLlama."),
            },
            { required: [], additionalProperties: true },
          ),
        ),
        chainCirculating: s.object(
          "chainCirculating returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.array(
              "Value for this key.",
              s.object(
                "Result entry returned by DeFiLlama.",
                {
                  date: s.number("date returned by DeFiLlama."),
                  circulating: s.number("circulating returned by DeFiLlama."),
                },
                { required: [], additionalProperties: true },
              ),
            ),
          },
        ),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_stablecoins_stablecoinchains",
    description: "Get current mcap sum of all stablecoins on each chain.  Available with no_auth or api_key.",
    route: {
      path: "/stablecoins/stablecoinchains",
      parameters: [],
      free: { baseUrl: "https://stablecoins.llama.fi", path: "/stablecoinchains" },
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_stablecoins_stablecoinchains.",
      {},
      { required: [], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama result.",
      {
        data: s.array(
          "DeFiLlama response.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              name: s.string("name returned by DeFiLlama."),
              totalCirculating: totalCirculatingSchema,
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: ["data"], additionalProperties: true },
    ),
  },
  {
    name: "get_stablecoins_stablecoinprices",
    description: "Get historical prices of all stablecoins.  Available with no_auth or api_key.",
    route: {
      path: "/stablecoins/stablecoinprices",
      parameters: [],
      free: { baseUrl: "https://stablecoins.llama.fi", path: "/stablecoinprices" },
      wrap: true,
    },
    inputSchema: s.object(
      "Parameters for get_stablecoins_stablecoinprices.",
      {},
      { required: [], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama result.",
      {
        data: s.array(
          "DeFiLlama response.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              date: s.number("date returned by DeFiLlama."),
              prices: s.object(
                "prices returned by DeFiLlama.",
                {},
                { required: [], additionalProperties: s.number("Value for this key.") },
              ),
            },
            { required: [], additionalProperties: true },
          ),
        ),
      },
      { required: ["data"], additionalProperties: true },
    ),
  },
  {
    name: "get_dat_institutions",
    description:
      "Get list of all institutions with Digital Asset Treasury data. Returns comprehensive data about institutions holding digital assets, including mNAV calculations (realized, realistic, maximum) as described in the [DAT Methodology](https://docs.llama.fi/analysts/dat-methodology) Requires an API plan key.",
    route: { path: "/dat/institutions", parameters: [], free: null, wrap: false },
    inputSchema: s.object("Parameters for get_dat_institutions.", {}, { required: [], additionalProperties: false }),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        institutionMetadata: s.object(
          "institutionMetadata returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Value for this key.",
              {
                institutionId: s.integer("Unique institution identifier"),
                ticker: s.string("Institution ticker symbol"),
                name: s.string("Institution name"),
                type: s.string("Institution type"),
                price: s.number("Current share price"),
                priceChange24h: s.number("24h price change percentage"),
                volume24h: s.number("24h trading volume"),
                mcapRealized: s.number("Market cap using current outstanding shares"),
                mcapRealistic: s.number("Market cap accounting for unavoidable dilution"),
                mcapMax: s.number("Market cap under maximum dilution scenario"),
                realized_mNAV: s.number("Ratio of marketcap to crypto treasury using current shares"),
                realistic_mNAV: s.number("Ratio accounting for unavoidable dilution"),
                max_mNAV: s.number("Ratio under maximum dilution scenario"),
                totalUsdValue: s.number("Total USD value of crypto holdings"),
                totalCost: s.number("Total cost basis of crypto holdings"),
                holdings: s.object(
                  "holdings returned by DeFiLlama.",
                  {},
                  {
                    required: [],
                    additionalProperties: s.object(
                      "Value for this key.",
                      {
                        amount: s.number("Amount of asset held"),
                        avgPrice: s.number("Average purchase price"),
                        usdValue: s.number("Current USD value"),
                        cost: s.number("Total cost basis"),
                        transactionCount: s.integer("Number of transactions"),
                        firstAnnouncementDate: s.string("Date of first announcement", {
                          format: "date",
                        }),
                        lastAnnouncementDate: s.string("Date of last announcement", {
                          format: "date",
                        }),
                        supplyPercentage: s.number("Percentage of total supply held"),
                      },
                      { required: [], additionalProperties: true },
                    ),
                  },
                ),
              },
              { required: [], additionalProperties: true },
            ),
          },
        ),
        assetMetadata: s.object(
          "assetMetadata returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Value for this key.",
              {
                name: s.string("Asset name"),
                ticker: s.string("Asset ticker"),
                geckoId: s.string("CoinGecko ID"),
                companies: s.integer("Number of companies holding this asset"),
                totalAmount: s.number("Total amount held across all institutions"),
                totalUsdValue: s.number("Total USD value across all institutions"),
                circSupplyPerc: s.number("Percentage of circulating supply held"),
              },
              { required: [], additionalProperties: true },
            ),
          },
        ),
        institutions: s.array(
          "institutions returned by DeFiLlama.",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              institutionId: s.integer("Institution ID"),
              totalUsdValue: s.number("Total USD value of holdings"),
              totalCost: s.number("Total cost basis"),
            },
            { required: [], additionalProperties: true },
          ),
        ),
        assets: s.object(
          "assets returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.array(
              "Value for this key.",
              s.object(
                "Result entry returned by DeFiLlama.",
                {
                  institutionId: s.integer("Institution ID"),
                  usdValue: s.number("USD value of holding"),
                  amount: s.number("Amount held"),
                },
                { required: [], additionalProperties: true },
              ),
            ),
          },
        ),
        totalCompanies: s.integer("Total number of companies tracked"),
        flows: s.object(
          "flows returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.array(
              "Value for this key.",
              s.array("Result entry returned by DeFiLlama.", {
                description: "Result entry returned by DeFiLlama.",
                anyOf: [
                  s.integer("Timestamp"),
                  s.number("Net flow"),
                  s.number("Inflow"),
                  s.number("Outflow"),
                  s.number("USD value"),
                  s.number("USD value of net flow"),
                ],
              }),
            ),
          },
        ),
        mNAV: s.object(
          "mNAV returned by DeFiLlama.",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Value for this key.",
              {},
              {
                required: [],
                additionalProperties: s.array(
                  "Value for this key.",
                  s.array("Result entry returned by DeFiLlama.", {
                    description: "Result entry returned by DeFiLlama.",
                    anyOf: [
                      s.integer("Timestamp"),
                      s.number("Realized mNAV"),
                      s.number("Realistic mNAV"),
                      s.number("Maximum mNAV"),
                    ],
                  }),
                ),
              },
            ),
          },
        ),
        lastUpdated: s.string("Last update timestamp", { format: "date-time" }),
      },
      { required: [], additionalProperties: true },
    ),
  },
  {
    name: "get_dat_institutions_by_symbol",
    description:
      "Get individual institution Digital Asset Treasury details. Returns detailed data for a specific institution, including mNAV calculations (realized, realistic, maximum) as described in the [DAT Methodology](https://docs.llama.fi/analysts/dat-methodology) Requires an API plan key.",
    route: {
      path: "/dat/institutions/{symbol}",
      parameters: [{ name: "symbol", in: "path" }],
      free: null,
      wrap: false,
    },
    inputSchema: s.object(
      "Parameters for get_dat_institutions_by_symbol.",
      {
        symbol: s.string("Institution ticker symbol (e.g., MSTR for MicroStrategy)", {
          minLength: 1,
        }),
      },
      { required: ["symbol"], additionalProperties: false },
    ),
    outputSchema: s.object(
      "DeFiLlama response.",
      {
        institutionId: s.integer("Unique institution identifier"),
        ticker: s.string("Institution ticker symbol"),
        name: s.string("Institution name"),
        type: s.string("Institution type"),
        rank: s.integer("Institution rank"),
        price: s.number("Current share price"),
        priceChange24h: s.number("24h price change percentage"),
        volume24h: s.number("24h trading volume"),
        fd_realized: s.string("Fully diluted shares - realized count"),
        fd_realistic: s.string("Fully diluted shares - realistic count"),
        fd_max: s.string("Fully diluted shares - maximum count"),
        mcap_realized: s.number("Market cap using realized share count"),
        mcap_realistic: s.number("Market cap using realistic share count"),
        mcap_max: s.number("Market cap using maximum share count"),
        realized_mNAV: s.number("Realized mNAV ratio"),
        realistic_mNAV: s.number("Realistic mNAV ratio"),
        max_mNAV: s.number("Maximum mNAV ratio"),
        totalCost: s.number("Total cost basis of crypto holdings"),
        totalUsdValue: s.number("Total USD value of crypto holdings"),
        assets: s.object(
          "Asset holdings by asset type",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Value for this key.",
              {
                amount: s.number("Amount of asset held"),
                avgPrice: s.number("Average purchase price"),
                usdValue: s.number("Current USD value"),
                cost: s.number("Total cost basis"),
              },
              { required: [], additionalProperties: true },
            ),
          },
        ),
        assetsMeta: s.object(
          "Metadata for assets held",
          {},
          {
            required: [],
            additionalProperties: s.object(
              "Value for this key.",
              { name: s.string("Asset name"), ticker: s.string("Asset ticker") },
              { required: [], additionalProperties: true },
            ),
          },
        ),
        ohlcv: s.array(
          "Historical OHLCV data",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [
              s.integer("Timestamp"),
              s.number("Open price"),
              s.number("High price"),
              s.number("Low price"),
              s.number("Close price"),
              s.number("Volume"),
            ],
          }),
        ),
        assetValue: s.array(
          "Historical asset value data",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [s.integer("Timestamp"), s.number("Asset value in USD")],
          }),
        ),
        stats: s.array(
          "Compact historical stats: [timestamp, fd_realized, fd_realistic, fd_maximum, mcap_realized, mcap_realistic, mcap_max, mnav_realized, mnav_realistic, mnav_max]",
          s.array("Result entry returned by DeFiLlama.", {
            description: "Result entry returned by DeFiLlama.",
            anyOf: [
              s.integer("Timestamp"),
              s.number("Fully diluted shares - realized"),
              s.number("Fully diluted shares - realistic"),
              s.number("Fully diluted shares - maximum"),
              s.number("Market cap - realized"),
              s.number("Market cap - realistic"),
              s.number("Market cap - maximum"),
              s.number("mNAV - realized"),
              s.number("mNAV - realistic"),
              s.number("mNAV - maximum"),
            ],
          }),
        ),
        transactions: s.array(
          "Transaction history",
          s.object(
            "Result entry returned by DeFiLlama.",
            {
              id: s.integer("Transaction ID"),
              asset: s.string("Asset type"),
              amount: s.string("Amount transacted"),
              avg_price: s.string("Average price per unit"),
              usd_value: s.string("Total USD value"),
              start_date: s.string("Transaction start date", { format: "date" }),
              end_date: s.string("Transaction end date", { format: "date" }),
              report_date: s.string("Report date", { format: "date" }),
              type: s.string("Transaction type"),
              source_type: s.string("Source type"),
              source_url: s.string("Source URL"),
              source_note: s.string("Source note with transaction details"),
              is_approved: s.boolean("Whether transaction is approved"),
              reject_reason: s.nullable(s.string("Rejection reason if not approved")),
              last_updated: s.string("Last update timestamp", { format: "date-time" }),
              ticker: s.string("Institution ticker"),
              assetName: s.string("Asset name"),
              assetTicker: s.string("Asset ticker"),
            },
            { required: [], additionalProperties: true },
          ),
        ),
        lastUpdated: s.string("Last update timestamp", { format: "date-time" }),
      },
      { required: [], additionalProperties: true },
    ),
  },
];
