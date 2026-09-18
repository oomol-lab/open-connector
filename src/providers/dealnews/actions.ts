import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dealnews";
const usageNotice =
  "Keep the returned content and referral-coded links unchanged, attribute public displays to DealNews, and do not use the feed in a publicly available browser extension.";

const imageSchema = s.looseObject("An image from the DealNews RSS feed.", {
  url: s.string("The original image URL from the feed."),
  title: s.string("The original image title from the feed."),
  link: s.string("The original image link from the feed."),
  height: s.string("The original image height value from the feed."),
  width: s.string("The original image width value from the feed."),
  description: s.string("The original image description from the feed."),
});

const priceSchema = s.looseObject("The original DealNews price element.", {
  value: s.string("The original price value from the feed."),
  currency: s.string("The original price currency from the feed."),
});

const mediaSchema = s.looseObject("The original DealNews media element.", {
  url: s.string("The original media URL from the feed."),
  medium: s.string("The original media type from the feed."),
  height: s.string("The original media height value from the feed."),
  width: s.string("The original media width value from the feed."),
});

const feedSchema = s.looseObject("The DealNews RSS channel metadata.", {
  title: s.string("The original RSS channel title."),
  link: s.string("The original RSS channel link."),
  description: s.string("The original RSS channel description."),
  language: s.string("The original RSS channel language."),
  copyright: s.string("The original RSS channel copyright notice."),
  pubDate: s.string("The original RSS channel publication date."),
  image: imageSchema,
});

const itemSchema = s.looseObject("A DealNews RSS item with original content and referral-coded links preserved.", {
  title: s.string("The original item title."),
  link: s.string("The original DealNews link, including its referral code."),
  description: s.string("The original HTML description from the RSS item."),
  guid: s.string("The original RSS item GUID."),
  pubDate: s.string("The original RSS item publication date."),
  "dealnews:retailer": s.string("The original DealNews retailer value."),
  "dealnews:expires": s.string("The original DealNews expiration value."),
  "dealnews:dealType": s.string("The original DealNews deal type."),
  "dealnews:category": s.string("The original DealNews category value."),
  "dealnews:staffPick": s.string("The original DealNews staff-pick value."),
  "dealnews:price": priceSchema,
  "media:content": mediaSchema,
});

const outputSchema = s.actionOutput(
  {
    attribution: s.string("The attribution required when displaying this content publicly."),
    feedUrl: s.string("The official DealNews RSS URL that was requested."),
    feed: feedSchema,
    items: s.array("The original RSS items parsed into JSON objects.", itemSchema),
    count: s.integer("The number of RSS items returned."),
  },
  "A structured DealNews RSS feed response.",
);

const emptyInputSchema = s.actionInput({}, [], "No input is required for this DealNews feed.");

export const dealNewsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_latest_deals",
    operationType: "read",
    description: `Get the most recent deals from the official DealNews RSS feed. ${usageNotice}`,
    inputSchema: emptyInputSchema,
    outputSchema,
  }),
  defineProviderAction(service, {
    name: "list_popular_deals",
    operationType: "read",
    description: `Get the most popular deals from the official DealNews RSS feed. ${usageNotice}`,
    inputSchema: emptyInputSchema,
    outputSchema,
  }),
  defineProviderAction(service, {
    name: "list_editors_choice_deals",
    operationType: "read",
    description: `Get Editors' Choice deals from the official DealNews RSS feed. ${usageNotice}`,
    inputSchema: emptyInputSchema,
    outputSchema,
  }),
  defineProviderAction(service, {
    name: "list_blog_posts",
    operationType: "read",
    description: `Get blog posts from the official DealNews RSS feed. ${usageNotice}`,
    inputSchema: emptyInputSchema,
    outputSchema,
  }),
  defineProviderAction(service, {
    name: "list_category_deals",
    operationType: "read",
    description: `Get deals from an official DealNews category RSS feed. ${usageNotice}`,
    inputSchema: s.actionInput(
      {
        categoryId: s.positiveInteger(
          "The numeric category ID in a DealNews category URL, such as 142 in /c142/Electronics/.",
        ),
      },
      ["categoryId"],
      "The DealNews category feed to retrieve.",
    ),
    outputSchema,
  }),
];
