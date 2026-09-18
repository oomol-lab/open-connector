import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "opensea";

const rawObjectSchema = s.looseObject("The raw object returned by OpenSea.");
const chainSchema = s.nonEmptyString("The blockchain identifier used by OpenSea, such as ethereum, polygon, or base.");
const collectionSlugSchema = s.nonEmptyString("The unique OpenSea collection slug.");
const nftIdentifierSchema = s.nonEmptyString("The NFT token identifier.");
const contractAddressSchema = s.nonEmptyString("The NFT contract address.");
const cursorSchema = s.nonEmptyString("The OpenSea pagination cursor from the previous response.");
const limitSchema = s.integer("Number of items to return per page.", { minimum: 1, maximum: 200 });
const searchLimitSchema = s.integer("Number of search results to return.", { minimum: 1, maximum: 50 });

const paginationOutputSchema = s.object("Pagination cursors returned by OpenSea.", {
  next: s.nullableString("The cursor for the next page when one is available."),
  previous: s.nullableString("The cursor for the previous page when one is available."),
});

const traitFilterSchema = s.object("One OpenSea trait filter for collection NFT searches.", {
  traitType: s.nonEmptyString("The trait category name."),
  value: s.nonEmptyString("The trait value to match."),
});

const nftSummarySchema = s.object("A normalized OpenSea NFT summary.", {
  identifier: s.nullableString("The NFT token identifier."),
  name: s.nullableString("The NFT display name."),
  description: s.nullableString("The NFT description."),
  imageUrl: s.nullableString("The NFT image URL."),
  collection: s.nullableString("The collection slug associated with the NFT."),
  contract: s.nullableString("The NFT contract address."),
  chain: s.nullableString("The blockchain identifier associated with the NFT."),
  raw: rawObjectSchema,
});

const collectionSummarySchema = s.object("A normalized OpenSea collection summary.", {
  slug: s.nullableString("The OpenSea collection slug."),
  name: s.nullableString("The collection display name."),
  description: s.nullableString("The collection description."),
  imageUrl: s.nullableString("The collection image URL."),
  bannerImageUrl: s.nullableString("The collection banner image URL."),
  owner: s.nullableString("The collection owner address when returned by OpenSea."),
  raw: rawObjectSchema,
});

const intervalStatSchema = s.looseObject("One interval statistic returned for an OpenSea collection.", {
  interval: s.string("The interval label returned by OpenSea."),
  volume: s.number("The trading volume for the interval."),
  sales: s.integer("The sales count for the interval."),
});

const collectionStatsSchema = s.looseObject("Collection statistics returned by OpenSea.", {
  total: s.looseObject("Total collection statistics returned by OpenSea.", {
    volume: s.number("Total trading volume."),
    sales: s.integer("Total sales count."),
    num_owners: s.integer("Total number of owners."),
    floor_price: s.number("Current floor price."),
    floor_price_symbol: s.string("Symbol for the floor price currency."),
  }),
  intervals: s.array("Interval statistics for the collection.", intervalStatSchema),
});

const traitsSchema = s.looseObject("Collection trait metadata returned by OpenSea.", {
  categories: s.record(
    "Trait category names mapped to their OpenSea data type.",
    s.string("The OpenSea trait data type."),
  ),
  counts: s.record("Trait category names mapped to value counts or numeric range metadata.", rawObjectSchema),
});

const orderSummarySchema = s.object("A normalized OpenSea marketplace order.", {
  orderHash: s.nullableString("The OpenSea order hash."),
  type: s.nullableString("The order type returned by OpenSea."),
  price: s.nullableString("The current order price when returned by OpenSea."),
  currency: s.nullableString("The order currency symbol when returned by OpenSea."),
  maker: s.nullableString("The maker address when returned by OpenSea."),
  taker: s.nullableString("The taker address when returned by OpenSea."),
  raw: rawObjectSchema,
});

const searchAssetTypeSchema = s.stringEnum("OpenSea asset type filter for search results.", [
  "collection",
  "nft",
  "token",
  "account",
]);

export const openseaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    operationType: "read",
    description: "Search OpenSea collections, tokens, NFTs, and accounts by relevance.",
    inputSchema: s.object(
      "Input parameters for searching OpenSea.",
      {
        query: s.nonEmptyString("Search query text."),
        chains: s.array("Blockchain identifiers used to filter search results.", chainSchema, { minItems: 1 }),
        assetTypes: s.array(
          "Asset type filters. OpenSea defaults to collection and token when omitted.",
          searchAssetTypeSchema,
          {
            minItems: 1,
          },
        ),
        limit: searchLimitSchema,
      },
      { optional: ["chains", "assetTypes", "limit"] },
    ),
    outputSchema: s.object("Search results returned by OpenSea.", {
      results: s.array("Raw ranked search results returned by OpenSea.", rawObjectSchema),
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_collection",
    operationType: "read",
    description: "Get one OpenSea collection including details, links, fees, and traits.",
    inputSchema: s.object(
      "Input parameters for retrieving one OpenSea collection.",
      {
        slug: collectionSlugSchema,
      },
      { required: ["slug"] },
    ),
    outputSchema: s.object("Collection details returned by OpenSea.", {
      collection: collectionSummarySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_collection_stats",
    operationType: "read",
    description: "Get comprehensive OpenSea statistics for one collection.",
    inputSchema: s.object(
      "Input parameters for retrieving OpenSea collection statistics.",
      {
        slug: collectionSlugSchema,
      },
      { required: ["slug"] },
    ),
    outputSchema: s.object("Collection statistics returned by OpenSea.", {
      stats: collectionStatsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_collection_nfts",
    operationType: "read",
    description: "List NFTs in one OpenSea collection with optional trait filtering.",
    inputSchema: s.object(
      "Input parameters for listing NFTs in an OpenSea collection.",
      {
        slug: collectionSlugSchema,
        traits: s.array("Trait filters to AND-combine for returned NFTs.", traitFilterSchema, { minItems: 1 }),
        hasAgentBinding: s.boolean("Filter to NFTs that have an ERC-8217 agent binding."),
        limit: limitSchema,
        next: cursorSchema,
      },
      { optional: ["traits", "hasAgentBinding", "limit", "next"] },
    ),
    outputSchema: s.object("NFTs returned for an OpenSea collection.", {
      nfts: s.array("Normalized OpenSea NFT summaries.", nftSummarySchema),
      pagination: paginationOutputSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_collection_traits",
    operationType: "read",
    description: "List all available traits for an OpenSea collection.",
    inputSchema: s.object(
      "Input parameters for listing OpenSea collection traits.",
      {
        slug: collectionSlugSchema,
      },
      { required: ["slug"] },
    ),
    outputSchema: s.object("Collection trait metadata returned by OpenSea.", {
      traits: traitsSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_collection_offers",
    operationType: "read",
    description: "List collection-level offers for an OpenSea collection.",
    inputSchema: s.object(
      "Input parameters for listing OpenSea collection offers.",
      {
        slug: collectionSlugSchema,
        limit: limitSchema,
        next: cursorSchema,
      },
      { optional: ["limit", "next"] },
    ),
    outputSchema: s.object("Collection offers returned by OpenSea.", {
      offers: s.array("Normalized OpenSea offers.", orderSummarySchema),
      pagination: paginationOutputSchema,
      raw: rawObjectSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_best_nft_listing",
    operationType: "read",
    description: "Get the best current OpenSea listing for a single NFT.",
    inputSchema: s.object(
      "Input parameters for retrieving the best listing for an NFT.",
      {
        slug: collectionSlugSchema,
        identifier: nftIdentifierSchema,
        includePrivateListings: s.boolean("Whether OpenSea should include private listings."),
      },
      { optional: ["includePrivateListings"] },
    ),
    outputSchema: s.object("Best NFT listing returned by OpenSea.", {
      listing: orderSummarySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_best_nft_offer",
    operationType: "read",
    description: "Get the best current OpenSea offer for a single NFT.",
    inputSchema: s.object(
      "Input parameters for retrieving the best offer for an NFT.",
      {
        slug: collectionSlugSchema,
        identifier: nftIdentifierSchema,
      },
      { required: ["slug", "identifier"] },
    ),
    outputSchema: s.object("Best NFT offer returned by OpenSea.", {
      offer: orderSummarySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_nft",
    operationType: "read",
    description: "Get metadata, traits, ownership, and rarity for a single OpenSea NFT.",
    inputSchema: s.object(
      "Input parameters for retrieving a single OpenSea NFT.",
      {
        chain: chainSchema,
        address: contractAddressSchema,
        identifier: nftIdentifierSchema,
      },
      { required: ["chain", "address", "identifier"] },
    ),
    outputSchema: s.object("NFT details returned by OpenSea.", {
      nft: nftSummarySchema,
    }),
  }),
];
