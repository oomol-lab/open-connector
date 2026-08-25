import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "partner_stack_partner";

const rawObjectSchema = s.looseObject("The raw PartnerStack Partner API object.");

const cursorPaginationProperties: Record<string, JsonSchema> = {
  limit: s.integer("The number of items to request. PartnerStack allows 1 to 250.", {
    minimum: 1,
    maximum: 250,
  }),
  starting_after: s.string("A cursor item key used to return the following page of list results.", { minLength: 1 }),
  ending_before: s.string("A cursor item key used to return the previous page of list results.", {
    minLength: 1,
  }),
};

const pageSchema = s.object("PartnerStack cursor pagination metadata.", {
  has_more: s.boolean("Whether more items are available after this result page."),
});

const responseMetadataSchema: Record<string, JsonSchema> = {
  message: s.string("The PartnerStack response message."),
  status: s.integer("The PartnerStack response status code."),
};

const marketplaceProgramSchema = s.looseRequiredObject(
  "A PartnerStack marketplace program.",
  {
    id: s.integer("The numeric PartnerStack program identifier."),
    key: s.string("The PartnerStack company or program key."),
    name: s.string("The marketplace program name."),
    website: s.nullableString("The marketplace program website URL."),
    category: s.nullable(
      s.array("The marketplace categories assigned to the program.", s.string("One marketplace category.")),
    ),
    country: s.nullableString("The origin country of the marketplace program."),
    description: s.nullableString("The marketplace program description."),
    created_at: s.integer("The program creation time as an epoch millisecond timestamp."),
    has_sub_id: s.boolean("Whether the program uses sub IDs."),
    logo: s.nullableString("The PartnerStack file key for the program logo."),
    raw: rawObjectSchema,
  },
  {
    optional: ["id", "website", "category", "country", "description", "created_at", "has_sub_id", "logo"],
  },
);

const companySchema = s.looseRequiredObject(
  "A PartnerStack company summary.",
  {
    id: s.integer("The numeric PartnerStack company identifier."),
    key: s.string("The PartnerStack company key."),
    name: s.string("The company name."),
  },
  { optional: ["id", "key", "name"] },
);

const partnershipSchema = s.looseRequiredObject(
  "A PartnerStack partnership.",
  {
    key: s.string("The PartnerStack partnership key."),
    created_at: s.integer("The partnership creation time as an epoch millisecond timestamp."),
    updated_at: s.integer("The partnership update time as an epoch millisecond timestamp."),
    claimed: s.boolean("Whether the partnership has been claimed."),
    company: companySchema,
    has_sub_id: s.nullableBoolean("Whether the program uses sub IDs."),
    raw: rawObjectSchema,
  },
  { optional: ["created_at", "updated_at", "claimed", "company", "has_sub_id"] },
);

const rewardSchema = s.looseRequiredObject(
  "A PartnerStack reward.",
  {
    key: s.string("The PartnerStack reward key."),
    created_at: s.integer("The reward creation time as an epoch millisecond timestamp."),
    updated_at: s.integer("The reward update time as an epoch millisecond timestamp."),
    amount: s.nullableInteger("The reward amount in cents when returned by PartnerStack."),
    amount_usd: s.nullableInteger("The reward amount converted to USD cents."),
    currency: s.nullableString("The reward currency code."),
    status: s.nullableString("The reward lifecycle status."),
    payment_status: s.nullableString("The reward payment status."),
    description: s.nullableString("The reward description."),
    raw: rawObjectSchema,
  },
  {
    optional: [
      "created_at",
      "updated_at",
      "amount",
      "amount_usd",
      "currency",
      "status",
      "payment_status",
      "description",
    ],
  },
);

const payoutProviderSchema = s.looseRequiredObject(
  "The PartnerStack payout payment provider details.",
  {
    key: s.string("The PartnerStack payment provider key."),
    external_key: s.string("The external key assigned by the payment provider."),
    meta: rawObjectSchema,
  },
  { optional: ["key", "external_key", "meta"] },
);

const payoutSchema = s.looseRequiredObject(
  "A PartnerStack payout.",
  {
    key: s.string("The PartnerStack payout key."),
    created_at: s.integer("The payout creation time as an epoch millisecond timestamp."),
    updated_at: s.integer("The payout update time as an epoch millisecond timestamp."),
    amount: s.nullableInteger("The payout amount in cents."),
    amount_usd: s.nullableInteger("The payout amount converted to USD cents."),
    currency: s.nullableString("The payout currency code."),
    status: s.nullableString("The payout lifecycle status."),
    provider: payoutProviderSchema,
    raw: rawObjectSchema,
  },
  {
    optional: ["created_at", "updated_at", "amount", "amount_usd", "currency", "status", "provider"],
  },
);

const listMarketplaceProgramsInputSchema = s.object(
  "Filters and pagination controls for listing PartnerStack marketplace programs.",
  {
    min_created: s.integer("Only return programs created at or after this epoch millisecond timestamp."),
    max_created: s.integer("Only return programs created at or before this epoch millisecond timestamp."),
    category: s.string("Only return programs in this marketplace category.", { minLength: 1 }),
    ...cursorPaginationProperties,
  },
  {
    optional: ["min_created", "max_created", "category", "limit", "starting_after", "ending_before"],
  },
);

const listMarketplaceProgramsOutputSchema = s.object(
  "A paginated PartnerStack marketplace program list.",
  {
    programs: s.array("The marketplace programs returned for this page.", marketplaceProgramSchema),
    page: pageSchema,
    ...responseMetadataSchema,
  },
  { optional: ["message", "status"] },
);

const getMarketplaceProgramInputSchema = s.object("The marketplace program lookup input.", {
  company_key: s.nonEmptyString("The PartnerStack company key of the marketplace program."),
});

const getMarketplaceProgramOutputSchema = s.object(
  "A PartnerStack marketplace program result.",
  {
    program: marketplaceProgramSchema,
    ...responseMetadataSchema,
  },
  { optional: ["message", "status"] },
);

const partnershipOrderBySchema = s.stringEnum("The partnership ordering expression.", [
  "-created_at",
  "created_at",
  "-updated_at",
  "updated_at",
]);

const hasSubIdSchema = s.stringEnum("Whether the program uses sub IDs.", ["true", "false", "null"]);

const listPartnershipsInputSchema = s.object(
  "Filters and pagination controls for listing PartnerStack partnerships.",
  {
    order_by: partnershipOrderBySchema,
    has_sub_id: hasSubIdSchema,
    include_offers: s.boolean("Whether to include offers in each partnership response."),
    include_archived: s.boolean("Whether to include archived partnerships."),
    ...cursorPaginationProperties,
  },
  {
    optional: [
      "order_by",
      "has_sub_id",
      "include_offers",
      "include_archived",
      "limit",
      "starting_after",
      "ending_before",
    ],
  },
);

const listPartnershipsOutputSchema = s.object(
  "A paginated PartnerStack partnership list.",
  {
    partnerships: s.array("The partnerships returned for this page.", partnershipSchema),
    page: pageSchema,
    ...responseMetadataSchema,
  },
  { optional: ["message", "status"] },
);

const rewardPaymentStatusSchema = s.stringEnum("The reward payment status.", [
  "in_transit",
  "withdrawn",
  "available",
  "paid_externally",
  "expired",
  "failed",
  "merging",
]);

const rewardOrderBySchema = s.stringEnum("The reward ordering expression.", [
  "-created_at",
  "created_at",
  "-amount",
  "amount",
  "-ready_at",
  "ready_at",
]);

const listRewardsInputSchema = s.object(
  "Filters and pagination controls for listing PartnerStack rewards.",
  {
    company_key: s.string("Only return rewards for this PartnerStack company key.", {
      minLength: 1,
    }),
    payment_status: rewardPaymentStatusSchema,
    max_created: s.integer("Only return rewards created at or before this epoch millisecond timestamp."),
    min_created: s.integer("Only return rewards created at or after this epoch millisecond timestamp."),
    order_by: rewardOrderBySchema,
    group_key: s.string("Only return rewards for this PartnerStack group key.", { minLength: 1 }),
    customer_key: s.string("Only return rewards for this PartnerStack customer key.", {
      minLength: 1,
    }),
    invoice_key: s.string("Only return rewards for this PartnerStack invoice key.", {
      minLength: 1,
    }),
    status: s.string("Only return rewards with this reward status.", { minLength: 1 }),
    exclude_drip_rewards: s.stringEnum("Whether drip rewards should be excluded.", ["true", "false"]),
    hide_archived_rewards: s.boolean("Whether archived rewards should be hidden."),
    empty_line_id: s.boolean("Whether returned drip rewards must have an empty line ID."),
    keywords: s.string("Free-text keywords used by PartnerStack to filter rewards.", {
      minLength: 1,
    }),
    description: s.string("Only return rewards whose description contains this text.", {
      minLength: 1,
    }),
    distinct_description: s.boolean("Whether reward descriptions should be distinct."),
    distinct_decline_reason: s.boolean("Whether reward decline reasons should be distinct."),
    ...cursorPaginationProperties,
  },
  {
    optional: [
      "company_key",
      "payment_status",
      "max_created",
      "min_created",
      "order_by",
      "group_key",
      "customer_key",
      "invoice_key",
      "status",
      "exclude_drip_rewards",
      "hide_archived_rewards",
      "empty_line_id",
      "keywords",
      "description",
      "distinct_description",
      "distinct_decline_reason",
      "limit",
      "starting_after",
      "ending_before",
    ],
  },
);

const listRewardsOutputSchema = s.object(
  "A paginated PartnerStack reward list.",
  {
    rewards: s.array("The rewards returned for this page.", rewardSchema),
    page: pageSchema,
    ...responseMetadataSchema,
  },
  { optional: ["message", "status"] },
);

const payoutOrderBySchema = s.stringEnum("The payout ordering expression.", ["-created_at", "created_at"]);

const listPayoutsInputSchema = s.object(
  "Filters and pagination controls for listing PartnerStack payouts.",
  {
    min_created: s.integer("Only return payouts created at or after this epoch millisecond timestamp."),
    max_created: s.integer("Only return payouts created at or before this epoch millisecond timestamp."),
    order_by: payoutOrderBySchema,
    ...cursorPaginationProperties,
  },
  {
    optional: ["min_created", "max_created", "order_by", "limit", "starting_after", "ending_before"],
  },
);

const listPayoutsOutputSchema = s.object(
  "A paginated PartnerStack payout list.",
  {
    payouts: s.array("The payouts returned for this page.", payoutSchema),
    page: pageSchema,
    ...responseMetadataSchema,
  },
  { optional: ["message", "status"] },
);

export const partnerStackPartnerActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_marketplace_programs",
    description: "List active marketplace programs available through the PartnerStack Partner API.",
    requiredScopes: [],
    inputSchema: listMarketplaceProgramsInputSchema,
    outputSchema: listMarketplaceProgramsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_marketplace_program",
    description: "Retrieve one marketplace program by company key through the PartnerStack Partner API.",
    requiredScopes: [],
    inputSchema: getMarketplaceProgramInputSchema,
    outputSchema: getMarketplaceProgramOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_partnerships",
    description: "List partnerships managed by or owned by the connected PartnerStack partner account.",
    requiredScopes: [],
    inputSchema: listPartnershipsInputSchema,
    outputSchema: listPartnershipsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_rewards",
    description: "List rewards for the connected PartnerStack partner account.",
    requiredScopes: [],
    inputSchema: listRewardsInputSchema,
    outputSchema: listRewardsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_payouts",
    description: "List payouts for the connected PartnerStack partner account.",
    requiredScopes: [],
    inputSchema: listPayoutsInputSchema,
    outputSchema: listPayoutsOutputSchema,
  }),
];
