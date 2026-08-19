import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "headout";

const paginationInputFields = {
  offset: s.nonEmptyString("The pagination offset returned by a previous Headout response."),
  limit: s.positiveInteger("The number of items to request from Headout."),
};

const imageSchema = s.object("A Headout image object.", {
  url: s.url("The absolute image URL."),
});

const paginationSchema = s.object("The Headout pagination wrapper metadata.", {
  nextUrl: s.nullableString("The next page URL when Headout returns one."),
  prevUrl: s.nullableString("The previous page URL when Headout returns one."),
  total: s.integer("The total number of matching Headout records."),
  nextOffset: s.nullableInteger("The next numeric offset when Headout returns one."),
});

const citySchema = s.object("A Headout city object.", {
  code: s.nonEmptyString("The Headout city code."),
  name: s.nonEmptyString("The display name of the city."),
  image: imageSchema,
  raw: s.unknownObject("The raw Headout city object."),
});

const categorySchema = s.object("A Headout category object.", {
  id: s.nonEmptyString("The Headout category identifier."),
  name: s.nonEmptyString("The category display name."),
  cityCode: s.nonEmptyString("The Headout city code for this category."),
  image: s.nullable(imageSchema),
  canonicalUrl: s.url("The canonical Headout category URL."),
  raw: s.unknownObject("The raw Headout category object."),
});

const geolocationSchema = s.object("A Headout geolocation object.", {
  latitude: s.number("The latitude."),
  longitude: s.number("The longitude."),
});

const ratingSchema = s.object("A Headout rating summary.", {
  avg: s.nullableNumber("The average rating."),
  count: s.nullableInteger("The number of ratings."),
});

const listingPriceSchema = s.object("A Headout pricing amount pair.", {
  originalPrice: s.nullableNumber("The original retail price."),
  finalPrice: s.nullableNumber("The final selling price."),
  raw: s.unknownObject("The raw Headout listing price object."),
});

const productPricingSchema = s.object("A Headout product pricing summary.", {
  type: s.nullableString("The Headout pricing type."),
  currencyCode: s.nullableString("The pricing currency code."),
  minimumPrice: s.nullable(listingPriceSchema),
  bestDiscount: s.nullableNumber("The best discount percentage or absolute value."),
  raw: s.unknownObject("The raw Headout product pricing object."),
});

const productListingSchema = s.object("A Headout product listing item.", {
  id: s.nonEmptyString("The Headout product identifier."),
  name: s.nonEmptyString("The product name."),
  url: s.nullableString("The relative Headout product URL."),
  canonicalUrl: s.nullableString("The canonical Headout product URL."),
  city: s.nullable(s.unknownObject("A minimal Headout city object attached to a listing.")),
  image: s.nullable(imageSchema),
  primaryCategory: s.nullable(s.unknownObject("The primary category attached to the product.")),
  startGeolocation: s.nullable(geolocationSchema),
  ratingCumulative: s.nullable(ratingSchema),
  pricing: s.nullable(productPricingSchema),
  hasInstantConfirmation: s.nullableBoolean("Whether the listing can be confirmed instantly."),
  raw: s.unknownObject("The raw Headout product listing object."),
});

const productSchema = s.object("A normalized Headout product.", {
  id: s.nonEmptyString("The Headout product identifier."),
  name: s.nonEmptyString("The product name."),
  url: s.nullableString("The relative Headout product URL."),
  canonicalUrl: s.nullableString("The canonical Headout product URL."),
  city: s.nullable(s.unknownObject("The Headout city attached to the product.")),
  currency: s.nullable(s.unknownObject("A Headout currency object.")),
  displayTags: s.stringArray("The display tags returned by Headout."),
  images: s.array("The Headout product images.", imageSchema),
  content: s.array("The normalized Headout content sections.", s.unknownObject("A Headout content section.")),
  startLocation: s.nullable(s.unknownObject("The normalized Headout start location object.")),
  endLocation: s.nullable(s.unknownObject("The normalized Headout end location object.")),
  productType: s.nullableString("The Headout product type."),
  ratingCumulative: s.nullable(ratingSchema),
  hasInstantConfirmation: s.nullableBoolean("Whether the product supports instant confirmation."),
  hasMobileTicket: s.nullableBoolean("Whether the product supports mobile tickets."),
  variants: s.array("The Headout product variants.", s.unknownObject("A Headout product variant.")),
  pricing: s.nullable(productPricingSchema),
  raw: s.unknownObject("The raw Headout product object."),
});

const inventorySchema = s.object("A Headout inventory object.", {
  id: s.nonEmptyString("The Headout inventory identifier."),
  startDateTime: s.nullableString("The inventory start local date-time."),
  endDateTime: s.nullableString("The inventory end local date-time."),
  availability: s.nullableString("The Headout availability code."),
  remaining: s.nullableInteger("The remaining seats when Headout reports them."),
  pricing: s.nullable(s.unknownObject("The Headout inventory pricing object.")),
  raw: s.unknownObject("The raw Headout inventory object."),
});

const bookingSchema = s.object("A normalized Headout booking.", {
  bookingId: s.nonEmptyString("The Headout booking identifier."),
  partnerReferenceId: s.nullableString("The partner reference identifier when present."),
  variantId: s.nullableString("The booked variant identifier."),
  startDateTime: s.nullableString("The booking start date-time."),
  product: s.nullable(s.unknownObject("The minimal product reference on a Headout booking.")),
  customerDetails: s.nullable(s.unknownObject("The customer details collected for a Headout booking.")),
  variantInputFields: s.array("The variant-level booking input fields.", s.unknownObject("A booking input field.")),
  price: s.nullable(s.unknownObject("A Headout monetary value.")),
  status: s.nullableString("The Headout booking status."),
  voucherUrl: s.nullableString("The Headout voucher URL when available."),
  tickets: s.array("The tickets returned for this booking.", s.unknownObject("A Headout ticket object.")),
  creationTimestamp: s.nullableInteger("The booking creation timestamp."),
  raw: s.unknownObject("The raw Headout booking object."),
});

export const headoutActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_cities",
    description: "List active Headout cities.",
    inputSchema: s.actionInput(paginationInputFields, [], "The input payload for listing Headout cities."),
    outputSchema: s.actionOutput(
      {
        cities: s.array("The active Headout cities.", citySchema),
        pagination: paginationSchema,
      },
      "The response returned when listing Headout cities.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_categories_by_city",
    description: "List Headout categories for a given city.",
    inputSchema: s.actionInput(
      {
        cityCode: s.nonEmptyString("The Headout city code."),
        ...paginationInputFields,
      },
      ["cityCode"],
      "The input payload for listing Headout categories by city.",
    ),
    outputSchema: s.actionOutput(
      {
        categories: s.array("The Headout categories in the requested city.", categorySchema),
        pagination: paginationSchema,
      },
      "The response returned when listing Headout categories by city.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_products_by_city",
    description: "List Headout product listings for a city.",
    inputSchema: s.actionInput(
      {
        cityCode: s.nonEmptyString("The Headout city code."),
        currencyCode: s.nonEmptyString("The ISO 4217 currency code for returned pricing."),
        language: s.nonEmptyString("The Headout language code."),
        ...paginationInputFields,
      },
      ["cityCode"],
      "The input payload for listing Headout products by city.",
    ),
    outputSchema: s.actionOutput(
      {
        products: s.array("The product listings returned by Headout.", productListingSchema),
        pagination: paginationSchema,
      },
      "The response returned when listing Headout products by city.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_products_by_category",
    description: "List Headout product listings for a category.",
    inputSchema: s.actionInput(
      {
        categoryId: s.nonEmptyString("The Headout category identifier."),
        currencyCode: s.nonEmptyString("The ISO 4217 currency code for returned pricing."),
        language: s.nonEmptyString("The Headout language code."),
        ...paginationInputFields,
      },
      ["categoryId"],
      "The input payload for listing Headout products by category.",
    ),
    outputSchema: s.actionOutput(
      {
        products: s.array("The product listings returned by Headout.", productListingSchema),
        pagination: paginationSchema,
      },
      "The response returned when listing Headout products by category.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Get one Headout product with variants and pricing.",
    inputSchema: s.actionInput(
      {
        productId: s.nonEmptyString("The Headout product identifier."),
        currencyCode: s.nonEmptyString("The ISO 4217 currency code for returned pricing."),
        language: s.nonEmptyString("The Headout language code."),
        fetchVariants: s.boolean("Whether to request variants from Headout."),
      },
      ["productId"],
      "The input payload for fetching one Headout product.",
    ),
    outputSchema: s.actionOutput(
      { product: productSchema },
      "The response returned when fetching one Headout product.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_inventory_by_variant",
    description: "List Headout inventory rows for one variant.",
    inputSchema: s.actionInput(
      {
        variantId: s.nonEmptyString("The Headout variant identifier."),
        startDateTime: s.nonEmptyString("The lower bound start date-time in Headout local date-time format."),
        endDateTime: s.nonEmptyString("The upper bound end date-time in Headout local date-time format."),
        currencyCode: s.nonEmptyString("The ISO 4217 currency code for returned pricing."),
        ...paginationInputFields,
      },
      ["variantId"],
      "The input payload for listing Headout inventory by variant.",
    ),
    outputSchema: s.actionOutput(
      {
        inventories: s.array("The inventory rows returned by Headout.", inventorySchema),
        pagination: paginationSchema,
      },
      "The response returned when listing Headout inventory.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_bookings",
    description: "List bookings accessible to the current Headout API key.",
    inputSchema: s.actionInput(paginationInputFields, [], "The input payload for listing Headout bookings."),
    outputSchema: s.actionOutput(
      {
        bookings: s.array("The bookings returned by Headout.", bookingSchema),
        pagination: paginationSchema,
      },
      "The response returned when listing Headout bookings.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_booking",
    description: "Get one booking by its Headout booking id.",
    inputSchema: s.actionInput(
      { bookingId: s.nonEmptyString("The Headout booking identifier.") },
      ["bookingId"],
      "The input payload for fetching one Headout booking.",
    ),
    outputSchema: s.actionOutput(
      { booking: bookingSchema },
      "The response returned when fetching one Headout booking.",
    ),
  }),
];
