import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "redfox";

const offsetSchema = s.nonNegativeInteger("Zero-based pagination offset.");
const sortTypeSchema = s.nonEmptyString("Sort type for this endpoint.");
const pageNumSchema = s.positiveInteger("One-based page number.");
const pageSizeSchema = s.positiveInteger("Number of results per page.");
const domesticPageSchema = s.integer("One-based page number.", { minimum: 1 });
const bilibiliPageSchema = s.nonEmptyString("One-based page number, encoded as a string.");
const domesticPageSizeSchema = s.integer("Number of results per page, up to 50.", {
  minimum: 1,
  maximum: 50,
});
const timeSchema = s.nonEmptyString("Time value used to filter results.");
const upstreamDataSchema = s.unknown("The RedFoxHub data payload returned by the endpoint.");

const redfoxOutputSchema = s.object("The RedFoxHub response wrapper returned by the endpoint.", {
  code: s.integer("RedFoxHub business status code. A value of 2000 means success."),
  msg: s.string("Message returned by RedFoxHub."),
  data: upstreamDataSchema,
});

const searchInputSchema = (description: string) =>
  s.object(
    description,
    {
      keyword: s.nonEmptyString("Keyword to search for."),
      offset: offsetSchema,
      sortType: sortTypeSchema,
    },
    {
      optional: ["offset", "sortType"],
    },
  );

const optionalIdInputSchema = (description: string, fields: Record<string, JsonSchema>) => ({
  ...s.object(description, fields, {
    optional: Object.keys(fields),
  }),
  anyOf: Object.keys(fields).map((field) => ({ required: [field] })),
});

const requireOneOfFields = (
  description: string,
  fields: Record<string, JsonSchema>,
  optional: string[],
  requiredOneOf: string[],
) => ({
  ...s.object(description, fields, { optional }),
  anyOf: requiredOneOf.map((field) => ({ required: [field] })),
});

const requiredWithOptionalInputSchema = (description: string, fields: Record<string, JsonSchema>, optional: string[]) =>
  s.object(description, fields, { optional });

const listDouyinUserWorksInputSchema = requireOneOfFields(
  "Input parameters for listing works published by a Douyin account.",
  {
    accountId: s.nonEmptyString("Douyin account identifier."),
    authorUrl: s.nonEmptyString("Douyin author page URL."),
    secUserId: s.nonEmptyString("Douyin sec_user_id."),
    offset: offsetSchema,
    sortType: sortTypeSchema,
  },
  ["accountId", "authorUrl", "secUserId", "offset", "sortType"],
  ["accountId", "authorUrl", "secUserId"],
);

const listWechatAccountArticlesInputSchema = s.object(
  "Input parameters for listing articles published by a WeChat Official Account.",
  {
    account: s.nonEmptyString("WeChat Official Account ID."),
    accountName: s.nonEmptyString("WeChat Official Account name."),
    offset: offsetSchema,
    sortType: sortTypeSchema,
    publishTimeStart: s.nonEmptyString("Earliest publish time to include."),
    publishTimeEnd: s.nonEmptyString("Latest publish time to include."),
  },
  {
    optional: ["accountName", "offset", "sortType", "publishTimeStart", "publishTimeEnd"],
  },
);

const tiktokUserSearchInputSchema = s.object("Input parameters for searching TikTok accounts.", {
  keyword: s.nonEmptyString("Keyword to search for."),
  cursor: s.nonNegativeInteger("TikTok search pagination cursor. Use 0 for the first page."),
});

const domesticWorkSortSchema = s.stringEnum("Sort order for the results.", ["综合", "最新", "最多点赞", "最多收藏"]);

const bilibiliWorkOrderSchema = s.stringEnum("Bilibili work sort order.", [
  "time",
  "play",
  "like",
  "comment",
  "favorite",
]);

const bilibiliAccountOrderSchema = s.stringEnum("Bilibili account sort order.", ["follower", "like"]);

const toutiaoCategorySchema = s.stringEnum("Toutiao content category.", [
  "profile_all",
  "pc_profile_article",
  "pc_profile_video",
  "pc_profile_ugc",
  "profile_wenda",
  "pc_profile_short_video",
]);

const xiaohongshuWorkSearchInputSchema = s.object(
  "Input parameters for searching Xiaohongshu works in the curated database.",
  {
    keyword: s.nonEmptyString("Keyword to search for."),
    noteTime: s.nonEmptyString("Publish time range, such as 一周内 or 不限."),
    sort: s.nonEmptyString("Sort order, such as 最多点赞 or 综合."),
    page: pageNumSchema,
    noteType: s.nonEmptyString("Xiaohongshu note type, such as 不限."),
  },
  {
    optional: ["noteTime", "sort", "page", "noteType"],
  },
);

const douyinAiCreationSearchInputSchema = s.object(
  "Input parameters for searching Douyin AI creation data.",
  {
    keyword: s.nonEmptyString("Keyword to search for."),
    pageNum: pageNumSchema,
    pageSize: pageSizeSchema,
    startTime: timeSchema,
    endTime: timeSchema,
  },
  {
    optional: ["pageNum", "pageSize", "startTime", "endTime"],
  },
);

const xiaohongshuAiCreationSearchInputSchema = s.object(
  "Input parameters for searching Xiaohongshu AI creation data.",
  {
    keyword: s.nonEmptyString("Keyword to search for."),
    pageNum: pageNumSchema,
    pageSize: pageSizeSchema,
    source: s.nonEmptyString("Source to include in the results."),
    startTime: timeSchema,
    endTime: timeSchema,
  },
  {
    optional: ["pageNum", "pageSize", "source"],
  },
);

const wechatAiCreationSearchInputSchema = s.object(
  "Input parameters for searching WeChat Official Account AI creation data.",
  {
    keyword: s.nonEmptyString("Keyword to search for."),
    pageNum: pageNumSchema,
    pageSize: pageSizeSchema,
    startTime: timeSchema,
    endTime: timeSchema,
  },
  {
    optional: ["startTime", "endTime"],
  },
);

export const redfoxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_douyin_works",
    operationType: "read",
    description: "Search Douyin works by keyword.",
    requiredScopes: [],
    inputSchema: searchInputSchema("Input parameters for searching Douyin works."),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_douyin_users",
    operationType: "read",
    description: "Search Douyin accounts by keyword.",
    requiredScopes: [],
    inputSchema: searchInputSchema("Input parameters for searching Douyin accounts."),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_douyin_work",
    operationType: "read",
    description: "Get a Douyin work by its ID or URL.",
    requiredScopes: [],
    inputSchema: optionalIdInputSchema("Input parameters for getting a Douyin work.", {
      workId: s.nonEmptyString("Douyin work ID."),
      workUrl: s.nonEmptyString("Douyin work URL."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_douyin_user",
    operationType: "read",
    description: "Get details about a Douyin account.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a Douyin account.", {
      accountId: s.nonEmptyString("Douyin account ID."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_douyin_user_works",
    operationType: "read",
    description: "List works published by a Douyin account.",
    requiredScopes: [],
    inputSchema: listDouyinUserWorksInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_douyin_ai_creations",
    operationType: "read",
    description: "Search Douyin works related to AI creation.",
    requiredScopes: [],
    inputSchema: douyinAiCreationSearchInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_xiaohongshu_works",
    operationType: "read",
    description: "Search Xiaohongshu works in the curated database.",
    requiredScopes: [],
    inputSchema: xiaohongshuWorkSearchInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_xiaohongshu_users",
    operationType: "read",
    description: "Search Xiaohongshu accounts by keyword.",
    requiredScopes: [],
    inputSchema: searchInputSchema("Input parameters for searching Xiaohongshu accounts."),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_xiaohongshu_work",
    operationType: "read",
    description: "Get a Xiaohongshu work by its ID or link.",
    requiredScopes: [],
    inputSchema: optionalIdInputSchema("Input parameters for getting a Xiaohongshu work.", {
      workId: s.nonEmptyString("Xiaohongshu work ID."),
      workLink: s.nonEmptyString("Xiaohongshu work link."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_xiaohongshu_user",
    operationType: "read",
    description: "Get details about a Xiaohongshu account.",
    requiredScopes: [],
    inputSchema: requiredWithOptionalInputSchema(
      "Input parameters for getting a Xiaohongshu account.",
      {
        accountId: s.nonEmptyString("Xiaohongshu account display ID."),
        userId: s.nonEmptyString("Xiaohongshu account primary user ID."),
      },
      ["userId"],
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_xiaohongshu_ai_creations",
    operationType: "read",
    description: "Search Xiaohongshu works related to AI creation.",
    requiredScopes: [],
    inputSchema: xiaohongshuAiCreationSearchInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_wechat_articles",
    operationType: "read",
    description: "Search WeChat Official Account articles by keyword.",
    requiredScopes: [],
    inputSchema: searchInputSchema("Input parameters for searching WeChat Official Account articles."),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_wechat_accounts",
    operationType: "read",
    description: "Search WeChat Official Accounts by keyword.",
    requiredScopes: [],
    inputSchema: searchInputSchema("Input parameters for searching WeChat Official Accounts."),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_wechat_article",
    operationType: "read",
    description: "Get a WeChat Official Account article by its UUID.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a WeChat Official Account article.", {
      workUuid: s.nonEmptyString("WeChat article UUID."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_wechat_article_by_url",
    operationType: "read",
    description: "Get a WeChat Official Account article by its URL.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a WeChat Official Account article by URL.", {
      url: s.nonEmptyString("WeChat article URL."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_wechat_account",
    operationType: "read",
    description: "Get details about a WeChat Official Account.",
    requiredScopes: [],
    inputSchema: requiredWithOptionalInputSchema(
      "Input parameters for getting a WeChat Official Account.",
      {
        account: s.nonEmptyString("WeChat Official Account ID."),
        accountName: s.nonEmptyString("WeChat Official Account name."),
      },
      ["accountName"],
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_wechat_account_articles",
    operationType: "read",
    description: "List articles published by a WeChat Official Account.",
    requiredScopes: [],
    inputSchema: listWechatAccountArticlesInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_wechat_ai_creations",
    operationType: "read",
    description: "Search WeChat Official Account articles related to AI creation.",
    requiredScopes: [],
    inputSchema: wechatAiCreationSearchInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_bilibili_works",
    operationType: "read",
    description: "Search Bilibili works by keyword.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Bilibili works.",
      {
        keyword: s.nonEmptyString("Keyword to search for."),
        exactMatch: s.boolean("Whether to require the complete phrase in the title or author."),
        page: bilibiliPageSchema,
        pageSize: domesticPageSizeSchema,
        order: bilibiliWorkOrderSchema,
      },
      { optional: ["exactMatch", "pageSize", "order"] },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_bilibili_users",
    operationType: "read",
    description: "Search Bilibili accounts by keyword.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Bilibili accounts.",
      {
        keyword: s.nonEmptyString("Keyword to search for."),
        page: bilibiliPageSchema,
        pageSize: domesticPageSizeSchema,
        order: bilibiliAccountOrderSchema,
      },
      { optional: ["pageSize", "order"] },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bilibili_work",
    operationType: "read",
    description: "Get a Bilibili work by its BV ID or URL.",
    requiredScopes: [],
    inputSchema: optionalIdInputSchema("Input parameters for getting a Bilibili work.", {
      bvId: s.nonEmptyString("Bilibili BV ID."),
      workUrl: s.nonEmptyString("Bilibili video URL or b23.tv short URL."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_bilibili_user",
    operationType: "read",
    description: "Get details about a Bilibili account.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a Bilibili account.", {
      mid: s.nonEmptyString("Bilibili account MID."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_bilibili_user_works",
    operationType: "read",
    description: "List works published by a Bilibili account.",
    requiredScopes: [],
    inputSchema: requireOneOfFields(
      "Input parameters for listing works published by a Bilibili account.",
      {
        mid: s.nonEmptyString("Bilibili account MID."),
        accountUrl: s.nonEmptyString("Bilibili account page URL."),
        page: domesticPageSchema,
        pageSize: domesticPageSizeSchema,
        order: bilibiliWorkOrderSchema,
      },
      ["mid", "accountUrl", "page", "pageSize", "order"],
      ["mid", "accountUrl"],
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_wechat_channel_works",
    operationType: "read",
    description: "Search WeChat Channel works by keyword.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching WeChat Channel works.",
      {
        keyword: s.nonEmptyString("Keyword to search for."),
        sort: domesticWorkSortSchema,
        page: domesticPageSchema,
        size: domesticPageSizeSchema,
        exactMatch: s.boolean("Whether to require the complete phrase in the content or author."),
      },
      { optional: ["sort", "page", "size", "exactMatch"] },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_wechat_channel_users",
    operationType: "read",
    description: "Search WeChat Channel accounts by name.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching WeChat Channel accounts.",
      {
        accountName: s.nonEmptyString("Account name to search for."),
        page: domesticPageSchema,
        pageSize: domesticPageSizeSchema,
      },
      { optional: ["page", "pageSize"] },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_wechat_channel_work",
    operationType: "read",
    description: "Get details about a WeChat Channel work.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a WeChat Channel work.", {
      videoId: s.nonEmptyString("WeChat Channel video ID."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_wechat_channel_user_works",
    operationType: "read",
    description: "List works published by a WeChat Channel account.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing works published by a WeChat Channel account.",
      {
        nickname: s.nonEmptyString("Exact WeChat Channel account nickname."),
        page: domesticPageSchema,
        size: domesticPageSizeSchema,
      },
      { optional: ["page", "size"] },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_kuaishou_works",
    operationType: "read",
    description: "Search Kuaishou works by keyword.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Kuaishou works.",
      {
        keyword: s.nonEmptyString("Keyword to search for."),
        page: domesticPageSchema,
        size: domesticPageSizeSchema,
        sort: domesticWorkSortSchema,
      },
      { optional: ["page", "size", "sort"] },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_kuaishou_users",
    operationType: "read",
    description: "Search Kuaishou accounts by name.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Kuaishou accounts.",
      {
        accountName: s.nonEmptyString("Account name to search for."),
        page: domesticPageSchema,
        pageSize: domesticPageSizeSchema,
      },
      { optional: ["page", "pageSize"] },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_kuaishou_work",
    operationType: "read",
    description: "Get details about a Kuaishou work.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a Kuaishou work.", {
      photoId: s.nonEmptyString("Kuaishou photo ID returned by a search or list action."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_kuaishou_user_works",
    operationType: "read",
    description: "List works published by a Kuaishou account.",
    requiredScopes: [],
    inputSchema: requireOneOfFields(
      "Input parameters for listing works published by a Kuaishou account.",
      {
        kwaiId: s.nonEmptyString("Kuaishou display ID returned by account search."),
        threeXId: s.nonEmptyString("Account ID contained in a Kuaishou profile URL."),
        page: domesticPageSchema,
        size: domesticPageSizeSchema,
      },
      ["kwaiId", "threeXId", "page", "size"],
      ["kwaiId", "threeXId"],
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_toutiao_works",
    operationType: "read",
    description: "Search Toutiao works by keyword.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for searching Toutiao works.", {
      keyword: s.nonEmptyString("Keyword to search for."),
      offset: s.nonEmptyString("Pagination offset. Use 0 for the first page."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_toutiao_users",
    operationType: "read",
    description: "Search Toutiao accounts by keyword.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for searching Toutiao accounts.",
      {
        name: s.nonEmptyString("Account name keyword to search for."),
        offset: s.nonEmptyString("Pagination offset returned by the previous page."),
        searchId: s.nonEmptyString("Search ID returned by the previous page."),
      },
      { optional: ["offset", "searchId"] },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_toutiao_work",
    operationType: "read",
    description: "Get details about a Toutiao work.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for getting a Toutiao work.", {
      opusId: s.nonEmptyString("Toutiao work ID."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_toutiao_work_comments",
    operationType: "read",
    description: "List comments on a Toutiao work.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for listing comments on a Toutiao work.",
      {
        opusId: s.nonEmptyString("Toutiao work ID."),
        offset: s.nonEmptyString("Pagination offset returned by the previous page."),
      },
      { optional: ["offset"] },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_toutiao_user_works",
    operationType: "read",
    description: "List works published by a Toutiao account.",
    requiredScopes: [],
    inputSchema: s.object("Input parameters for listing works published by a Toutiao account.", {
      category: toutiaoCategorySchema,
      token: s.nonEmptyString("Toutiao web account token found in the account page URL."),
      offset: s.nonEmptyString("Pagination offset. Use 0 for the first page."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_tiktok_users",
    operationType: "read",
    description: "Search TikTok accounts by keyword.",
    requiredScopes: [],
    inputSchema: tiktokUserSearchInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
];
