import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "uniswap_api";
const chainIds = [
  1, 10, 56, 130, 137, 143, 196, 324, 480, 1301, 1868, 4217, 4326, 8453, 84532, 10143, 42161, 42220, 43114, 59144,
  81457, 7777777, 11155111,
];
const protocolValues = ["V2", "V3", "V4", "UNISWAPX", "UNISWAPX_V2", "UNISWAPX_V3"];
const urgencyLevels = ["normal", "fast", "urgent"];
const tradeTypes = ["EXACT_INPUT", "EXACT_OUTPUT"];

const decimalStringSchema = (description: string) => s.string({ description, minLength: 1, pattern: "^[0-9]+$" });
const hexAddressSchema = (description: string) =>
  s.string({ description, minLength: 1, pattern: "^(0x)?[0-9a-fA-F]{40}$" });

const chainIdSchema = s.oneOf(
  chainIds.map((value) => s.literal(value, { description: `The chain ID ${value}.` })),
  { description: "The blockchain chain ID supported by the Uniswap Trading API." },
);
const tradeTypeSchema = s.stringEnum("How Uniswap interprets the requested amount.", tradeTypes);
const protocolSchema = s.stringEnum("One Uniswap routing protocol identifier.", protocolValues);
const txFailureReasonSchema = s.stringEnum("One transaction simulation failure reason returned by Uniswap.", [
  "SIMULATION_ERROR",
  "UNSUPPORTED_SIMULATION",
  "SIMULATION_UNAVAILABLE",
  "SLIPPAGE_TOO_LOW",
  "TRANSFER_FROM_FAILED",
]);
const routingPreferenceSchema = s.stringEnum("The quote routing preference for Uniswap route selection.", [
  "BEST_PRICE",
  "FASTEST",
]);
const autoSlippageSchema = s.stringEnum("The automatic slippage strategy supported by the public Uniswap API.", [
  "DEFAULT",
]);
const permitAmountSchema = s.stringEnum(
  "The permit allowance mode included in a quote response when Permit2 is enabled.",
  ["FULL", "EXACT"],
);
const spreadOptimizationSchema = s.stringEnum("The UniswapX spread optimization strategy when applicable.", [
  "EXECUTION",
  "PRICE",
]);
const safetyModeSchema = s.stringEnum("The swap safety mode accepted by the /swap endpoint.", ["SAFE", "FAST"]);

const urgencyOverridesSchema = s.object("Optional gas caps applied on top of the selected urgency tier.", {
  maxPriorityFeePerGas: decimalStringSchema("The maximum priority fee per gas in wei."),
  maxFeePerGas: decimalStringSchema("The maximum total fee per gas in wei."),
  gasLimit: decimalStringSchema("The replacement gas limit cap in gas units."),
});

const urgencySchema = s.oneOf(
  [
    s.stringEnum("One simple urgency level.", urgencyLevels),
    s.object("An urgency level with optional gas caps.", {
      level: s.stringEnum("The urgency level.", urgencyLevels),
      overrides: urgencyOverridesSchema,
    }),
  ],
  { description: "The urgency mode used for approval or swap pricing." },
);

const permitDataSchema = s.object("The Permit2 payload returned by Uniswap when applicable.", {
  domain: s.looseObject("The EIP-712 domain object returned by Uniswap."),
  values: s.looseObject("The permit values object returned by Uniswap."),
  types: s.looseObject("The permit type map returned by Uniswap."),
});

const transactionRequestSchema = s.object("One transaction request returned by Uniswap.", {
  to: hexAddressSchema("The transaction recipient address."),
  from: hexAddressSchema("The transaction sender address."),
  data: s.nonEmptyString("The transaction calldata."),
  value: decimalStringSchema("The transaction value in wei."),
  chainId: chainIdSchema,
  gasLimit: s.nullable(decimalStringSchema("The gas limit returned by Uniswap when present.")),
  maxFeePerGas: s.nullable(decimalStringSchema("The max fee per gas returned by Uniswap when present.")),
  maxPriorityFeePerGas: s.nullable(
    decimalStringSchema("The max priority fee per gas returned by Uniswap when present."),
  ),
  gasPrice: s.nullable(decimalStringSchema("The gas price returned by Uniswap when present.")),
});

const getQuoteInputSchema = s.object(
  "Input parameters for requesting a Uniswap trade quote.",
  {
    type: tradeTypeSchema,
    amount: decimalStringSchema("The input or output amount in token base units."),
    tokenInChainId: chainIdSchema,
    tokenOutChainId: chainIdSchema,
    tokenIn: hexAddressSchema("The input token contract address."),
    tokenOut: hexAddressSchema("The output token contract address."),
    swapper: hexAddressSchema("The wallet address that will submit the transaction."),
    recipient: hexAddressSchema("The wallet address that should receive the output token."),
    slippageTolerance: s.number("The manual slippage tolerance percentage.", { minimum: 0 }),
    autoSlippage: autoSlippageSchema,
    routingPreference: routingPreferenceSchema,
    protocols: s.array("The protocols Uniswap may use for routing.", protocolSchema, { minItems: 1 }),
    urgency: urgencySchema,
    permitAmount: permitAmountSchema,
    spreadOptimization: spreadOptimizationSchema,
    generatePermitAsTransaction: s.boolean(
      "Whether Permit2 should be generated as an onchain transaction instead of a signature.",
    ),
    enableUniversalRouter: s.boolean("Whether to send the public x-universal-router-version header as version 2.0."),
    enablePermit2: s.boolean("Whether Permit2 should stay enabled. Set false to send x-permit2-disabled: true."),
  },
  {
    optional: [
      "recipient",
      "slippageTolerance",
      "autoSlippage",
      "routingPreference",
      "protocols",
      "urgency",
      "permitAmount",
      "spreadOptimization",
      "generatePermitAsTransaction",
      "enableUniversalRouter",
      "enablePermit2",
    ],
  },
);

const getQuoteOutputSchema = s.actionOutput(
  {
    requestId: s.nonEmptyString("The upstream Uniswap request identifier."),
    routing: s.string("The routing family returned by Uniswap."),
    quoteId: s.nonEmptyString("The quote identifier returned by Uniswap."),
    chainId: chainIdSchema,
    swapper: hexAddressSchema("The wallet address tied to this quote."),
    tradeType: tradeTypeSchema,
    inputToken: hexAddressSchema("The quoted input token address."),
    inputAmount: decimalStringSchema("The quoted input amount in base units."),
    outputToken: hexAddressSchema("The quoted output token address."),
    outputAmount: decimalStringSchema("The quoted output amount in base units."),
    recipient: s.nullable(hexAddressSchema("The output recipient when Uniswap returns one.")),
    slippage: s.nullableNumber("The quoted slippage tolerance percentage when returned."),
    gasFee: s.nullable(decimalStringSchema("The total estimated gas cost in wei when returned.")),
    gasFeeUsd: s.nullableString("The total estimated gas cost denominated in USDC."),
    gasUseEstimate: s.nullable(decimalStringSchema("The gas use estimate when returned.")),
    txFailureReasons: s.array("Transaction simulation failure reasons returned by Uniswap.", txFailureReasonSchema),
    permitData: s.nullable(permitDataSchema),
    route: s.array(
      "The route legs returned by Uniswap as a nested list of raw route segments.",
      s.array("One route segment list.", s.looseObject("One raw route segment object.")),
    ),
    rawQuote: s.looseObject("The raw quote object returned by Uniswap."),
  },
  "The normalized Uniswap quote response.",
  [
    "requestId",
    "quoteId",
    "chainId",
    "swapper",
    "tradeType",
    "inputToken",
    "inputAmount",
    "outputToken",
    "outputAmount",
    "txFailureReasons",
    "route",
    "rawQuote",
  ],
);

const checkApprovalInputSchema = s.object(
  "Input parameters for checking whether a wallet approval transaction is required.",
  {
    walletAddress: hexAddressSchema("The wallet address that would send the token."),
    token: hexAddressSchema("The token contract address to approve."),
    amount: decimalStringSchema("The token amount that must be spendable."),
    chainId: chainIdSchema,
    urgency: urgencySchema,
    includeGasInfo: s.boolean("Whether the gas-fee fields should be requested from Uniswap."),
    tokenOut: hexAddressSchema("The output token address when provided for routing context."),
    tokenOutChainId: chainIdSchema,
    enablePermit2: s.boolean("Whether Permit2 should stay enabled. Set false to send x-permit2-disabled: true."),
  },
  { optional: ["urgency", "includeGasInfo", "tokenOut", "tokenOutChainId", "enablePermit2"] },
);

const checkApprovalOutputSchema = s.actionOutput(
  {
    requestId: s.nonEmptyString("The upstream Uniswap request identifier."),
    approval: s.nullable(transactionRequestSchema),
    cancel: s.nullable(transactionRequestSchema),
    gasFee: s.nullable(decimalStringSchema("The estimated gas cost for the approval transaction.")),
    cancelGasFee: s.nullable(decimalStringSchema("The estimated gas cost for the approval-reset transaction.")),
  },
  "The normalized Uniswap approval-check response.",
);

const createSwapInputSchema = s.object(
  "Input parameters for creating swap calldata.",
  {
    quote: s.looseObject("The prior Uniswap quote object to convert into swap calldata."),
    signature: s.nonEmptyString("The signed Permit2 signature when one is required."),
    permitData: permitDataSchema,
    refreshGasPrice: s.boolean("Whether Uniswap should refresh gas pricing."),
    simulateTransaction: s.boolean("Whether Uniswap should simulate the transaction."),
    safetyMode: safetyModeSchema,
    deadline: decimalStringSchema("The swap deadline timestamp in seconds."),
    urgency: urgencySchema,
    enableUniversalRouter: s.boolean("Whether to send the public x-universal-router-version header as version 2.0."),
    enablePermit2: s.boolean("Whether Permit2 should stay enabled. Set false to send x-permit2-disabled: true."),
  },
  {
    optional: [
      "signature",
      "permitData",
      "refreshGasPrice",
      "simulateTransaction",
      "safetyMode",
      "deadline",
      "urgency",
      "enableUniversalRouter",
      "enablePermit2",
    ],
  },
);

const createSwapOutputSchema = s.actionOutput(
  {
    requestId: s.nonEmptyString("The upstream Uniswap request identifier."),
    swap: transactionRequestSchema,
    gasFee: s.nullable(decimalStringSchema("The estimated gas cost for the swap transaction.")),
  },
  "The normalized Uniswap swap-calldata response.",
  ["requestId", "swap"],
);

export const uniswapApiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_quote",
    operationType: "read",
    description: "Request a Uniswap trade quote for one wallet, token pair, and amount.",
    inputSchema: getQuoteInputSchema,
    outputSchema: getQuoteOutputSchema,
    followUpActions: ["uniswap_api.create_swap"],
  }),
  defineProviderAction(service, {
    name: "check_approval",
    operationType: "read",
    description: "Check whether the swapper wallet needs an ERC-20 approval transaction before swapping.",
    inputSchema: checkApprovalInputSchema,
    outputSchema: checkApprovalOutputSchema,
  }),
  defineProviderAction(service, {
    name: "create_swap",
    operationType: "write",
    description: "Create the transaction calldata for a Uniswap swap from a prior quote and optional permit signature.",
    inputSchema: createSwapInputSchema,
    outputSchema: createSwapOutputSchema,
  }),
];
