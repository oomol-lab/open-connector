import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wp_maps";

const resourceIdSchema = s.positiveInteger("WP Maps resource ID.");
const languageSchema = s.nonEmptyString("WP Maps language code used for localized fields, such as en_US.");
const nullableString = (description: string) => s.nullable(s.string(description));
const nullableNumber = (description: string) => s.nullable(s.number(description));

const productWriteSchema = s.object(
  "One product to create in WP Maps.",
  {
    title: s.nonEmptyString("Product title."),
    description: s.string("Product description."),
    price: s.string("Product price as displayed by WP Maps."),
    url: s.string("Public product page URL."),
    images: s.string("Public product image URL passed to WP Maps."),
    brand: s.string("Product brand."),
    categories: s.string("Product category value accepted by WP Maps."),
    tab: s.string("WP Maps tab assigned to the product."),
    ptype: s.string("WP Maps product type ID."),
    affs: s.record("Online retailer links keyed by retailer name.", s.string("Public product URL at the retailer.")),
  },
  {
    optional: ["description", "price", "url", "images", "brand", "categories", "tab", "ptype", "affs"],
  },
);

const productUpdateSchema = s.object(
  "One product to update in WP Maps.",
  {
    id: resourceIdSchema,
    title: s.nonEmptyString("Product title."),
    description: s.string("Product description."),
    price: s.string("Product price as displayed by WP Maps."),
    url: s.string("Public product page URL."),
    images: s.string("Public product image URL passed to WP Maps."),
    brand: s.string("Product brand."),
    categories: s.string("Product category value accepted by WP Maps."),
    tab: s.string("WP Maps tab assigned to the product."),
    ptype: s.string("WP Maps product type ID."),
    affs: s.record("Online retailer links keyed by retailer name.", s.string("Public product URL at the retailer.")),
  },
  {
    optional: ["description", "price", "url", "images", "brand", "categories", "tab", "ptype", "affs"],
  },
);

const productSchema = s.looseObject("A product returned by WP Maps.", {
  id: s.nullable(s.integer("Product ID.")),
  title: nullableString("Product title."),
  description: nullableString("Product description."),
  price: nullableString("Product price."),
  url: nullableString("Product page URL."),
  images: nullableString("Product image URL or provider-defined image value."),
  brand: nullableString("Product brand."),
  categories: s.unknown("Product categories returned by WP Maps."),
  stores: s.unknown("Stores associated with the product."),
  created_at: nullableString("Product creation timestamp."),
});

const geocoderSchema = s.stringEnum("Geocoder used when WP Maps resolves store coordinates.", [
  "google_maps",
  "mapbox",
  "arcgis_online",
]);

const storeFields = {
  title: s.nonEmptyString("Store title."),
  description: s.string("Store description."),
  url: nullableString("Public store page URL."),
  disable: s.unknown("Provider-defined value controlling whether the store is disabled."),
  street: s.string("Store street address."),
  city: s.string("Store city."),
  state: s.string("Store state or region."),
  postal_code: nullableString("Store postal code."),
  country: s.string("Store country."),
  lat: nullableNumber("Store latitude."),
  lng: nullableNumber("Store longitude."),
  phone: nullableString("Store phone number."),
  email: nullableString("Store email address."),
};

const storeWriteOptionalFields = [
  "description",
  "url",
  "disable",
  "street",
  "city",
  "state",
  "postal_code",
  "country",
  "lat",
  "lng",
  "phone",
  "email",
];

const storeWriteSchema = s.object("One store to create in WP Maps.", storeFields, {
  optional: storeWriteOptionalFields,
});
const storeUpdateSchema = s.object(
  "One store to update in WP Maps.",
  { id: resourceIdSchema, ...storeFields },
  { optional: storeWriteOptionalFields },
);
const storeSchema = s.looseObject("A store returned by WP Maps.", {
  id: s.nullable(s.integer("Store ID.")),
  title: nullableString("Store title."),
  description: nullableString("Store description."),
  url: nullableString("Store page URL."),
  disable: s.unknown("Provider-defined disabled value."),
  street: nullableString("Store street address."),
  city: nullableString("Store city."),
  state: nullableString("Store state or region."),
  postal_code: nullableString("Store postal code."),
  country: nullableString("Store country."),
  lat: nullableNumber("Store latitude."),
  lng: nullableNumber("Store longitude."),
  phone: nullableString("Store phone number."),
  email: nullableString("Store email address."),
});

const languageOnlyInput = s.object(
  "Optional localization settings for a WP Maps request.",
  { language: languageSchema },
  { optional: ["language"] },
);
const deleteOutput = s.object("A WP Maps delete response.", {
  success: s.boolean("Whether WP Maps reports that the delete succeeded."),
  message: s.string("Delete result message returned by WP Maps."),
});
const listOutput = s.object("A column-oriented WP Maps list response.", {
  data: s.array("Rows returned by WP Maps.", s.unknown("One provider-defined row.")),
  header: s.array("Column names returned by WP Maps.", s.string("One column name.")),
});

const createProductsAction = defineProviderAction(service, {
  name: "create_products",
  operationType: "write",
  description: "Create one or more products in WP Maps.",
  requiredScopes: [],
  inputSchema: s.object(
    "Products and optional language for a WP Maps create request.",
    {
      products: s.array("Products to create.", productWriteSchema, { minItems: 1 }),
      language: languageSchema,
    },
    { optional: ["language"] },
  ),
  outputSchema: s.object("The WP Maps product create response.", {
    products: s.array("Products saved by WP Maps.", productSchema),
    results: s.string("Product save summary returned by WP Maps."),
  }),
});

const updateProductsAction = defineProviderAction(service, {
  name: "update_products",
  operationType: "write",
  description: "Update one or more existing products in WP Maps.",
  requiredScopes: [],
  inputSchema: s.object(
    "Products and optional language for a WP Maps update request.",
    {
      products: s.array("Products to update.", productUpdateSchema, { minItems: 1 }),
      language: languageSchema,
    },
    { optional: ["language"] },
  ),
  outputSchema: s.object("The WP Maps product update response.", {
    products: s.array("Products saved by WP Maps.", productSchema),
    results: s.string("Product save summary returned by WP Maps."),
  }),
});

const getProductAction = defineProviderAction(service, {
  name: "get_product",
  operationType: "read",
  description: "Get one WP Maps product by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "Product ID and optional language for a WP Maps get request.",
    { productId: resourceIdSchema, language: languageSchema },
    { optional: ["language"] },
  ),
  outputSchema: s.object("The WP Maps product response.", { product: productSchema }),
});

const listProductsAction = defineProviderAction(service, {
  name: "list_products",
  operationType: "read",
  description: "List all products in the connected WP Maps account.",
  requiredScopes: [],
  inputSchema: languageOnlyInput,
  outputSchema: listOutput,
});

const deleteProductsAction = defineProviderAction(service, {
  name: "delete_products",
  operationType: "destructive",
  description: "Delete one or more WP Maps products by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "Product IDs and optional language for a WP Maps delete request.",
    {
      productIds: s.array("Product IDs to delete.", resourceIdSchema, { minItems: 1 }),
      language: languageSchema,
    },
    { optional: ["language"] },
  ),
  outputSchema: deleteOutput,
});

const createStoresAction = defineProviderAction(service, {
  name: "create_stores",
  operationType: "write",
  description: "Create one or more stores in WP Maps.",
  requiredScopes: [],
  inputSchema: s.object(
    "Stores, geocoder, and optional language for a WP Maps create request.",
    {
      stores: s.array("Stores to create.", storeWriteSchema, { minItems: 1 }),
      geocoder: geocoderSchema,
      language: languageSchema,
    },
    { optional: ["geocoder", "language"] },
  ),
  outputSchema: s.object("The WP Maps store create response.", {
    stores: s.array("Stores saved by WP Maps.", storeSchema),
    results: s.string("Store save summary returned by WP Maps."),
  }),
});

const updateStoresAction = defineProviderAction(service, {
  name: "update_stores",
  operationType: "write",
  description: "Update one or more existing stores in WP Maps.",
  requiredScopes: [],
  inputSchema: s.object(
    "Stores, geocoder, and optional language for a WP Maps update request.",
    {
      stores: s.array("Stores to update.", storeUpdateSchema, { minItems: 1 }),
      geocoder: geocoderSchema,
      language: languageSchema,
    },
    { optional: ["geocoder", "language"] },
  ),
  outputSchema: s.object("The WP Maps store update response.", {
    stores: s.array("Stores saved by WP Maps.", storeSchema),
    results: s.string("Store save summary returned by WP Maps."),
  }),
});

const getStoreAction = defineProviderAction(service, {
  name: "get_store",
  operationType: "read",
  description: "Get one WP Maps store by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "Store ID and optional language for a WP Maps get request.",
    { storeId: resourceIdSchema, language: languageSchema },
    { optional: ["language"] },
  ),
  outputSchema: s.object("The WP Maps store response.", { store: storeSchema }),
});

const listStoresAction = defineProviderAction(service, {
  name: "list_stores",
  operationType: "read",
  description: "List all stores in the connected WP Maps account.",
  requiredScopes: [],
  inputSchema: languageOnlyInput,
  outputSchema: listOutput,
});

const deleteStoresAction = defineProviderAction(service, {
  name: "delete_stores",
  operationType: "destructive",
  description: "Delete one or more WP Maps stores by ID.",
  requiredScopes: [],
  inputSchema: s.object(
    "Store IDs and optional language for a WP Maps delete request.",
    {
      storeIds: s.array("Store IDs to delete.", resourceIdSchema, { minItems: 1 }),
      language: languageSchema,
    },
    { optional: ["language"] },
  ),
  outputSchema: deleteOutput,
});

export const wpMapsActions: readonly ProviderActionDefinition[] = [
  createProductsAction,
  updateProductsAction,
  getProductAction,
  listProductsAction,
  deleteProductsAction,
  createStoresAction,
  updateStoresAction,
  getStoreAction,
  listStoresAction,
  deleteStoresAction,
];

export type WpMapsActionName =
  | "create_products"
  | "update_products"
  | "get_product"
  | "list_products"
  | "delete_products"
  | "create_stores"
  | "update_stores"
  | "get_store"
  | "list_stores"
  | "delete_stores";
