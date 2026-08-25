import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "blocknative";

const chainIdSchema = s.nonNegativeInteger(
  "The chain ID to query. Use `0` for Bitcoin when querying the Gas Price API.",
);
const systemSchema = s.string("The chain ecosystem used by Blocknative, for example `ethereum` or `story`.", {
  minLength: 1,
  pattern: "\\S",
});
const networkSchema = s.string("The network name used by Blocknative, for example `main` or `mainnet`.", {
  minLength: 1,
  pattern: "\\S",
});
const confidenceLevelsSchema = s.array(
  "Up to five confidence levels used to override the default prediction buckets.",
  s.integer("One requested confidence level for gas-price prediction.", { minimum: 1, maximum: 99 }),
  { minItems: 1, maxItems: 5 },
);

const supportedChainSchema = s.object(
  "One supported chain returned by Blocknative.",
  {
    arch: s.nonEmptyString("The blockchain architecture returned by Blocknative."),
    chainId: s.integer("The unique chain ID returned by Blocknative."),
    label: s.nonEmptyString("The human-readable chain label returned by Blocknative."),
    features: s.array(
      "The Blocknative features supported for the returned chain.",
      s.nonEmptyString("One feature flag supported on the chain."),
    ),
    icon: s.string("The chain icon URL returned by Blocknative."),
    system: s.nonEmptyString("The chain ecosystem returned by Blocknative."),
    network: s.nonEmptyString("The network name returned by Blocknative."),
  },
  { optional: ["icon"] },
);

const gasOracleSchema = s.object(
  "One gas-oracle metadata object returned by Blocknative.",
  {
    arch: s.nonEmptyString("The blockchain architecture returned by Blocknative."),
    chainId: s.integer("The unique chain ID returned by Blocknative."),
    label: s.nonEmptyString("The human-readable chain label returned by Blocknative."),
    name: s.nonEmptyString("The internal chain name returned by Blocknative."),
    network: s.nonEmptyString("The network name returned by Blocknative."),
    system: s.string("The chain ecosystem returned by Blocknative."),
    addressByVersion: s.record(
      "The gas-oracle contract addresses keyed by Blocknative oracle version.",
      s.string("A gas-oracle contract address."),
    ),
    rpcUrl: s.nonEmptyString("The public RPC URL returned by Blocknative."),
    blockExplorerUrl: s.nonEmptyString("The public block-explorer URL returned by Blocknative."),
    icon: s.string("The chain icon URL returned by Blocknative."),
    testnet: s.boolean("Whether the returned oracle belongs to a testnet."),
  },
  { optional: ["system", "icon"] },
);

const estimatedPriceSchema = s.object(
  "One Blocknative gas-price estimate.",
  {
    confidence: s.integer("The inclusion confidence for this gas-price bucket."),
    price: s.number("The gas price returned for this confidence bucket."),
    maxPriorityFeePerGas: s.number("The max priority fee per gas returned for this confidence bucket."),
    maxFeePerGas: s.number("The max fee per gas returned for this confidence bucket."),
  },
  { optional: ["maxPriorityFeePerGas", "maxFeePerGas"] },
);

const blockPriceSchema = s.object(
  "One predicted block-price object returned by Blocknative.",
  {
    blockNumber: s.integer("The block number this prediction targets."),
    estimatedTransactionCount: s.integer("The estimated number of transactions in the predicted block."),
    baseFeePerGas: s.number("The base fee per gas returned by Blocknative."),
    blobBaseFeePerGas: s.number("The blob base fee per gas returned by Blocknative when present."),
    estimatedPrices: s.array("The ordered gas-price estimates returned for the block.", estimatedPriceSchema),
  },
  { optional: ["blobBaseFeePerGas"] },
);

const distributionPairSchema = {
  type: "array",
  prefixItems: [s.number("One gas price bucket."), s.integer("The number of transactions in this price bucket.")],
  items: false,
  minItems: 2,
  maxItems: 2,
  description: "One `[price, count]` pair returned by Blocknative.",
} satisfies JsonSchema;

const topNDistributionSchema = s.actionOutput(
  {
    distribution: s.array(
      "The ordered gas-price distribution buckets returned by Blocknative.",
      distributionPairSchema,
    ),
    n: s.integer("The top-N pending transactions covered by the distribution."),
  },
  "The normalized top-N gas-price distribution returned by Blocknative.",
);

const gasPricesInputSchema: JsonSchema = s.object(
  "The input payload for requesting Blocknative gas-price estimates.",
  {
    chainId: chainIdSchema,
    system: systemSchema,
    network: networkSchema,
    confidenceLevels: confidenceLevelsSchema,
  },
  { optional: ["chainId", "system", "network", "confidenceLevels"] },
);
gasPricesInputSchema.oneOf = [
  {
    not: {
      anyOf: [{ required: ["chainId"] }, { required: ["system"] }, { required: ["network"] }],
    },
  },
  {
    required: ["chainId"],
    not: {
      anyOf: [{ required: ["system"] }, { required: ["network"] }],
    },
  },
  {
    required: ["system", "network"],
    not: {
      required: ["chainId"],
    },
  },
];

const gasPriceDistributionInputSchema = s.object(
  "The input payload for requesting the Blocknative gas-price distribution.",
  {
    chainId: s.literal(1, {
      description: "The supported chain ID for gas distribution. Only Ethereum mainnet (`1`) works.",
    }),
  },
  { optional: ["chainId"] },
);

const gasPricesOutputSchema = s.actionOutput(
  {
    system: s.nonEmptyString("The chain ecosystem returned by Blocknative."),
    network: s.nonEmptyString("The network name returned by Blocknative."),
    unit: s.nonEmptyString("The gas-price unit returned by Blocknative."),
    maxPrice: s.number("The highest priced transaction returned by Blocknative."),
    currentBlockNumber: s.integer("The current block number used for the prediction snapshot."),
    msSinceLastBlock: s.integer("Milliseconds since the last block at the prediction snapshot."),
    blockPrices: s.array("The predicted block-price payloads returned by Blocknative.", blockPriceSchema),
  },
  "The normalized output payload for Blocknative gas-price estimates.",
);

const gasPriceDistributionOutputSchema = s.actionOutput(
  {
    system: s.nonEmptyString("The chain ecosystem returned by Blocknative."),
    network: s.nonEmptyString("The network name returned by Blocknative."),
    unit: s.nonEmptyString("The gas-price unit returned by Blocknative."),
    maxPrice: s.number("The highest priced transaction returned by Blocknative."),
    currentBlockNumber: s.integer("The current block number used for the distribution snapshot."),
    msSinceLastBlock: s.integer("Milliseconds since the last block at the distribution snapshot."),
    topNDistribution: topNDistributionSchema,
  },
  "The normalized output payload for the Blocknative gas-price distribution.",
);

export const blocknativeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_supported_chains",
    description: "List the chains currently supported by the Blocknative Gas Platform.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Blocknative supported chains.", {}),
    outputSchema: s.actionOutput(
      {
        chains: s.array("The supported chains returned by Blocknative.", supportedChainSchema),
      },
      "The output payload for listing Blocknative supported chains.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_gas_oracles",
    description: "List the gas-oracle metadata exposed by Blocknative across supported chains.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing Blocknative gas oracles.", {}),
    outputSchema: s.actionOutput(
      {
        oracles: s.array("The gas oracles returned by Blocknative.", gasOracleSchema),
      },
      "The output payload for listing Blocknative gas oracles.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_gas_prices",
    description: "Get Blocknative gas-price estimates for the default chain or a selected network.",
    requiredScopes: [],
    inputSchema: gasPricesInputSchema,
    outputSchema: gasPricesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_gas_price_distribution",
    description: "Get the current Blocknative gas-price distribution for Ethereum mainnet.",
    requiredScopes: [],
    inputSchema: gasPriceDistributionInputSchema,
    outputSchema: gasPriceDistributionOutputSchema,
  }),
];
