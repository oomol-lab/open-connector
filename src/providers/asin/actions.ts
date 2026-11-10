import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "asin";
const asinSearchResultSchema = s.looseObject(
  "One search result returned by Asin.",
  {
    asin: s.nullableString("The ASIN of the product."),
    title: s.nullableString("Product title."),
    image: s.nullableString("URL of the main product image."),
    price: s.nullableNumber("Price shown in the results."),
    currency: s.nullableString("ISO 4217 code of the marketplace currency."),
    rating: s.nullableNumber("Average rating out of 5."),
    reviews_count: s.nullableNumber("Number of reviews."),
  },
  { optional: ["asin", "title", "image", "price", "currency", "rating", "reviews_count"] },
);

const asinOfferSchema = s.looseObject(
  "One offer returned by Asin.",
  {
    seller: s.nullableString("Name of the seller."),
    seller_id: s.nullableString("Amazon's ID of the seller."),
    price: s.nullableNumber("Price of the offer in the marketplace currency."),
    amazon: s.nullableBoolean("Whether Amazon itself sells the offer."),
    fulfilled_by_amazon: s.nullableBoolean("Whether Amazon ships the offer."),
    used: s.nullableBoolean("Whether the offer is used or renewed."),
    delivery_time: s.nullableString("Delivery date, as Amazon shows it."),
    delivery_price: s.nullableString("Delivery cost, as Amazon shows it."),
  },
  {
    optional: [
      "seller",
      "seller_id",
      "price",
      "amazon",
      "fulfilled_by_amazon",
      "used",
      "delivery_time",
      "delivery_price",
    ],
  },
);

const asinPricePointSchema = s.looseObject(
  "One price point returned by Asin.",
  {
    price: s.nullableNumber("Price of the offer shown; null when there was no offer."),
    in_stock: s.nullableBoolean("Whether the product was in stock."),
    coupon: s.nullableString("Coupon shown, if any."),
    seller: s.nullableString("Seller of the offer shown (Buy Box)."),
    checked_at: s.nullableString("When Amazon was read."),
  },
  { optional: ["price", "in_stock", "coupon", "seller", "checked_at"] },
);

export const asinActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_products",
    operationType: "read",
    description:
      "Search an Amazon store and get up to 60 results, sponsored ones included, with ASIN, title, price, rating and review count.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search terms (e.g., "wireless earbuds").'),
        marketplace: s.stringEnum(
          'Amazon store: com, co.uk, de, fr, it, es, ca, co.jp, com.br, com.mx or in (defaults to "com").',
          ["com", "co.uk", "de", "fr", "it", "es", "ca", "co.jp", "com.br", "com.mx", "in"],
        ),
      },
      ["query"],
      "Input for Search Products.",
    ),
    outputSchema: s.looseObject(
      "The Asin response for Search Products.",
      {
        results: s.array("Products found on Amazon.", asinSearchResultSchema),
      },
      { optional: ["results"] },
    ),
  }),
  defineProviderAction(service, {
    name: "read_offers",
    operationType: "read",
    description:
      "Read every offer for an ASIN from Amazon now (uses a credit): seller, price, whether Amazon ships it (FBA), delivery, with Amazon's own price and the lowest new and used offers.",
    inputSchema: s.actionInput(
      {
        asin: s.nonEmptyString('The 10-character ASIN of the product (e.g., "B09DFCB66S").'),
        marketplace: s.stringEnum(
          'Amazon store: com, co.uk, de, fr, it, es, ca, co.jp, com.br, com.mx or in (defaults to "com").',
          ["com", "co.uk", "de", "fr", "it", "es", "ca", "co.jp", "com.br", "com.mx", "in"],
        ),
      },
      ["asin"],
      "Input for Read Offers.",
    ),
    outputSchema: s.looseObject(
      "The Asin response for Read Offers.",
      {
        asin: s.nullableString("The ASIN of the product."),
        marketplace: s.nullableString("Amazon store the offers come from."),
        currency: s.nullableString("ISO 4217 code of the marketplace currency."),
        fetched_at: s.nullableString("When Amazon was read; null when the product was never read."),
        charged: s.nullableBoolean("Whether the request used a credit."),
        amazon_price: s.nullableNumber("Amazon's own price, when Amazon sells the product."),
        lowest_new_price: s.nullableNumber("Lowest price among offers that are not used."),
        lowest_used_price: s.nullableNumber("Lowest used or renewed price."),
        offers: s.array("Offers for the product, cheapest first.", asinOfferSchema),
      },
      {
        optional: [
          "asin",
          "marketplace",
          "currency",
          "fetched_at",
          "charged",
          "amazon_price",
          "lowest_new_price",
          "lowest_used_price",
          "offers",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_offers",
    operationType: "read",
    description:
      "Get the offers last read for an ASIN, cheapest first, with Amazon's own price and the lowest new and used offers, without reading Amazon again.",
    inputSchema: s.actionInput(
      {
        asin: s.nonEmptyString('The 10-character ASIN of the product (e.g., "B09DFCB66S").'),
        marketplace: s.stringEnum(
          'Amazon store: com, co.uk, de, fr, it, es, ca, co.jp, com.br, com.mx or in (defaults to "com").',
          ["com", "co.uk", "de", "fr", "it", "es", "ca", "co.jp", "com.br", "com.mx", "in"],
        ),
      },
      ["asin"],
      "Input for Get Last Known Offers.",
    ),
    outputSchema: s.looseObject(
      "The Asin response for Get Last Known Offers.",
      {
        asin: s.nullableString("The ASIN of the product."),
        marketplace: s.nullableString("Amazon store the offers come from."),
        currency: s.nullableString("ISO 4217 code of the marketplace currency."),
        fetched_at: s.nullableString("When Amazon was read; null when the product was never read."),
        charged: s.nullableBoolean("Whether the request used a credit."),
        amazon_price: s.nullableNumber("Amazon's own price, when Amazon sells the product."),
        lowest_new_price: s.nullableNumber("Lowest price among offers that are not used."),
        lowest_used_price: s.nullableNumber("Lowest used or renewed price."),
        offers: s.array("Offers for the product, cheapest first.", asinOfferSchema),
      },
      {
        optional: [
          "asin",
          "marketplace",
          "currency",
          "fetched_at",
          "charged",
          "amazon_price",
          "lowest_new_price",
          "lowest_used_price",
          "offers",
        ],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_price_history",
    operationType: "read",
    description:
      "Get every price read for an ASIN over a period, oldest first, with its lowest, highest and average price.",
    inputSchema: s.actionInput(
      {
        asin: s.nonEmptyString('The 10-character ASIN of the product (e.g., "B09DFCB66S").'),
        marketplace: s.stringEnum(
          'Amazon store: com, co.uk, de, fr, it, es, ca, co.jp, com.br, com.mx or in (defaults to "com").',
          ["com", "co.uk", "de", "fr", "it", "es", "ca", "co.jp", "com.br", "com.mx", "in"],
        ),
        days: s.integer("Days of history to return (defaults to 30).", { minimum: 1 }),
      },
      ["asin"],
      "Input for Get Price History.",
    ),
    outputSchema: s.looseObject(
      "The Asin response for Get Price History.",
      {
        asin: s.nullableString("The ASIN of the product."),
        marketplace: s.nullableString("Amazon store the prices come from."),
        currency: s.nullableString("ISO 4217 code of the marketplace currency."),
        lowest_price: s.nullableNumber("Lowest price of the period."),
        highest_price: s.nullableNumber("Highest price of the period."),
        average_price: s.nullableNumber("Average price of the period."),
        history: s.array("Prices read over the period, oldest first.", asinPricePointSchema),
      },
      { optional: ["asin", "marketplace", "currency", "lowest_price", "highest_price", "average_price", "history"] },
    ),
  }),
];
