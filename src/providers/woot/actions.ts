import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "woot";

export const wootFeedNames: readonly string[] = [
  "All",
  "Clearance",
  "Computers",
  "Electronics",
  "Featured",
  "Home",
  "Gourmet",
  "Shirts",
  "Sports",
  "Tools",
  "Wootoff",
];

const priceRangeSchema = s.object("A minimum and maximum price range returned by Woot.", {
  minimum: s.nullableNumber("The minimum price in the range, or null when unavailable."),
  maximum: s.nullableNumber("The maximum price in the range, or null when unavailable."),
});

const photoSchema = s.looseRequiredObject("A normalized Woot offer photo.", {
  url: s.nullableString("The photo URL, or null when unavailable."),
  caption: s.nullableString("The photo caption, or null when unavailable."),
  tags: s.stringArray("The tags assigned to the photo.", { itemDescription: "A Woot photo tag." }),
  height: s.nullableInteger("The image height in pixels, or null when unavailable."),
  width: s.nullableInteger("The image width in pixels, or null when unavailable."),
  raw: s.looseObject("The raw photo object returned by Woot."),
});

const attributeSchema = s.looseRequiredObject("A normalized Woot offer item attribute.", {
  key: s.nullableString("The attribute name, or null when unavailable."),
  value: s.nullableString("The attribute value, or null when unavailable."),
  raw: s.looseObject("The raw attribute object returned by Woot."),
});

const offerItemSchema = s.looseRequiredObject("A normalized purchasable item in a Woot offer.", {
  id: s.nullableString("The Woot item identifier, or null when unavailable."),
  asin: s.nullableString("The Amazon Standard Identification Number, or null when unavailable."),
  title: s.nullableString("The item title, or null when unavailable."),
  win: s.nullableString("The Woot item number, or null when unavailable."),
  listPrice: s.nullableNumber("The item list price, or null when unavailable."),
  salePrice: s.nullableNumber("The item sale price, or null when unavailable."),
  attributes: s.array("The normalized item attributes.", attributeSchema),
  photos: s.array("The normalized item photos.", photoSchema),
  raw: s.looseObject("The raw item object returned by Woot."),
});

const shippingMethodSchema = s.looseRequiredObject("A normalized Woot shipping method.", {
  name: s.nullableString("The shipping method name, or null when unavailable."),
  excludePOBox: s.nullableBoolean("Whether the shipping method excludes post office boxes, or null when unspecified."),
  excludedStates: s.stringArray("The state or territory codes excluded from this method.", {
    itemDescription: "An excluded state or territory code.",
  }),
  excludedPostalCodes: s.stringArray("The postal codes excluded from this method.", {
    itemDescription: "An excluded postal code.",
  }),
  raw: s.looseObject("The raw shipping method object returned by Woot."),
});

const feedItemSchema = s.looseRequiredObject("A normalized deal from a Woot feed.", {
  offerId: s.nullableString("The Woot offer identifier, or null when unavailable."),
  title: s.nullableString("The offer title, or null when unavailable."),
  subtitle: s.nullableString("The offer subtitle, or null when unavailable."),
  condition: s.nullableString("The offer condition, or null when unavailable."),
  categories: s.stringArray("The Woot categories assigned to the offer.", {
    itemDescription: "A Woot category path.",
  }),
  photo: s.nullableString("The primary offer photo URL, or null when unavailable."),
  url: s.nullableString("The public offer URL, or null when unavailable."),
  forumUrl: s.nullableString("The Woot forum URL for the offer, or null when unavailable."),
  startDate: s.nullableString("The offer start date and time, or null when unavailable."),
  endDate: s.nullableString("The offer end date and time, or null when unavailable."),
  listPrice: s.nullable(priceRangeSchema),
  salePrice: s.nullable(priceRangeSchema),
  isSoldOut: s.nullableBoolean("Whether the offer is sold out, or null when unspecified."),
  isWootOff: s.nullableBoolean("Whether the offer is part of a Woot-Off, or null when unspecified."),
  isFeatured: s.nullableBoolean("Whether the offer is featured, or null when unspecified."),
  isFulfilledByAmazon: s.nullableBoolean("Whether Amazon fulfills the offer, or null when unspecified."),
  isAvailableOnMobileAppOnly: s.nullableBoolean(
    "Whether the offer is available only in the Woot mobile app, or null when unspecified.",
  ),
  raw: s.looseObject("The raw feed item object returned by Woot."),
});

const offerSchema = s.looseRequiredObject("A normalized detailed Woot offer.", {
  id: s.nullableString("The Woot offer identifier, or null when unavailable."),
  eventId: s.nullableString("The Woot event identifier, or null when unavailable."),
  title: s.nullableString("The offer title, or null when unavailable."),
  fullTitle: s.nullableString("The full offer title, or null when unavailable."),
  subtitle: s.nullableString("The offer subtitle, or null when unavailable."),
  teaser: s.nullableString("The offer teaser, or null when unavailable."),
  slug: s.nullableString("The offer URL slug, or null when unavailable."),
  url: s.nullableString("The public offer URL, or null when unavailable."),
  win: s.nullableString("The Woot item number, or null when unavailable."),
  features: s.nullableString("The offer features markup or text, or null when unavailable."),
  specs: s.nullableString("The offer specifications markup or text, or null when unavailable."),
  snippet: s.nullableString("The offer snippet, or null when unavailable."),
  writeUpIntro: s.nullableString("The offer write-up introduction, or null when unavailable."),
  writeUpBody: s.nullableString("The offer write-up body, or null when unavailable."),
  extendedWarranty: s.nullableString("The extended warranty information, or null when unavailable."),
  purchaseLimit: s.nullableInteger("The per-customer purchase limit, or null when unavailable."),
  quantityLimit: s.nullableInteger("The available quantity limit, or null when unavailable."),
  percentageRemainingBlurred: s.nullableInteger(
    "The approximate remaining inventory percentage, or null when unavailable.",
  ),
  isSoldOut: s.nullableBoolean("Whether the offer is sold out, or null when unspecified."),
  isWootOff: s.nullableBoolean("Whether the offer is part of a Woot-Off, or null when unspecified."),
  items: s.array("The normalized purchasable items in the offer.", offerItemSchema),
  photos: s.array("The normalized offer photos.", photoSchema),
  shippingMethods: s.array("The normalized shipping methods for the offer.", shippingMethodSchema),
  raw: s.looseObject("The raw detailed offer object returned by Woot."),
});

const offerIdSchema = s.uuid("A Woot offer identifier obtained from a feed response.");

export const wootActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_feed",
    operationType: "read",
    description: "List live, minified Woot offers from a supported category feed, optionally by page.",
    inputSchema: s.object(
      "The input for retrieving live offers from a named Woot feed.",
      {
        feedName: s.stringEnum("The Woot category feed to retrieve.", wootFeedNames),
        page: s.integer("The one-based result page. Woot returns up to 100 offers per page.", {
          minimum: 1,
        }),
      },
      { optional: ["page"] },
    ),
    outputSchema: s.object("A normalized page of live Woot offers.", {
      items: s.array("The normalized offers in the requested feed.", feedItemSchema),
      marketingName: s.nullableString("The feed marketing name, or null when unavailable."),
      totalPages: s.nullableInteger("The total number of result pages, or null when unavailable."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_offers",
    operationType: "read",
    description: "Retrieve detailed Woot offers for up to 25 unique offer IDs.",
    inputSchema: s.object("The input for retrieving multiple detailed Woot offers.", {
      offerIds: s.array("The unique Woot offer identifiers to retrieve.", offerIdSchema, {
        minItems: 1,
        maxItems: 25,
        uniqueItems: true,
      }),
    }),
    outputSchema: s.object("The detailed Woot offers returned for the requested IDs.", {
      offers: s.array("The normalized detailed offers.", offerSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_offer",
    operationType: "read",
    description: "Retrieve all available details for one Woot offer ID.",
    inputSchema: s.object("The input for retrieving one detailed Woot offer.", {
      offerId: offerIdSchema,
    }),
    outputSchema: s.object("The detailed Woot offer returned for the requested ID.", {
      offer: offerSchema,
    }),
  }),
];
