import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "bestbuy";

const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const jsonFormatSchema = s.literal("json", {
  description: "Response format. Only json is supported by this connector.",
});
const optionalPageSchema = s.integer("The one-based page number to retrieve.", { minimum: 1 });
const optionalPageSizeSchema = s.integer("The number of results to return per page, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const optionalShowSchema = nonEmptyString("A comma-separated list of upstream fields to include in the response.");
const optionalSortSchema = nonEmptyString("The Best Buy sort expression, such as name.asc or salePrice.dsc.");
const skuInputSchema = s.anyOf("The product SKU.", [s.integer("The product SKU."), nonEmptyString("The product SKU.")]);
const storeIdInputSchema = s.anyOf("The store identifier.", [
  s.integer("The store identifier."),
  nonEmptyString("The store identifier."),
]);
const reviewIdInputSchema = s.anyOf("The review identifier.", [
  s.integer("The review identifier."),
  nonEmptyString("The review identifier."),
]);

const categoryPathItemSchema = s.looseRequiredObject("A category path entry returned by Best Buy.", {
  id: nonEmptyString("The category identifier."),
  name: nonEmptyString("The category display name."),
});

const subCategoryItemSchema = s.looseRequiredObject(
  "A direct subcategory entry returned by Best Buy.",
  {
    id: nonEmptyString("The subcategory identifier."),
    name: nonEmptyString("The subcategory display name."),
    url: s.string("The canonical URL for the subcategory."),
    active: s.boolean("Whether the subcategory is active."),
  },
  { optional: ["url", "active"] },
);

const categorySchema = s.looseRequiredObject(
  "A Best Buy category object.",
  {
    id: nonEmptyString("The category identifier."),
    name: nonEmptyString("The category display name."),
    url: s.string("The canonical URL for the category."),
    active: s.boolean("Whether the category is active."),
    parent: s.string("The parent category identifier."),
    path: s.array("The category path from root to the current category.", categoryPathItemSchema),
    subCategories: s.array("The direct subcategories of the category.", subCategoryItemSchema),
  },
  { optional: ["url", "active", "parent", "path", "subCategories"] },
);

const productSchema = s.looseRequiredObject(
  "A Best Buy product object.",
  {
    sku: s.anyOf("The product SKU.", [s.integer("The product SKU."), nonEmptyString("The product SKU.")]),
    name: nonEmptyString("The product display name."),
    type: s.string("The upstream product type."),
    upc: s.string("The product UPC."),
    url: s.string("The canonical Best Buy product URL."),
    image: s.string("The primary product image URL."),
    thumbnailImage: s.string("The thumbnail product image URL."),
    salePrice: s.number("The current sale price."),
    regularPrice: s.number("The regular list price."),
    shortDescription: s.string("The short product description."),
    longDescription: s.string("The long product description."),
    description: s.string("The product description text."),
    manufacturer: s.string("The product manufacturer."),
    customerReviewCount: s.integer("The number of customer reviews."),
    customerReviewAverage: s.number("The average customer review score."),
    categoryPath: s.array("The category hierarchy for the product.", categoryPathItemSchema),
  },
  {
    optional: [
      "type",
      "upc",
      "url",
      "image",
      "thumbnailImage",
      "salePrice",
      "regularPrice",
      "shortDescription",
      "longDescription",
      "description",
      "manufacturer",
      "customerReviewCount",
      "customerReviewAverage",
      "categoryPath",
    ],
  },
);

const reviewSchema = s.looseRequiredObject(
  "A Best Buy review object.",
  {
    id: s.anyOf("The unique review identifier.", [
      s.integer("The review identifier."),
      nonEmptyString("The review identifier."),
    ]),
    productId: s.string("The reviewed product identifier."),
    sku: s.anyOf("The reviewed product SKU.", [
      s.integer("The reviewed product SKU."),
      nonEmptyString("The reviewed product SKU."),
    ]),
    reviewer: s.string("The reviewer display name."),
    reviewerLocation: s.string("The reviewer location string."),
    title: s.string("The review title."),
    comment: s.string("The review body text."),
    rating: s.integer("The review rating score."),
    submissionTime: s.string("The review submission timestamp."),
    isRecommended: s.boolean("Whether the reviewer recommends the product."),
    helpfulVotes: s.integer("The helpful vote count."),
    notHelpfulVotes: s.integer("The not-helpful vote count."),
  },
  {
    optional: [
      "productId",
      "sku",
      "reviewer",
      "reviewerLocation",
      "title",
      "comment",
      "rating",
      "submissionTime",
      "isRecommended",
      "helpfulVotes",
      "notHelpfulVotes",
    ],
  },
);

const storeSchema = s.looseRequiredObject(
  "A Best Buy store object.",
  {
    storeId: s.anyOf("The store identifier.", [
      s.integer("The store identifier."),
      nonEmptyString("The store identifier."),
    ]),
    name: s.string("The store display name."),
    type: s.string("The upstream store type alias."),
    storeType: s.string("The upstream store type."),
    address: s.string("The primary store street address."),
    address2: s.string("The secondary store address line."),
    city: s.string("The store city."),
    state: s.string("The store state or region code."),
    postalCode: s.string("The store postal code."),
    fullPostalCode: s.string("The full store postal code."),
    country: s.string("The store country code."),
    phone: s.string("The store phone number."),
    hours: s.string("The store hours string."),
    lat: s.number("The store latitude."),
    lng: s.number("The store longitude."),
    distance: s.number("The distance from the requested origin."),
    services: s.array("The services offered by the store.", s.string("A service offered by the store.")),
  },
  {
    optional: [
      "name",
      "type",
      "storeType",
      "address",
      "address2",
      "city",
      "state",
      "postalCode",
      "fullPostalCode",
      "country",
      "phone",
      "hours",
      "lat",
      "lng",
      "distance",
      "services",
    ],
  },
);

const listResponseMetadataSchema = {
  from: s.integer("The starting index of the current page."),
  to: s.integer("The ending index of the current page."),
  currentPage: s.integer("The current one-based page number."),
  totalPages: s.integer("The total number of pages available."),
  total: s.integer("The total number of matching records."),
  queryTime: s.number("The query execution time reported by Best Buy."),
  totalTime: s.number("The total request time reported by Best Buy."),
  partial: s.boolean("Whether the response is a partial result set."),
  canonicalUrl: s.string("The canonical URL returned by Best Buy."),
};
const listOptionalMetadataFields = ["queryTime", "totalTime", "partial", "canonicalUrl"];

const categoriesOutputSchema = s.looseRequiredObject(
  "The Best Buy categories response.",
  {
    ...listResponseMetadataSchema,
    categories: s.array("The categories returned by the request.", categorySchema),
  },
  { optional: listOptionalMetadataFields },
);
const productsOutputSchema = s.looseRequiredObject(
  "The Best Buy products response.",
  {
    ...listResponseMetadataSchema,
    products: s.array("The products returned by the request.", productSchema),
  },
  { optional: listOptionalMetadataFields },
);
const reviewsOutputSchema = s.looseRequiredObject(
  "The Best Buy reviews response.",
  {
    ...listResponseMetadataSchema,
    reviews: s.array("The reviews returned by the request.", reviewSchema),
  },
  { optional: listOptionalMetadataFields },
);
const storesOutputSchema = s.looseRequiredObject(
  "The Best Buy stores response.",
  {
    ...listResponseMetadataSchema,
    stores: s.array("The stores returned by the request.", storeSchema),
  },
  { optional: listOptionalMetadataFields },
);

const listOptions = {
  page: optionalPageSchema,
  pageSize: optionalPageSizeSchema,
  show: optionalShowSchema,
  sort: optionalSortSchema,
  format: jsonFormatSchema,
};
const listOptionKeys = ["page", "pageSize", "show", "sort", "format"];

const categoriesInputSchema = s.object(
  "The input payload for listing Best Buy categories.",
  {
    id: nonEmptyString("A category identifier or a pipe-separated list of category identifiers."),
    name: nonEmptyString("A category name or a pipe-separated list of category names."),
    ...listOptions,
  },
  { optional: ["id", "name", ...listOptionKeys] },
);

const categoryDetailsInputSchema = s.object(
  "The input payload for retrieving one Best Buy category.",
  {
    id: nonEmptyString("The category identifier to retrieve."),
    show: optionalShowSchema,
    format: jsonFormatSchema,
  },
  { optional: ["show", "format"] },
);

const productsInputSchema = s.object(
  "The input payload for listing Best Buy products.",
  {
    sku: skuInputSchema,
    upc: nonEmptyString("The product UPC to filter by."),
    name: nonEmptyString(
      "The product name filter. Plain values are converted into a name clause, and raw Best Buy name expressions are also accepted.",
    ),
    salePrice: nonEmptyString(
      "The salePrice filter. Values such as >100 are converted into a Best Buy comparison clause, and raw salePrice expressions are also accepted.",
    ),
    categoryPathId: nonEmptyString("The Best Buy category identifier to filter products by."),
    "categoryPath.id": nonEmptyString(
      "The Best Buy category identifier alias used by the toolkit to filter products by.",
    ),
    ...listOptions,
  },
  { optional: ["sku", "upc", "name", "salePrice", "categoryPathId", "categoryPath.id", ...listOptionKeys] },
);

const productDetailsInputSchema = s.object(
  "The input payload for retrieving one Best Buy product.",
  {
    sku: skuInputSchema,
    show: optionalShowSchema,
    format: jsonFormatSchema,
  },
  { optional: ["show", "format"] },
);

const reviewsInputSchema = s.object(
  "The input payload for listing Best Buy reviews.",
  {
    sku: skuInputSchema,
    reviewer: nonEmptyString("The reviewer name used to filter reviews."),
    minScore: s.integer("The minimum review rating to include.", { minimum: 1, maximum: 5 }),
    maxScore: s.integer("The maximum review rating to include.", { minimum: 1, maximum: 5 }),
    ...listOptions,
  },
  { optional: ["sku", "reviewer", "minScore", "maxScore", ...listOptionKeys] },
);

const reviewDetailsInputSchema = s.object(
  "The input payload for retrieving one Best Buy review.",
  {
    id: reviewIdInputSchema,
    show: optionalShowSchema,
    format: jsonFormatSchema,
  },
  { optional: ["show", "format"] },
);

const geoInputSchema = s.object(
  "The geographic area filter for listing Best Buy stores.",
  {
    lat: s.number("The latitude used for area-based store search.", { minimum: -90, maximum: 90 }),
    long: s.number("The longitude used for area-based store search.", { minimum: -180, maximum: 180 }),
    radius: s.integer("The search radius in miles used for area-based store search.", { minimum: 0 }),
  },
  { optional: ["radius"] },
);

const storesInputSchema = s.object(
  "The input payload for listing Best Buy stores.",
  {
    geo: geoInputSchema,
    city: nonEmptyString("The city name used to filter stores."),
    state: nonEmptyString("The state code alias used to filter stores."),
    region: nonEmptyString("The Best Buy region filter used to filter stores."),
    storeId: s.integer("The store identifier used to filter stores."),
    storeType: nonEmptyString("The store type used to filter stores."),
    postalCode: nonEmptyString("The postal code used to filter stores."),
    services: nonEmptyString("The services filter used to filter stores."),
    ...listOptions,
  },
  { optional: ["geo", "city", "state", "region", "storeId", "storeType", "postalCode", "services", ...listOptionKeys] },
);

const storeDetailsInputSchema = s.object(
  "The input payload for retrieving one Best Buy store.",
  {
    storeId: storeIdInputSchema,
    show: optionalShowSchema,
    format: jsonFormatSchema,
  },
  { optional: ["show", "format"] },
);

export const bestbuyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_categories",
    description: "List Best Buy categories with optional identifier or name filters.",
    inputSchema: categoriesInputSchema,
    outputSchema: categoriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_category_details",
    description: "Retrieve one Best Buy category by identifier.",
    inputSchema: categoryDetailsInputSchema,
    outputSchema: categorySchema,
  }),
  defineProviderAction(service, {
    name: "get_products",
    description: "List Best Buy products with optional SKU, UPC, name, category, or price filters.",
    inputSchema: productsInputSchema,
    outputSchema: productsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_product_details",
    description: "Retrieve one Best Buy product by SKU.",
    inputSchema: productDetailsInputSchema,
    outputSchema: productSchema,
  }),
  defineProviderAction(service, {
    name: "get_reviews",
    description: "List Best Buy product reviews with optional SKU, reviewer, and rating filters.",
    inputSchema: reviewsInputSchema,
    outputSchema: reviewsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_review_details",
    description: "Retrieve one Best Buy review by identifier.",
    inputSchema: reviewDetailsInputSchema,
    outputSchema: reviewSchema,
  }),
  defineProviderAction(service, {
    name: "get_stores",
    description: "List Best Buy stores with optional geographic and attribute filters.",
    inputSchema: storesInputSchema,
    outputSchema: storesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_store_details",
    description: "Retrieve one Best Buy store by store identifier.",
    inputSchema: storeDetailsInputSchema,
    outputSchema: storeSchema,
  }),
];

export type BestbuyActionName = (typeof bestbuyActions)[number]["name"];
