import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "alchemy";

const hexAddressSchema = s.stringPattern("^0x[0-9a-fA-F]{40}$", {
  description: "A 0x-prefixed 20-byte hex address.",
});

const tokenSpecSchema = s.anyOf("Token selection forwarded to Alchemy Token API.", [
  s.stringEnum("Built-in token selection used by Alchemy.", ["erc20", "DEFAULT_TOKENS", "NATIVE_TOKEN"]),
  s.array("Explicit token contract addresses to include in the balance response.", hexAddressSchema, {
    minItems: 1,
  }),
]);

const transferCategorySchema = s.stringEnum("Transfer category forwarded to Alchemy.", [
  "external",
  "internal",
  "erc20",
  "erc721",
  "erc1155",
  "specialnft",
]);

const nftTokenTypeSchema = s.stringEnum("NFT token type forwarded to Alchemy.", ["ERC721", "ERC1155"]);

const getTokenBalancesInputSchema = s.object(
  "Input parameters for retrieving ERC-20 balances from Alchemy Ethereum mainnet.",
  {
    address: hexAddressSchema,
    tokenSpec: tokenSpecSchema,
    pageKey: s.string("Pagination key returned by a previous Alchemy token-balance call.", { minLength: 1 }),
    maxCount: s.integer("Maximum number of balances to request per page.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  { optional: ["tokenSpec", "pageKey", "maxCount"] },
);

const tokenBalanceEntrySchema = s.object("Single token balance entry returned by Alchemy.", {
  contractAddress: hexAddressSchema,
  tokenBalance: s.nullable(s.string("Hex-encoded token balance returned by Alchemy when available.", { minLength: 1 })),
  error: s.nullable(s.string("Alchemy error string for this token balance when present.", { minLength: 1 })),
});

const getTokenBalancesOutputSchema = s.object(
  "ERC-20 balances returned by Alchemy.",
  {
    address: hexAddressSchema,
    pageKey: s.nullable(s.string("Pagination key for fetching the next page of token balances.", { minLength: 1 })),
    tokenBalances: s.array("Token balance entries returned by Alchemy.", tokenBalanceEntrySchema),
  },
  { optional: ["pageKey"] },
);

const getTokenMetadataInputSchema = s.object(
  "Input parameters for retrieving token metadata from Alchemy Ethereum mainnet.",
  {
    contractAddress: hexAddressSchema,
  },
);

const getTokenMetadataOutputSchema = s.object("Token metadata returned by Alchemy.", {
  name: s.nullable(s.string("Token name returned by Alchemy when available.", { minLength: 1 })),
  symbol: s.nullable(s.string("Token symbol returned by Alchemy when available.", { minLength: 1 })),
  decimals: s.nullable(s.number("Token decimals returned by Alchemy when available.")),
  logo: s.nullable(s.url("Token logo URL returned by Alchemy when available.")),
});

const getAssetTransfersInputSchema = s.object(
  "Input parameters for retrieving historical asset transfers from Alchemy Ethereum mainnet.",
  {
    fromBlock: s.string("Starting block tag or hex block number.", { minLength: 1 }),
    toBlock: s.string("Ending block tag or hex block number.", { minLength: 1 }),
    fromAddress: hexAddressSchema,
    toAddress: hexAddressSchema,
    excludeZeroValue: s.boolean("Whether zero-value transfers should be excluded."),
    category: s.array("Transfer categories to include in the response.", transferCategorySchema, {
      minItems: 1,
    }),
    contractAddresses: s.array("Token or NFT contract addresses used to filter transfers.", hexAddressSchema, {
      minItems: 1,
    }),
    order: s.stringEnum("Transfer ordering returned by Alchemy.", ["asc", "desc"]),
    withMetadata: s.boolean("Whether Alchemy should attach block metadata when available."),
    maxCount: s.string("Hex-encoded maximum number of transfers to return.", { minLength: 1 }),
    pageKey: s.string("Pagination key returned by a previous transfers call.", { minLength: 1 }),
  },
  {
    optional: [
      "fromBlock",
      "toBlock",
      "fromAddress",
      "toAddress",
      "excludeZeroValue",
      "contractAddresses",
      "order",
      "withMetadata",
      "maxCount",
      "pageKey",
    ],
  },
);

const getAssetTransfersOutputSchema = s.object(
  "Historical asset transfers returned by Alchemy.",
  {
    message: s.nullable(s.string("Alchemy result string returned when no transfer object payload is available.")),
    pageKey: s.nullable(s.string("Pagination key for fetching the next transfer page.", { minLength: 1 })),
    transfers: s.array("Transfer objects returned by Alchemy.", s.looseObject({}, { description: "Transfer object." })),
  },
  { optional: ["message", "pageKey"] },
);

const getNftsForOwnerInputSchema = s.object(
  "Input parameters for retrieving NFTs owned by an address from Alchemy Ethereum mainnet.",
  {
    owner: s.string("Owner address or ENS name accepted by Alchemy.", { minLength: 1 }),
    contractAddresses: s.array("NFT contract addresses used to filter the response.", hexAddressSchema, {
      minItems: 1,
      maxItems: 45,
    }),
    withMetadata: s.boolean("Whether NFT metadata should be returned."),
    orderBy: s.stringEnum("NFT ordering mode accepted by Alchemy.", ["transferTime"]),
    tokenUriTimeoutInMs: s.integer(
      "Timeout in milliseconds for live token URI fetches when metadata is requested.",
      { minimum: 0 },
    ),
    pageKey: s.string("Pagination key returned by a previous NFTs-by-owner call.", { minLength: 1 }),
    pageSize: s.integer("Maximum number of NFTs to return per page.", {
      minimum: 1,
      maximum: 100,
    }),
  },
  {
    optional: [
      "contractAddresses",
      "withMetadata",
      "orderBy",
      "tokenUriTimeoutInMs",
      "pageKey",
      "pageSize",
    ],
  },
);

const getNftsForOwnerOutputSchema = s.object(
  "NFT ownership payload returned by Alchemy.",
  {
    ownedNfts: s.array("NFT objects returned by Alchemy.", s.looseObject({}, { description: "NFT object." })),
    totalCount: s.integer("Total number of NFTs owned by the requested address."),
    pageKey: s.nullable(s.string("Pagination key for the next NFTs-by-owner page.", { minLength: 1 })),
    validAt: s.nullable(s.looseObject({}, { description: "Block-validity metadata returned by Alchemy." })),
  },
  { optional: ["pageKey", "validAt"] },
);

const getNftMetadataInputSchema = s.object(
  "Input parameters for retrieving metadata for one NFT from Alchemy Ethereum mainnet.",
  {
    contractAddress: hexAddressSchema,
    tokenId: s.string("NFT token identifier in decimal or hex form.", { minLength: 1 }),
    tokenType: nftTokenTypeSchema,
    tokenUriTimeoutInMs: s.integer(
      "Timeout in milliseconds for live token URI fetches when metadata is requested.",
      { minimum: 0 },
    ),
  },
  { optional: ["tokenType", "tokenUriTimeoutInMs"] },
);

const getNftMetadataOutputSchema = s.object("NFT metadata payload returned by Alchemy.", {
  nft: s.looseObject({}, { description: "NFT metadata object returned by Alchemy." }),
});

export const alchemyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_token_balances",
    description: "Retrieve ERC-20 token balances for a wallet address from Alchemy Ethereum mainnet.",
    requiredScopes: [],
    inputSchema: getTokenBalancesInputSchema,
    outputSchema: getTokenBalancesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_token_metadata",
    description: "Retrieve ERC-20 token metadata for one contract from Alchemy Ethereum mainnet.",
    requiredScopes: [],
    inputSchema: getTokenMetadataInputSchema,
    outputSchema: getTokenMetadataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_asset_transfers",
    description: "Retrieve historical asset transfers for Ethereum mainnet addresses through Alchemy.",
    requiredScopes: [],
    inputSchema: getAssetTransfersInputSchema,
    outputSchema: getAssetTransfersOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_nfts_for_owner",
    description: "Retrieve NFTs currently owned by an address from Alchemy Ethereum mainnet.",
    requiredScopes: [],
    inputSchema: getNftsForOwnerInputSchema,
    outputSchema: getNftsForOwnerOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_nft_metadata",
    description: "Retrieve metadata for a specific NFT from Alchemy Ethereum mainnet.",
    requiredScopes: [],
    inputSchema: getNftMetadataInputSchema,
    outputSchema: getNftMetadataOutputSchema,
  }),
];

export type AlchemyActionName = (typeof alchemyActions)[number]["name"];
