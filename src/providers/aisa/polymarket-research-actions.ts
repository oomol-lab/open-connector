import type { ActionDefinition } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const batchTokens = s.array(
  "Outcome tokens to query; side selects BUY or SELL where applicable.",
  s.object(
    "One outcome token and optional quote side.",
    {
      tokenId: s.string("The outcome token ID.", { minLength: 1 }),
      side: s.optional(s.stringEnum("The quote side, when applicable.", ["BUY", "SELL"])),
    },
    { optional: [] },
  ),
  { minItems: 1 },
);

export const polymarketResearchActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "quote_polymarket_bridge",
    description: "Estimate bridge fees, received amount, and completion time without submitting a transfer.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The source amount, assets, chains, and recipient for a bridge quote.",
      {
        fromAmountBaseUnit: s.string("Amount of tokens to send in base units, preserved as a decimal string.", {
          minLength: 1,
        }),
        fromChainId: s.string("Source chain ID.", { minLength: 1 }),
        fromTokenAddress: s.string("Source token address.", { minLength: 1 }),
        recipientAddress: s.string("Recipient address.", { minLength: 1 }),
        toChainId: s.string("Destination chain ID.", { minLength: 1 }),
        toTokenAddress: s.string("Destination token address.", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The estimated bridge quote and fees, including additional upstream fields.",
      {
        quoteId: s.optional(s.string("The quote identifier.")),
        estToTokenBaseUnit: s.optional(s.string("Estimated received token amount in base units.")),
        estCheckoutTimeMs: s.optional(s.number("Estimated completion time in milliseconds.")),
        estInputUsd: s.optional(s.number("Estimated input value in USD.")),
        estOutputUsd: s.optional(s.number("Estimated output value in USD.")),
        estFeeBreakdown: s.optional(s.looseObject("Estimated fee and price-impact details.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_relayer_transaction",
    description:
      "Read a relayer transaction by its existing transaction ID, including broadcast status and onchain hash.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "An existing relayer transaction identifier.",
      {
        transactionId: s.string(
          "The transactionID returned by a relayer submission, not the onchain transaction hash.",
          { minLength: 1 },
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.array(
      "Matching relayer transaction records.",
      s.looseObject(
        "One relayer transaction record.",
        {
          transactionID: s.optional(s.string("The relayer transaction identifier.")),
          transactionHash: s.optional(s.string("The onchain transaction hash when broadcast.")),
          state: s.optional(s.string("The relayer transaction state.")),
          signature: s.optional(s.string("The transaction signature returned by the relayer.")),
        },
        { required: [] },
      ),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_nonce",
    description: "Read the current public Proxy or Safe nonce for a signer address.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The public signer address and nonce type.",
      {
        address: s.string("The signer Ethereum address.", { pattern: "^0x[a-fA-F0-9]{40}$" }),
        type: s.stringEnum("The nonce type to retrieve.", ["PROXY", "SAFE"]),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The public relayer metadata, including additional upstream fields.",
      {
        nonce: s.string("The current nonce as a decimal string."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_relay_payload",
    description: "Read the relayer address and nonce for a public signer address.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The public signer address and nonce type.",
      {
        address: s.string("The signer Ethereum address.", { pattern: "^0x[a-fA-F0-9]{40}$" }),
        type: s.stringEnum("The nonce type to retrieve.", ["PROXY", "SAFE"]),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The public relayer metadata, including additional upstream fields.",
      {
        address: s.string("The relayer address."),
        nonce: s.string("The current nonce as a decimal string."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_bridge_status",
    description: "Read deposits and withdrawals observed at a public bridge address with cursor pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "A public bridge address and pagination options.",
      {
        address: s.string(
          "The bridge address from a deposit or withdrawal response. EVM, Solana, Tron, and Bitcoin formats are supported.",
          { minLength: 1 },
        ),
        cursor: s.optional(s.string("Opaque nextCursor from the previous page; omit for the newest activity.")),
        limit: s.optional(
          s.integer("Transactions per page. Defaults to 50; a short page may still have a nextCursor.", {
            minimum: 1,
            maximum: 100,
          }),
        ),
        paginate: s.optional(
          s.stringEnum("Compatibility parameter; normally omit and use cursor and limit.", ["true"]),
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "One page of public bridge activity with its continuation cursor.",
      {
        transactions: s.array(
          "Bridge deposits and withdrawals, newest first.",
          s.looseObject("One bridge transaction with status and available chain details."),
        ),
        nextCursor: s.nullableString("Continuation cursor, or null when no further page exists."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_maker_rebates",
    description: "Read public rebated fees for a maker address on a given date.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The maker address and date to query.",
      {
        makerAddress: s.string("Ethereum address of the maker.", { pattern: "^0x[a-fA-F0-9]{40}$" }),
        date: s.string("Date in YYYY-MM-DD format.", { format: "date" }),
      },
      { optional: [] },
    ),
    outputSchema: s.nullable(
      s.array(
        "Public maker rebate entries, or null when no rows exist.",
        s.looseObject(
          "One public maker rebate entry.",
          {
            condition_id: s.optional(s.string("The market condition ID.")),
            asset_address: s.optional(s.string("The rebate asset address.")),
            maker_address: s.optional(s.string("The maker address.")),
            date: s.optional(s.string("The rebate date.")),
            rebated_fees_usdc: s.optional(s.string("The rebated fee amount in USDC, preserved as a decimal string.")),
          },
          { required: [] },
        ),
      ),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_wallet_deployment",
    description: "Check whether a public Polymarket Safe or Deposit Wallet address is deployed onchain.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The public wallet address and wallet type to inspect.",
      {
        address: s.string("Ethereum wallet address: 0x followed by 40 hexadecimal characters.", {
          pattern: "^0x[a-fA-F0-9]{40}$",
        }),
        type: s.optional(s.stringEnum("Wallet type to check. Defaults to SAFE when omitted.", ["SAFE", "WALLET"])),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The public wallet deployment status, including additional upstream fields.",
      {
        deployed: s.boolean("Whether the wallet is deployed onchain."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_batch_price_history",
    description: "Get price histories for up to 20 outcome tokens in one request.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Get price histories for up to 20 outcome tokens in one request.",
      {
        endTimestamp: s.number("Filter by items before this unix timestamp (seconds)."),
        fidelity: s.integer("Accuracy of the data expressed in minutes. Default is 1 minute."),
        interval: s.stringEnum("Time interval for data aggregation.", ["max", "all", "1m", "1w", "1d", "6h", "1h"]),
        tokenIds: s.array(
          "List of market asset ids to query. Maximum 20.",
          s.string("One entry in the list.", { minLength: 1 }),
          { minItems: 1, maxItems: 20 },
        ),
        startTimestamp: s.number("Filter by items after this unix timestamp (seconds)."),
      },
      { optional: ["endTimestamp", "fidelity", "interval", "startTimestamp"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        history: s.looseObject("Map of market asset id to array of price data points."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_orderbooks",
    description: "Read multiple public orderbooks in one request.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read multiple public orderbooks in one request.",
      {
        tokens: batchTokens,
      },
      { optional: [] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_comments",
    description: "List public comments on Polymarket markets, events, or series with filtering and pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List public comments on Polymarket markets, events, or series with filtering and pagination.",
      {
        ascending: s.boolean("The ascending filter or option."),
        getPositions: s.boolean("The getPositions filter or option."),
        holdersOnly: s.boolean("The holdersOnly filter or option."),
        limit: s.integer("The limit filter or option.", { minimum: 0 }),
        offset: s.integer("The offset filter or option.", { minimum: 0 }),
        order: s.string("Comma-separated list of fields to order by"),
        parentEntityId: s.integer("The parentEntity ID filter or option."),
        parentEntityType: s.stringEnum("The parentEntityType filter or option.", ["Event", "Series", "market"]),
      },
      {
        optional: [
          "ascending",
          "getPositions",
          "holdersOnly",
          "limit",
          "offset",
          "order",
          "parentEntityId",
          "parentEntityType",
        ],
      },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_user_comments",
    description: "Read public comments authored by a wallet address.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read public comments authored by a wallet address.",
      {
        userAddress: s.string("The userAddress filter or option.", { minLength: 1 }),
        ascending: s.boolean("The ascending filter or option."),
        limit: s.integer("The limit filter or option.", { minimum: 0 }),
        offset: s.integer("The offset filter or option.", { minimum: 0 }),
        order: s.string("Comma-separated list of fields to order by"),
      },
      { optional: ["ascending", "limit", "offset", "order"] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_comment",
    description: "Read a public comment by its identifier.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read a public comment by its identifier.",
      {
        commentId: s.integer("The id filter or option."),
        getPositions: s.boolean("The getPositions filter or option."),
      },
      { optional: ["getPositions"] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "search_polymarket_events",
    description: "Search public events with keyset pagination, sports, time, tag, and liquidity filters.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Search public events with keyset pagination, sports, time, tag, and liquidity filters.",
      {
        cursor: s.string("Opaque cursor token from a previous response's next_cursor"),
        ascending: s.boolean("Sort direction. Only used when order is set."),
        closed: s.anyOf(
          "Filter by closed state. Omitted includes open and closed events. Use true for closed events, false for open events, or any (case-insensitive) for both states. Unlike markets, any does not require an identifier filter. Invalid closed values return 422.\n",
          [
            s.boolean(
              "Filter by closed state. Omitted includes open and closed events. Use true for closed events, false for open events, or any (case-insensitive) for both states. Unlike markets, any does not require an identifier filter. Invalid closed values return 422.\n",
            ),
            s.stringEnum(
              "Filter by closed state. Omitted includes open and closed events. Use true for closed events, false for open events, or any (case-insensitive) for both states. Unlike markets, any does not require an identifier filter. Invalid closed values return 422.\n",
              ["any"],
            ),
          ],
        ),
        createdBy: s.array("The createdBy filter or option.", s.string("One entry in the list.")),
        cyom: s.boolean("The cyom filter or option."),
        endDateMax: s.string("The endDateMax filter or option.", { format: "date-time" }),
        endDateMin: s.string("The endDateMin filter or option.", { format: "date-time" }),
        eventDate: s.string("The eventDate filter or option.", { format: "date-time" }),
        eventWeek: s.integer("The eventWeek filter or option."),
        excludeTagIds: s.array("Tag IDs to exclude. Cannot overlap with tag_id.", s.integer("One entry in the list.")),
        featured: s.boolean("The featured filter or option."),
        featuredOrder: s.boolean("The featuredOrder filter or option."),
        gameIds: s.array("The game ID filter or option.", s.integer("One entry in the list.")),
        ids: s.array("The id filter or option.", s.integer("One entry in the list.")),
        includeBestLines: s.boolean("When true, includes BestLines relation"),
        includeChat: s.boolean("When true, includes Chats and Series.Chats relations"),
        includeChildren: s.boolean("The includeChildren filter or option."),
        includeTemplate: s.boolean("When true, includes Templates relation"),
        limit: s.integer("Maximum number of results to return (max 100)", {
          minimum: 1,
          maximum: 100,
        }),
        liquidityMax: s.number("The liquidityMax filter or option."),
        liquidityMin: s.number("The liquidityMin filter or option."),
        live: s.boolean("The live filter or option."),
        locale: s.string("The locale filter or option."),
        order: s.string("Comma-separated list of JSON field names to order by"),
        parentEventId: s.integer("The parentEvent ID filter or option."),
        partnerSlug: s.string("When set, external_partners are attached to matching events"),
        recurrence: s.string("The recurrence filter or option."),
        relatedTags: s.boolean("The relatedTags filter or option."),
        seriesIds: s.array("The series ID filter or option.", s.integer("One entry in the list.")),
        slugs: s.array("The slug filter or option.", s.string("One entry in the list.")),
        startDateMax: s.string("The startDateMax filter or option.", { format: "date-time" }),
        startDateMin: s.string("The startDateMin filter or option.", { format: "date-time" }),
        startTimeMax: s.string("The startTimeMax filter or option.", { format: "date-time" }),
        startTimeMin: s.string("The startTimeMin filter or option.", { format: "date-time" }),
        tagIds: s.array("The tag ID filter or option.", s.integer("One entry in the list.")),
        tagMatch: s.string("The tagMatch filter or option."),
        tagSlug: s.string("The tagSlug filter or option."),
        titleSearch: s.string("The titleSearch filter or option."),
        volumeMax: s.number("The volumeMax filter or option."),
        volumeMin: s.number("The volumeMin filter or option."),
      },
      {
        optional: [
          "cursor",
          "ascending",
          "closed",
          "createdBy",
          "cyom",
          "endDateMax",
          "endDateMin",
          "eventDate",
          "eventWeek",
          "excludeTagIds",
          "featured",
          "featuredOrder",
          "gameIds",
          "ids",
          "includeBestLines",
          "includeChat",
          "includeChildren",
          "includeTemplate",
          "limit",
          "liquidityMax",
          "liquidityMin",
          "live",
          "locale",
          "order",
          "parentEventId",
          "partnerSlug",
          "recurrence",
          "relatedTags",
          "seriesIds",
          "slugs",
          "startDateMax",
          "startDateMin",
          "startTimeMax",
          "startTimeMin",
          "tagIds",
          "tagMatch",
          "tagSlug",
          "titleSearch",
          "volumeMax",
          "volumeMin",
        ],
      },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        events: s.array("Array of Event objects. Empty array if none found.", s.looseObject("One entry in the list.")),
        next_cursor: s.string(
          "Opaque cursor token for fetching the next page. Present only when the number of returned events equals the effective limit. Omitted on the last page.\n",
        ),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_event_by_slug",
    description: "Read an event by its URL slug, with optional chat and template metadata.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read an event by its URL slug, with optional chat and template metadata.",
      {
        slug: s.string("The slug filter or option.", { minLength: 1 }),
        includeChat: s.boolean("The includeChat filter or option."),
        includeTemplate: s.boolean("The includeTemplate filter or option."),
      },
      { optional: ["includeChat", "includeTemplate"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        id: s.string("The returned id field."),
        slug: s.nullable(s.string("The returned slug field.")),
        title: s.nullable(s.string("The returned title field.")),
        description: s.nullable(s.string("The returned description field.")),
        active: s.nullable(s.boolean("The returned active field.")),
        closed: s.nullable(s.boolean("The returned closed field.")),
        markets: s.array("The returned markets field.", s.looseObject("One entry in the list.")),
        tags: s.array("The returned tags field.", s.looseObject("One entry in the list.")),
        startDate: s.nullable(s.string("The returned startDate field.", { format: "date-time" })),
        endDate: s.nullable(s.string("The returned endDate field.", { format: "date-time" })),
        liquidity: s.nullable(s.number("The returned liquidity field.")),
        volume: s.nullable(s.number("The returned volume field.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_event_tags",
    description: "Read the category tags assigned to an event.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the category tags assigned to an event.",
      {
        eventId: s.integer("The id filter or option."),
      },
      { optional: [] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_fee_rate",
    description: "Read the published base fee rate for an outcome token.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the published base fee rate for an outcome token.",
      {
        tokenId: s.string("Token ID (asset ID)", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        base_fee: s.integer("Base fee in basis points"),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_last_trade_price",
    description: "Read the most recent executed trade price and side for an outcome token.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the most recent executed trade price and side for an outcome token.",
      {
        tokenId: s.string("Token ID (asset ID)", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        price: s.string("Last trade price"),
        side: s.stringEnum("Last trade side (BUY or SELL)", ["BUY", "SELL", ""]),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_last_trade_prices",
    description: "Read last executed trade prices for multiple outcome tokens.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read last executed trade prices for multiple outcome tokens.",
      {
        tokens: batchTokens,
      },
      { optional: [] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_market_by_token",
    description: "Resolve an outcome token to its condition ID and paired token IDs.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Resolve an outcome token to its condition ID and paired token IDs.",
      {
        tokenId: s.string("The token ID to look up the parent market for", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        condition_id: s.string("The condition ID of the market containing the given token"),
        primary_token_id: s.string("The primary (Yes) token ID"),
        secondary_token_id: s.string("The secondary (No) token ID"),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "search_polymarket_markets",
    description: "Search public markets with keyset pagination, identifiers, tags, dates, and liquidity filters.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Search public markets with keyset pagination, identifiers, tags, dates, and liquidity filters.",
      {
        cursor: s.string("Opaque cursor token from a previous response's next_cursor"),
        ascending: s.boolean("Sort direction. Only used when order is set."),
        clobTokenIds: s.array("The clobToken IDs filter or option.", s.string("One entry in the list."), {
          minItems: 1,
          maxItems: 100,
        }),
        closed: s.anyOf(
          "Filter by closed state. Omitted or false returns open markets; true returns closed markets. Use any (case-insensitive) to include both states in an identifier lookup. Requires at least one of id, slug, clob_token_ids, position_ids, condition_ids, request_ids, onchain_event_ids, or question_ids when any is used. Each identifier filter accepts at most 100 values. Missing an identifier with any, or an invalid closed value, returns 422.\n",
          [
            s.boolean(
              "Filter by closed state. Omitted or false returns open markets; true returns closed markets. Use any (case-insensitive) to include both states in an identifier lookup. Requires at least one of id, slug, clob_token_ids, position_ids, condition_ids, request_ids, onchain_event_ids, or question_ids when any is used. Each identifier filter accepts at most 100 values. Missing an identifier with any, or an invalid closed value, returns 422.\n",
            ),
            s.stringEnum(
              "Filter by closed state. Omitted or false returns open markets; true returns closed markets. Use any (case-insensitive) to include both states in an identifier lookup. Requires at least one of id, slug, clob_token_ids, position_ids, condition_ids, request_ids, onchain_event_ids, or question_ids when any is used. Each identifier filter accepts at most 100 values. Missing an identifier with any, or an invalid closed value, returns 422.\n",
              ["any"],
            ),
          ],
        ),
        conditionIds: s.array("The condition IDs filter or option.", s.string("One entry in the list."), {
          minItems: 1,
          maxItems: 100,
        }),
        cyom: s.boolean("The cyom filter or option."),
        decimalized: s.boolean("The decimalized filter or option."),
        endDateMax: s.string("The endDateMax filter or option.", { format: "date-time" }),
        endDateMin: s.string("The endDateMin filter or option.", { format: "date-time" }),
        gameId: s.string("The game ID filter or option."),
        ids: s.array("The id filter or option.", s.integer("One entry in the list."), {
          minItems: 1,
          maxItems: 100,
        }),
        includeTag: s.boolean("When true, includes Tags relation on each market"),
        limit: s.integer("Maximum number of results to return (max 100)", {
          minimum: 1,
          maximum: 100,
        }),
        liquidityNumMax: s.number("The liquidityNumMax filter or option."),
        liquidityNumMin: s.number("The liquidityNumMin filter or option."),
        locale: s.string("The locale filter or option."),
        order: s.string("Comma-separated list of JSON field names to order by, e.g. volume_num,liquidity_num"),
        questionIds: s.array("The question IDs filter or option.", s.string("One entry in the list."), {
          minItems: 1,
          maxItems: 100,
        }),
        relatedTags: s.boolean("The relatedTags filter or option."),
        rfqEnabled: s.boolean("The rfqEnabled filter or option."),
        slugs: s.array("The slug filter or option.", s.string("One entry in the list."), {
          minItems: 1,
          maxItems: 100,
        }),
        sportsMarketTypes: s.array("The sportsMarketTypes filter or option.", s.string("One entry in the list.")),
        startDateMax: s.string("The startDateMax filter or option.", { format: "date-time" }),
        startDateMin: s.string("The startDateMin filter or option.", { format: "date-time" }),
        tagIds: s.array("The tag ID filter or option.", s.integer("One entry in the list.")),
        tagMatch: s.string("The tagMatch filter or option."),
        umaResolutionStatus: s.string("The umaResolutionStatus filter or option."),
        volumeNumMax: s.number("The volumeNumMax filter or option."),
        volumeNumMin: s.number("The volumeNumMin filter or option."),
      },
      {
        optional: [
          "cursor",
          "ascending",
          "clobTokenIds",
          "closed",
          "conditionIds",
          "cyom",
          "decimalized",
          "endDateMax",
          "endDateMin",
          "gameId",
          "ids",
          "includeTag",
          "limit",
          "liquidityNumMax",
          "liquidityNumMin",
          "locale",
          "order",
          "questionIds",
          "relatedTags",
          "rfqEnabled",
          "slugs",
          "sportsMarketTypes",
          "startDateMax",
          "startDateMin",
          "tagIds",
          "tagMatch",
          "umaResolutionStatus",
          "volumeNumMax",
          "volumeNumMin",
        ],
        allOf: [
          {
            if: { properties: { closed: { const: "any" } }, required: ["closed"] },
            then: {
              anyOf: [
                { required: ["ids"] },
                { required: ["slugs"] },
                { required: ["clobTokenIds"] },
                { required: ["conditionIds"] },
                { required: ["questionIds"] },
              ],
            },
          },
        ],
      },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        markets: s.array(
          "Array of Market objects. Empty array if none found.",
          s.looseObject("One entry in the list."),
        ),
        next_cursor: s.string(
          "Opaque cursor token for fetching the next page. Present only when the number of returned markets equals the effective limit. Omitted on the last page.\n",
        ),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_market_by_slug",
    description: "Read a public market by its URL slug.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read a public market by its URL slug.",
      {
        slug: s.string("The slug filter or option.", { minLength: 1 }),
        includeTag: s.boolean("The includeTag filter or option."),
      },
      { optional: ["includeTag"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        id: s.string("The returned id field."),
        slug: s.nullable(s.string("The returned slug field.")),
        question: s.nullable(s.string("The returned question field.")),
        description: s.nullable(s.string("The returned description field.")),
        conditionId: s.string("The returned conditionId field."),
        clobTokenIds: s.nullable(s.string("The returned clobTokenIds field.")),
        outcomes: s.nullable(s.string("The returned outcomes field.")),
        outcomePrices: s.nullable(s.string("The returned outcomePrices field.")),
        active: s.nullable(s.boolean("The returned active field.")),
        closed: s.nullable(s.boolean("The returned closed field.")),
        events: s.array("The returned events field.", s.looseObject("One entry in the list.")),
        tags: s.array("The returned tags field.", s.looseObject("One entry in the list.")),
        startDate: s.nullable(s.string("The returned startDate field.", { format: "date-time" })),
        endDate: s.nullable(s.string("The returned endDate field.", { format: "date-time" })),
        liquidity: s.nullable(s.string("The returned liquidity field.")),
        volume: s.nullable(s.string("The returned volume field.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_market_tags",
    description: "Read the category tags assigned to a market.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the category tags assigned to a market.",
      {
        marketId: s.integer("The id filter or option."),
      },
      { optional: [] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_midpoint",
    description: "Read the current midpoint between bid and ask for one outcome token.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the current midpoint between bid and ask for one outcome token.",
      {
        tokenId: s.string("Token ID (asset ID)", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        mid_price: s.string("Midpoint price as a string"),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_midpoints",
    description: "Read current midpoint prices for multiple outcome tokens.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read current midpoint prices for multiple outcome tokens.",
      {
        tokens: batchTokens,
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {},
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_price",
    description: "Read the current public BUY or SELL quote for one outcome token.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the current public BUY or SELL quote for one outcome token.",
      {
        side: s.stringEnum("Order side", ["BUY", "SELL"]),
        tokenId: s.string("Token ID (asset ID)", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        price: s.number("Market price as a decimal number"),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_prices",
    description: "Read public BUY or SELL quotes for multiple outcome tokens.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read public BUY or SELL quotes for multiple outcome tokens.",
      {
        tokens: batchTokens,
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {},
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_public_profile",
    description: "Read the public profile associated with a wallet address.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the public profile associated with a wallet address.",
      {
        address: s.string("The wallet address (proxy wallet or user address)", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        bio: s.nullable(s.string("Profile bio")),
        createdAt: s.nullable(s.string("ISO 8601 timestamp of when the profile was created", { format: "date-time" })),
        displayUsernamePublic: s.nullable(s.boolean("Whether the username is displayed publicly")),
        name: s.nullable(s.string("User-chosen display name")),
        profileImage: s.nullable(s.string("URL to the profile image", { format: "uri" })),
        proxyWallet: s.nullable(s.string("The proxy wallet address")),
        pseudonym: s.nullable(s.string("Auto-generated pseudonym")),
        users: s.nullable(s.array("Array of associated user objects", s.looseObject("One entry in the list."))),
        verifiedBadge: s.nullable(s.boolean("Whether the profile has a verified badge")),
        xUsername: s.nullable(s.string("X (Twitter) username")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_reward_markets",
    description: "List markets with currently active liquidity-reward configurations.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List markets with currently active liquidity-reward configurations.",
      {
        cursor: s.string("Pagination cursor from previous response"),
        sponsored: s.boolean("If true, returns sponsored reward configurations instead of standard ones"),
      },
      { optional: ["cursor", "sponsored"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        count: s.integer("Number of items in the current response"),
        data: s.array("The returned data field.", s.looseObject("One entry in the list.")),
        limit: s.integer("Maximum number of items per page"),
        next_cursor: s.string('Cursor for the next page. "LTE=" indicates the last page.'),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "search_polymarket_reward_markets",
    description: "Search public market reward configurations by event, price, spread, volume, and text.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Search public market reward configurations by event, price, spread, volume, and text.",
      {
        eventIds: s.array(
          "Filter by event ID. Can be repeated for multiple events (e.g., ?event_id=100&event_id=200) Supply a list; each value is sent as a repeated query parameter.",
          s.string("One entry in the list.", { minLength: 1 }),
          { minItems: 1 },
        ),
        eventTitle: s.string("Search event titles using case-insensitive pattern matching"),
        maxPrice: s.number("Maximum first token price filter"),
        maxSpread: s.number("Maximum spread filter"),
        maxVolume24hr: s.number("Maximum 24-hour volume filter"),
        minPrice: s.number("Minimum first token price filter"),
        minSpread: s.number("Minimum spread filter"),
        minVolume24hr: s.number("Minimum 24-hour volume filter"),
        cursor: s.string("Pagination cursor from previous response"),
        orderBy: s.stringEnum("Field to sort results by", [
          "market_id",
          "created_at",
          "volume_24hr",
          "spread",
          "competitiveness",
          "max_spread",
          "min_size",
          "question",
          "one_day_price_change",
          "rate_per_day",
          "price",
          "end_date",
          "start_date",
          "reward_end_date",
        ]),
        pageSize: s.integer("Number of items per page (max 500, values above are capped)", {
          maximum: 500,
        }),
        position: s.stringEnum("Sort direction", ["ASC", "DESC"]),
        query: s.string("Text search on market question/description"),
        tagSlugs: s.array(
          "Filter by tag slug. Can be repeated for OR logic (e.g., ?tag_slug=sports&tag_slug=politics) Supply a list; each value is sent as a repeated query parameter.",
          s.string("One entry in the list.", { minLength: 1 }),
          { minItems: 1 },
        ),
      },
      {
        optional: [
          "eventIds",
          "eventTitle",
          "maxPrice",
          "maxSpread",
          "maxVolume24hr",
          "minPrice",
          "minSpread",
          "minVolume24hr",
          "cursor",
          "orderBy",
          "pageSize",
          "position",
          "query",
          "tagSlugs",
        ],
      },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        count: s.integer("Number of items in the current response"),
        data: s.array("The returned data field.", s.looseObject("One entry in the list.")),
        limit: s.integer("Maximum number of items per page"),
        next_cursor: s.string('Cursor for the next page. "LTE=" indicates the last page.'),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_market_rewards",
    description: "Read the public reward configuration for a market condition ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the public reward configuration for a market condition ID.",
      {
        conditionId: s.string("The condition ID of the market", { minLength: 1 }),
        cursor: s.string("Pagination cursor from previous response"),
        sponsored: s.boolean("If true, folds sponsored daily rates into each config's rate_per_day"),
      },
      { optional: ["cursor", "sponsored"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        count: s.integer("Number of items in the current response"),
        data: s.array("The returned data field.", s.looseObject("One entry in the list.")),
        limit: s.integer("Maximum number of items per page"),
        next_cursor: s.string('Cursor for the next page. "LTE=" indicates the last page.'),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_sampling_markets",
    description: "List sampled CLOB markets with descriptive metadata, token summaries, and tags.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List sampled CLOB markets with descriptive metadata, token summaries, and tags.",
      {
        cursor: s.string("The cursor returned by the previous response."),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        count: s.integer("The returned count field."),
        data: s.array("The returned data field.", s.looseObject("One entry in the list.")),
        limit: s.integer("The returned limit field."),
        next_cursor: s.string("The returned next cursor field."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_sampled_market_summaries",
    description: "List sampled CLOB market summaries with rewards and token information.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List sampled CLOB market summaries with rewards and token information.",
      {
        cursor: s.string("The cursor returned by the previous response."),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        count: s.integer("The returned count field."),
        data: s.array("The returned data field.", s.looseObject("One entry in the list.")),
        limit: s.integer("The returned limit field."),
        next_cursor: s.string("The returned next cursor field."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_series",
    description: "Find recurring market series with category, slug, and pagination filters.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Find recurring market series with category, slug, and pagination filters.",
      {
        ascending: s.boolean("The ascending filter or option."),
        categoriesIds: s.array("The categories IDs filter or option.", s.integer("One entry in the list.")),
        categoriesLabels: s.array("The categoriesLabels filter or option.", s.string("One entry in the list.")),
        closed: s.boolean("The closed filter or option."),
        excludeEvents: s.boolean("The excludeEvents filter or option."),
        includeChat: s.boolean("The includeChat filter or option."),
        limit: s.integer("The limit filter or option.", { minimum: 0 }),
        offset: s.integer("The offset filter or option.", { minimum: 0 }),
        order: s.string("Comma-separated list of fields to order by"),
        recurrence: s.string("The recurrence filter or option."),
        slugs: s.array("The slug filter or option.", s.string("One entry in the list.")),
      },
      {
        optional: [
          "ascending",
          "categoriesIds",
          "categoriesLabels",
          "closed",
          "excludeEvents",
          "includeChat",
          "limit",
          "offset",
          "order",
          "recurrence",
          "slugs",
        ],
      },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_series",
    description: "Read a market series and its associated events.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read a market series and its associated events.",
      {
        seriesId: s.integer("The id filter or option."),
        includeChat: s.boolean("The includeChat filter or option."),
      },
      { optional: ["includeChat"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        id: s.string("The returned id field."),
        slug: s.nullable(s.string("The returned slug field.")),
        title: s.nullable(s.string("The returned title field.")),
        description: s.nullable(s.string("The returned description field.")),
        active: s.nullable(s.boolean("The returned active field.")),
        closed: s.nullable(s.boolean("The returned closed field.")),
        events: s.array("The returned events field.", s.looseObject("One entry in the list.")),
        tags: s.array("The returned tags field.", s.looseObject("One entry in the list.")),
        startDate: s.nullable(s.string("The returned startDate field.", { format: "date-time" })),
        liquidity: s.nullable(s.number("The returned liquidity field.")),
        volume: s.nullable(s.number("The returned volume field.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_market_summaries",
    description: "List simplified CLOB markets with token and reward summaries.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List simplified CLOB markets with token and reward summaries.",
      {
        cursor: s.string("The cursor returned by the previous response."),
      },
      { optional: ["cursor"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        count: s.integer("The returned count field."),
        data: s.array("The returned data field.", s.looseObject("One entry in the list.")),
        limit: s.integer("The returned limit field."),
        next_cursor: s.string("The returned next cursor field."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_sports",
    description: "Discover sports metadata and classification identifiers for event research.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Discover sports metadata and classification identifiers for event research.",
      {},
      { optional: [] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_sports_market_types",
    description: "List valid sports-market types for filtering market research.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object("List valid sports-market types for filtering market research.", {}, { optional: [] }),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        marketTypes: s.array("List of all valid sports market types", s.string("One entry in the list.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_spread",
    description: "Read the current bid-ask spread for one outcome token.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the current bid-ask spread for one outcome token.",
      {
        tokenId: s.string("Token ID (asset ID)", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        spread: s.string("Spread as a string"),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_spreads",
    description: "Read current bid-ask spreads for multiple outcome tokens.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read current bid-ask spreads for multiple outcome tokens.",
      {
        tokens: batchTokens,
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {},
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_bridge_assets",
    description: "List publicly supported bridge assets and chains without initiating a transfer.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "List publicly supported bridge assets and chains without initiating a transfer.",
      {},
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        supportedAssets: s.array(
          "List of supported assets with minimum amounts for deposits and withdrawals",
          s.looseObject("One entry in the list."),
        ),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_tags",
    description: "Discover public category tags with pagination.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Discover public category tags with pagination.",
      {
        ascending: s.boolean("The ascending filter or option."),
        includeTemplate: s.boolean("The includeTemplate filter or option."),
        isCarousel: s.boolean("The isCarousel filter or option."),
        limit: s.integer("The limit filter or option.", { minimum: 0 }),
        offset: s.integer("The offset filter or option.", { minimum: 0 }),
        order: s.string("Comma-separated list of fields to order by"),
      },
      { optional: ["ascending", "includeTemplate", "isCarousel", "limit", "offset", "order"] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_tag_by_slug",
    description: "Read a category tag by its URL slug.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read a category tag by its URL slug.",
      {
        slug: s.string("The slug filter or option.", { minLength: 1 }),
        includeTemplate: s.boolean("The includeTemplate filter or option."),
      },
      { optional: ["includeTemplate"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        createdAt: s.nullable(s.string("The returned createdAt field.", { format: "date-time" })),
        createdBy: s.nullable(s.integer("The returned createdBy field.")),
        forceHide: s.nullable(s.boolean("The returned forceHide field.")),
        forceShow: s.nullable(s.boolean("The returned forceShow field.")),
        id: s.string("The returned id field."),
        isCarousel: s.nullable(s.boolean("The returned isCarousel field.")),
        label: s.nullable(s.string("The returned label field.")),
        publishedAt: s.nullable(s.string("The returned publishedAt field.")),
        slug: s.nullable(s.string("The returned slug field.")),
        updatedAt: s.nullable(s.string("The returned updatedAt field.", { format: "date-time" })),
        updatedBy: s.nullable(s.integer("The returned updatedBy field.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_tag_relations_by_slug",
    description: "Read relationships between a tag slug and related tags.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read relationships between a tag slug and related tags.",
      {
        slug: s.string("The slug filter or option.", { minLength: 1 }),
        omitEmpty: s.boolean("The omitEmpty filter or option."),
        status: s.stringEnum("The status filter or option.", ["active", "closed", "all"]),
      },
      { optional: ["omitEmpty", "status"] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_related_tags_by_slug",
    description: "Read tags related to a known tag slug.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read tags related to a known tag slug.",
      {
        slug: s.string("The slug filter or option.", { minLength: 1 }),
        omitEmpty: s.boolean("The omitEmpty filter or option."),
        status: s.stringEnum("The status filter or option.", ["active", "closed", "all"]),
      },
      { optional: ["omitEmpty", "status"] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_tag",
    description: "Read a category tag by its identifier.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read a category tag by its identifier.",
      {
        tagId: s.integer("The id filter or option."),
        includeTemplate: s.boolean("The includeTemplate filter or option."),
      },
      { optional: ["includeTemplate"] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        createdAt: s.nullable(s.string("The returned createdAt field.", { format: "date-time" })),
        createdBy: s.nullable(s.integer("The returned createdBy field.")),
        forceHide: s.nullable(s.boolean("The returned forceHide field.")),
        forceShow: s.nullable(s.boolean("The returned forceShow field.")),
        id: s.string("The returned id field."),
        isCarousel: s.nullable(s.boolean("The returned isCarousel field.")),
        label: s.nullable(s.string("The returned label field.")),
        publishedAt: s.nullable(s.string("The returned publishedAt field.")),
        slug: s.nullable(s.string("The returned slug field.")),
        updatedAt: s.nullable(s.string("The returned updatedAt field.", { format: "date-time" })),
        updatedBy: s.nullable(s.integer("The returned updatedBy field.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_tag_relations",
    description: "Read relationships between a tag ID and related tags.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read relationships between a tag ID and related tags.",
      {
        tagId: s.integer("The id filter or option."),
        omitEmpty: s.boolean("The omitEmpty filter or option."),
        status: s.stringEnum("The status filter or option.", ["active", "closed", "all"]),
      },
      { optional: ["omitEmpty", "status"] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_related_tags",
    description: "Read tags related to a known tag ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read tags related to a known tag ID.",
      {
        tagId: s.integer("The id filter or option."),
        omitEmpty: s.boolean("The omitEmpty filter or option."),
        status: s.stringEnum("The status filter or option.", ["active", "closed", "all"]),
      },
      { optional: ["omitEmpty", "status"] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "list_polymarket_teams",
    description: "Discover sports teams by name, league, or abbreviation.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Discover sports teams by name, league, or abbreviation.",
      {
        abbreviations: s.array("The abbreviation filter or option.", s.string("One entry in the list.")),
        ascending: s.boolean("The ascending filter or option."),
        leagues: s.array("The league filter or option.", s.string("One entry in the list.")),
        limit: s.integer("The limit filter or option.", { minimum: 0 }),
        names: s.array("The name filter or option.", s.string("One entry in the list.")),
        offset: s.integer("The offset filter or option.", { minimum: 0 }),
        order: s.string("Comma-separated list of fields to order by"),
      },
      { optional: ["abbreviations", "ascending", "leagues", "limit", "names", "offset", "order"] },
    ),
    outputSchema: s.array(
      "The upstream public Polymarket data, including additional fields.",
      s.looseObject("One entry in the list."),
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_tick_size",
    description: "Read the minimum price increment for an outcome token.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Read the minimum price increment for an outcome token.",
      {
        tokenId: s.string("Token ID (asset ID)", { minLength: 1 }),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The upstream public Polymarket data, including additional fields.",
      {
        minimum_tick_size: s.number("Minimum tick size (price increment)"),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_polymarket_server_time",
    description: "Read the CLOB server timestamp to interpret time-based market data.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object("Read the CLOB server timestamp to interpret time-based market data.", {}, { optional: [] }),
    outputSchema: s.integer("The upstream public Polymarket data, including additional fields."),
  }),
];

export const polymarketResearchRoutes: Record<string, AisaActionRoute> = {
  quote_polymarket_bridge: {
    method: "POST",
    path: "/apis/v1/polymarket/quote",
    query: {},
    body: {
      fromAmountBaseUnit: "fromAmountBaseUnit",
      fromChainId: "fromChainId",
      fromTokenAddress: "fromTokenAddress",
      recipientAddress: "recipientAddress",
      toChainId: "toChainId",
      toTokenAddress: "toTokenAddress",
    },
  },
  get_polymarket_relayer_transaction: {
    method: "GET",
    path: "/apis/v1/polymarket/transaction",
    query: { transactionId: "id" },
  },
  get_polymarket_nonce: {
    method: "GET",
    path: "/apis/v1/polymarket/nonce",
    query: { address: "address", type: "type" },
  },
  get_polymarket_relay_payload: {
    method: "GET",
    path: "/apis/v1/polymarket/relay-payload",
    query: { address: "address", type: "type" },
  },
  get_polymarket_bridge_status: {
    method: "GET",
    path: "/apis/v1/polymarket/status/{address}",
    pathParams: { address: "address" },
    query: { cursor: "cursor", limit: "limit", paginate: "paginate" },
  },
  get_polymarket_maker_rebates: {
    method: "GET",
    path: "/apis/v1/polymarket/rebates/current",
    query: { makerAddress: "maker_address", date: "date" },
  },
  get_polymarket_wallet_deployment: {
    method: "GET",
    path: "/apis/v1/polymarket/deployed",
    query: { address: "address", type: "type" },
  },
  get_polymarket_batch_price_history: {
    path: "/apis/v1/polymarket/batch-prices-history",
    query: {},
    method: "POST",
    body: {
      endTimestamp: "end_ts",
      fidelity: "fidelity",
      interval: "interval",
      tokenIds: "markets",
      startTimestamp: "start_ts",
    },
  },
  get_polymarket_orderbooks: {
    path: "/apis/v1/polymarket/books",
    query: {},
    method: "POST",
    bodyInput: "tokens",
    snakeCaseBody: true,
  },
  list_polymarket_comments: {
    path: "/apis/v1/polymarket/comments",
    query: {
      ascending: "ascending",
      getPositions: "get_positions",
      holdersOnly: "holders_only",
      limit: "limit",
      offset: "offset",
      order: "order",
      parentEntityId: "parent_entity_id",
      parentEntityType: "parent_entity_type",
    },
  },
  get_polymarket_user_comments: {
    path: "/apis/v1/polymarket/comments/user_address/{user_address}",
    query: {
      ascending: "ascending",
      limit: "limit",
      offset: "offset",
      order: "order",
    },
    pathParams: {
      user_address: "userAddress",
    },
  },
  get_polymarket_comment: {
    path: "/apis/v1/polymarket/comments/{id}",
    query: {
      getPositions: "get_positions",
    },
    pathParams: {
      id: "commentId",
    },
  },
  search_polymarket_events: {
    path: "/apis/v1/polymarket/events/keyset",
    query: {
      cursor: "after_cursor",
      ascending: "ascending",
      closed: "closed",
      createdBy: "created_by",
      cyom: "cyom",
      endDateMax: "end_date_max",
      endDateMin: "end_date_min",
      eventDate: "event_date",
      eventWeek: "event_week",
      excludeTagIds: "exclude_tag_id",
      featured: "featured",
      featuredOrder: "featured_order",
      gameIds: "game_id",
      ids: "id",
      includeBestLines: "include_best_lines",
      includeChat: "include_chat",
      includeChildren: "include_children",
      includeTemplate: "include_template",
      limit: "limit",
      liquidityMax: "liquidity_max",
      liquidityMin: "liquidity_min",
      live: "live",
      locale: "locale",
      order: "order",
      parentEventId: "parent_event_id",
      partnerSlug: "partner_slug",
      recurrence: "recurrence",
      relatedTags: "related_tags",
      seriesIds: "series_id",
      slugs: "slug",
      startDateMax: "start_date_max",
      startDateMin: "start_date_min",
      startTimeMax: "start_time_max",
      startTimeMin: "start_time_min",
      tagIds: "tag_id",
      tagMatch: "tag_match",
      tagSlug: "tag_slug",
      titleSearch: "title_search",
      volumeMax: "volume_max",
      volumeMin: "volume_min",
    },
  },
  get_polymarket_event_by_slug: {
    path: "/apis/v1/polymarket/events/slug/{slug}",
    query: {
      includeChat: "include_chat",
      includeTemplate: "include_template",
    },
    pathParams: {
      slug: "slug",
    },
  },
  get_polymarket_event_tags: {
    path: "/apis/v1/polymarket/events/{id}/tags",
    query: {},
    pathParams: {
      id: "eventId",
    },
  },
  get_polymarket_fee_rate: {
    path: "/apis/v1/polymarket/fee-rate/{token_id}",
    query: {},
    pathParams: {
      token_id: "tokenId",
    },
  },
  get_polymarket_last_trade_price: {
    path: "/apis/v1/polymarket/last-trade-price",
    query: {
      tokenId: "token_id",
    },
  },
  get_polymarket_last_trade_prices: {
    path: "/apis/v1/polymarket/last-trades-prices",
    query: {},
    method: "POST",
    bodyInput: "tokens",
    snakeCaseBody: true,
  },
  get_polymarket_market_by_token: {
    path: "/apis/v1/polymarket/markets-by-token/{token_id}",
    query: {},
    pathParams: {
      token_id: "tokenId",
    },
  },
  search_polymarket_markets: {
    path: "/apis/v1/polymarket/markets/keyset",
    query: {
      cursor: "after_cursor",
      ascending: "ascending",
      clobTokenIds: "clob_token_ids",
      closed: "closed",
      conditionIds: "condition_ids",
      cyom: "cyom",
      decimalized: "decimalized",
      endDateMax: "end_date_max",
      endDateMin: "end_date_min",
      gameId: "game_id",
      ids: "id",
      includeTag: "include_tag",
      limit: "limit",
      liquidityNumMax: "liquidity_num_max",
      liquidityNumMin: "liquidity_num_min",
      locale: "locale",
      order: "order",
      questionIds: "question_ids",
      relatedTags: "related_tags",
      rfqEnabled: "rfq_enabled",
      slugs: "slug",
      sportsMarketTypes: "sports_market_types",
      startDateMax: "start_date_max",
      startDateMin: "start_date_min",
      tagIds: "tag_id",
      tagMatch: "tag_match",
      umaResolutionStatus: "uma_resolution_status",
      volumeNumMax: "volume_num_max",
      volumeNumMin: "volume_num_min",
    },
  },
  get_polymarket_market_by_slug: {
    path: "/apis/v1/polymarket/markets/slug/{slug}",
    query: {
      includeTag: "include_tag",
    },
    pathParams: {
      slug: "slug",
    },
  },
  get_polymarket_market_tags: {
    path: "/apis/v1/polymarket/markets/{id}/tags",
    query: {},
    pathParams: {
      id: "marketId",
    },
  },
  get_polymarket_midpoint: {
    path: "/apis/v1/polymarket/midpoint",
    query: {
      tokenId: "token_id",
    },
  },
  get_polymarket_midpoints: {
    path: "/apis/v1/polymarket/midpoints",
    query: {},
    method: "POST",
    bodyInput: "tokens",
    snakeCaseBody: true,
  },
  get_polymarket_price: {
    path: "/apis/v1/polymarket/price",
    query: {
      side: "side",
      tokenId: "token_id",
    },
  },
  get_polymarket_prices: {
    path: "/apis/v1/polymarket/prices",
    query: {},
    method: "POST",
    bodyInput: "tokens",
    snakeCaseBody: true,
  },
  get_polymarket_public_profile: {
    path: "/apis/v1/polymarket/public-profile",
    query: {
      address: "address",
    },
  },
  list_polymarket_reward_markets: {
    path: "/apis/v1/polymarket/rewards/markets/current",
    query: {
      cursor: "next_cursor",
      sponsored: "sponsored",
    },
  },
  search_polymarket_reward_markets: {
    path: "/apis/v1/polymarket/rewards/markets/multi",
    query: {
      eventIds: "event_id",
      eventTitle: "event_title",
      maxPrice: "max_price",
      maxSpread: "max_spread",
      maxVolume24hr: "max_volume_24hr",
      minPrice: "min_price",
      minSpread: "min_spread",
      minVolume24hr: "min_volume_24hr",
      cursor: "next_cursor",
      orderBy: "order_by",
      pageSize: "page_size",
      position: "position",
      query: "q",
      tagSlugs: "tag_slug",
    },
  },
  get_polymarket_market_rewards: {
    path: "/apis/v1/polymarket/rewards/markets/{condition_id}",
    query: {
      cursor: "next_cursor",
      sponsored: "sponsored",
    },
    pathParams: {
      condition_id: "conditionId",
    },
  },
  list_polymarket_sampling_markets: {
    path: "/apis/v1/polymarket/sampling-markets",
    query: {
      cursor: "next_cursor",
    },
  },
  list_polymarket_sampled_market_summaries: {
    path: "/apis/v1/polymarket/sampling-simplified-markets",
    query: {
      cursor: "next_cursor",
    },
  },
  list_polymarket_series: {
    path: "/apis/v1/polymarket/series",
    query: {
      ascending: "ascending",
      categoriesIds: "categories_ids",
      categoriesLabels: "categories_labels",
      closed: "closed",
      excludeEvents: "exclude_events",
      includeChat: "include_chat",
      limit: "limit",
      offset: "offset",
      order: "order",
      recurrence: "recurrence",
      slugs: "slug",
    },
  },
  get_polymarket_series: {
    path: "/apis/v1/polymarket/series/{id}",
    query: {
      includeChat: "include_chat",
    },
    pathParams: {
      id: "seriesId",
    },
  },
  list_polymarket_market_summaries: {
    path: "/apis/v1/polymarket/simplified-markets",
    query: {
      cursor: "next_cursor",
    },
  },
  list_polymarket_sports: {
    path: "/apis/v1/polymarket/sports",
    query: {},
  },
  list_polymarket_sports_market_types: {
    path: "/apis/v1/polymarket/sports/market-types",
    query: {},
  },
  get_polymarket_spread: {
    path: "/apis/v1/polymarket/spread",
    query: {
      tokenId: "token_id",
    },
  },
  get_polymarket_spreads: {
    path: "/apis/v1/polymarket/spreads",
    query: {},
    method: "POST",
    bodyInput: "tokens",
    snakeCaseBody: true,
  },
  list_polymarket_bridge_assets: {
    path: "/apis/v1/polymarket/supported-assets",
    query: {},
  },
  list_polymarket_tags: {
    path: "/apis/v1/polymarket/tags",
    query: {
      ascending: "ascending",
      includeTemplate: "include_template",
      isCarousel: "is_carousel",
      limit: "limit",
      offset: "offset",
      order: "order",
    },
  },
  get_polymarket_tag_by_slug: {
    path: "/apis/v1/polymarket/tags/slug/{slug}",
    query: {
      includeTemplate: "include_template",
    },
    pathParams: {
      slug: "slug",
    },
  },
  get_polymarket_tag_relations_by_slug: {
    path: "/apis/v1/polymarket/tags/slug/{slug}/related-tags",
    query: {
      omitEmpty: "omit_empty",
      status: "status",
    },
    pathParams: {
      slug: "slug",
    },
  },
  get_polymarket_related_tags_by_slug: {
    path: "/apis/v1/polymarket/tags/slug/{slug}/related-tags/tags",
    query: {
      omitEmpty: "omit_empty",
      status: "status",
    },
    pathParams: {
      slug: "slug",
    },
  },
  get_polymarket_tag: {
    path: "/apis/v1/polymarket/tags/{id}",
    query: {
      includeTemplate: "include_template",
    },
    pathParams: {
      id: "tagId",
    },
  },
  get_polymarket_tag_relations: {
    path: "/apis/v1/polymarket/tags/{id}/related-tags",
    query: {
      omitEmpty: "omit_empty",
      status: "status",
    },
    pathParams: {
      id: "tagId",
    },
  },
  get_polymarket_related_tags: {
    path: "/apis/v1/polymarket/tags/{id}/related-tags/tags",
    query: {
      omitEmpty: "omit_empty",
      status: "status",
    },
    pathParams: {
      id: "tagId",
    },
  },
  list_polymarket_teams: {
    path: "/apis/v1/polymarket/teams",
    query: {
      abbreviations: "abbreviation",
      ascending: "ascending",
      leagues: "league",
      limit: "limit",
      names: "name",
      offset: "offset",
      order: "order",
    },
  },
  get_polymarket_tick_size: {
    path: "/apis/v1/polymarket/tick-size/{token_id}",
    query: {},
    pathParams: {
      token_id: "tokenId",
    },
  },
  get_polymarket_server_time: {
    path: "/apis/v1/polymarket/time",
    query: {},
  },
};
