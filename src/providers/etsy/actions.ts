import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import {
  self,
  shop,
  sectionPage,
  listingPage,
  listing,
  inventory,
  receiptPage,
  receipt,
  transactionPage,
} from "./schemas.ts";

export const etsyActions: ProviderActionDefinition[] = [
  defineProviderAction("etsy", {
    name: "get_me",
    description: "Get the connected Etsy user ID and shop ID.",
    operationType: "read",
    requiredScopes: ["shops_r"],
    inputSchema: s.object("Lookup parameters.", {}, { required: [] }),
    outputSchema: self,
  }),
  defineProviderAction("etsy", {
    name: "get_shop",
    description: "Get an Etsy shop's public details.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Lookup parameters.",
      {
        shop_id: s.integer("The unique positive non-zero numeric ID for an Etsy Shop.", {
          minimum: 1,
        }),
      },
      { required: ["shop_id"] },
    ),
    outputSchema: shop,
  }),
  defineProviderAction("etsy", {
    name: "get_shop_by_owner",
    description: "Get an Etsy shop by its owner's user ID.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Lookup parameters.",
      {
        user_id: s.integer("The numeric user ID of the [user](/documentation/reference#tag/User) who owns this shop.", {
          minimum: 1,
        }),
      },
      { required: ["user_id"] },
    ),
    outputSchema: shop,
  }),
  defineProviderAction("etsy", {
    name: "list_shop_sections",
    description: "List the sections of an Etsy shop.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Lookup parameters.",
      {
        shop_id: s.integer("The unique positive non-zero numeric ID for an Etsy Shop.", {
          minimum: 1,
        }),
      },
      { required: ["shop_id"] },
    ),
    outputSchema: sectionPage,
  }),
  defineProviderAction("etsy", {
    name: "list_shop_listings",
    description: "List an Etsy shop's listings by state with limit/offset pagination.",
    operationType: "read",
    requiredScopes: ["listings_r"],
    inputSchema: s.object(
      "Lookup parameters.",
      {
        shop_id: s.integer("The unique positive non-zero numeric ID for an Etsy Shop.", {
          minimum: 1,
        }),
        state: s.stringEnum("The listing state to retrieve. Defaults to active.", [
          "active",
          "inactive",
          "sold_out",
          "draft",
          "removed",
          "expired",
        ]),
        limit: s.integer("The maximum number of results to return.", { minimum: 1, maximum: 100 }),
        offset: s.integer("The number of records to skip before selecting the first result.", {
          minimum: 0,
        }),
        sort_on: s.stringEnum("The field to sort by. Defaults to created.", ["created", "price", "updated", "score"]),
        sort_order: s.stringEnum("The sort direction. Defaults to desc.", [
          "asc",
          "ascending",
          "desc",
          "descending",
          "up",
          "down",
        ]),
        includes: s.array(
          "The associations to include in the response.",
          s.stringEnum("An association to include.", [
            "Shipping",
            "Images",
            "Shop",
            "User",
            "Translations",
            "Inventory",
            "Videos",
            "Personalization",
            "BuyerPrice",
          ]),
        ),
      },
      { required: ["shop_id"] },
    ),
    outputSchema: listingPage,
  }),
  defineProviderAction("etsy", {
    name: "get_listing",
    description: "Get an Etsy listing with optional associations and translation.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Lookup parameters.",
      {
        listing_id: s.integer(
          "The numeric ID for the [listing](/documentation/reference#tag/ShopListing) associated to this transaction.",
          { minimum: 1 },
        ),
        includes: s.array(
          "The associations to include in the response.",
          s.stringEnum("An association to include.", [
            "Images",
            "Shop",
            "User",
            "Translations",
            "Videos",
            "Personalization",
            "BuyerPrice",
          ]),
        ),
        language: s.string(
          "The IETF language tag for the language of this translation. Ex: `de`, `en`, `es`, `fr`, `it`, `ja`, `nl`, `pl`, `pt`.",
        ),
        allow_suggested_title: s.boolean(
          "This parameter will include in the response a suggested title for the listing, if one is available. Since suggestions are only available to the listing's owner, client must submit an oauth_access_token scoped to the owner of the listing.",
        ),
      },
      { required: ["listing_id"] },
    ),
    outputSchema: listing,
  }),
  defineProviderAction("etsy", {
    name: "get_listing_inventory",
    description: "Read inventory for a listing you own. Listings without Etsy inventory records may have no inventory.",
    operationType: "read",
    requiredScopes: ["listings_r"],
    inputSchema: s.object(
      "Lookup parameters.",
      {
        listing_id: s.integer(
          "The numeric ID for the [listing](/documentation/reference#tag/ShopListing) associated to this transaction.",
          { minimum: 1 },
        ),
        show_deleted: s.boolean(
          "A boolean value for inventory whether to include deleted products and their offerings. Default value is false.",
        ),
        includes: s.stringEnum("The associations to include in the response.", ["Listing"]),
      },
      { required: ["listing_id"] },
    ),
    outputSchema: inventory,
  }),
  defineProviderAction("etsy", {
    name: "list_receipts",
    description:
      "List Etsy order receipts by dates, payment, shipping, delivery, and cancellation status. Address availability depends on Etsy regional partner access.",
    operationType: "read",
    requiredScopes: ["transactions_r"],
    inputSchema: s.object(
      "Lookup parameters.",
      {
        shop_id: s.integer("The unique positive non-zero numeric ID for an Etsy Shop.", {
          minimum: 1,
        }),
        min_created: s.integer("The earliest unix timestamp for when a record was created.", {
          minimum: 946684800,
        }),
        max_created: s.integer("The latest unix timestamp for when a record was created.", {
          minimum: 946684800,
        }),
        min_last_modified: s.integer("The earliest unix timestamp for when a record last changed.", {
          minimum: 946684800,
        }),
        max_last_modified: s.integer("The latest unix timestamp for when a record last changed.", {
          minimum: 946684800,
        }),
        limit: s.integer("The maximum number of results to return.", { minimum: 1, maximum: 100 }),
        offset: s.integer("The number of records to skip before selecting the first result.", {
          minimum: 0,
        }),
        sort_on: s.stringEnum("The field to sort by. Defaults to created.", ["created", "updated", "receipt_id"]),
        sort_order: s.stringEnum("The sort direction. Defaults to desc.", [
          "asc",
          "ascending",
          "desc",
          "descending",
          "up",
          "down",
        ]),
        was_paid: s.nullable(
          s.boolean(
            "When `true`, returns receipts where the seller has received payment for the receipt. When `false`, returns receipts where payment has not been received.",
          ),
        ),
        was_shipped: s.nullable(
          s.boolean(
            "When `true`, returns receipts where the seller shipped the product(s) in this receipt. When `false`, returns receipts where shipment has not been set.",
          ),
        ),
        was_delivered: s.nullable(
          s.boolean(
            "When `true`, returns receipts that have been marked as delivered. When `false`, returns receipts where shipment has not been marked as delivered.",
          ),
        ),
        was_canceled: s.nullable(
          s.boolean(
            "When `true`, the endpoint will only return the canceled receipts. When `false`, the endpoint will only return non-canceled receipts.",
          ),
        ),
        legacy: s.boolean("Enable Etsy's processing-profile request and response behavior."),
      },
      { required: ["shop_id"] },
    ),
    outputSchema: receiptPage,
  }),
  defineProviderAction("etsy", {
    name: "get_receipt",
    description:
      "Get an Etsy order receipt, including available shipping and payment details. Address availability depends on Etsy regional partner access.",
    operationType: "read",
    requiredScopes: ["transactions_r"],
    inputSchema: s.object(
      "Lookup parameters.",
      {
        shop_id: s.integer("The unique positive non-zero numeric ID for an Etsy Shop.", {
          minimum: 1,
        }),
        receipt_id: s.integer(
          "The numeric ID for the [receipt](/documentation/reference#tag/Shop-Receipt) associated to this transaction.",
          { minimum: 1 },
        ),
        legacy: s.boolean("Enable Etsy's processing-profile request and response behavior."),
      },
      { required: ["shop_id", "receipt_id"] },
    ),
    outputSchema: receipt,
  }),
  defineProviderAction("etsy", {
    name: "list_receipt_transactions",
    description: "List the purchased items for an Etsy order receipt.",
    operationType: "read",
    requiredScopes: ["transactions_r"],
    inputSchema: s.object(
      "Lookup parameters.",
      {
        shop_id: s.integer("The unique positive non-zero numeric ID for an Etsy Shop.", {
          minimum: 1,
        }),
        receipt_id: s.integer(
          "The numeric ID for the [receipt](/documentation/reference#tag/Shop-Receipt) associated to this transaction.",
          { minimum: 1 },
        ),
        legacy: s.boolean("Enable Etsy's processing-profile request and response behavior."),
      },
      { required: ["shop_id", "receipt_id"] },
    ),
    outputSchema: transactionPage,
  }),
  defineProviderAction("etsy", {
    name: "create_receipt_shipment",
    description:
      "Record an Etsy shipment and notify the buyer by email on every successful call. Omit tracking and carrier to mark shipped only; both are required for US domestic orders over $10 and shipments to India. Use carrier 'other' for unsupported carriers. Regional partner restrictions may apply even with valid credentials and scopes.",
    operationType: "write",
    requiredScopes: ["transactions_w"],
    inputSchema: s.object(
      "Shipment parameters.",
      {
        shop_id: s.integer("The unique positive non-zero numeric ID for an Etsy Shop.", {
          minimum: 1,
        }),
        receipt_id: s.integer("The receipt to submit tracking for.", { minimum: 1 }),
        legacy: s.boolean("Enable Etsy's processing-profile request and response behavior."),
        tracking_code: s.string("The tracking code for this receipt."),
        carrier_name: s.string("The carrier name for this receipt."),
        send_bcc: s.boolean("If true, the shipping notification will be sent to the seller as well"),
        note_to_buyer: s.string("Message to include in notification to the buyer."),
        mail_class: s.nullable(
          s.string(
            "The service level of postal or carrier service selected for the shipment (e.g., First-Class, Priority, Ground, Express).",
          ),
        ),
        weight: s.nullable(s.number("The total weight of the package.")),
        weight_units: s.nullable(s.string("Unit of measurement used for package weight (oz, grams, etc.).")),
        length: s.nullable(s.number("Longest side of the package.")),
        width: s.nullable(s.number("Second longest side of the package.")),
        height: s.nullable(s.number("Third longest side of the package.")),
        dimension_units: s.nullable(s.string("Unit of measurement used for package dimensions (in, cm...).")),
        shipping_label_cost: s.nullable(s.number("The purchase price the seller paid for the shipping label.")),
        shipping_label_currency: s.nullable(s.string("The currency in which the shipping label was purchased.")),
        revenue_eligibility: s.nullable(
          s.string(
            "A flag indicating if the shipment is tied to a revenue share agreement between Etsy and the vendor.",
          ),
        ),
        ship_from_country: s.nullable(s.string("Where the package ships from.")),
        ship_to_country: s.nullable(s.string("Package destination.")),
        incoterm: s.nullable(s.string("The specific incoterm (e.g., DDU, DDP) designated for the shipment.")),
        customs_data: s.nullable(
          s.array(
            "Contains custom data like country of origin, declared value and HS code.",
            s.object(
              "A customs declaration.",
              {
                country_of_origin: s.nullable(s.string("The country in which the goods originate from.")),
                declared_value: s.nullable(s.number("The commercial value of the goods.")),
                HS_code: s.nullable(
                  s.string("The standardized global system (Harmonized System) for classifying traded products."),
                ),
              },
              { required: ["country_of_origin", "declared_value", "HS_code"] },
            ),
          ),
        ),
        duty_amount: s.nullable(
          s.number("The estimated or actual amount of import duties and taxes assessed by customs for the shipment."),
        ),
        duty_currency: s.nullable(s.string("The currency in which the duty was paid.")),
        ship_date: s.nullable(s.string("The date package was shipped.")),
      },
      { required: ["shop_id", "receipt_id"] },
    ),
    outputSchema: receipt,
  }),
];
