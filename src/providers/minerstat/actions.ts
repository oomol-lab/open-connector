import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "minerstat";
const optionalFilter = (description: string) => s.nonEmptyString(description);
const optionalMetric = (description: string) => s.nullable(s.number(description));
const optionalText = (description: string) => s.nullable(s.string(description));
const nullSchema = (description: string): JsonSchema => ({ type: "null", description });

const coinSchema = s.looseObject("One coin or multi-pool record returned by Minerstat.", {
  id: s.string("The unique Minerstat coin identifier."),
  coin: s.string("The coin ticker symbol."),
  name: s.string("The coin name."),
  type: s.string("The Minerstat record type, such as coin or pool."),
  algorithm: s.string("The mining algorithm used by the coin."),
  network_hashrate: optionalMetric("The network hashrate in hashes per second, or null when unavailable."),
  difficulty: optionalMetric("The current mining difficulty, or null when unavailable."),
  reward: optionalMetric("The estimated reward for one hash per second over one hour, or null when unavailable."),
  reward_unit: optionalText("The reward currency unit, or null when unavailable."),
  reward_block: optionalMetric("The block reward amount, or null when unavailable."),
  price: optionalMetric("The current price in US dollars, or null when unavailable."),
  volume: optionalMetric("The last 24-hour trading volume in US dollars, or null when unavailable."),
  updated: s.nullable(s.integer("The Unix timestamp when Minerstat last updated the coin record.")),
});

const hardwareAlgorithmSchema = s.looseObject("One Minerstat benchmark for a mining algorithm.", {
  hashrate: optionalMetric("The estimated algorithm hashrate in hashes per second, or null when unavailable."),
  power: optionalMetric("The estimated algorithm power consumption in watts, or null when unavailable."),
});

const hardwareSchema = s.looseObject("One mining hardware record returned by Minerstat.", {
  id: s.string("The unique Minerstat hardware identifier."),
  name: s.string("The mining hardware model name."),
  url: s.string("The Minerstat URL slug for the hardware model."),
  type: s.string("The hardware category, such as gpu or asic."),
  brand: s.string("The hardware brand or manufacturer."),
  algorithms: s.record("Benchmark data keyed by mining algorithm name.", hardwareAlgorithmSchema),
  specs: s.looseObject("Provider-defined hardware specifications such as clocks, memory, release date, or power."),
});

const poolCoinSchema = s.looseObject("Mining terms for one coin supported by a Minerstat pool.", {
  algorithm: optionalText("The mining algorithm used for the coin, or null when unavailable."),
  payoutThreshold: s.anyOf("The minimum payout threshold, or null when unavailable.", [
    s.string("The payout threshold including any upstream unit."),
    s.number("The numeric payout threshold."),
    nullSchema("No payout threshold value."),
  ]),
  rewardMethod: optionalText("The pool reward distribution method, or null when unavailable."),
  fee: s.anyOf("The pool fee, or null when unavailable.", [
    s.string("The pool fee including any upstream percent sign or unit."),
    s.number("The numeric pool fee."),
    nullSchema("No pool fee value."),
  ]),
  anonymous: s.nullable(s.boolean("Whether the pool supports anonymous mining for the coin.")),
  registration: s.nullable(s.boolean("Whether the pool requires registration for the coin.")),
});

const poolSchema = s.looseObject("One mining pool record returned by Minerstat.", {
  id: s.string("The unique Minerstat pool identifier."),
  name: s.string("The mining pool name."),
  url: s.string("The Minerstat URL slug for the pool."),
  description: s.string("The pool description."),
  website: s.string("The pool website URL."),
  founded: s.anyOf("The year the pool was founded.", [
    s.integer("The founding year represented as an integer."),
    s.string("The founding year represented as a string."),
  ]),
  type: s.string("The pool category, such as pool or multipool."),
  coins: s.record("Pool terms keyed by supported coin symbol.", poolCoinSchema),
});

export const minerstatActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_coins",
    operationType: "read",
    description:
      "List Minerstat coin profitability and market data, optionally filtered by ticker or mining algorithm.",
    inputSchema: s.object(
      "Input parameters for listing Minerstat coin data.",
      {
        list: optionalFilter("Comma-separated coin tickers to return, for example BTC,BCH,BSV."),
        algo: optionalFilter("Comma-separated mining algorithms to return, for example SHA-256,Scrypt."),
      },
      { optional: ["list", "algo"] },
    ),
    outputSchema: s.requiredObject("The normalized Minerstat coin response.", {
      coins: s.array("Coin records returned by Minerstat.", coinSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_hardware",
    operationType: "read",
    description: "List Minerstat GPU and ASIC benchmark data, optionally filtered by hardware type or brand.",
    inputSchema: s.object(
      "Input parameters for listing Minerstat hardware data.",
      {
        type: s.stringEnum("The hardware category to return.", ["gpu", "asic"]),
        brand: optionalFilter("The hardware brand or manufacturer to return, for example nvidia or antminer."),
      },
      { optional: ["type", "brand"] },
    ),
    outputSchema: s.requiredObject("The normalized Minerstat hardware response.", {
      hardware: s.array("Mining hardware records returned by Minerstat.", hardwareSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_pools",
    operationType: "read",
    description: "List Minerstat mining pools and supported-coin terms, optionally filtered by coin or pool type.",
    inputSchema: s.object(
      "Input parameters for listing Minerstat pool data.",
      {
        coin: optionalFilter("The supported coin symbol to return, for example BTC or ETH."),
        type: optionalFilter("The pool category to return, for example multipool."),
      },
      { optional: ["coin", "type"] },
    ),
    outputSchema: s.requiredObject("The normalized Minerstat pool response.", {
      pools: s.array("Mining pool records returned by Minerstat.", poolSchema),
    }),
  }),
];
