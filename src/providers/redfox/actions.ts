import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "redfox";

const offsetSchema = s.nonNegativeInteger("Zero-based pagination offset accepted by RedFoxHub.");
const sortTypeSchema = s.nonEmptyString("Sort type accepted by RedFoxHub for this endpoint.");
const pageNumSchema = s.positiveInteger("One-based page number accepted by RedFoxHub.");
const pageSizeSchema = s.positiveInteger("Page size accepted by RedFoxHub.");
const timeSchema = s.nonEmptyString("Time value accepted by RedFoxHub.");
const upstreamDataSchema = s.unknown("The RedFoxHub data payload returned by the endpoint.");

const redfoxOutputSchema = s.object(
  {
    code: s.integer("RedFoxHub business status code. A value of 2000 means success."),
    msg: s.string("Message returned by RedFoxHub."),
    data: upstreamDataSchema,
  },
  { description: "The RedFoxHub response wrapper returned by the endpoint." },
);

function searchInputSchema(description: string) {
  return s.object(
    {
      keyword: s.nonEmptyString("Search keyword sent to RedFoxHub."),
      offset: offsetSchema,
      sortType: sortTypeSchema,
    },
    { optional: ["offset", "sortType"], description },
  );
}

function optionalIdInputSchema(description: string, fields: Record<string, ReturnType<typeof s.nonEmptyString>>) {
  return s.object(fields, {
    optional: Object.keys(fields),
    description: `${description} Provide at least one identifier.`,
  });
}

function requiredWithOptionalInputSchema(
  description: string,
  fields: Record<string, ReturnType<typeof s.nonEmptyString>>,
  optional: string[],
) {
  return s.object(fields, { optional, description });
}

const listDouyinUserWorksInputSchema = s.object(
  {
    accountId: s.nonEmptyString("Douyin account identifier accepted by RedFoxHub."),
    authorUrl: s.nonEmptyString("Douyin author page URL accepted by RedFoxHub."),
    secUserId: s.nonEmptyString("Douyin sec_user_id accepted by RedFoxHub."),
    offset: offsetSchema,
    sortType: sortTypeSchema,
  },
  {
    optional: ["accountId", "authorUrl", "secUserId", "offset", "sortType"],
    description:
      "Input parameters for listing Douyin works published by an account through RedFoxHub. accountId, authorUrl, or secUserId is required.",
  },
);

const listWechatAccountArticlesInputSchema = s.object(
  {
    account: s.nonEmptyString("WeChat Official Account ID accepted by RedFoxHub."),
    accountName: s.nonEmptyString("WeChat Official Account name accepted by RedFoxHub."),
    offset: offsetSchema,
    sortType: sortTypeSchema,
    publishTimeStart: s.nonEmptyString("Earliest publish time accepted by RedFoxHub."),
    publishTimeEnd: s.nonEmptyString("Latest publish time accepted by RedFoxHub."),
  },
  {
    optional: ["accountName", "offset", "sortType", "publishTimeStart", "publishTimeEnd"],
    description: "Input parameters for listing WeChat Official Account articles through RedFoxHub.",
  },
);

const tiktokUserSearchInputSchema = s.object(
  {
    keyword: s.nonEmptyString("Search keyword sent to RedFoxHub."),
    cursor: s.nonNegativeInteger("TikTok search pagination cursor. Use 0 for the first page."),
  },
  { description: "Input parameters for searching TikTok accounts through RedFoxHub." },
);

const douyinAiCreationSearchInputSchema = s.object(
  {
    keyword: s.nonEmptyString("Search keyword sent to RedFoxHub."),
    pageNum: pageNumSchema,
    pageSize: pageSizeSchema,
    startTime: timeSchema,
    endTime: timeSchema,
  },
  {
    optional: ["pageNum", "pageSize", "startTime", "endTime"],
    description: "Input parameters for searching Douyin AI creation data through RedFoxHub.",
  },
);

const xiaohongshuAiCreationSearchInputSchema = s.object(
  {
    keyword: s.nonEmptyString("Search keyword sent to RedFoxHub."),
    pageNum: pageNumSchema,
    pageSize: pageSizeSchema,
    source: s.nonEmptyString("Source filter accepted by RedFoxHub."),
    startTime: timeSchema,
    endTime: timeSchema,
  },
  {
    optional: ["pageNum", "pageSize", "source"],
    description: "Input parameters for searching Xiaohongshu AI creation data through RedFoxHub.",
  },
);

const wechatAiCreationSearchInputSchema = s.object(
  {
    keyword: s.nonEmptyString("Search keyword sent to RedFoxHub."),
    pageNum: pageNumSchema,
    pageSize: pageSizeSchema,
    startTime: timeSchema,
    endTime: timeSchema,
  },
  {
    optional: ["startTime", "endTime"],
    description: "Input parameters for searching WeChat Official Account AI creation data through RedFoxHub.",
  },
);

export const redfoxActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_douyin_works",
    description: "Search Douyin works through RedFoxHub and return the upstream result payload.",
    inputSchema: searchInputSchema("Input parameters for searching Douyin works through RedFoxHub."),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_douyin_users",
    description: "Search Douyin accounts through RedFoxHub and return the upstream result payload.",
    inputSchema: searchInputSchema("Input parameters for searching Douyin accounts through RedFoxHub."),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_douyin_work",
    description: "Fetch a Douyin work detail payload through RedFoxHub by work ID or work URL.",
    inputSchema: optionalIdInputSchema("Input parameters for fetching a Douyin work through RedFoxHub.", {
      workId: s.nonEmptyString("Douyin work ID accepted by RedFoxHub."),
      workUrl: s.nonEmptyString("Douyin work URL accepted by RedFoxHub."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_douyin_user",
    description: "Fetch a Douyin account detail payload through RedFoxHub.",
    inputSchema: s.object(
      {
        accountId: s.nonEmptyString("Douyin account ID accepted by RedFoxHub."),
      },
      { description: "Input parameters for fetching a Douyin account through RedFoxHub." },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_douyin_user_works",
    description: "List works published by a Douyin account through RedFoxHub.",
    inputSchema: listDouyinUserWorksInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_douyin_ai_creations",
    description: "Search Douyin AI creation data through RedFoxHub.",
    inputSchema: douyinAiCreationSearchInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_xiaohongshu_works",
    description: "Search Xiaohongshu works in the RedFoxHub curated database and return matching works.",
    inputSchema: s.object(
      {
        keyword: s.nonEmptyString("Search keyword sent to RedFoxHub."),
        noteTime: s.optional(s.nonEmptyString("Publish time range accepted by RedFoxHub, such as 一周内 or 不限.")),
        sort: s.optional(s.nonEmptyString("Sort order accepted by RedFoxHub, such as 最多点赞 or 综合.")),
        page: s.optional(s.positiveInteger("Page number to return.")),
        noteType: s.optional(s.nonEmptyString("Xiaohongshu note type accepted by RedFoxHub, such as 不限.")),
      },
      { description: "Input parameters for searching Xiaohongshu works in the RedFoxHub curated database." },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_xiaohongshu_users",
    description: "Search Xiaohongshu accounts through RedFoxHub and return the upstream result payload.",
    inputSchema: searchInputSchema("Input parameters for searching Xiaohongshu accounts through RedFoxHub."),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_xiaohongshu_work",
    description: "Fetch a Xiaohongshu work detail payload through RedFoxHub by work ID or link.",
    inputSchema: optionalIdInputSchema("Input parameters for fetching a Xiaohongshu work through RedFoxHub.", {
      workId: s.nonEmptyString("Xiaohongshu work ID accepted by RedFoxHub."),
      workLink: s.nonEmptyString("Xiaohongshu work link accepted by RedFoxHub."),
    }),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_xiaohongshu_user",
    description: "Fetch a Xiaohongshu account detail payload through RedFoxHub.",
    inputSchema: requiredWithOptionalInputSchema(
      "Input parameters for fetching a Xiaohongshu account through RedFoxHub.",
      {
        accountId: s.nonEmptyString("Xiaohongshu account display ID accepted by RedFoxHub."),
        userId: s.nonEmptyString("Xiaohongshu account primary user ID accepted by RedFoxHub."),
      },
      ["userId"],
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_xiaohongshu_ai_creations",
    description: "Search Xiaohongshu AI creation data through RedFoxHub.",
    inputSchema: xiaohongshuAiCreationSearchInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_wechat_articles",
    description: "Search WeChat Official Account articles through RedFoxHub and return the upstream payload.",
    inputSchema: searchInputSchema(
      "Input parameters for searching WeChat Official Account articles through RedFoxHub.",
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_wechat_accounts",
    description: "Search WeChat Official Accounts through RedFoxHub and return the upstream payload.",
    inputSchema: searchInputSchema("Input parameters for searching WeChat Official Accounts through RedFoxHub."),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_wechat_article",
    description: "Fetch a WeChat Official Account article payload through RedFoxHub.",
    inputSchema: s.object(
      {
        workUuid: s.nonEmptyString("WeChat article UUID accepted by RedFoxHub."),
      },
      { description: "Input parameters for fetching a WeChat Official Account article through RedFoxHub." },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_wechat_article_by_url",
    description: "Fetch WeChat Official Account article data through RedFoxHub by article URL.",
    inputSchema: s.object(
      {
        url: s.nonEmptyString("WeChat article URL accepted by RedFoxHub."),
      },
      { description: "Input parameters for fetching WeChat Official Account article data by URL through RedFoxHub." },
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_wechat_account",
    description: "Fetch a WeChat Official Account detail payload through RedFoxHub.",
    inputSchema: requiredWithOptionalInputSchema(
      "Input parameters for fetching a WeChat Official Account through RedFoxHub.",
      {
        account: s.nonEmptyString("WeChat Official Account ID accepted by RedFoxHub."),
        accountName: s.nonEmptyString("WeChat Official Account name accepted by RedFoxHub."),
      },
      ["accountName"],
    ),
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_wechat_account_articles",
    description: "List articles published by a WeChat Official Account through RedFoxHub.",
    inputSchema: listWechatAccountArticlesInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_wechat_ai_creations",
    description: "Search WeChat Official Account AI creation data through RedFoxHub.",
    inputSchema: wechatAiCreationSearchInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_tiktok_users",
    description: "Search TikTok accounts through RedFoxHub.",
    inputSchema: tiktokUserSearchInputSchema,
    outputSchema: redfoxOutputSchema,
  }),
];
