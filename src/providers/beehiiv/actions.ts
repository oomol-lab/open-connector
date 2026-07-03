import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "beehiiv";

const directionSchema = s.stringEnum("Sort direction for the Beehiiv request.", ["asc", "desc"]);

const pagingFields = {
  limit: s.integer("Maximum number of objects to return. Beehiiv documents a range from 1 to 100 and defaults to 10.", {
    minimum: 1,
    maximum: 100,
  }),
  page: s.integer("Offset-based page number for Beehiiv pagination.", {
    minimum: 1,
  }),
};

const publicationExpandSchema = s.array(
  "Publication fields to expand in the Beehiiv response.",
  s.stringEnum("One Beehiiv publication expand value.", [
    "stats",
    "stat_active_subscriptions",
    "stat_active_premium_subscriptions",
    "stat_active_free_subscriptions",
    "stat_average_open_rate",
    "stat_average_click_rate",
    "stat_total_sent",
    "stat_total_unique_opened",
    "stat_total_clicked",
  ]),
);

const listPublicationsInputSchema = s.object(
  "Query parameters for listing Beehiiv publications.",
  {
    expand: publicationExpandSchema,
    limit: pagingFields.limit,
    page: pagingFields.page,
    direction: directionSchema,
    orderBy: s.stringEnum("Field used to sort Beehiiv publications.", ["created", "name"]),
  },
  { optional: ["expand", "limit", "page", "direction", "orderBy"] },
);

const getPublicationInputSchema = s.object(
  "Path and query parameters for fetching a Beehiiv publication.",
  {
    publicationId: s.nonEmptyString("Beehiiv publication ID to retrieve."),
    expand: publicationExpandSchema,
  },
  { optional: ["expand"] },
);

const postExpandSchema = s.array(
  "Post fields to expand in the Beehiiv response. HTML content expansions can make responses large.",
  s.stringEnum("One Beehiiv post expand value.", [
    "stats",
    "free_web_content",
    "free_email_content",
    "free_rss_content",
    "premium_web_content",
    "premium_email_content",
  ]),
);

const postListInputSchema = s.object(
  "Path and query parameters for listing Beehiiv posts.",
  {
    publicationId: s.nonEmptyString("Beehiiv publication ID whose posts should be listed."),
    expand: postExpandSchema,
    audience: s.stringEnum("Audience filter for returned posts.", ["free", "premium", "all"]),
    platform: s.stringEnum("Platform filter for returned posts.", ["web", "email", "both", "all"]),
    status: s.stringEnum("Status filter for returned posts.", ["draft", "confirmed", "archived", "all"]),
    contentTags: s.stringArray("Content tags used to filter returned posts.", {
      itemDescription: "One tag.",
    }),
    slugs: s.stringArray("Post slugs used to filter returned posts.", {
      itemDescription: "One slug.",
    }),
    authors: s.stringArray("Author names used to filter returned posts.", {
      itemDescription: "One author.",
    }),
    premiumTiers: s.stringArray("Premium tier display names used to filter returned posts and expanded content.", {
      itemDescription: "One premium tier display name.",
    }),
    limit: pagingFields.limit,
    page: pagingFields.page,
    orderBy: s.stringEnum("Field used to sort Beehiiv posts.", ["created", "publish_date", "displayed_date"]),
    direction: directionSchema,
    hiddenFromFeed: s.stringEnum("Filter by whether posts are hidden from the feed.", ["all", "true", "false"]),
  },
  {
    optional: [
      "expand",
      "audience",
      "platform",
      "status",
      "contentTags",
      "slugs",
      "authors",
      "premiumTiers",
      "limit",
      "page",
      "orderBy",
      "direction",
      "hiddenFromFeed",
    ],
  },
);

const getPostInputSchema = s.object(
  "Path and query parameters for fetching a Beehiiv post.",
  {
    publicationId: s.nonEmptyString("Beehiiv publication ID that owns the post."),
    postId: s.nonEmptyString("Beehiiv post ID to retrieve."),
    expand: postExpandSchema,
    premiumTiers: s.stringArray("Premium tier display names used to scope expanded post content.", {
      itemDescription: "One premium tier display name.",
    }),
  },
  { optional: ["expand", "premiumTiers"] },
);

const subscriptionExpandSchema = s.array(
  "Subscription fields to expand in the Beehiiv response.",
  s.stringEnum("One Beehiiv subscription expand value.", [
    "stats",
    "custom_fields",
    "referrals",
    "tags",
    "newsletter_lists",
  ]),
);

const listSubscriptionsInputSchema = s.object(
  "Path and query parameters for listing Beehiiv subscriptions.",
  {
    publicationId: s.nonEmptyString("Beehiiv publication ID whose subscriptions should be listed."),
    expand: subscriptionExpandSchema,
    status: s.stringEnum("Status filter for returned subscriptions.", [
      "validating",
      "invalid",
      "pending",
      "active",
      "inactive",
      "all",
    ]),
    tier: s.stringEnum("Tier filter for returned subscriptions.", ["free", "premium", "all"]),
    premiumTiers: s.stringArray("Premium tier names used to filter returned subscriptions.", {
      itemDescription: "One premium tier name.",
    }),
    premiumTierIds: s.stringArray("Premium tier IDs used to filter returned subscriptions.", {
      itemDescription: "One premium tier ID.",
    }),
    limit: pagingFields.limit,
    cursor: s.nonEmptyString("Cursor token for cursor-based pagination."),
    page: pagingFields.page,
    email: s.email("Email address used to find a matching subscription."),
    orderBy: s.stringEnum("Field used to sort Beehiiv subscriptions.", ["created"]),
    direction: directionSchema,
    creationDate: s.stringPattern("^\\d{4}/\\d{2}/\\d{2}$", {
      description: "Creation date filter in YYYY/MM/DD format.",
    }),
  },
  {
    optional: [
      "expand",
      "status",
      "tier",
      "premiumTiers",
      "premiumTierIds",
      "limit",
      "cursor",
      "page",
      "email",
      "orderBy",
      "direction",
      "creationDate",
    ],
  },
);

const getSubscriptionInputSchema = s.object(
  "Path and query parameters for fetching a Beehiiv subscription by ID.",
  {
    publicationId: s.nonEmptyString("Beehiiv publication ID that owns the subscription."),
    subscriptionId: s.nonEmptyString("Beehiiv subscription ID to retrieve."),
    expand: subscriptionExpandSchema,
  },
  { optional: ["expand"] },
);

const publicationStatsSchema = s.looseObject("Beehiiv publication statistics.", {
  active_subscriptions: s.anyOf("Total active free and premium subscriptions.", [
    s.integer("Subscription count."),
    s.boolean("False when Beehiiv did not include this stat."),
  ]),
  active_premium_subscriptions: s.anyOf("Total active premium subscriptions.", [
    s.integer("Subscription count."),
    s.boolean("False when Beehiiv did not include this stat."),
  ]),
  active_free_subscriptions: s.anyOf("Total active free subscriptions.", [
    s.integer("Subscription count."),
    s.boolean("False when Beehiiv did not include this stat."),
  ]),
  average_open_rate: s.anyOf("Historical average open rate.", [
    s.number("Average open rate."),
    s.boolean("False when Beehiiv did not include this stat."),
  ]),
  average_click_rate: s.anyOf("Historical average click-through rate.", [
    s.number("Average click-through rate."),
    s.boolean("False when Beehiiv did not include this stat."),
  ]),
  total_sent: s.anyOf("Total emails sent.", [
    s.integer("Email count."),
    s.boolean("False when Beehiiv did not include this stat."),
  ]),
  total_unique_opened: s.anyOf("Total uniquely opened emails.", [
    s.integer("Open count."),
    s.boolean("False when Beehiiv did not include this stat."),
  ]),
  total_clicked: s.anyOf("Total links clicked from emails.", [
    s.integer("Click count."),
    s.boolean("False when Beehiiv did not include this stat."),
  ]),
});

const publicationSchema = s.looseRequiredObject(
  "Beehiiv publication object.",
  {
    id: s.nonEmptyString("Beehiiv publication ID."),
    name: s.string("Publication name."),
    organization_name: s.string("Organization name."),
    referral_program_enabled: s.boolean("Whether the referral program is enabled."),
    created: s.number("Publication creation time as seconds since the Unix epoch."),
    stats: publicationStatsSchema,
  },
  { optional: ["stats"] },
);

const postContentSchema = s.looseObject("Expanded Beehiiv post HTML content.", {
  free: s.looseObject("Expanded content for free readers.", {
    web: s.string("Web HTML rendered to a free reader."),
    email: s.string("Email HTML rendered to a free reader."),
    rss: s.string("RSS HTML rendered for the post."),
  }),
  premium: s.looseObject("Expanded content for premium readers.", {
    web: s.string("Web HTML rendered to a premium reader."),
    email: s.string("Email HTML rendered to a premium reader."),
  }),
});

const postSchema = s.looseRequiredObject(
  "Beehiiv post object.",
  {
    id: s.nonEmptyString("Beehiiv post ID."),
    title: s.string("Post title."),
    subtitle: s.nullableString("Post subtitle."),
    authors: s.array("Post author names.", s.string("One post author.")),
    created: s.number("Post creation time as seconds since the Unix epoch."),
    status: s.stringEnum("Post status.", ["draft", "confirmed", "archived"]),
    publish_date: s.nullableNumber("Post publish time as seconds since the Unix epoch."),
    displayed_date: s.nullableNumber("Post displayed date as seconds since the Unix epoch."),
    split_tested: s.boolean("Whether the post was split tested."),
    subject_line: s.nullableString("Email subject line for the post."),
    preview_text: s.nullableString("Email preview text for the post."),
    slug: s.nullableString("Post slug."),
    thumbnail_url: s.nullableString("Post thumbnail URL."),
    web_url: s.nullableString("Public web URL for the post."),
    audience: s.stringEnum("Audience that can access the post.", ["free", "premium", "both"]),
    platform: s.stringEnum("Platform where the post is published.", ["web", "email", "both"]),
    content_tags: s.array("Content tags associated with the post.", s.string("One content tag.")),
    content: postContentSchema,
    stats: s.looseObject("Expanded post statistics returned by Beehiiv."),
  },
  { optional: ["content", "stats"] },
);

const subscriptionTierSchema = s.looseObject("Beehiiv subscription premium tier.", {
  id: s.nonEmptyString("Beehiiv tier ID."),
  name: s.string("Tier name."),
  status: s.string("Tier status."),
});

const subscriptionStatsSchema = s.looseObject("Beehiiv subscription statistics.", {
  emails_received: s.integer("Total emails sent to the subscriber."),
  open_rate: s.number("Subscriber open rate."),
  click_through_rate: s.number("Subscriber click-through rate."),
});

const customFieldSchema = s.looseObject("Beehiiv subscription custom field.", {
  name: s.string("Custom field name."),
  kind: s.string("Custom field value type."),
  value: s.unknown("Custom field value returned by Beehiiv."),
});

const subscriptionSchema = s.looseRequiredObject(
  "Beehiiv subscription object.",
  {
    id: s.nonEmptyString("Beehiiv subscription ID."),
    email: s.email("Subscriber email address."),
    status: s.string("Beehiiv subscription status."),
    created: s.integer("Subscription creation time as seconds since the Unix epoch."),
    subscription_tier: s.string("Current subscription tier."),
    subscription_premium_tiers: s.array("Premium tiers associated with the subscription.", subscriptionTierSchema),
    utm_source: s.nullableString("Subscription UTM source."),
    utm_medium: s.nullableString("Subscription UTM medium."),
    utm_channel: s.nullableString("Subscription UTM channel."),
    utm_campaign: s.nullableString("Subscription UTM campaign."),
    referring_site: s.nullableString("Referring site captured for the subscription."),
    referral_code: s.nullableString("Referral code assigned to the subscription."),
    stripe_customer_id: s.nullableString("Stripe customer ID associated with the subscription."),
    stats: subscriptionStatsSchema,
    custom_fields: s.array("Custom fields set on the subscription.", customFieldSchema),
    referrals: s.array(
      "Subscriptions referred by this subscription.",
      s.looseObject("Limited referral subscription object.", {
        id: s.nonEmptyString("Referred subscription ID."),
        email: s.email("Referred subscriber email address."),
        status: s.string("Referred subscription status."),
      }),
    ),
    tags: s.array("Tags set on the subscription.", s.string("One subscription tag.")),
    newsletter_lists: s.array(
      "Newsletter list IDs the subscription is actively subscribed to.",
      s.string("One newsletter list ID."),
    ),
  },
  {
    optional: [
      "subscription_premium_tiers",
      "utm_source",
      "utm_medium",
      "utm_channel",
      "utm_campaign",
      "referring_site",
      "referral_code",
      "stripe_customer_id",
      "stats",
      "custom_fields",
      "referrals",
      "tags",
      "newsletter_lists",
    ],
  },
);

const paginationSchema = {
  limit: s.integer("Number of objects requested per page."),
  page: s.integer("Current offset pagination page."),
  total_results: s.integer("Total number of matching objects."),
  total_pages: s.integer("Total number of offset pagination pages."),
};

const cursorPaginationSchema = {
  limit: s.integer("Number of objects requested per page."),
  page: s.integer("Current offset pagination page when returned by Beehiiv."),
  total_results: s.integer("Total number of matching objects when returned by Beehiiv."),
  total_pages: s.integer("Total number of offset pagination pages when returned by Beehiiv."),
  next_cursor: s.nullableString("Cursor token for the next page of results."),
};

export const beehiivActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_publications",
    description: "List Beehiiv publications associated with the API key, with optional sorting and expansion.",
    inputSchema: listPublicationsInputSchema,
    outputSchema: s.looseRequiredObject("Paginated Beehiiv publications response.", {
      data: s.array("Publications returned by Beehiiv.", publicationSchema),
      ...paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_publication",
    description: "Fetch one Beehiiv publication by ID with optional statistics expansion.",
    inputSchema: getPublicationInputSchema,
    outputSchema: s.looseRequiredObject("Beehiiv publication response.", {
      data: publicationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_posts",
    description: "List Beehiiv posts for a publication with documented filters and optional expansions.",
    inputSchema: postListInputSchema,
    outputSchema: s.looseRequiredObject("Paginated Beehiiv posts response.", {
      data: s.array("Posts returned by Beehiiv.", postSchema),
      ...paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_post",
    description: "Fetch one Beehiiv post by ID with optional statistics or content expansion.",
    inputSchema: getPostInputSchema,
    outputSchema: s.looseRequiredObject("Beehiiv post response.", {
      data: postSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_subscriptions",
    description: "List Beehiiv subscriptions for a publication with cursor pagination and documented filters.",
    inputSchema: listSubscriptionsInputSchema,
    outputSchema: s.looseRequiredObject("Paginated Beehiiv subscriptions response.", {
      data: s.array("Subscriptions returned by Beehiiv.", subscriptionSchema),
      ...cursorPaginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_subscription",
    description: "Fetch one Beehiiv subscription by ID with optional expansions.",
    inputSchema: getSubscriptionInputSchema,
    outputSchema: s.looseRequiredObject("Beehiiv subscription response.", {
      data: subscriptionSchema,
    }),
  }),
];

export type BeehiivActionName = (typeof beehiivActions)[number]["name"];
