import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "slickdeals" as const;

const pageSchema = s.positiveInteger("The 1-based result page to retrieve.");
const perPageSchema = s.integer("The number of results to return per page.", {
  minimum: 5,
  maximum: 100,
});
const sortOrderSchema = s.stringEnum("The order used to sort results.", ["asc", "desc"]);
const storeIdSchema = s.positiveInteger("The Slickdeals store ID used to filter results.");
const utmCampaignSchema = s.nonWhitespaceString("The UTM campaign value added to links returned by Slickdeals.");
const countrySchema = s.stringEnum("The store country used to filter results.", ["US", "UK", "CA", "AU"]);

const paginationFields = {
  page: pageSchema,
  perPage: perPageSchema,
};

const paginationSchema = s.object("Pagination information for the returned collection.", {
  page: s.positiveInteger("The current result page."),
  perPage: s.positiveInteger("The requested number of results per page."),
});

const categorySchema = s.looseObject("A category returned by Slickdeals.", {
  id: s.integer("The Slickdeals category ID."),
  name: s.string("The category name."),
  path: s.string("The full category hierarchy path."),
});

const brandSchema = s.looseObject("A brand returned by Slickdeals.", {
  id: s.integer("The Slickdeals brand ID."),
  name: s.string("The brand name."),
});

const storeSchema = s.looseObject("A store returned by Slickdeals.", {
  id: s.integer("The Slickdeals store ID."),
  name: s.string("The store name."),
  domain: s.string("The store domain."),
  country: s.string("The store country code."),
  internalLink: s.url("The Slickdeals page for the store."),
  monetized: s.boolean("Whether Slickdeals monetizes links for this store."),
  externalLink: s.url("The Slickdeals redirect URL for the store."),
});

const articleSchema = s.looseObject("An article returned by Slickdeals.", {
  id: s.integer("The Slickdeals article ID."),
  title: s.string("The article title."),
  subtitle: s.string("The article subtitle."),
  author: s.string("The article author."),
  publishedAt: s.nullable(s.dateTime("When the article was published.")),
  modifiedAt: s.nullable(s.dateTime("When the article was last modified.")),
  featuredImage: s.url("The featured image URL."),
  internalLink: s.url("The Slickdeals article URL."),
  excerpt: s.string("A short article excerpt."),
  content: s.string("The article content."),
});

const couponSchema = s.looseObject("A coupon returned by Slickdeals.", {
  id: s.integer("The Slickdeals coupon ID."),
  title: s.string("The coupon title."),
  description: s.string("The coupon description and restrictions."),
  code: s.string("The coupon code when one is required."),
  internalLink: s.url("The Slickdeals coupon URL."),
  externalLink: s.url("The Slickdeals redirect URL for the coupon."),
  type: s.string("The coupon type returned by Slickdeals."),
  store: storeSchema,
  categories: s.array("Categories associated with the coupon.", categorySchema),
  startAt: s.nullable(s.dateTime("When the coupon becomes active.")),
  expireAt: s.nullable(s.dateTime("When the coupon expires.")),
  modifiedAt: s.nullable(s.dateTime("When the coupon was last modified.")),
  percentOff: s.string("The percentage discount represented as text."),
  dollarsOff: s.string("The fixed discount represented as text."),
  redemptions: s.nonNegativeInteger("The total redemption count."),
  redemptions_24hrs: s.nonNegativeInteger("The redemption count during the last 24 hours."),
  exclusive: s.boolean("Whether the coupon is exclusive to Slickdeals."),
  sitewide: s.boolean("Whether the coupon applies store-wide."),
  verified: s.boolean("Whether Slickdeals has verified the coupon."),
});

const attachmentSchema = s.looseObject("An image attachment returned with a deal.", {
  primary: s.boolean("Whether this is the primary deal image."),
  urls: s.record("Image URLs keyed by rendition size.", s.url("An image rendition URL.")),
});

const dealSchema = s.looseObject("A deal returned by Slickdeals.", {
  id: s.integer("The Slickdeals deal ID."),
  title: s.string("The deal title."),
  content: s.string("The deal content, which may contain HTML."),
  author: s.string("The Slickdeals user who posted the deal."),
  authorAvatars: s.looseObject("Author avatar URLs keyed by image size."),
  internalLink: s.url("The Slickdeals deal URL."),
  externalLink: s.url("The Slickdeals redirect URL for the deal."),
  comments: s.nonNegativeInteger("The number of deal comments."),
  views: s.nonNegativeInteger("The number of deal views."),
  score: s.integer("The Slickdeals community score."),
  thumbs: s.integer("The Slickdeals community thumbs score."),
  type: s.string("The deal type returned by Slickdeals."),
  fireDeal: s.boolean("Whether Slickdeals marks this as a fire deal."),
  createdAt: s.nullable(s.dateTime("When the deal was created.")),
  modifiedAt: s.nullable(s.dateTime("When the deal was last modified.")),
  expiredAt: s.nullable(s.integer("When the deal expired as a Unix timestamp.")),
  listPrice: s.nullable(s.number("The original list price.")),
  finalPrice: s.nullable(s.number("The final deal price.")),
  featuredImage: s.url("The featured deal image URL."),
  primaryCategory: categorySchema,
  categories: s.array("Categories associated with the deal.", categorySchema),
  images: s.array("Image attachments associated with the deal.", attachmentSchema),
  primaryStore: storeSchema,
  stores: s.array("Stores associated with the deal.", storeSchema),
  coupons: s.array("Coupons associated with the deal.", couponSchema),
});

const listArticlesAction = defineProviderAction(service, {
  name: "list_articles",
  operationType: "read",
  description: "List Slickdeals shopping articles with optional store, sorting, and pagination filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters used to list Slickdeals articles.",
    {
      sortBy: s.stringEnum("The article field used for sorting.", ["created", "modified"]),
      sortOrder: sortOrderSchema,
      storeId: storeIdSchema,
      ...paginationFields,
      utmCampaign: utmCampaignSchema,
    },
    { optional: ["sortBy", "sortOrder", "storeId", "page", "perPage", "utmCampaign"] },
  ),
  outputSchema: s.object("A normalized Slickdeals article collection.", {
    articles: s.array("The articles returned by Slickdeals.", articleSchema),
    pagination: paginationSchema,
  }),
});

const listBrandsAction = defineProviderAction(service, {
  name: "list_brands",
  operationType: "read",
  description: "List Slickdeals brands that can be used to filter deals.",
  requiredScopes: [],
  inputSchema: s.object("No input is required to list Slickdeals brands.", {}),
  outputSchema: s.object("A normalized Slickdeals brand collection.", {
    brands: s.array("The brands returned by Slickdeals.", brandSchema),
  }),
});

const listCategoriesAction = defineProviderAction(service, {
  name: "list_categories",
  operationType: "read",
  description: "List Slickdeals categories that can be used to filter deals and coupons.",
  requiredScopes: [],
  inputSchema: s.object("No input is required to list Slickdeals categories.", {}),
  outputSchema: s.object("A normalized Slickdeals category collection.", {
    categories: s.array("The categories returned by Slickdeals.", categorySchema),
  }),
});

const listCouponsAction = defineProviderAction(service, {
  name: "list_coupons",
  operationType: "read",
  description: "List Slickdeals coupons with store, category, country, state, and sorting filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters used to list Slickdeals coupons.",
    {
      categoryId: s.positiveInteger("The Slickdeals category ID used to filter coupons."),
      storeId: storeIdSchema,
      type: s.stringEnum("The coupon type to return.", ["all", "code", "discount", "print"]),
      monetizedOnly: s.boolean("Whether to return coupons only from monetized stores."),
      sortBy: s.stringEnum("The coupon field used for sorting.", ["created", "modified", "expired", "redemptions"]),
      country: countrySchema,
      sitewide: s.boolean("Whether to return only sitewide coupons."),
      sortOrder: sortOrderSchema,
      expired: s.boolean("Whether to return expired instead of active coupons."),
      ...paginationFields,
      utmCampaign: utmCampaignSchema,
    },
    {
      optional: [
        "categoryId",
        "storeId",
        "type",
        "monetizedOnly",
        "sortBy",
        "country",
        "sitewide",
        "sortOrder",
        "expired",
        "page",
        "perPage",
        "utmCampaign",
      ],
    },
  ),
  outputSchema: s.object("A normalized Slickdeals coupon collection.", {
    coupons: s.array("The coupons returned by Slickdeals.", couponSchema),
    pagination: paginationSchema,
  }),
});

const listDealsAction = defineProviderAction(service, {
  name: "list_deals",
  operationType: "read",
  description: "List Slickdeals deals with store, category, brand, popularity, and date filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The filters used to list Slickdeals deals.",
    {
      includeStoreIds: s.array("Store IDs whose deals should be returned.", storeIdSchema, {
        minItems: 1,
      }),
      includeCategoryIds: s.array(
        "Category IDs whose deals should be returned.",
        s.positiveInteger("A Slickdeals category ID."),
        { minItems: 1 },
      ),
      includeBrandIds: s.array(
        "Brand IDs whose deals should be returned.",
        s.positiveInteger("A Slickdeals brand ID."),
        { minItems: 1 },
      ),
      type: s.stringEnum("The minimum deal popularity to return.", ["all", "popularOrBetter", "frontpage"]),
      createdAfter: s.date("Return only deals created after this date."),
      sortOrder: sortOrderSchema,
      expired: s.boolean("Whether to return expired instead of active deals."),
      ...paginationFields,
      utmCampaign: utmCampaignSchema,
    },
    {
      optional: [
        "includeStoreIds",
        "includeCategoryIds",
        "includeBrandIds",
        "type",
        "createdAfter",
        "sortOrder",
        "expired",
        "page",
        "perPage",
        "utmCampaign",
      ],
    },
  ),
  outputSchema: s.object("A normalized Slickdeals deal collection.", {
    deals: s.array("The deals returned by Slickdeals.", dealSchema),
    pagination: paginationSchema,
  }),
});

const listStoresInputSchema = s.object(
  "The filters used to list Slickdeals stores.",
  {
    storeName: s.nonWhitespaceString("The exact store name to retrieve."),
    monetizedOnly: s.boolean("Whether to return only monetized stores."),
    country: countrySchema,
    ...paginationFields,
  },
  { optional: ["storeName", "monetizedOnly", "country", "page", "perPage"] },
);

const listStoresAction = defineProviderAction(service, {
  name: "list_stores",
  operationType: "read",
  description: "List Slickdeals stores with optional name, monetization, country, and pagination filters.",
  requiredScopes: [],
  inputSchema: listStoresInputSchema,
  outputSchema: s.object("A normalized Slickdeals store collection.", {
    stores: s.array("The stores returned by Slickdeals.", storeSchema),
    pagination: paginationSchema,
  }),
});

const listTypesAction = defineProviderAction(service, {
  name: "list_types",
  operationType: "read",
  description: "List the coupon and deal type values supported by the Slickdeals Syndication API.",
  requiredScopes: [],
  inputSchema: s.object("No input is required to list Slickdeals content types.", {}),
  outputSchema: s.object("The content type values supported by Slickdeals.", {
    couponTypes: s.stringArray("The supported coupon types."),
    dealTypes: s.stringArray("The supported deal types."),
  }),
});

export const slickdealsActions: ProviderActionDefinition[] = [
  listArticlesAction,
  listBrandsAction,
  listCategoriesAction,
  listCouponsAction,
  listDealsAction,
  listStoresAction,
  listTypesAction,
];
