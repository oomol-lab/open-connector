import type { ActionDefinition } from "../../core/types.ts";
import type { G2Endpoint } from "./endpoint.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { buyerEndpoints } from "./buyer-endpoints.ts";
import { catalogEndpoints } from "./catalog-endpoints.ts";
import { dataSolutionsEndpoints } from "./data-solutions-endpoints.ts";
import { intelligenceEndpoints } from "./intelligence-endpoints.ts";

const resource = s.looseObject("A G2 JSON:API resource. Sparse fields and newly added attributes are preserved.", {
  id: s.string("The resource identifier."),
  type: s.string("The JSON:API resource type."),
  attributes: s.looseObject("Resource attributes, including review answers and attribution when returned."),
  relationships: s.looseObject("Relationships to other G2 resources."),
});

function outputSchema(list: boolean) {
  return s.object(
    "The G2 JSON:API response with normalized pagination cursors. Unknown upstream fields are preserved.",
    {
      data: list ? s.array("The resources on this page.", resource) : resource,
      included: s.array("Related resources included by G2.", resource),
      links: s.looseObject("Upstream pagination links; returned as data and never fetched automatically."),
      meta: s.looseObject("Upstream metadata, including counts, filter aggregates or competitors when available."),
      nextCursor: s.nullable(s.string("Pass this cursor as after to request the next page; null when absent.")),
      previousCursor: s.nullable(
        s.string("Pass this cursor as before to request the previous page; null when absent."),
      ),
    },
    {
      additionalProperties: true,
      required: ["data", "nextCursor", "previousCursor"],
    },
  );
}

const list_products = {
  path: "/api/v2/products",
  list: true,
  query: {
    pageSize: "page[size]",
    after: "page[after]",
    before: "page[before]",
    updatedAtGt: "filter[updated_at_gt]",
    updatedAtLt: "filter[updated_at_lt]",
    createdAtGt: "filter[created_at_gt]",
    createdAtLt: "filter[created_at_lt]",
    categoryIds: "filter[category_id][]",
    productIds: "filter[product_id][]",
    reviewCountGteq: "filter[review_count_gteq]",
    slugs: "filter[slug][]",
    starRatings: "filter[star_rating][]",
    vendorName: "filter[vendor_name]",
    productNameCont: "filter[product_name_cont]",
    productNameEq: "filter[product_name_eq]",
    websiteUrls: "filter[public_detail_url][]",
    websiteContains: "filter[public_detail_url_cont][]",
    query: "filter[query]",
    fields: "fields[products]",
    include: "include",
  },
  action: defineProviderAction("g2", {
    name: "list_products",
    description:
      "Search G2 products by name, category, domain, rating or other filters. Requires products.read permission.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for list_products.",
      {
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 250,
          default: 25,
          description: "Number of records per page (default: 25, max: 250)",
        },
        after: { type: "string", description: "Cursor for fetching the next page of results" },
        before: { type: "string", description: "Cursor for fetching the previous page of results" },
        updatedAtGt: {
          type: "string",
          format: "date-time",
          description: "Filter records updated after this date",
        },
        updatedAtLt: {
          type: "string",
          format: "date-time",
          description: "Filter records updated before this date",
        },
        createdAtGt: {
          type: "string",
          format: "date-time",
          description: "Filter records created after this date",
        },
        createdAtLt: {
          type: "string",
          format: "date-time",
          description: "Filter records created before this date",
        },
        categoryIds: {
          type: "array",
          items: { type: "string", description: "One value in the categoryIds list." },
          description: "Filter products by category id",
        },
        productIds: {
          type: "array",
          items: { type: "string", description: "One value in the productIds list." },
          description: "Filter products by one or more product UUIDs",
        },
        reviewCountGteq: { type: "string", description: "Filter products by minimum review count" },
        slugs: {
          type: "array",
          items: { type: "string", description: "One value in the slugs list." },
          description: "Filter products by one or more product slugs (exact match)",
        },
        starRatings: {
          type: "array",
          items: { type: "string", description: "One value in the starRatings list." },
          description: "Filter products by star rating",
        },
        vendorName: { type: "string", description: "Filter products by vendor name" },
        productNameCont: { type: "string", description: "Filter products by partial name match" },
        productNameEq: { type: "string", description: "Filter products by exact name match" },
        websiteUrls: {
          type: "array",
          items: { type: "string", description: "One value in the websiteUrls list." },
          description: "Filter products by exact vendor website URL (case-sensitive)",
        },
        websiteContains: {
          type: "array",
          items: { type: "string", description: "One value in the websiteContains list." },
          description: "Filter by partial URL/domain match (substring)",
        },
        query: { type: "string", description: "Search for products using full-text search" },
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "type",
              "detail_description",
              "domain",
              "g2_url",
              "name",
              "public_detail_url",
              "review_count",
              "slug",
              "write_review_url",
              "is_validated",
              "image_url",
              "pricing_tiers",
              "star_rating",
            ],
            description: "One value in the fields list.",
          },
          description: "List of fields for products to include in response",
        },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["categories", "discussions", "screenshots", "vendor"],
            description: "One value in the include list.",
          },
          description:
            "Comma-separated list of relationships to include (e.g. categories,discussions,screenshots,vendor)",
        },
      },
      {
        optional: [],
        required: [],
      },
    ),
    outputSchema: outputSchema(true),
  }),
};

const get_product = {
  path: "/api/v2/products/{product_id}",
  list: false,
  query: { fields: "fields[products]", include: "include" },
  action: defineProviderAction("g2", {
    name: "get_product",
    description: "Get a G2 product by UUID or slug. Requires products.read permission.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for get_product.",
      {
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "type",
              "detail_description",
              "domain",
              "g2_url",
              "name",
              "public_detail_url",
              "review_count",
              "slug",
              "write_review_url",
              "is_validated",
              "image_url",
              "pricing_tiers",
              "star_rating",
            ],
            description: "One value in the fields list.",
          },
          description: "List of fields for products to include in response",
        },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["categories", "discussions", "screenshots", "vendor"],
            description: "One value in the include list.",
          },
          description:
            "Comma-separated list of relationships to include (e.g. categories,discussions,screenshots,vendor)",
        },
        productId: {
          type: "string",
          description: "The UUID or slug of the product",
          minLength: 1,
          not: { enum: [".", ".."] },
        },
      },
      {
        optional: [],
        required: ["productId"],
      },
    ),
    outputSchema: outputSchema(false),
  }),
};

const list_categories = {
  path: "/api/v2/categories",
  list: true,
  query: {
    pageSize: "page[size]",
    after: "page[after]",
    before: "page[before]",
    updatedAtGt: "filter[updated_at_gt]",
    updatedAtLt: "filter[updated_at_lt]",
    createdAtGt: "filter[created_at_gt]",
    createdAtLt: "filter[created_at_lt]",
    nameEq: "filter[name_eq]",
    nameCont: "filter[name_cont]",
    slugEq: "filter[slug_eq]",
    slugCont: "filter[slug_cont]",
    fields: "fields[categories]",
    include: "include",
  },
  action: defineProviderAction("g2", {
    name: "list_categories",
    description: "List G2 categories with name, slug and date filters.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for list_categories.",
      {
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 250,
          default: 25,
          description: "Number of records per page (default: 25, max: 250)",
        },
        after: { type: "string", description: "Cursor for fetching the next page of results" },
        before: { type: "string", description: "Cursor for fetching the previous page of results" },
        updatedAtGt: {
          type: "string",
          format: "date-time",
          description: "Filter records updated after this date",
        },
        updatedAtLt: {
          type: "string",
          format: "date-time",
          description: "Filter records updated before this date",
        },
        createdAtGt: {
          type: "string",
          format: "date-time",
          description: "Filter records created after this date",
        },
        createdAtLt: {
          type: "string",
          format: "date-time",
          description: "Filter records created before this date",
        },
        nameEq: { type: "string", description: "Filter by exact name match" },
        nameCont: { type: "string", description: "Filter by partial name match" },
        slugEq: { type: "string", description: "Filter by exact slug match" },
        slugCont: { type: "string", description: "Filter by partial slug match" },
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: ["uuid", "name", "slug", "description", "updated_at"],
            description: "One value in the fields list.",
          },
          description: "List of fields for categories to include in response",
        },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["products", "children", "ancestors", "descendants", "parent"],
            description: "One value in the include list.",
          },
          description:
            "Comma-separated list of relationships to include (e.g. products,children,ancestors,descendants,parent)",
        },
      },
      {
        optional: [],
        required: [],
      },
    ),
    outputSchema: outputSchema(true),
  }),
};

const get_category = {
  path: "/api/v2/categories/{id}",
  list: false,
  query: { fields: "fields[categories]", include: "include" },
  action: defineProviderAction("g2", {
    name: "get_category",
    description: "Get a G2 category by UUID or slug, optionally including related categories and products.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for get_category.",
      {
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: ["uuid", "name", "slug", "description", "updated_at"],
            description: "One value in the fields list.",
          },
          description: "List of fields for categories to include in response",
        },
        include: {
          type: "array",
          items: {
            type: "string",
            enum: ["products", "children", "ancestors", "descendants", "parent"],
            description: "One value in the include list.",
          },
          description:
            "Comma-separated list of relationships to include (e.g. products,children,ancestors,descendants,parent)",
        },
        categoryId: {
          type: "string",
          description: "Category UUID or Slug",
          minLength: 1,
          not: { enum: [".", ".."] },
        },
      },
      {
        optional: [],
        required: ["categoryId"],
      },
    ),
    outputSchema: outputSchema(false),
  }),
};

const list_product_reviews = {
  path: "/api/v2/products/{product_id}/reviews",
  list: true,
  query: {
    pageSize: "page[size]",
    after: "page[after]",
    before: "page[before]",
    updatedAtGt: "filter[updated_at_gt]",
    updatedAtLt: "filter[updated_at_lt]",
    categoryIds: "filter[category_ids][]",
    commentAnswerValuesExclude: "filter[comment_answer_values_exclude]",
    companySegments: "filter[company_segment][]",
    countries: "filter[country][]",
    industryIds: "filter[industry][]",
    nps: "filter[nps][]",
    starRatings: "filter[nps_score][]",
    regions: "filter[region][]",
    roleIds: "filter[role][]",
    removed: "filter[removed]",
    fields: "fields[reviews]",
    include: "include",
  },
  action: defineProviderAction("g2", {
    name: "list_product_reviews",
    description:
      "List standard or removed G2 product reviews. Requires products.reviews.read and the corresponding product license.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for list_product_reviews.",
      {
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 250,
          default: 25,
          description: "Number of records per page (default: 25, max: 250)",
        },
        after: { type: "string", description: "Cursor for fetching the next page of results" },
        before: { type: "string", description: "Cursor for fetching the previous page of results" },
        productId: {
          type: "string",
          description: "Product UUID or Slug",
          minLength: 1,
          not: { enum: [".", ".."] },
        },
        updatedAtGt: {
          type: "string",
          format: "date-time",
          description: "Filter records updated after this date",
        },
        updatedAtLt: {
          type: "string",
          format: "date-time",
          description: "Filter records updated before this date",
        },
        categoryIds: {
          type: "array",
          items: { type: "string", description: "One value in the categoryIds list." },
          description: "Filter reviews by category IDs",
        },
        commentAnswerValuesExclude: {
          type: "string",
          description: "Exclude reviews with specific comment answer values",
        },
        companySegments: {
          type: "array",
          items: { type: "string", description: "One value in the companySegments list." },
          description:
            "Filter by company size segment\n\n - Company Segment ID: `179` => `Small-Business` *(0-50 employees)*\n\n - Company Segment ID: `180` => `Mid-Market` *(51-1000 employees)*\n\n - Company Segment ID: `181` => `Enterprise` *(1001-Infinity employees)*\n\n",
        },
        countries: {
          type: "array",
          items: { type: "string", description: "One value in the countries list." },
          description: "Filter by country names",
        },
        industryIds: {
          type: "array",
          items: { type: "string", description: "One value in the industryIds list." },
          description: "Filter by industry IDs",
        },
        nps: {
          type: "array",
          items: { type: "string", description: "One value in the nps list." },
          description: "Filter by raw NPS scores (0-10)",
        },
        starRatings: {
          type: "array",
          items: { type: "string", description: "One value in the starRatings list." },
          description: "Filter by derived star ratings (1-5)",
        },
        regions: {
          type: "array",
          items: { type: "string", description: "One value in the regions list." },
          description: "Filter by geographic regions",
        },
        roleIds: {
          type: "array",
          items: { type: "string", description: "One value in the roleIds list." },
          description: "Filter by user role IDs",
        },
        removed: { type: "boolean", description: "Filter to show only removed reviews" },
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "answers",
              "attribution",
              "comments_present",
              "country_name",
              "default_sort",
              "is_public",
              "official_response_present",
              "percent_complete",
              "product_name",
              "published_at",
              "regions",
              "review_incentive",
              "slug",
              "source",
              "star_rating",
              "submitted_at",
              "title",
              "url",
              "user_updated_at",
              "verified_current_user",
              "removed_at",
            ],
            description: "One value in the fields list.",
          },
          description: "Fields to return. Available review fields depend on whether removed is true.",
        },
        include: {
          type: "array",
          items: { type: "string", enum: ["user"], description: "One value in the include list." },
          description: "Comma-separated list of relationships to include (e.g. user)",
        },
      },
      {
        optional: [],
        required: ["productId"],
        allOf: [
          {
            if: { properties: { removed: { const: true } }, required: ["removed"] },
            then: {
              properties: {
                fields: { items: { enum: ["product_name", "removed_at", "slug", "submitted_at"] } },
              },
            },
            else: { properties: { fields: { items: { not: { const: "removed_at" } } } } },
          },
        ],
      },
    ),
    outputSchema: outputSchema(true),
  }),
};

const list_market_intelligence_reviews = {
  path: "/api/v2/products/{product_id}/market_intelligence/reviews",
  list: true,
  query: {
    pageSize: "page[size]",
    after: "page[after]",
    before: "page[before]",
    updatedAtGt: "filter[updated_at_gt]",
    updatedAtLt: "filter[updated_at_lt]",
    categoryIds: "filter[category_ids][]",
    commentAnswerValuesExclude: "filter[comment_answer_values_exclude]",
    companySegments: "filter[company_segment][]",
    countries: "filter[country][]",
    industryIds: "filter[industry][]",
    nps: "filter[nps][]",
    starRatings: "filter[nps_score][]",
    regions: "filter[region][]",
    roleIds: "filter[role][]",
    fields: "fields[reviews]",
    include: "include",
  },
  action: defineProviderAction("g2", {
    name: "list_market_intelligence_reviews",
    description:
      "List Market Intelligence reviews for one product. Requires products.reviews.read and Market Intelligence access; competitor products in meta must be queried separately.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Parameters for list_market_intelligence_reviews.",
      {
        pageSize: {
          type: "integer",
          minimum: 1,
          maximum: 250,
          default: 25,
          description: "Number of records per page (default: 25, max: 250)",
        },
        after: { type: "string", description: "Cursor for fetching the next page of results" },
        before: { type: "string", description: "Cursor for fetching the previous page of results" },
        productId: {
          type: "string",
          description: "Product UUID or Slug",
          minLength: 1,
          not: { enum: [".", ".."] },
        },
        updatedAtGt: {
          type: "string",
          format: "date-time",
          description: "Filter records updated after this date",
        },
        updatedAtLt: {
          type: "string",
          format: "date-time",
          description: "Filter records updated before this date",
        },
        categoryIds: {
          type: "array",
          items: { type: "string", description: "One value in the categoryIds list." },
          description: "Filter reviews by category IDs",
        },
        commentAnswerValuesExclude: {
          type: "string",
          description: "Exclude reviews with specific comment answer values",
        },
        companySegments: {
          type: "array",
          items: { type: "string", description: "One value in the companySegments list." },
          description:
            "Filter by company size segment\n\n - Company Segment ID: `179` => `Small-Business` *(0-50 employees)*\n\n - Company Segment ID: `180` => `Mid-Market` *(51-1000 employees)*\n\n - Company Segment ID: `181` => `Enterprise` *(1001-Infinity employees)*\n\n",
        },
        countries: {
          type: "array",
          items: { type: "string", description: "One value in the countries list." },
          description: "Filter by country names",
        },
        industryIds: {
          type: "array",
          items: { type: "string", description: "One value in the industryIds list." },
          description: "Filter by industry IDs",
        },
        nps: {
          type: "array",
          items: { type: "string", description: "One value in the nps list." },
          description: "Filter by raw NPS scores (0-10)",
        },
        starRatings: {
          type: "array",
          items: { type: "string", description: "One value in the starRatings list." },
          description: "Filter by derived star ratings (1-5)",
        },
        regions: {
          type: "array",
          items: { type: "string", description: "One value in the regions list." },
          description: "Filter by geographic regions",
        },
        roleIds: {
          type: "array",
          items: { type: "string", description: "One value in the roleIds list." },
          description: "Filter by user role IDs",
        },
        fields: {
          type: "array",
          items: {
            type: "string",
            enum: [
              "url",
              "title",
              "rating",
              "user_updated_at",
              "user_company_name",
              "product_name",
              "company_segment_name",
              "industry_name",
              "primary_region_name",
              "country_name",
              "country_code",
              "switched_theme",
              "category_names",
              "switched_from_products",
              "answers",
              "feature_ratings",
            ],
            description: "One value in the fields list.",
          },
          description: "List of fields for reviews to include in response",
        },
        include: {
          type: "array",
          items: { type: "string", enum: ["user"], description: "One value in the include list." },
          description: "Comma-separated list of relationships to include (e.g. user)",
        },
      },
      {
        optional: [],
        required: ["productId"],
      },
    ),
    outputSchema: outputSchema(true),
  }),
};

const coreEndpoints = [
  list_products,
  get_product,
  list_categories,
  get_category,
  list_product_reviews,
  list_market_intelligence_reviews,
];

const g2Endpoints: G2Endpoint[] = [
  ...coreEndpoints.map((endpoint): G2Endpoint => ({
    path: endpoint.path,
    method: "GET",
    pathParameters: { productId: "product_id", categoryId: "id" },
    query: Object.fromEntries(
      Object.entries(endpoint.query).map(([key, name]) => [
        key,
        { name, encoding: name.endsWith("[]") ? "repeat" : "comma" },
      ]),
    ),
    action: endpoint.action,
  })),
  ...catalogEndpoints,
  ...intelligenceEndpoints,
  ...buyerEndpoints,
  ...dataSolutionsEndpoints,
];

export const g2Actions: ActionDefinition[] = g2Endpoints.map((endpoint) => endpoint.action);

export const g2EndpointByName: Map<string, G2Endpoint> = new Map(
  g2Endpoints.map((endpoint) => [endpoint.action.name, endpoint]),
);
