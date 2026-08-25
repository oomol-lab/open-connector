import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "adobe_commerce";

const nonEmptyString = (description: string) => s.string({ description, minLength: 1 });
const storeCodeSchema = nonEmptyString("Optional Adobe Commerce store view code to place between /rest and /V1.");
const fieldsSchema = nonEmptyString("Optional Adobe Commerce fields selector used to return a partial response.");

const searchConditionTypeSchema = s.stringEnum("Adobe Commerce search condition type for the filter value.", [
  "eq",
  "finset",
  "from",
  "gt",
  "gteq",
  "in",
  "like",
  "lt",
  "lteq",
  "moreq",
  "neq",
  "nfinset",
  "nin",
  "nlike",
  "notnull",
  "null",
  "to",
]);

const searchFilterSchema = s.object(
  "One Adobe Commerce searchCriteria filter.",
  {
    field: nonEmptyString("The top-level Adobe Commerce field to filter."),
    value: nonEmptyString("The filter value sent to Adobe Commerce."),
    conditionType: searchConditionTypeSchema,
  },
  { optional: ["conditionType"] },
);

const searchFilterGroupSchema = s.object("One Adobe Commerce searchCriteria filter group.", {
  filters: s.array("Filters in this group. Multiple filters in one group are ORed.", searchFilterSchema, {
    minItems: 1,
  }),
});

const sortDirectionSchema = s.stringEnum("Adobe Commerce search sort direction.", ["ASC", "DESC"]);

const searchSortOrderSchema = s.object(
  "One Adobe Commerce searchCriteria sort order.",
  {
    field: nonEmptyString("The top-level Adobe Commerce field to sort by."),
    direction: sortDirectionSchema,
  },
  { optional: ["direction"] },
);

const listProductsInputSchema = s.object(
  "Search and pagination options for listing Adobe Commerce products.",
  {
    filterGroups: s.array(
      "Adobe Commerce searchCriteria filter groups. Groups are ANDed together.",
      searchFilterGroupSchema,
      {
        minItems: 1,
      },
    ),
    sortOrders: s.array("Adobe Commerce searchCriteria sort orders.", searchSortOrderSchema, {
      minItems: 1,
    }),
    pageSize: s.positiveInteger("Maximum number of products to return."),
    currentPage: s.positiveInteger("One-based result page to request."),
    fields: fieldsSchema,
    storeCode: storeCodeSchema,
  },
  {
    optional: ["filterGroups", "sortOrders", "pageSize", "currentPage", "fields", "storeCode"],
  },
);

const getProductInputSchema = s.object(
  "Lookup options for retrieving one Adobe Commerce product.",
  {
    sku: nonEmptyString("The Adobe Commerce product SKU."),
    editMode: s.boolean("Whether Adobe Commerce should return edit-mode product data."),
    storeId: s.integer("The numeric store ID to read the product from.", { minimum: 0 }),
    forceReload: s.boolean("Whether Adobe Commerce should force a product reload."),
    fields: fieldsSchema,
    storeCode: storeCodeSchema,
  },
  { optional: ["editMode", "storeId", "forceReload", "fields", "storeCode"] },
);

const listCategoriesInputSchema = s.object(
  "Options for retrieving the Adobe Commerce category tree.",
  {
    rootCategoryId: s.integer("Category ID to use as the category tree root.", { minimum: 1 }),
    depth: s.integer("Maximum category tree depth to return.", { minimum: 1 }),
    fields: fieldsSchema,
    storeCode: storeCodeSchema,
  },
  { optional: ["rootCategoryId", "depth", "fields", "storeCode"] },
);

const getCategoryInputSchema = s.object(
  "Lookup options for retrieving one Adobe Commerce category.",
  {
    categoryId: s.integer("The numeric Adobe Commerce category ID.", { minimum: 1 }),
    storeId: s.integer("The numeric store ID to read the category from.", { minimum: 0 }),
    fields: fieldsSchema,
    storeCode: storeCodeSchema,
  },
  { optional: ["storeId", "fields", "storeCode"] },
);

const customAttributeSchema = s.looseObject("Adobe Commerce custom attribute object.", {
  attribute_code: s.string("Attribute code returned by Adobe Commerce."),
  value: s.unknown("Attribute value returned by Adobe Commerce."),
});

const extensionAttributesSchema = s.looseObject("Adobe Commerce extension attributes returned for this resource.");

const productSchema = s.object("A normalized Adobe Commerce product.", {
  id: s.nullable(s.integer("Numeric product ID when returned by Adobe Commerce.")),
  sku: s.string("Product SKU returned by Adobe Commerce."),
  name: s.nullable(s.string("Product name when returned by Adobe Commerce.")),
  price: s.nullable(s.number("Product price when returned by Adobe Commerce.")),
  typeId: s.nullable(s.string("Product type ID when returned by Adobe Commerce.")),
  attributeSetId: s.nullable(s.integer("Product attribute set ID when returned by Adobe Commerce.")),
  status: s.nullable(s.integer("Product status code when returned by Adobe Commerce.")),
  visibility: s.nullable(s.integer("Product visibility code when returned by Adobe Commerce.")),
  createdAt: s.nullable(s.string("Product creation timestamp when returned by Adobe Commerce.")),
  updatedAt: s.nullable(s.string("Product update timestamp when returned by Adobe Commerce.")),
  customAttributes: s.array("Custom attributes returned by Adobe Commerce.", customAttributeSchema),
  extensionAttributes: s.nullable(extensionAttributesSchema),
  raw: s.looseObject("The raw Adobe Commerce product payload."),
});

const searchCriteriaSchema = s.looseObject("Adobe Commerce search_criteria object.");

const productSearchResultSchema = s.object("Adobe Commerce product search result.", {
  products: s.array("Products returned by Adobe Commerce.", productSchema),
  searchCriteria: s.nullable(searchCriteriaSchema),
  totalCount: s.integer("Total number of matching products reported by Adobe Commerce."),
});

const categorySchema = s.object("A normalized Adobe Commerce category.", {
  id: s.nullable(s.integer("Numeric category ID when returned by Adobe Commerce.")),
  parentId: s.nullable(s.integer("Parent category ID when returned by Adobe Commerce.")),
  name: s.nullable(s.string("Category name when returned by Adobe Commerce.")),
  isActive: s.nullable(s.boolean("Whether the category is active when returned by Adobe Commerce.")),
  position: s.nullable(s.integer("Category position when returned by Adobe Commerce.")),
  level: s.nullable(s.integer("Category level when returned by Adobe Commerce.")),
  path: s.nullable(s.string("Category path when returned by Adobe Commerce.")),
  productCount: s.nullable(s.integer("Product count when returned by Adobe Commerce.")),
  children: s.array(
    "Child category objects returned by Adobe Commerce.",
    s.looseObject("One raw child category object."),
  ),
  raw: s.looseObject("The raw Adobe Commerce category payload."),
});

export const adobeCommerceActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_products",
    description: "List Adobe Commerce products with optional searchCriteria filters and pagination.",
    requiredScopes: [],
    inputSchema: listProductsInputSchema,
    outputSchema: productSearchResultSchema,
  }),
  defineProviderAction(service, {
    name: "get_product",
    description: "Retrieve one Adobe Commerce product by SKU.",
    requiredScopes: [],
    inputSchema: getProductInputSchema,
    outputSchema: s.object("Adobe Commerce product lookup result.", {
      product: productSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_categories",
    description: "Retrieve the Adobe Commerce category tree with optional root and depth limits.",
    requiredScopes: [],
    inputSchema: listCategoriesInputSchema,
    outputSchema: s.object("Adobe Commerce category tree result.", {
      category: categorySchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_category",
    description: "Retrieve one Adobe Commerce category by category ID.",
    requiredScopes: [],
    inputSchema: getCategoryInputSchema,
    outputSchema: s.object("Adobe Commerce category lookup result.", {
      category: categorySchema,
    }),
  }),
];
