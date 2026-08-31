import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "echotik";

const languageSchema = s.stringEnum("Language used for EchoTik product category names.", [
  "th-TH",
  "en-US",
  "id-ID",
  "zh-CN",
  "ms-MY",
  "vi-VN",
]);

const regionSchema = s.string("Two-letter TikTok Shop region code, such as US or ID.", { minLength: 2, maxLength: 2 });

function inputIdentifierSchema(description: string) {
  return s.nonEmptyString(description, { maxLength: 256 });
}

const pageSchema = s.integer("One-based EchoTik result page.", {
  minimum: 1,
  maximum: 100_000,
  default: 1,
});

const pageSizeSchema = s.integer("Number of records to return, up to EchoTik's limit of 10.", {
  minimum: 1,
  maximum: 10,
  default: 10,
});

const sortOrderSchema = s.stringEnum("Sort direction for the requested records.", ["asc", "desc"]);

const categorySchema = s.object(
  "A normalized EchoTik product category.",
  {
    categoryId: s.nonEmptyString("EchoTik product category ID."),
    level: s.string("EchoTik category level, usually 1, 2, or 3."),
    name: s.string("Localized EchoTik category name."),
    language: s.string("Language returned for the category name."),
    parentId: s.string("Parent EchoTik category ID."),
  },
  { optional: ["level", "name", "language", "parentId"] },
);

const productCoverSchema = s.object(
  "One product cover entry decoded from EchoTik's encoded cover collection.",
  {
    url: s.nonEmptyString("EchoTik product cover URL."),
    index: s.integer("Provider-defined cover position."),
  },
  { optional: ["index"] },
);

const productSchema = s.object(
  "A normalized EchoTik product record.",
  {
    productId: s.nonEmptyString("TikTok Shop product ID."),
    productName: s.string("Product name recorded by EchoTik."),
    region: s.string("TikTok Shop region code associated with the product."),
    categoryId: s.string("EchoTik first-level product category ID."),
    categoryLevel2Id: s.string("EchoTik second-level product category ID."),
    categoryLevel3Id: s.string("EchoTik third-level product category ID."),
    sellerId: s.string("TikTok Shop seller ID associated with the product."),
    coverUrl: s.string("EchoTik product cover URL, which may require the cover resolver API."),
    coverUrls: s.array("Product covers decoded from EchoTik's encoded collection.", productCoverSchema),
    minimumPrice: s.number("Lowest SKU price reported by EchoTik."),
    maximumPrice: s.number("Highest SKU price reported by EchoTik."),
    averagePrice: s.number("Average SKU price reported by EchoTik."),
    commissionRate: s.number("Product commission rate reported by EchoTik."),
    rating: s.number("Product rating reported by EchoTik."),
    reviewCount: s.integer("Number of product reviews reported by EchoTik."),
    totalSales: s.integer("Total or ranking-period product sales reported by EchoTik."),
    sales30Days: s.integer("Product sales during the latest 30-day window."),
    totalGmv: s.number("Total or ranking-period product GMV estimated by EchoTik."),
    gmv30Days: s.number("Product GMV estimated for the latest 30-day window."),
    influencerCount: s.integer("Number of creators associated with the product."),
    videoCount: s.integer("Number of commerce videos associated with the product."),
    liveCount: s.integer("Number of live sessions associated with the product."),
  },
  {
    optional: [
      "productName",
      "region",
      "categoryId",
      "categoryLevel2Id",
      "categoryLevel3Id",
      "sellerId",
      "coverUrl",
      "coverUrls",
      "minimumPrice",
      "maximumPrice",
      "averagePrice",
      "commissionRate",
      "rating",
      "reviewCount",
      "totalSales",
      "sales30Days",
      "totalGmv",
      "gmv30Days",
      "influencerCount",
      "videoCount",
      "liveCount",
    ],
  },
);

const productRankingSchema = s.object(
  "A normalized EchoTik product ranking record whose sales and GMV are increments for the requested ranking period.",
  {
    productId: s.nonEmptyString("TikTok Shop product ID."),
    productName: s.string("Product name recorded by EchoTik."),
    region: s.string("TikTok Shop region code associated with the ranked product."),
    categoryId: s.string("EchoTik first-level product category ID."),
    categoryLevel2Id: s.string("EchoTik second-level product category ID."),
    categoryLevel3Id: s.string("EchoTik third-level product category ID."),
    minimumPrice: s.number("Lowest SKU price reported by EchoTik."),
    maximumPrice: s.number("Highest SKU price reported by EchoTik."),
    averagePrice: s.number("Average SKU price reported by EchoTik."),
    commissionRate: s.number("Product commission rate reported by EchoTik."),
    periodSales: s.integer("Product sales added during the requested ranking period."),
    periodGmv: s.number("Product GMV added during the requested ranking period."),
    influencerCount: s.integer("Number of creators associated with the ranked product."),
    videoCount: s.integer("Number of commerce videos associated with the ranked product."),
    liveCount: s.integer("Number of live sessions associated with the ranked product."),
  },
  {
    optional: [
      "productName",
      "region",
      "categoryId",
      "categoryLevel2Id",
      "categoryLevel3Id",
      "minimumPrice",
      "maximumPrice",
      "averagePrice",
      "commissionRate",
      "periodSales",
      "periodGmv",
      "influencerCount",
      "videoCount",
      "liveCount",
    ],
  },
);

const productTrendSchema = s.object(
  "One normalized EchoTik offline product trend snapshot.",
  {
    date: s.nonEmptyString("Snapshot date returned by EchoTik."),
    productId: s.string("TikTok Shop product ID associated with the snapshot."),
    averagePrice: s.number("Average SKU price at the snapshot."),
    dailySales: s.integer("Product sales added during the snapshot day."),
    totalSales: s.integer("Cumulative product sales at the snapshot."),
    dailyGmv: s.number("Product GMV added during the snapshot day."),
    totalGmv: s.number("Cumulative product GMV at the snapshot."),
    influencerCount: s.integer("Cumulative number of creators associated with the product."),
    videoCount: s.integer("Cumulative number of videos associated with the product."),
    liveCount: s.integer("Cumulative number of live sessions associated with the product."),
  },
  {
    optional: [
      "productId",
      "averagePrice",
      "dailySales",
      "totalSales",
      "dailyGmv",
      "totalGmv",
      "influencerCount",
      "videoCount",
      "liveCount",
    ],
  },
);

const productInfluencerSchema = s.object(
  "A normalized creator associated with an EchoTik product.",
  {
    userId: s.nonEmptyString("TikTok creator user ID."),
    productId: s.string("TikTok Shop product ID used for this relationship."),
    nickname: s.string("Creator nickname."),
    region: s.string("Creator region code."),
    category: s.string("Creator category recorded by EchoTik."),
    avatarUrl: s.string("EchoTik creator avatar URL."),
    followerCount: s.integer("Creator follower count."),
    likeCount: s.integer("Total creator likes."),
    productSales: s.integer("Product sales attributed to this creator by EchoTik."),
    productGmv: s.number("Product GMV attributed to this creator by EchoTik."),
    videoCount: s.integer("Total videos published by the creator."),
    videoViewCount: s.integer("Total creator video views."),
    liveCount: s.integer("Total live sessions associated with the creator."),
    liveViewCount: s.integer("Total creator live views."),
  },
  {
    optional: [
      "productId",
      "nickname",
      "region",
      "category",
      "avatarUrl",
      "followerCount",
      "likeCount",
      "productSales",
      "productGmv",
      "videoCount",
      "videoViewCount",
      "liveCount",
      "liveViewCount",
    ],
  },
);

const productVideoSchema = s.object(
  "A normalized commerce video associated with an EchoTik product.",
  {
    videoId: s.nonEmptyString("TikTok video ID."),
    productId: s.string("TikTok Shop product ID associated with the video."),
    userId: s.string("TikTok creator user ID associated with the video."),
    region: s.string("Video region code."),
    description: s.string("Video caption recorded by EchoTik."),
    createdAt: s.string("Video creation time returned by EchoTik."),
    durationSeconds: s.integer("Video duration in seconds."),
    playUrl: s.string("Video playback URL, which may expire."),
    coverUrl: s.string("Video cover URL."),
    viewCount: s.integer("Total video views."),
    likeCount: s.integer("Total video likes."),
    commentCount: s.integer("Total video comments."),
    shareCount: s.integer("Total video shares."),
    favoriteCount: s.integer("Total video favorites."),
    productSales: s.integer("Product sales attributed to the video by EchoTik."),
    productGmv: s.number("Product GMV attributed to the video by EchoTik."),
  },
  {
    optional: [
      "productId",
      "userId",
      "region",
      "description",
      "createdAt",
      "durationSeconds",
      "playUrl",
      "coverUrl",
      "viewCount",
      "likeCount",
      "commentCount",
      "shareCount",
      "favoriteCount",
      "productSales",
      "productGmv",
    ],
  },
);

const productLiveSchema = s.object(
  "A normalized live session associated with an EchoTik product.",
  {
    roomId: s.nonEmptyString("TikTok live room ID."),
    productId: s.string("TikTok Shop product ID associated with the live session."),
    productName: s.string("Product name recorded for the live session."),
    userId: s.string("TikTok creator user ID associated with the live session."),
    region: s.string("Live session region code."),
    createdAt: s.integer("Live session creation time returned by EchoTik."),
    liveType: s.stringEnum("Normalized live session owner type.", ["shop", "creator", "unknown"]),
    coverUrl: s.string("Live session cover URL."),
    sellerId: s.string("TikTok Shop seller ID associated with the live session."),
    sellerName: s.string("TikTok Shop seller name associated with the live session."),
    peakViewCount: s.integer("Peak concurrent live viewers."),
    totalViewCount: s.integer("Total live viewers."),
    productCount: s.integer("Number of products promoted during the live session."),
    productSales: s.integer("Product sales attributed to the live session by EchoTik."),
    productGmv: s.number("Product GMV attributed to the live session by EchoTik."),
  },
  {
    optional: [
      "productId",
      "productName",
      "userId",
      "region",
      "createdAt",
      "liveType",
      "coverUrl",
      "sellerId",
      "sellerName",
      "peakViewCount",
      "totalViewCount",
      "productCount",
      "productSales",
      "productGmv",
    ],
  },
);

const productCommentSchema = s.object(
  "A normalized EchoTik product review.",
  {
    reviewId: s.nonEmptyString("TikTok Shop review ID."),
    productId: s.string("TikTok Shop product ID associated with the review."),
    rating: s.integer("Integer product rating from 0 to 5."),
    text: s.string("Review text returned by EchoTik."),
    reviewedAt: s.integer("Review time as an epoch timestamp in milliseconds."),
    skuId: s.string("TikTok Shop SKU ID associated with the review."),
    skuSpecification: s.string("Human-readable SKU specification associated with the review."),
  },
  {
    optional: ["productId", "rating", "text", "reviewedAt", "skuId", "skuSpecification"],
  },
);

const categoryOverviewSchema = s.object(
  "A normalized EchoTik category market overview.",
  {
    categoryId: s.nonEmptyString("EchoTik first-level product category ID."),
    region: s.string("TikTok Shop region code associated with the category overview."),
    trend: s.string("EchoTik category trend classification."),
    priceTrend: s.string("EchoTik category price trend classification."),
    totalGmv: s.number("Cumulative category GMV estimated by EchoTik."),
    gmv1Day: s.number("Category GMV during the latest one-day window."),
    gmv7Days: s.number("Category GMV during the latest seven-day window."),
    gmv30Days: s.number("Category GMV during the latest 30-day window."),
    totalSales: s.integer("Cumulative category product sales estimated by EchoTik."),
    sales1Day: s.integer("Category product sales during the latest one-day window."),
    sales7Days: s.integer("Category product sales during the latest seven-day window."),
    sales30Days: s.integer("Category product sales during the latest 30-day window."),
    totalProducts: s.integer("Total products collected for the category."),
    products1Day: s.integer("Products added during the latest one-day window."),
    products7Days: s.integer("Products added during the latest seven-day window."),
    products30Days: s.integer("Products added during the latest 30-day window."),
    totalInfluencers: s.integer("Total creators associated with the category."),
    influencers1Day: s.integer("Creators added during the latest one-day window."),
    influencers7Days: s.integer("Creators added during the latest seven-day window."),
    influencers30Days: s.integer("Creators added during the latest 30-day window."),
    averagePrice: s.number("Current average product price in the category."),
    liveSales: s.integer("Cumulative live-commerce sales for the category."),
  },
  {
    optional: [
      "region",
      "trend",
      "priceTrend",
      "totalGmv",
      "gmv1Day",
      "gmv7Days",
      "gmv30Days",
      "totalSales",
      "sales1Day",
      "sales7Days",
      "sales30Days",
      "totalProducts",
      "products1Day",
      "products7Days",
      "products30Days",
      "totalInfluencers",
      "influencers1Day",
      "influencers7Days",
      "influencers30Days",
      "averagePrice",
      "liveSales",
    ],
  },
);

const categoryTrendSchema = s.object(
  "A normalized EchoTik category trend snapshot.",
  {
    date: s.nonEmptyString("Category trend snapshot date."),
    region: s.string("TikTok Shop region code associated with the snapshot."),
    categoryId: s.string("EchoTik first-level category ID."),
    categoryLevel2Id: s.string("EchoTik second-level category ID."),
    categoryLevel3Id: s.string("EchoTik third-level category ID."),
    dailySales: s.integer("Category sales during the snapshot day."),
    dailyGmv: s.number("Category GMV during the snapshot day."),
  },
  {
    optional: ["region", "categoryId", "categoryLevel2Id", "categoryLevel3Id", "dailySales", "dailyGmv"],
  },
);

const shopSchema = s.object(
  "A normalized EchoTik shop profile.",
  {
    shopId: s.nonEmptyString("TikTok Shop seller ID."),
    shopName: s.string("TikTok Shop seller name."),
    shopUrl: s.string("TikTok Shop seller URL."),
    region: s.string("TikTok Shop region code."),
    storeType: s.stringEnum("Normalized TikTok Shop seller type.", ["local", "cross_border", "unknown"]),
    coverUrl: s.string("EchoTik shop cover URL."),
    rating: s.number("Shop rating reported by EchoTik."),
    reviewCount: s.integer("Number of shop reviews reported by EchoTik."),
    positiveFeedbackRate: s.number("Positive shop feedback rate."),
    responseRate: s.number("Shop response rate."),
    followerCount: s.integer("Shop follower count."),
    productCount: s.integer("Number of products associated with the shop."),
    influencerCount: s.integer("Number of creators associated with the shop."),
    videoCount: s.integer("Number of commerce videos associated with the shop."),
    liveCount: s.integer("Number of live sessions associated with the shop."),
    totalSales: s.integer("Cumulative shop sales estimated by EchoTik."),
    sales30Days: s.integer("Shop sales during the latest 30-day window."),
    totalGmv: s.number("Cumulative shop GMV estimated by EchoTik."),
    gmv30Days: s.number("Shop GMV during the latest 30-day window."),
    averagePrice: s.number("Average shop product price reported by EchoTik."),
  },
  {
    optional: [
      "shopName",
      "shopUrl",
      "region",
      "storeType",
      "coverUrl",
      "rating",
      "reviewCount",
      "positiveFeedbackRate",
      "responseRate",
      "followerCount",
      "productCount",
      "influencerCount",
      "videoCount",
      "liveCount",
      "totalSales",
      "sales30Days",
      "totalGmv",
      "gmv30Days",
      "averagePrice",
    ],
  },
);

const influencerDetailSchema = s.object(
  "A normalized EchoTik creator profile.",
  {
    userId: s.nonEmptyString("TikTok creator user ID."),
    uniqueId: s.string("TikTok creator handle."),
    nickname: s.string("TikTok creator nickname."),
    signature: s.string("TikTok creator profile signature."),
    region: s.string("TikTok creator region code."),
    language: s.string("Primary creator language recorded by EchoTik."),
    gender: s.string("Gender classification estimated by EchoTik."),
    category: s.string("Creator category recorded by EchoTik."),
    avatarUrl: s.string("EchoTik creator avatar URL."),
    contactEmail: s.string("Creator contact email returned by EchoTik."),
    commerceScore: s.number("EchoTik creator commerce score."),
    interactionRate: s.number("Creator interaction rate reported by EchoTik."),
    followerCount: s.integer("Current creator follower count."),
    followerGrowth7Days: s.integer("Follower growth during the latest seven-day window."),
    followerGrowth30Days: s.integer("Follower growth during the latest 30-day window."),
    followingCount: s.integer("Number of accounts followed by the creator."),
    likeCount: s.integer("Total creator likes."),
    videoCount: s.integer("Total videos published by the creator."),
    liveCount: s.integer("Total live sessions associated with the creator."),
    productCount: s.integer("Total commerce products associated with the creator."),
    totalSales: s.integer("Cumulative creator-attributed product sales estimated by EchoTik."),
    totalGmv: s.number("Cumulative creator-attributed GMV estimated by EchoTik."),
    gmv30Days: s.number("Creator-attributed GMV during the latest 30-day window."),
    averageProductPrice30Days: s.number("Average creator-promoted product price over 30 days."),
    showcaseEnabled: s.boolean("Whether the creator has a TikTok Shop showcase."),
  },
  {
    optional: [
      "uniqueId",
      "nickname",
      "signature",
      "region",
      "language",
      "gender",
      "category",
      "avatarUrl",
      "contactEmail",
      "commerceScore",
      "interactionRate",
      "followerCount",
      "followerGrowth7Days",
      "followerGrowth30Days",
      "followingCount",
      "likeCount",
      "videoCount",
      "liveCount",
      "productCount",
      "totalSales",
      "totalGmv",
      "gmv30Days",
      "averageProductPrice30Days",
      "showcaseEnabled",
    ],
  },
);

const videoDetailSchema = s.object(
  "A normalized EchoTik video profile.",
  {
    videoId: s.nonEmptyString("TikTok video ID."),
    userId: s.string("TikTok creator user ID associated with the video."),
    uniqueId: s.string("TikTok creator handle associated with the video."),
    description: s.string("TikTok video caption."),
    region: s.string("Video region code."),
    createdAt: s.string("Video creation time returned by EchoTik."),
    durationSeconds: s.integer("Video duration in seconds."),
    coverUrl: s.string("EchoTik video cover URL."),
    createdByAi: s.boolean("Whether EchoTik marks the video as AI-created."),
    isAd: s.boolean("Whether EchoTik marks the video as an advertisement."),
    viewCount: s.integer("Total video views."),
    views7Days: s.integer("Video views added during the latest seven-day window."),
    views30Days: s.integer("Video views added during the latest 30-day window."),
    likeCount: s.integer("Total video likes."),
    likes7Days: s.integer("Video likes added during the latest seven-day window."),
    likes30Days: s.integer("Video likes added during the latest 30-day window."),
    commentCount: s.integer("Total video comments."),
    favoriteCount: s.integer("Total video favorites."),
    shareCount: s.integer("Total video shares."),
    productSales: s.integer("Product sales attributed to the video by EchoTik."),
    productGmv: s.number("Product GMV attributed to the video by EchoTik."),
  },
  {
    optional: [
      "userId",
      "uniqueId",
      "description",
      "region",
      "createdAt",
      "durationSeconds",
      "coverUrl",
      "createdByAi",
      "isAd",
      "viewCount",
      "views7Days",
      "views30Days",
      "likeCount",
      "likes7Days",
      "likes30Days",
      "commentCount",
      "favoriteCount",
      "shareCount",
      "productSales",
      "productGmv",
    ],
  },
);

const liveDetailSchema = s.object(
  "A normalized EchoTik live-session profile.",
  {
    roomId: s.nonEmptyString("TikTok live room ID."),
    userId: s.string("TikTok creator user ID associated with the live session."),
    uniqueId: s.string("TikTok creator handle associated with the live session."),
    nickname: s.string("TikTok creator nickname associated with the live session."),
    title: s.string("Live session title."),
    region: s.string("Live session region code."),
    status: s.stringEnum("Normalized live session status.", ["live", "ended", "unknown"]),
    liveType: s.stringEnum("Normalized live session owner type.", ["shop", "creator", "unknown"]),
    startedAt: s.integer("Live session creation time returned by EchoTik."),
    finishedAt: s.integer("Live session finish time returned by EchoTik."),
    durationSeconds: s.integer("Live session duration in seconds."),
    coverUrl: s.string("EchoTik live cover URL."),
    avatarUrl: s.string("EchoTik creator avatar URL."),
    peakViewCount: s.integer("Peak concurrent live viewers."),
    totalViewCount: s.integer("Total live viewers."),
    followerGrowthRate: s.number("Creator follower growth rate during the live session."),
    followerGrowthCount: s.integer("Creator followers added during the live session."),
    productCount: s.integer("Number of products promoted during the live session."),
    activeProductCount: s.integer("Number of promoted products with sales activity."),
    productSales: s.integer("Product sales attributed to the live session by EchoTik."),
    productGmv: s.number("Product GMV attributed to the live session by EchoTik."),
    averageProductPrice: s.number("Average promoted product price."),
    topProducts: s.string("Provider-defined top-product summary returned by EchoTik."),
  },
  {
    optional: [
      "userId",
      "uniqueId",
      "nickname",
      "title",
      "region",
      "status",
      "liveType",
      "startedAt",
      "finishedAt",
      "durationSeconds",
      "coverUrl",
      "avatarUrl",
      "peakViewCount",
      "totalViewCount",
      "followerGrowthRate",
      "followerGrowthCount",
      "productCount",
      "activeProductCount",
      "productSales",
      "productGmv",
      "averageProductPrice",
      "topProducts",
    ],
  },
);

function pageOutputSchema(
  description: string,
  itemDescription: string,
  itemSchema: JsonSchema,
  freshness: "offline" | "t_plus_1" = "offline",
) {
  return s.object(description, {
    items: s.array(itemDescription, itemSchema),
    page: s.integer("EchoTik page returned by the connector."),
    pageSize: s.integer("EchoTik page size returned by the connector."),
    freshness: s.literal(freshness, {
      description:
        freshness === "t_plus_1"
          ? "EchoTik documents this provider-collected dataset as T+1."
          : "The result comes from EchoTik's provider-collected offline dataset.",
    }),
    requestId: s.nullableString("EchoTik request identifier, when returned."),
  });
}

function offlineItemsOutputSchema(description: string, itemDescription: string, itemSchema: JsonSchema) {
  return s.object(description, {
    items: s.array(itemDescription, itemSchema),
    freshness: s.literal("offline", {
      description: "The result comes from EchoTik's provider-collected offline dataset.",
    }),
    requestId: s.nullableString("EchoTik request identifier, when returned."),
  });
}

const listProductsInputSchema = s.object(
  "Filters for browsing EchoTik's T+1 TikTok Shop product dataset.",
  {
    region: regionSchema,
    categoryId: inputIdentifierSchema("EchoTik first-level category ID."),
    categoryLevel2Id: inputIdentifierSchema("EchoTik second-level category ID."),
    categoryLevel3Id: inputIdentifierSchema("EchoTik third-level category ID."),
    salesTrend: s.stringEnum("Seven-day sales trend filter.", ["stable", "rising", "falling"]),
    minimumTotalSales: s.nonNegativeInteger("Minimum lifetime product sales."),
    maximumTotalSales: s.nonNegativeInteger("Maximum lifetime product sales."),
    minimumSales30Days: s.nonNegativeInteger("Minimum product sales in the latest 30 days."),
    maximumSales30Days: s.nonNegativeInteger("Maximum product sales in the latest 30 days."),
    minimumPrice: s.number("Minimum average SKU price.", { minimum: 0 }),
    maximumPrice: s.number("Maximum average SKU price.", { minimum: 0 }),
    minimumCommissionRate: s.number("Minimum product commission rate.", {
      minimum: 0,
    }),
    maximumCommissionRate: s.number("Maximum product commission rate.", {
      minimum: 0,
    }),
    minimumInfluencerCount: s.nonNegativeInteger("Minimum number of associated creators."),
    maximumInfluencerCount: s.nonNegativeInteger("Maximum number of associated creators."),
    minimumVideoCount: s.nonNegativeInteger("Minimum number of associated commerce videos."),
    maximumVideoCount: s.nonNegativeInteger("Maximum number of associated commerce videos."),
    minimumRating: s.number("Minimum product rating.", { minimum: 0 }),
    maximumRating: s.number("Maximum product rating.", { minimum: 0 }),
    minimumTotalGmv: s.number("Minimum lifetime product GMV.", {
      minimum: 0,
    }),
    maximumTotalGmv: s.number("Maximum lifetime product GMV.", {
      minimum: 0,
    }),
    minimumGmv30Days: s.number("Minimum product GMV in the latest 30 days.", {
      minimum: 0,
    }),
    maximumGmv30Days: s.number("Maximum product GMV in the latest 30 days.", {
      minimum: 0,
    }),
    salesChannel: s.stringEnum("Commerce channel associated with the product.", ["video", "live"]),
    storeType: s.stringEnum("TikTok Shop seller type.", ["local", "cross_border"]),
    managedShop: s.boolean("Whether to include only fully managed shops."),
    freeShipping: s.boolean("Whether to filter by free shipping."),
    listedOnly: s.boolean("Whether to include only products that EchoTik marks as listed."),
    hotProduct: s.boolean("Whether to filter by EchoTik's hot-product flag."),
    brandedStore: s.boolean("Whether to filter by EchoTik's branded-store flag."),
    sortBy: s.stringEnum("Product field used to order the result.", [
      "total_sales",
      "total_gmv",
      "average_price",
      "sales_7_days",
      "sales_30_days",
      "gmv_7_days",
      "gmv_30_days",
    ]),
    sortOrder: sortOrderSchema,
    page: pageSchema,
    pageSize: pageSizeSchema,
  },
  {
    optional: [
      "categoryId",
      "categoryLevel2Id",
      "categoryLevel3Id",
      "salesTrend",
      "minimumTotalSales",
      "maximumTotalSales",
      "minimumSales30Days",
      "maximumSales30Days",
      "minimumPrice",
      "maximumPrice",
      "minimumCommissionRate",
      "maximumCommissionRate",
      "minimumInfluencerCount",
      "maximumInfluencerCount",
      "minimumVideoCount",
      "maximumVideoCount",
      "minimumRating",
      "maximumRating",
      "minimumTotalGmv",
      "maximumTotalGmv",
      "minimumGmv30Days",
      "maximumGmv30Days",
      "salesChannel",
      "storeType",
      "managedShop",
      "freeShipping",
      "listedOnly",
      "hotProduct",
      "brandedStore",
      "sortBy",
      "sortOrder",
      "page",
      "pageSize",
    ],
  },
);

const productDateRangeInputSchema = s.object(
  "Date range and pagination for EchoTik product trend snapshots.",
  {
    productId: inputIdentifierSchema("TikTok Shop product ID."),
    startDate: s.date("Inclusive trend start date."),
    endDate: s.date("Inclusive trend end date."),
    page: pageSchema,
    pageSize: pageSizeSchema,
  },
  { optional: ["page", "pageSize"] },
);

const productVideoInputSchema = s.object(
  "Filters for videos associated with one EchoTik product.",
  {
    productId: inputIdentifierSchema("TikTok Shop product ID."),
    userId: inputIdentifierSchema("TikTok creator user ID used to filter videos."),
    createdFrom: s.nonNegativeInteger("Minimum video creation time as a Unix timestamp."),
    createdTo: s.nonNegativeInteger("Maximum video creation time as a Unix timestamp."),
    sortBy: s.stringEnum("Video field used to order the result.", [
      "views",
      "likes",
      "shares",
      "sales",
      "gmv",
      "created_at",
    ]),
    sortOrder: sortOrderSchema,
    page: pageSchema,
    pageSize: pageSizeSchema,
  },
  {
    optional: ["userId", "createdFrom", "createdTo", "sortBy", "sortOrder", "page", "pageSize"],
  },
);

const productLiveInputSchema = s.object(
  "Filters for live sessions associated with one EchoTik product.",
  {
    productId: inputIdentifierSchema("TikTok Shop product ID."),
    createdFrom: s.nonNegativeInteger("Minimum live creation time as a Unix timestamp."),
    createdTo: s.nonNegativeInteger("Maximum live creation time as a Unix timestamp."),
    sortBy: s.stringEnum("Live field used to order the result.", [
      "peak_views",
      "product_count",
      "sales",
      "gmv",
      "total_views",
    ]),
    sortOrder: sortOrderSchema,
    page: pageSchema,
    pageSize: pageSizeSchema,
  },
  {
    optional: ["createdFrom", "createdTo", "sortBy", "sortOrder", "page", "pageSize"],
  },
);

function idArraySchema(description: string, itemDescription: string) {
  return s.array(description, inputIdentifierSchema(itemDescription), {
    minItems: 1,
    maxItems: 10,
  });
}

const productCommentInputSchema = s.object(
  "Product review filters and pagination for EchoTik's offline review dataset.",
  {
    productId: inputIdentifierSchema("TikTok Shop product ID."),
    minimumRating: s.integer("Minimum integer product rating from 0 to 5.", {
      minimum: 0,
      maximum: 5,
    }),
    maximumRating: s.integer("Maximum integer product rating from 0 to 5.", {
      minimum: 0,
      maximum: 5,
    }),
    page: pageSchema,
    pageSize: pageSizeSchema,
  },
  { optional: ["minimumRating", "maximumRating", "page", "pageSize"] },
);

const categoryTrendInputSchema = s.object(
  "Region, category filters, date range, and pagination for EchoTik category trends.",
  {
    region: regionSchema,
    categoryId: inputIdentifierSchema("EchoTik first-level category ID."),
    categoryLevel2Id: inputIdentifierSchema("EchoTik second-level category ID."),
    categoryLevel3Id: inputIdentifierSchema("EchoTik third-level category ID."),
    startDate: s.date("Inclusive category trend start date."),
    endDate: s.date("Inclusive category trend end date."),
    page: pageSchema,
    pageSize: pageSizeSchema,
  },
  {
    optional: ["categoryId", "categoryLevel2Id", "categoryLevel3Id", "page", "pageSize"],
  },
);

const influencerDetailsInputSchema = s.object(
  "TikTok creator IDs or handles for EchoTik batch profile lookup.",
  {
    userIds: idArraySchema(
      "TikTok creator user IDs, with at most 10 IDs across the request.",
      "One TikTok creator user ID.",
    ),
    uniqueIds: idArraySchema(
      "TikTok creator handles, with at most 10 handles across the request.",
      "One TikTok creator handle.",
    ),
  },
  { optional: ["userIds", "uniqueIds"] },
);

const echotikActionDefinitions = [
  defineProviderAction(service, {
    name: "list_product_categories",
    description: "List EchoTik's localized TikTok Shop category dictionary at the first, second, or third level.",
    requiredScopes: [],
    inputSchema: s.object(
      "Category level and localization settings for the EchoTik category dictionary.",
      {
        level: s.integer("Category level to retrieve: 1, 2, or 3.", {
          minimum: 1,
          maximum: 3,
        }),
        language: languageSchema,
        parentCategoryId: inputIdentifierSchema(
          "Optional parent category ID used to narrow second- or third-level categories.",
        ),
      },
      { optional: ["parentCategoryId"] },
    ),
    outputSchema: s.object("Localized EchoTik product categories.", {
      items: s.array("Product categories returned by EchoTik.", categorySchema),
      requestId: s.nullableString("EchoTik request identifier, when returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "resolve_product_id",
    description: "Resolve a TikTok product share URL to the stable product ID used by EchoTik product actions.",
    requiredScopes: [],
    inputSchema: s.object("TikTok product share URL to resolve through EchoTik.", {
      shareUrl: s.string("TikTok product share URL, including supported TikTok short-link hosts.", {
        format: "uri",
        maxLength: 4096,
      }),
    }),
    outputSchema: s.object("Resolved TikTok Shop product identifier.", {
      productId: s.nonEmptyString("TikTok Shop product ID resolved by EchoTik."),
      freshness: s.literal("realtime", {
        description: "The product ID was resolved through an EchoTik realtime endpoint.",
      }),
      requestId: s.nullableString("EchoTik request identifier, when returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_products",
    description:
      "Browse EchoTik's T+1 TikTok Shop product dataset with category, sales, GMV, price, commission, store, and ranking filters.",
    requiredScopes: [],
    inputSchema: listProductsInputSchema,
    outputSchema: pageOutputSchema(
      "Paginated products from EchoTik's offline dataset.",
      "Products returned by EchoTik.",
      productSchema,
      "t_plus_1",
    ),
  }),
  defineProviderAction(service, {
    name: "list_product_comments",
    description: "List EchoTik's offline TikTok Shop product reviews with optional integer rating filters.",
    requiredScopes: [],
    inputSchema: productCommentInputSchema,
    outputSchema: pageOutputSchema(
      "Paginated product reviews from EchoTik's offline dataset.",
      "Product reviews returned by EchoTik.",
      productCommentSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_product_details",
    description: "Get EchoTik's detailed offline commerce profile for up to 10 TikTok Shop products in one request.",
    requiredScopes: [],
    inputSchema: s.object("TikTok Shop product IDs to retrieve from EchoTik.", {
      productIds: idArraySchema(
        "TikTok Shop product IDs, with at most 10 IDs per EchoTik request.",
        "One TikTok Shop product ID.",
      ),
    }),
    outputSchema: s.object("Detailed EchoTik product records.", {
      items: s.array("Detailed products returned by EchoTik.", productSchema),
      freshness: s.literal("offline", {
        description: "The result comes from EchoTik's provider-collected offline dataset.",
      }),
      requestId: s.nullableString("EchoTik request identifier, when returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_product_trend",
    description:
      "Get up to 180 days of EchoTik offline price, sales, GMV, creator, video, and live snapshots for one product.",
    requiredScopes: [],
    inputSchema: productDateRangeInputSchema,
    outputSchema: pageOutputSchema(
      "Paginated EchoTik product trend snapshots.",
      "Product trend snapshots returned by EchoTik.",
      productTrendSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_category_overview",
    description:
      "Get EchoTik's T+1 market-size, sales, GMV, product, creator, price, and live-commerce overview for one first-level category.",
    requiredScopes: [],
    inputSchema: s.object("First-level category and region for an EchoTik market overview.", {
      categoryId: inputIdentifierSchema("EchoTik first-level product category ID."),
      region: regionSchema,
    }),
    outputSchema: s.object("EchoTik category market overview.", {
      items: s.array("Category overview records returned by EchoTik.", categoryOverviewSchema),
      freshness: s.literal("t_plus_1", { description: "EchoTik documents category overviews as T+1 data." }),
      requestId: s.nullableString("EchoTik request identifier, when returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_category_trend",
    description:
      "Get EchoTik offline daily sales and GMV trend snapshots for a region and optional first-, second-, or third-level category filters.",
    requiredScopes: [],
    inputSchema: categoryTrendInputSchema,
    outputSchema: pageOutputSchema(
      "Paginated EchoTik category trend snapshots.",
      "Category trend snapshots returned by EchoTik.",
      categoryTrendSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "list_product_influencers",
    description: "List creators associated with an EchoTik product, including estimated attributed sales and GMV.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters for creators associated with one EchoTik product.",
      {
        productId: inputIdentifierSchema("TikTok Shop product ID."),
        sortBy: s.stringEnum("Creator field used to order the result.", [
          "followers",
          "likes",
          "product_sales",
          "product_gmv",
          "videos",
          "video_views",
          "live_views",
        ]),
        sortOrder: sortOrderSchema,
        page: pageSchema,
        pageSize: pageSizeSchema,
      },
      { optional: ["sortBy", "sortOrder", "page", "pageSize"] },
    ),
    outputSchema: pageOutputSchema(
      "Paginated creators associated with an EchoTik product.",
      "Creators returned by EchoTik.",
      productInfluencerSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "list_product_videos",
    description:
      "List offline commerce videos associated with an EchoTik product, including engagement and estimated sales performance.",
    requiredScopes: [],
    inputSchema: productVideoInputSchema,
    outputSchema: pageOutputSchema(
      "Paginated videos associated with an EchoTik product.",
      "Commerce videos returned by EchoTik.",
      productVideoSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "list_product_lives",
    description:
      "List offline live sessions associated with an EchoTik product, including audience and estimated sales performance.",
    requiredScopes: [],
    inputSchema: productLiveInputSchema,
    outputSchema: pageOutputSchema(
      "Paginated live sessions associated with an EchoTik product.",
      "Live sessions returned by EchoTik.",
      productLiveSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "list_product_rankings",
    description:
      "List EchoTik daily, weekly, or monthly TikTok Shop product rankings by sales or creator promotion growth.",
    requiredScopes: [],
    inputSchema: s.object(
      "Ranking date, region, metric, period, category filters, and pagination.",
      {
        date: s.date("Ranking date; use Monday for weekly rankings and the first day for monthly rankings."),
        region: regionSchema,
        metric: s.stringEnum("Ranking metric.", ["sales", "influencers"]),
        period: s.stringEnum("Ranking period.", ["daily", "weekly", "monthly"]),
        storeType: s.stringEnum("TikTok Shop seller type.", ["local", "cross_border"]),
        categoryId: inputIdentifierSchema("EchoTik first-level category ID."),
        categoryLevel2Id: inputIdentifierSchema("EchoTik second-level category ID."),
        categoryLevel3Id: inputIdentifierSchema("EchoTik third-level category ID."),
        page: pageSchema,
        pageSize: pageSizeSchema,
      },
      {
        optional: ["storeType", "categoryId", "categoryLevel2Id", "categoryLevel3Id", "page", "pageSize"],
      },
    ),
    outputSchema: s.object("Paginated EchoTik product ranking records and query context.", {
      items: s.array("Ranked products returned by EchoTik.", productRankingSchema),
      date: s.date("Ranking date requested from EchoTik."),
      region: regionSchema,
      metric: s.stringEnum("Ranking metric used for the result.", ["sales", "influencers"]),
      period: s.stringEnum("Ranking period used for the result.", ["daily", "weekly", "monthly"]),
      page: s.integer("EchoTik page returned by the connector."),
      pageSize: s.integer("EchoTik page size returned by the connector."),
      freshness: s.literal("offline", {
        description: "The ranking comes from EchoTik's provider-collected offline dataset.",
      }),
      requestId: s.nullableString("EchoTik request identifier, when returned."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_shop_details",
    description:
      "Get EchoTik's offline TikTok Shop profile for a seller discovered through product or proxy workflows.",
    requiredScopes: [],
    inputSchema: s.object("TikTok Shop seller to retrieve from EchoTik.", {
      shopId: inputIdentifierSchema("TikTok Shop seller ID."),
    }),
    outputSchema: offlineItemsOutputSchema("Detailed EchoTik shop records.", "Shops returned by EchoTik.", shopSchema),
  }),
  defineProviderAction(service, {
    name: "get_influencer_details",
    description: "Get EchoTik's offline creator profiles for up to 10 TikTok user IDs or handles in one request.",
    requiredScopes: [],
    inputSchema: influencerDetailsInputSchema,
    outputSchema: offlineItemsOutputSchema(
      "Detailed EchoTik creator records.",
      "Creators returned by EchoTik.",
      influencerDetailSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_video_details",
    description: "Get EchoTik's offline engagement and commerce profiles for up to 10 TikTok videos in one request.",
    requiredScopes: [],
    inputSchema: s.object("TikTok video IDs to retrieve from EchoTik.", {
      videoIds: idArraySchema("TikTok video IDs, with at most 10 IDs per EchoTik request.", "One TikTok video ID."),
    }),
    outputSchema: offlineItemsOutputSchema(
      "Detailed EchoTik video records.",
      "Videos returned by EchoTik.",
      videoDetailSchema,
    ),
  }),
  defineProviderAction(service, {
    name: "get_live_details",
    description: "Get EchoTik's offline audience and commerce profiles for up to 10 TikTok live rooms in one request.",
    requiredScopes: [],
    inputSchema: s.object("TikTok live room IDs to retrieve from EchoTik.", {
      roomIds: idArraySchema(
        "TikTok live room IDs, conservatively limited to 10 IDs per connector request.",
        "One TikTok live room ID.",
      ),
    }),
    outputSchema: offlineItemsOutputSchema(
      "Detailed EchoTik live-session records.",
      "Live sessions returned by EchoTik.",
      liveDetailSchema,
    ),
  }),
];

export const echotikActions: ActionDefinition[] = echotikActionDefinitions;
