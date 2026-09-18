import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const literal = (description: string, value: string | number | boolean): JsonSchema =>
  s.literal(value, { description });

const url = (description: string, options: { maxLength?: number } = {}): JsonSchema =>
  s.string(description, { ...options, format: "uri" });

const dataOutput = s.object("Chuhaijiang TikTok data returned through LinkFox.", {
  data: s.looseObject("The complete supplier data, including optional detail expansions.", {
    items: s.optional(
      s.array(
        "The returned records; detail endpoints may also return a list.",
        s.looseObject("A supplier record with original IDs, metrics and currency units."),
      ),
    ),
    total_count: s.optional(s.number("The total matching record count when provided.")),
  }),
  requestId: s.nullable(s.string("The LinkFox request tracing identifier.")),
  costToken: s.nullable(s.number("The LinkFox token usage when provided.")),
});
const uploadOutput = s.object("Temporary image upload credentials returned by LinkFox.", {
  data: s.looseObject("The image upload information.", {
    url: s.string(
      "The temporary URL for uploading image bytes with HTTP PUT and an image Content-Type, without LinkFox credentials.",
    ),
    os_key: s.string("The object key passed to image search as osKey after upload."),
    os_bucket: s.optional(s.string("The object storage bucket.")),
    signed_url: s.optional(s.string("The temporary read URL; never use this as the upload URL.")),
  }),
  requestId: s.nullable(s.string("The LinkFox request tracing identifier.")),
  costToken: s.nullable(s.number("The LinkFox token usage when provided.")),
});
interface ChuhaijiangOperation {
  path: string;
  usage: number;
  action: ProviderActionDefinition;
}
function operation<const TName extends string>(
  name: TName,
  operationType: ActionDefinition["operationType"],
  path: string,
  usage: number,
  description: string,
  inputSchema: JsonSchema,
  upload = false,
): ChuhaijiangOperation {
  return {
    path,
    usage,
    action: defineProviderAction("linkfox", {
      name,
      operationType,
      description,
      inputSchema,
      outputSchema: upload ? uploadOutput : dataOutput,
    }),
  };
}

const countryField = s.stringEnum("The lowercase TikTok market country code.", [
  "br",
  "de",
  "es",
  "fr",
  "gb",
  "id",
  "it",
  "jp",
  "mx",
  "my",
  "ph",
  "sg",
  "th",
  "us",
  "vn",
]);
const pageField = s.integer("The result page number, starting at 1.", { minimum: 1 });
const pageSizeField = s.integer("The number of records per page. Maximum 10.", {
  minimum: 1,
  maximum: 10,
});
const keywordField = s.string("The search keyword.");
const categoryField = s.string("The supplier category identifier.");
const minViewsField = s.number("The minimum view count.");
const maxViewsField = s.number("The maximum view count.");
const minGmvField = s.number("The minimum GMV.");
const maxGmvField = s.number("The maximum GMV.");
const gmvSortField = s.string("The supplier sort expression in field:asc or field:desc format. Default: gmv:desc.", {
  default: "gmv:desc",
});
const adIdField = s.nonEmptyString("The ad ID from the corresponding search result, passed as a JSON string.");
const coreIncludeField = s.stringEnum("Comma-separated optional detail expansions: core.", ["core"]);
const minGmv30dField = s.number("The minimum 30-day GMV.");
const maxGmv30dField = s.number("The maximum 30-day GMV.");
const minEngagementField = s.number("The minimum engagement rate in supplier units.");
const maxEngagementField = s.number("The maximum engagement rate in supplier units.");
const gmv30dSortField = s.string(
  "The supplier sort expression in field:asc or field:desc format. Default: gmv_30d:desc.",
  { default: "gmv_30d:desc" },
);
const creatorIdField = s.nonEmptyString(
  "The creator ID from the corresponding search result, passed as a JSON string.",
);
const rankingPageSizeField = s.integer("The number of records per page. Maximum 20.", {
  minimum: 1,
  maximum: 20,
});
const dateField = s.nonEmptyString("The ranking date in YYYYMMDD format.", {
  pattern: "^[0-9]{8}$",
});
const granularityField = s.stringEnum("The ranking period: daily, weekly, monthly, or the supplier codes 0, 1, 2.", [
  "daily",
  "weekly",
  "monthly",
  "0",
  "1",
  "2",
]);
const creatorCategoryField = s.string("The creator category.");
const productCategoryField = s.string("The product category.");
const isCommercialField = s.boolean("Whether the content promotes products.");
const liveIdField = s.nonEmptyString("The live room ID from the corresponding search result, passed as a JSON string.");
const sellerTypeField = s.stringEnum("The supplier seller type: 1 overseas non-brand, 2 local, 3 brand, 4 non-brand.", [
  "1",
  "2",
  "3",
  "4",
]);
const minSold7dField = s.number("The minimum 7-day sales count.");
const maxSold7dField = s.number("The maximum 7-day sales count.");
const gmv7dSortField = s.string(
  "The supplier sort expression in field:asc or field:desc format. Default: gmv_7d:desc.",
  { default: "gmv_7d:desc" },
);
const productIdField = s.nonEmptyString(
  "The product ID from the corresponding search result, passed as a JSON string.",
);
const coreChannelIncludeField = s.stringEnum("Comma-separated optional detail expansions: core, channel.", [
  "core",
  "channel",
  "core,channel",
  "channel,core",
]);
const promotionRankingSortField = s.string(
  "The supplier sort expression in field:asc or field:desc format. Default: related_creator_count:desc.",
  { default: "related_creator_count:desc" },
);
const salesRankingSortField = s.string(
  "The supplier sort expression in field:asc or field:desc format. Default: interval_sold_count:desc.",
  { default: "interval_sold_count:desc" },
);
const shopIdField = s.nonEmptyString("The shop ID from the corresponding search result, passed as a JSON string.");
const shopTypeField = s.stringEnum("The supplier shop type code.", ["1", "2", "3", "4"]);
const videoIdField = s.nonEmptyString("The video ID from the corresponding search result, passed as a JSON string.");

export const chuhaijiangOperations: ChuhaijiangOperation[] = [
  operation(
    "search_chuhaijiang_ads",
    "read",
    "/chuhaijiang/ad-creative/ads/search",
    18,
    "Search TikTok ads through LinkFox and Chuhaijiang.",
    s.object("Search TikTok ads parameters.", {
      country: countryField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
      keyword: s.optional(keywordField),
      category: s.optional(categoryField),
      adType: s.optional(s.string("The supplier ad type classification.")),
      excludeSparkAds: s.optional(s.boolean("Whether to exclude Spark Ads.")),
      minViews: s.optional(minViewsField),
      maxViews: s.optional(maxViewsField),
      minGmv: s.optional(minGmvField),
      maxGmv: s.optional(maxGmvField),
      minDays: s.optional(s.number("The minimum ad running days.")),
      maxDays: s.optional(s.number("The maximum ad running days.")),
      sort: s.optional(gmvSortField),
    }),
  ),
  operation(
    "get_chuhaijiang_ad",
    "read",
    "/chuhaijiang/ad-creative/ads/detail",
    9,
    "Get TikTok ad details through LinkFox and Chuhaijiang.",
    s.object("Get TikTok ad details parameters.", {
      country: countryField,
      id: adIdField,
      include: s.optional(coreIncludeField),
    }),
  ),
  operation(
    "list_chuhaijiang_ad_products",
    "read",
    "/chuhaijiang/ad-creative/ads/related-products",
    18,
    "List products associated with a TikTok ad through LinkFox and Chuhaijiang.",
    s.object("List products associated with a TikTok ad parameters.", {
      country: countryField,
      id: adIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "search_chuhaijiang_creatives",
    "read",
    "/chuhaijiang/ad-creative/creatives/search",
    18,
    "Search TikTok creatives through LinkFox and Chuhaijiang.",
    s.object("Search TikTok creatives parameters.", {
      country: countryField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
      keyword: s.optional(keywordField),
      category: s.optional(categoryField),
      hasProduct: s.optional(s.boolean("Whether the creative is associated with products.")),
      isSponsored: s.optional(s.boolean("Whether the content is sponsored.")),
      isAigc: s.optional(s.boolean("Whether the content is AI-generated.")),
      sort: s.optional(gmvSortField),
    }),
  ),
  operation(
    "get_chuhaijiang_creative",
    "read",
    "/chuhaijiang/ad-creative/creatives/detail",
    9,
    "Get TikTok creative details through LinkFox and Chuhaijiang.",
    s.object("Get TikTok creative details parameters.", {
      country: countryField,
      id: s.nonEmptyString("The creative ID from the corresponding search result, passed as a JSON string."),
      include: s.optional(
        s.stringEnum("Comma-separated optional detail expansions: analysis, embedding.", [
          "analysis",
          "embedding",
          "analysis,embedding",
          "embedding,analysis",
        ]),
      ),
    }),
  ),
  operation(
    "search_chuhaijiang_creators",
    "read",
    "/chuhaijiang/creators/search",
    18,
    "Search TikTok creators through LinkFox and Chuhaijiang.",
    s.object("Search TikTok creators parameters.", {
      country: countryField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
      keyword: s.optional(keywordField),
      category: s.optional(categoryField),
      minFollowers: s.optional(s.number("The minimum follower count.")),
      maxFollowers: s.optional(s.number("The maximum follower count.")),
      minGmv30d: s.optional(minGmv30dField),
      maxGmv30d: s.optional(maxGmv30dField),
      minAvgViews: s.optional(s.number("The minimum average view count.")),
      maxAvgViews: s.optional(s.number("The maximum average view count.")),
      minEngagement: s.optional(minEngagementField),
      maxEngagement: s.optional(maxEngagementField),
      hasContact: s.optional(s.boolean("Whether the creator has public contact information.")),
      sort: s.optional(gmv30dSortField),
    }),
  ),
  operation(
    "get_chuhaijiang_creator",
    "read",
    "/chuhaijiang/creators/detail",
    9,
    "Get TikTok creator details through LinkFox and Chuhaijiang.",
    s.object("Get TikTok creator details parameters.", {
      country: countryField,
      id: creatorIdField,
      include: s.optional(
        s.stringEnum("Comma-separated optional detail expansions: channel, core, portrait.", [
          "channel",
          "core",
          "portrait",
          "channel,core",
          "channel,portrait",
          "core,channel",
          "core,portrait",
          "portrait,channel",
          "portrait,core",
          "channel,core,portrait",
          "channel,portrait,core",
          "core,channel,portrait",
          "core,portrait,channel",
          "portrait,channel,core",
          "portrait,core,channel",
        ]),
      ),
    }),
  ),
  operation(
    "list_chuhaijiang_creator_lives",
    "read",
    "/chuhaijiang/creators/related-lives",
    18,
    "List live streams associated with a TikTok creator through LinkFox and Chuhaijiang.",
    s.object("List live streams associated with a TikTok creator parameters.", {
      country: countryField,
      id: creatorIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_creator_products",
    "read",
    "/chuhaijiang/creators/related-products",
    18,
    "List products associated with a TikTok creator through LinkFox and Chuhaijiang.",
    s.object("List products associated with a TikTok creator parameters.", {
      country: countryField,
      id: creatorIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_creator_videos",
    "read",
    "/chuhaijiang/creators/related-videos",
    18,
    "List videos associated with a TikTok creator through LinkFox and Chuhaijiang.",
    s.object("List videos associated with a TikTok creator parameters.", {
      country: countryField,
      id: creatorIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_creator_agencies",
    "read",
    "/chuhaijiang/creators/rankings/agencies",
    18,
    "List TikTok creator agencies ranked by performance through LinkFox and Chuhaijiang.",
    s.object("List TikTok creator agencies ranked by performance parameters.", {
      country: countryField,
      page: s.optional(pageField),
      pageSize: s.optional(rankingPageSizeField),
      category: s.optional(categoryField),
      sort: s.optional(gmv30dSortField),
    }),
  ),
  operation(
    "list_chuhaijiang_commercial_creators",
    "read",
    "/chuhaijiang/creators/rankings/commercial",
    18,
    "List commercial TikTok creator rankings through LinkFox and Chuhaijiang.",
    s.object("List commercial TikTok creator rankings parameters.", {
      country: countryField,
      date: dateField,
      granularity: granularityField,
      page: s.optional(pageField),
      pageSize: s.optional(rankingPageSizeField),
      creatorCategory: s.optional(creatorCategoryField),
      productCategory: s.optional(productCategoryField),
      sort: s.optional(
        s.string("The supplier sort expression in field:asc or field:desc format. Default: total_gmv:desc.", {
          default: "total_gmv:desc",
        }),
      ),
    }),
  ),
  operation(
    "list_chuhaijiang_growing_creators",
    "read",
    "/chuhaijiang/creators/rankings/growth",
    18,
    "List TikTok creator follower-growth rankings through LinkFox and Chuhaijiang.",
    s.object("List TikTok creator follower-growth rankings parameters.", {
      country: countryField,
      date: dateField,
      granularity: granularityField,
      page: s.optional(pageField),
      pageSize: s.optional(rankingPageSizeField),
      creatorCategory: s.optional(creatorCategoryField),
      productCategory: s.optional(productCategoryField),
      sort: s.optional(
        s.string("The supplier sort expression in field:asc or field:desc format. Default: new_follower_count:desc.", {
          default: "new_follower_count:desc",
        }),
      ),
    }),
  ),
  operation(
    "search_chuhaijiang_lives",
    "read",
    "/chuhaijiang/lives/search",
    18,
    "Search TikTok live streams through LinkFox and Chuhaijiang.",
    s.object("Search TikTok live streams parameters.", {
      country: countryField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
      keyword: s.optional(keywordField),
      category: s.optional(categoryField),
      productCategory: s.optional(productCategoryField),
      isLiving: s.optional(s.boolean("Whether the stream is currently live.")),
      isCommercial: s.optional(isCommercialField),
      minSold: s.optional(s.number("The minimum sales count.")),
      maxSold: s.optional(s.number("The maximum sales count.")),
      minGmv: s.optional(minGmvField),
      maxGmv: s.optional(maxGmvField),
      minAudience: s.optional(s.number("The minimum audience count.")),
      maxAudience: s.optional(s.number("The maximum audience count.")),
      sort: s.optional(gmvSortField),
    }),
  ),
  operation(
    "get_chuhaijiang_live",
    "read",
    "/chuhaijiang/lives/detail",
    9,
    "Get TikTok live stream details through LinkFox and Chuhaijiang.",
    s.object("Get TikTok live stream details parameters.", {
      country: countryField,
      id: liveIdField,
      include: s.optional(coreIncludeField),
    }),
  ),
  operation(
    "list_chuhaijiang_live_products",
    "read",
    "/chuhaijiang/lives/related-products",
    18,
    "List products associated with a TikTok live stream through LinkFox and Chuhaijiang.",
    s.object("List products associated with a TikTok live stream parameters.", {
      country: countryField,
      id: liveIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "search_chuhaijiang_products",
    "read",
    "/chuhaijiang/products/search",
    18,
    "Search TikTok products through LinkFox and Chuhaijiang.",
    s.object("Search TikTok products parameters.", {
      country: countryField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
      keyword: s.optional(keywordField),
      category: s.optional(categoryField),
      sellerType: s.optional(sellerTypeField),
      minPrice: s.optional(s.number("The minimum price in USD.")),
      maxPrice: s.optional(s.number("The maximum price in USD.")),
      minRating: s.optional(s.number("The minimum rating.", { minimum: 0, maximum: 5 })),
      maxRating: s.optional(s.number("The maximum rating.", { minimum: 0, maximum: 5 })),
      minSold7d: s.optional(minSold7dField),
      maxSold7d: s.optional(maxSold7dField),
      minSold30d: s.optional(s.number("The minimum 30-day sales count.")),
      maxSold30d: s.optional(s.number("The maximum 30-day sales count.")),
      freeShipping: s.optional(s.boolean("Whether the product offers free shipping.")),
      sort: s.optional(gmv7dSortField),
    }),
  ),
  operation(
    "get_chuhaijiang_product",
    "read",
    "/chuhaijiang/products/detail",
    9,
    "Get TikTok product details through LinkFox and Chuhaijiang.",
    s.object("Get TikTok product details parameters.", {
      country: countryField,
      id: productIdField,
      include: s.optional(coreChannelIncludeField),
    }),
  ),
  operation(
    "list_chuhaijiang_product_creators",
    "read",
    "/chuhaijiang/products/related-creators",
    18,
    "List creators associated with a TikTok product through LinkFox and Chuhaijiang.",
    s.object("List creators associated with a TikTok product parameters.", {
      country: countryField,
      id: productIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_product_lives",
    "read",
    "/chuhaijiang/products/related-lives",
    18,
    "List live streams associated with a TikTok product through LinkFox and Chuhaijiang.",
    s.object("List live streams associated with a TikTok product parameters.", {
      country: countryField,
      id: productIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_product_reviews",
    "read",
    "/chuhaijiang/products/reviews",
    18,
    "List TikTok product reviews through LinkFox and Chuhaijiang.",
    s.object("List TikTok product reviews parameters.", {
      country: countryField,
      id: productIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_product_videos",
    "read",
    "/chuhaijiang/products/related-videos",
    18,
    "List videos associated with a TikTok product through LinkFox and Chuhaijiang.",
    s.object("List videos associated with a TikTok product parameters.", {
      country: countryField,
      id: productIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_most_promoted_products",
    "read",
    "/chuhaijiang/products/rankings/most-promoted",
    18,
    "List most-promoted TikTok product rankings through LinkFox and Chuhaijiang.",
    s.object("List most-promoted TikTok product rankings parameters.", {
      country: countryField,
      date: dateField,
      granularity: granularityField,
      page: s.optional(pageField),
      pageSize: s.optional(rankingPageSizeField),
      category: s.optional(categoryField),
      sellerType: s.optional(sellerTypeField),
      sort: s.optional(promotionRankingSortField),
    }),
  ),
  operation(
    "list_chuhaijiang_new_products",
    "read",
    "/chuhaijiang/products/rankings/new-arrivals",
    18,
    "List newly listed TikTok product rankings through LinkFox and Chuhaijiang.",
    s.object("List newly listed TikTok product rankings parameters.", {
      country: countryField,
      page: s.optional(pageField),
      pageSize: s.optional(rankingPageSizeField),
      category: s.optional(categoryField),
      sellerType: s.optional(sellerTypeField),
      listedFrom: s.optional(s.string("The earliest listing date in YYYYMMDD format.", { pattern: "^[0-9]{8}$" })),
      listedTo: s.optional(s.string("The latest listing date in YYYYMMDD format.", { pattern: "^[0-9]{8}$" })),
      productStatus: s.optional(s.stringEnum("The supplier product status code.", ["1", "2", "3", "4"])),
      sort: s.optional(
        s.string("The supplier sort expression in field:asc or field:desc format. Default: gmv_3d:desc.", {
          default: "gmv_3d:desc",
        }),
      ),
    }),
  ),
  operation(
    "list_chuhaijiang_top_selling_products",
    "read",
    "/chuhaijiang/products/rankings/top-selling",
    18,
    "List top-selling TikTok product rankings through LinkFox and Chuhaijiang.",
    s.object("List top-selling TikTok product rankings parameters.", {
      country: countryField,
      date: dateField,
      granularity: granularityField,
      page: s.optional(pageField),
      pageSize: s.optional(rankingPageSizeField),
      category: s.optional(categoryField),
      sellerType: s.optional(sellerTypeField),
      sort: s.optional(salesRankingSortField),
    }),
  ),
  operation(
    "search_chuhaijiang_products_by_image",
    "write",
    "/chuhaijiang/products/image-search",
    30,
    "Find visually similar TikTok products using an image URL or an uploaded object key through LinkFox and Chuhaijiang.",
    {
      ...s.object("Find visually similar TikTok products using an image URL or an uploaded object key parameters.", {
        osKey: s.optional(
          s.nonEmptyString("The uploaded object key returned as data.os_key by create_chuhaijiang_image_upload_url."),
        ),
        country: s.optional(
          s.string("The uppercase two-letter country code for image search; defaults to US.", {
            pattern: "^[A-Z]{2}$",
            default: "US",
          }),
        ),
        imageUrl: s.optional(
          url(
            "A public JPG or PNG image URL, at most 20 MiB. Connector downloads and uploads the image before searching. Supply exactly one of imageUrl and osKey.",
          ),
        ),
      }),
      oneOf: [{ required: ["osKey"] }, { required: ["imageUrl"] }],
    },
  ),
  operation(
    "create_chuhaijiang_image_upload_url",
    "write",
    "/chuhaijiang/upload/presigned-url",
    0,
    "Create a temporary upload URL for a JPG, JPEG or PNG image through LinkFox and Chuhaijiang.",
    s.object("Create a temporary upload URL for a JPG, JPEG or PNG image parameters.", {
      fileName: s.nonEmptyString("The image filename including its JPG, JPEG or PNG extension.", {
        pattern: "\\.[jJ][pP][eE]?[gG]$|\\.[pP][nN][gG]$",
      }),
    }),
    true,
  ),
  operation(
    "search_chuhaijiang_shops",
    "read",
    "/chuhaijiang/sellers/search",
    18,
    "Search TikTok shops through LinkFox and Chuhaijiang.",
    s.object("Search TikTok shops parameters.", {
      country: countryField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
      keyword: s.optional(keywordField),
      category: s.optional(categoryField),
      sellerType: s.optional(
        s.string("The supplier seller type: 1 overseas non-brand, 2 local, 3 brand, 4 non-brand."),
      ),
      minRating: s.optional(s.number("The minimum rating.")),
      maxRating: s.optional(s.number("The maximum rating.")),
      minSold7d: s.optional(minSold7dField),
      maxSold7d: s.optional(maxSold7dField),
      minGmv7d: s.optional(s.number("The minimum 7-day GMV.")),
      maxGmv7d: s.optional(s.number("The maximum 7-day GMV.")),
      sort: s.optional(gmv7dSortField),
    }),
  ),
  operation(
    "get_chuhaijiang_shop",
    "read",
    "/chuhaijiang/sellers/detail",
    9,
    "Get TikTok shop details through LinkFox and Chuhaijiang.",
    s.object("Get TikTok shop details parameters.", {
      country: countryField,
      id: shopIdField,
      include: s.optional(coreChannelIncludeField),
    }),
  ),
  operation(
    "list_chuhaijiang_shop_creators",
    "read",
    "/chuhaijiang/sellers/related-creators",
    18,
    "List creators associated with a TikTok shop through LinkFox and Chuhaijiang.",
    s.object("List creators associated with a TikTok shop parameters.", {
      country: countryField,
      id: shopIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_shop_products",
    "read",
    "/chuhaijiang/sellers/related-products",
    18,
    "List products associated with a TikTok shop through LinkFox and Chuhaijiang.",
    s.object("List products associated with a TikTok shop parameters.", {
      country: countryField,
      id: shopIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_shop_videos",
    "read",
    "/chuhaijiang/sellers/related-videos",
    18,
    "List videos associated with a TikTok shop through LinkFox and Chuhaijiang.",
    s.object("List videos associated with a TikTok shop parameters.", {
      country: countryField,
      id: shopIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_most_promoted_shops",
    "read",
    "/chuhaijiang/sellers/rankings/most-promoted",
    18,
    "List most-promoted TikTok shop rankings through LinkFox and Chuhaijiang.",
    s.object("List most-promoted TikTok shop rankings parameters.", {
      country: countryField,
      date: dateField,
      granularity: granularityField,
      page: s.optional(pageField),
      pageSize: s.optional(rankingPageSizeField),
      category: s.optional(categoryField),
      shopType: s.optional(shopTypeField),
      sort: s.optional(promotionRankingSortField),
    }),
  ),
  operation(
    "list_chuhaijiang_top_selling_shops",
    "read",
    "/chuhaijiang/sellers/rankings/top-selling",
    18,
    "List top-selling TikTok shop rankings through LinkFox and Chuhaijiang.",
    s.object("List top-selling TikTok shop rankings parameters.", {
      country: countryField,
      date: dateField,
      granularity: granularityField,
      page: s.optional(pageField),
      pageSize: s.optional(rankingPageSizeField),
      category: s.optional(categoryField),
      shopType: s.optional(shopTypeField),
      sort: s.optional(salesRankingSortField),
    }),
  ),
  operation(
    "search_chuhaijiang_videos",
    "read",
    "/chuhaijiang/videos/search",
    18,
    "Search TikTok videos through LinkFox and Chuhaijiang.",
    s.object("Search TikTok videos parameters.", {
      country: countryField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
      keyword: s.optional(keywordField),
      category: s.optional(categoryField),
      isCommercial: s.optional(isCommercialField),
      minViews: s.optional(minViewsField),
      maxViews: s.optional(maxViewsField),
      minLikes: s.optional(s.number("The minimum like count.")),
      maxLikes: s.optional(s.number("The maximum like count.")),
      minGmv30d: s.optional(minGmv30dField),
      maxGmv30d: s.optional(maxGmv30dField),
      minEngagement: s.optional(minEngagementField),
      maxEngagement: s.optional(maxEngagementField),
      accountType: s.optional(
        s.anyOf("The supplier account type: 0, 3, or 4.", [
          literal("The integer value 0.", 0),
          literal("The integer value 3.", 3),
          literal("The integer value 4.", 4),
        ]),
      ),
      sort: s.optional(
        s.string("The supplier sort expression in field:asc or field:desc format. Default: views:desc.", {
          default: "views:desc",
        }),
      ),
    }),
  ),
  operation(
    "get_chuhaijiang_video",
    "read",
    "/chuhaijiang/videos/detail",
    9,
    "Get TikTok video details through LinkFox and Chuhaijiang.",
    s.object("Get TikTok video details parameters.", {
      country: countryField,
      id: videoIdField,
      include: s.optional(coreIncludeField),
    }),
  ),
  operation(
    "list_chuhaijiang_video_products",
    "read",
    "/chuhaijiang/videos/related-products",
    18,
    "List products associated with a TikTok video through LinkFox and Chuhaijiang.",
    s.object("List products associated with a TikTok video parameters.", {
      country: countryField,
      id: videoIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
  operation(
    "list_chuhaijiang_video_reviews",
    "read",
    "/chuhaijiang/videos/reviews",
    18,
    "List TikTok video comments through LinkFox and Chuhaijiang.",
    s.object("List TikTok video comments parameters.", {
      country: countryField,
      id: videoIdField,
      page: s.optional(pageField),
      pageSize: s.optional(pageSizeField),
    }),
  ),
] as const;

export const chuhaijiangActions: ProviderActionDefinition[] = chuhaijiangOperations.map(({ action }) => action);
