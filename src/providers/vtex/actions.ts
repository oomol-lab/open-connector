import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "vtex";

const productIdSchema = s.positiveInteger("VTEX product unique numerical identifier.");
const categoryIdSchema = s.positiveInteger("VTEX category identifier.");
const paginationFromSchema = s.nonNegativeInteger(
  "Initial zero-based item number for VTEX search pagination. VTEX requires this value to be at most 2500.",
  { maximum: 2500 },
);
const paginationToSchema = s.nonNegativeInteger(
  "Final item number for VTEX search pagination. When from is also provided, to must be greater than or equal to from and no more than 50 greater than from.",
);
const productAndSkuFromSchema = s.positiveInteger("Product ID that starts the VTEX product and SKU ID result range.");
const productAndSkuToSchema = s.positiveInteger("Product ID that ends the VTEX product and SKU ID result range.");

const orderBySchema = s.stringEnum("VTEX product search sorting method.", [
  "OrderByPriceDESC",
  "OrderByPriceASC",
  "OrderByTopSaleDESC",
  "OrderByReviewRateDESC",
  "OrderByNameASC",
  "OrderByNameDESC",
  "OrderByReleaseDateDESC",
  "OrderByBestDiscountDESC",
  "OrderByScoreDESC",
]);

const productSchema = s.looseObject(
  "A VTEX product object. The Search API and Catalog API include product, SKU, seller, pricing, specification, and custom fields that vary by store.",
);

const brandSchema = s.looseObject("A VTEX catalog brand.", {
  id: s.integer("Brand ID."),
  name: s.string("Brand name."),
  isActive: s.boolean("Whether the brand is active."),
  title: s.string("Brand title."),
  metaTagDescription: s.string("Brand SEO meta description."),
  imageUrl: s.nullable(s.string("Brand image URL when configured.")),
});

const categorySchema = s.looseObject("A VTEX catalog category tree node.", {
  id: s.integer("Category ID."),
  name: s.string("Category name."),
  hasChildren: s.boolean("Whether this category has child categories."),
  url: s.string("Category storefront URL."),
  children: s.array(
    "Direct child category nodes. Nested child nodes may include the same category fields.",
    s.looseObject("A nested VTEX category node."),
  ),
  Title: s.string("Category SEO title."),
  MetaTagDescription: s.string("Category SEO meta description."),
});

const productAndSkuRangeSchema = s.object("Range metadata returned by VTEX.", {
  total: s.integer("Total quantity of products in the response range."),
  from: s.integer("Initial product ID returned by the query."),
  to: s.integer("Final product ID returned by the query."),
});

const listProductAndSkuIdsInputSchema = s.object(
  "Input for retrieving VTEX product IDs and their SKU IDs.",
  {
    categoryId: categoryIdSchema,
    from: productAndSkuFromSchema,
    to: productAndSkuToSchema,
  },
  { optional: ["categoryId", "from", "to"] },
);

const listProductAndSkuIdsOutputSchema = s.object("VTEX product IDs mapped to SKU IDs, plus range metadata.", {
  productIdsByProductId: s.record(
    "SKU ID arrays keyed by VTEX product ID.",
    s.array("SKU IDs for a product.", s.integer("VTEX SKU ID.")),
  ),
  range: productAndSkuRangeSchema,
});

const getProductInputSchema = s.object(
  "Input for retrieving a VTEX product by ID.",
  {
    productId: productIdSchema,
  },
  { required: ["productId"] },
);

const getProductOutputSchema = s.object("A VTEX product lookup result.", {
  product: productSchema,
});

const listBrandsOutputSchema = s.object("VTEX catalog brands.", {
  brands: s.array("Brands returned by VTEX.", brandSchema),
});

const listCategoryTreeInputSchema = s.object(
  "Input for retrieving the VTEX category tree.",
  {
    categoryLevels: s.positiveInteger("Maximum category level depth to retrieve."),
  },
  { required: ["categoryLevels"] },
);

const listCategoryTreeOutputSchema = s.object("VTEX catalog category tree.", {
  categories: s.array("Top-level VTEX categories.", categorySchema),
});

const searchProductsInputSchema = s.object(
  "Input for searching VTEX storefront products with filters, ordering, and pagination.",
  {
    fullText: s.nonEmptyString("Full-text product search term sent as the ft query parameter."),
    filterQueries: s.array(
      "VTEX fq filter expressions, such as C:/1000041/1000049/, productId:123, or skuId:456.",
      s.nonEmptyString("One VTEX fq filter expression."),
      { minItems: 1 },
    ),
    orderBy: orderBySchema,
    from: paginationFromSchema,
    to: paginationToSchema,
  },
  { optional: ["fullText", "filterQueries", "orderBy", "from", "to"] },
);

const searchProductsOutputSchema = s.object("VTEX storefront product search results.", {
  products: s.array("Products returned by VTEX search.", productSchema),
});

export const vtexActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_product_and_sku_ids",
    description: "Retrieve VTEX product IDs and their SKU IDs, optionally scoped by category and product ID range.",
    inputSchema: listProductAndSkuIdsInputSchema,
    outputSchema: listProductAndSkuIdsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve a VTEX Catalog product by its product ID.",
    inputSchema: getProductInputSchema,
    outputSchema: getProductOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_brands",
    description: "List brands registered in a VTEX store catalog.",
    inputSchema: s.object("The input payload for listing VTEX brands.", {}),
    outputSchema: listBrandsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_category_tree",
    description: "Retrieve the VTEX store category tree up to a requested depth.",
    inputSchema: listCategoryTreeInputSchema,
    outputSchema: listCategoryTreeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_products",
    description: "Search VTEX storefront products with full text, filter query expressions, sorting, and pagination.",
    inputSchema: searchProductsInputSchema,
    outputSchema: searchProductsOutputSchema,
  }),
];
