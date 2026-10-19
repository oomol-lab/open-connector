import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { chuhaijiangOperations } from "./chuhaijiang-actions.ts";
import { normalizeChuhaijiang, searchChuhaijiangImage } from "./chuhaijiang-runtime.ts";
import { mercadoOperations } from "./mercado-actions.ts";
import { seerfarOperations } from "./seerfar-actions.ts";
import { sifOperations } from "./sif-actions.ts";
import { zhihuiyaOperations } from "./zhihuiya-actions.ts";
import { validateZhihuiyaInput } from "./zhihuiya-runtime.ts";

const zhihuiyaOperationsByName = new Map<string, { path: string }>(
  zhihuiyaOperations.map(({ action, path }) => [action.name, { path }]),
);

const chuhaijiangOperationsByName = new Map<string, (typeof chuhaijiangOperations)[number]>(
  chuhaijiangOperations.map((operation) => [operation.action.name, operation]),
);

export const linkfoxApiBaseUrl = "https://tool-gateway.linkfox.com";

const linkfoxRequestTimeoutMs = 120_000;
const storeReportPath = "reports/2021-06-30/reports";
const adsReportPath = "reporting/reports";
const adsReportContentType = "application/vnd.createasyncreportrequest.v3+json";
const spCampaignContentType = "application/vnd.spcampaign.v3+json";
const reportPollingBudgetMs = 10 * 60 * 1000;

type LinkfoxRequestPhase = "validate" | "execute";
type ActionInput = Record<string, unknown>;
type ActionHandler = (
  input: ActionInput,
  context: { apiKey: string; fetcher: typeof fetch; signal?: AbortSignal },
) => Promise<unknown>;

interface DirectOperation {
  path: string;
  timeoutMs?: number;
  method?: "GET" | "POST";
  gatewayBusinessCodeOnly?: boolean;
  buildBody?: (input: ActionInput) => ActionInput;
  normalize: (payload: unknown) => unknown;
}

const directOperations: Record<string, DirectOperation> = {
  ...Object.fromEntries(
    mercadoOperations.map(({ action, toolName }) => [
      action.name,
      {
        path: "/mercado/productSelection",
        timeoutMs: 150_000,
        buildBody: (input: ActionInput) => ({ toolName, arguments: input }),
        normalize: (payload: unknown) => requiredResponseRecord(payload, "LinkFox Mercado response"),
      },
    ]),
  ),
  ...Object.fromEntries(
    seerfarOperations.map(({ action, path }) => [
      action.name,
      {
        path,
        normalize: (payload: unknown) => requiredResponseRecord(payload, "LinkFox Seerfar response"),
      },
    ]),
  ),
  ...Object.fromEntries(
    sifOperations.map(({ action, path }) => [
      action.name,
      { path, gatewayBusinessCodeOnly: true, normalize: normalizeSifResult },
    ]),
  ),
  get_current_account: {
    path: "/account/currentByAPI",
    method: "GET",
    normalize: normalizeAccount,
  },
  search_amazon_products: {
    path: "/amazon/search",
    normalize: normalizeProductList,
  },
  get_amazon_product: {
    path: "/amazon/product/detail",
    normalize: normalizeProductList,
  },
  search_amazon_by_image: {
    path: "/amazon/searchByImage",
    normalize: normalizeProductList,
  },
  list_amazon_product_reviews: {
    path: "/amazon/reviews/list",
    normalize: normalizeReviews,
  },
  query_amazon_aba: {
    path: "/aba/intelligentQuery",
    normalize: normalizeAba,
  },
  search_amazon_opportunities: {
    path: "/amazon/opportunity/searchByMetrics",
    normalize: normalizeOpportunities,
  },
  get_amazon_opportunity_report: {
    path: "/amazon/opportunity/reportByKeyword",
    normalize: normalizeOpportunityReport,
  },
  list_amazon_policy_updates: {
    path: "/amazon/policyFeed",
    normalize: normalizeDataList,
  },
  get_amazon_policy_update: {
    path: "/amazon/policyFeedDetail",
    normalize: normalizeDetail,
  },
  ask_amazon_alexa: {
    path: "/amazon/alexaSearch",
    normalize: normalizeAlexa,
  },
  search_1688_products: {
    path: "/dld/productSearch",
    normalize: normalizeProductList,
  },
  list_1688_hot_products: {
    path: "/dld/productBillboard",
    normalize: normalizeProductList,
  },
  search_1688_by_image: {
    path: "/alibaba1688/imageSearch",
    normalize: normalizeProductList,
  },
  get_1688_product: {
    path: "/alibaba1688/productDetail",
    normalize: normalizeDetail,
  },
  search_ebay_products: {
    path: "/ebay/search",
    normalize: normalizeProductList,
  },
  search_echotik_products: {
    path: "/echotik/listProduct",
    normalize: normalizeProductList,
  },
  get_echotik_products: {
    path: "/echotik/batchProductDetail",
    normalize: normalizeProductList,
  },
  get_echotik_videos: {
    path: "/echotik/batchVideoDetail",
    normalize: normalizeVideoList,
  },
  get_echotik_video_download: {
    path: "/echotik/getVideoDownloadUrl",
    normalize: normalizeDetail,
  },
  list_echotik_new_products: {
    path: "/echotik/listNewProductRank",
    normalize: normalizeProductList,
  },
  search_echotik_sellers: {
    path: "/echotik/listSeller",
    normalize: normalizeSellerList,
  },
  list_echotik_seller_products: {
    path: "/echotik/listSellerProduct",
    normalize: normalizeProductList,
  },
  search_echotik_videos: {
    path: "/echotik/listVideo",
    normalize: normalizeVideoList,
  },
  list_echotik_video_rankings: {
    path: "/echotik/listVideoRank",
    normalize: normalizeVideoList,
  },
  list_echotik_product_videos: {
    path: "/echotik/listProductVideo",
    normalize: normalizeVideoList,
  },
  get_echotik_seller: {
    path: "/echotik/sellerDetail",
    normalize: normalizeDetail,
  },
  get_tiktok_shop_product: {
    path: "/tiktok/shop/product/detail",
    normalize: normalizeDataList,
  },
  search_fastmoss_products: {
    path: "/fastmoss/productSearch",
    normalize: normalizeProductList,
  },
  list_fastmoss_top_selling_products: {
    path: "/fastmoss/productRankTopSelling",
    normalize: normalizeProductList,
  },
  list_kalodata_products: {
    path: "/kalodata/product/rank",
    normalize: normalizeProductList,
  },
  get_kalodata_product: {
    path: "/kalodata/product/detail",
    normalize: normalizeProductList,
  },
  get_amazon_store_authorization_url: {
    path: "/spApi/authorizeUrl",
    normalize: normalizeAuthorizationUrl,
  },
  list_authorized_amazon_stores: {
    path: "/spApi/authorizedStores",
    normalize: normalizeStores,
  },
  get_amazon_ads_authorization_url: {
    path: "/amazonAds/authorizeUrl",
    normalize: normalizeAuthorizationUrl,
  },
  list_authorized_amazon_ads_accounts: {
    path: "/amazonAds/authorizedStores",
    normalize: normalizeStores,
  },
  list_amazon_ads_profiles: {
    path: "/amazonAds/profiles",
    normalize: normalizeAdsProfiles,
  },
  check_text_trademark_risk: {
    path: "/ruiguan/textTrademarkDetection",
    normalize: normalizeTextTrademark,
  },
  check_copyright_risk: {
    path: "/ruiguan/copyrightDetection",
    buildBody: (input) => ({ topNumber: 100, enableRadar: true, ...input }),
    normalize: normalizeCompliance,
  },
  check_design_patent_risk: {
    path: "/ruiguan/detectionPatentDesign",
    buildBody: (input) => ({
      queryMode: "hybrid",
      topNumber: 100,
      regions: "US",
      patentStatus: "1",
      enableRadar: true,
      ...input,
    }),
    normalize: normalizeCompliance,
  },
  check_image_policy_compliance: {
    path: "/ruiguan/gunPartsSearch",
    normalize: normalizeCompliance,
  },
  check_graphic_trademark_risk: {
    path: "/ruiguan/trademarkGraphicDetection",
    buildBody: (input) => ({ enableLocalizing: false, enableRadar: true, ...input }),
    normalize: normalizeGraphicTrademark,
  },
  check_utility_patent_risk: {
    path: "/ruiguan/utilityPatentDetection",
    normalize: normalizeCompliance,
  },
  list_ozon_brand_products: {
    path: "/mpstats/ozon/brandProducts",
    normalize: normalizeOzonProducts,
  },
  list_ozon_category_products: {
    path: "/mpstats/ozon/categoryProducts",
    normalize: normalizeOzonProducts,
  },
  get_ozon_product: {
    path: "/mpstats/ozon/productDetail",
    normalize: normalizeOzonProducts,
  },
  search_ozon_products: {
    path: "/mpstats/ozon/productSearch",
    normalize: normalizeOzonProducts,
  },
  get_ozon_product_trend: {
    path: "/mpstats/ozon/productTrend",
    normalize: normalizeOzonTrend,
  },
  list_ozon_seller_products: {
    path: "/mpstats/ozon/sellerProducts",
    normalize: normalizeOzonProducts,
  },
  search_etsy_categories: {
    path: "/ehunt/etsy/etsyCategorySearch",
    normalize: normalizeEtsyCategories,
  },
  get_etsy_product: {
    path: "/etsy/product/detail",
    normalize: normalizeEtsyProduct,
  },
  search_etsy_products: {
    path: "/ehunt/etsy/productQuery",
    normalize: normalizeEtsyProducts,
  },
  search_etsy_stores: {
    path: "/ehunt/etsy/storeQuery",
    normalize: normalizeEtsyStores,
  },
  check_product_tro_risk: {
    path: "/maidalv/checkApiFlash",
    timeoutMs: 150_000,
    buildBody: (input) => ({ language: "zh", ...input }),
    normalize: (payload) => requiredResponseRecord(payload, "LinkFox Maidalv response"),
  },
};

const customHandlers: Partial<Record<string, ActionHandler>> = {
  search_amazon_store_orders: executeOrderSearch,
  get_amazon_store_report: executeStoreReport,
  list_sp_campaigns: executeSpCampaignList,
  get_amazon_ads_report: executeAdsReport,
};

export async function validateLinkfoxCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestLinkfoxPayload(
    "/account/currentByAPI",
    { method: "GET" },
    apiKey,
    fetcher,
    "validate",
    true,
    signal,
  );
  const account = optionalRecord(payload);
  const creditsInsufficient = readBusinessCode(payload) === 402;
  const accountId = creditsInsufficient ? undefined : readString(account?.id);
  const nickname = creditsInsufficient ? undefined : readString(account?.nickName);

  return {
    profile: { accountId, displayName: nickname ?? "LinkFox API Key" },
    metadata: {
      apiBaseUrl: linkfoxApiBaseUrl,
      validationEndpoint: "/account/currentByAPI",
    },
  };
}

export async function executeLinkfoxAction(
  actionName: string,
  input: ActionInput,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
): Promise<unknown> {
  validateLinkfoxActionInput(actionName, input);
  const zhihuiya = zhihuiyaOperationsByName.get(actionName);
  if (zhihuiya) {
    validateZhihuiyaInput(zhihuiya.path, input);
    return requiredResponseRecord(
      await requestLinkfoxPayload(
        zhihuiya.path,
        { method: "POST", body: input },
        apiKey,
        fetcher,
        "execute",
        false,
        parentSignal,
      ),
      "LinkFox Patsnap response",
    );
  }
  const chuhaijiang = chuhaijiangOperationsByName.get(actionName);
  if (chuhaijiang) {
    const request = (path: string, body: ActionInput) =>
      requestLinkfoxPayload(path, { method: "POST", body }, apiKey, fetcher, "execute", false, parentSignal);
    if (actionName === "search_chuhaijiang_products_by_image") {
      return searchChuhaijiangImage(input, request, fetcher);
    }
    return normalizeChuhaijiang(await request(chuhaijiang.path, input));
  }
  const direct = directOperations[actionName];
  if (direct) {
    if (direct.gatewayBusinessCodeOnly) validateSifInput(actionName, input);
    const body = direct.buildBody ? direct.buildBody(input) : input;
    const payload = await requestLinkfoxPayload(
      direct.path,
      {
        method: direct.method ?? "POST",
        timeoutMs: direct.timeoutMs,
        gatewayBusinessCodeOnly: direct.gatewayBusinessCodeOnly,
        ...((direct.method ?? "POST") === "POST" ? { body } : {}),
      },
      apiKey,
      fetcher,
      "execute",
      false,
      parentSignal,
    );
    return direct.normalize(payload);
  }

  const handler = customHandlers[actionName];
  if (!handler) {
    throw providerInputError(`unknown linkfox action: ${actionName}`);
  }
  return handler(input, { apiKey, fetcher, signal: parentSignal });
}

function validateSifInput(actionName: string, input: ActionInput): void {
  if (actionName === "list_sif_asin_keywords") {
    const periodType = optionalString(input.timePieceType) ?? "latelyDay";
    const periodValue = optionalString(input.timePieceValue);
    if ((periodType === "month" || periodType === "week") && !periodValue) {
      throw providerInputError("timePieceValue is required for month or week periods");
    }
  }
  const startDate = optionalString(input.startDate);
  const endDate = optionalString(input.endDate);
  if ((startDate && !endDate) || (!startDate && endDate)) {
    throw providerInputError("startDate and endDate must be provided together");
  }
  if ((startDate || endDate) && input.last7d !== false) {
    throw providerInputError("last7d must be false when a date range is provided");
  }
  if (startDate && endDate && startDate > endDate) {
    throw providerInputError("startDate must not be later than endDate");
  }
  if (actionName === "get_sif_asin_traffic_summary") {
    const asins = optionalString(input.asins);
    if (asins && asins.split(",").length > 10) {
      throw providerInputError("asins must contain at most 10 comma-separated ASINs");
    }
  }
}

function validateLinkfoxActionInput(actionName: string, input: ActionInput): void {
  if (actionName === "search_amazon_by_image" && input.deliveryZip && input.countryOrAreaCode) {
    throw providerInputError("deliveryZip and countryOrAreaCode cannot be used together");
  }
  if (actionName === "search_amazon_opportunities") {
    const meaningful = Object.keys(input).some(
      (key) => key !== "amazonDomain" && key !== "limit" && input[key] !== undefined,
    );
    if (!meaningful) throw providerInputError("Provide keyword, nicheName, or at least one opportunity metric filter");
  }
  if (actionName === "search_1688_products" && !input.keyWord && !input.goodsUrl && !input.productIds) {
    throw providerInputError("Provide keyWord, goodsUrl, or productIds");
  }
  if (actionName === "search_1688_by_image" && !input.imageUrl && !input.imageId) {
    throw providerInputError("Provide imageUrl or imageId");
  }
  if (actionName === "get_echotik_products") validateIdentifierLists(input, "productIds", "productUrls");
  if (actionName === "get_echotik_videos") validateIdentifierLists(input, "videoIds", "videoUrls");
  if (actionName === "search_amazon_store_orders" && Boolean(input.createdAfter) === Boolean(input.lastUpdatedAfter)) {
    throw providerInputError("Provide exactly one of createdAfter or lastUpdatedAfter");
  }
  if (
    actionName === "get_amazon_store_report" &&
    !input.reportId &&
    (!input.reportType || !Array.isArray(input.marketplaceIds) || input.marketplaceIds.length === 0)
  ) {
    throw providerInputError("Provide reportId, or provide reportType and marketplaceIds to create a report");
  }
  if (actionName === "get_amazon_ads_report" && !input.reportId) {
    for (const field of ["reportTypeId", "adProduct", "groupBy", "columns", "startDate", "endDate"]) {
      const value = input[field];
      if (value === undefined || (Array.isArray(value) && value.length === 0)) {
        throw providerInputError(`${field} is required when reportId is not provided`);
      }
    }
  }
  if (actionName === "search_ozon_products" && !input.keyword && !input.productIds) {
    throw providerInputError("Provide keyword or productIds");
  }
  if (Array.isArray(input.filters)) {
    for (const filter of input.filters) {
      const record = optionalRecord(filter);
      if (record?.op === "BETWEEN" && record.value2 === undefined) {
        throw providerInputError("value2 is required when op is BETWEEN");
      }
    }
  }
  if (actionName === "get_tiktok_shop_product") validateTikTokProductInput(input.productInput);
  if (
    [
      "search_echotik_sellers",
      "list_echotik_seller_products",
      "search_echotik_videos",
      "list_echotik_video_rankings",
      "list_echotik_product_videos",
    ].includes(actionName) &&
    typeof input.pageSize === "number" &&
    input.pageSize % 10 !== 0
  ) {
    throw providerInputError("pageSize must be a multiple of 10");
  }
}

function validateIdentifierLists(input: ActionInput, idsField: string, urlsField: string): void {
  const ids = Array.isArray(input[idsField]) ? input[idsField] : [];
  const urls = Array.isArray(input[urlsField]) ? input[urlsField] : [];
  if (ids.length === 0 && urls.length === 0) throw providerInputError(`${idsField} or ${urlsField} is required`);
  if (new Set([...ids, ...urls]).size > 1000) {
    throw providerInputError(`The combined ${idsField} and ${urlsField} count cannot exceed 1000`);
  }
}

function validateTikTokProductInput(value: unknown): void {
  const productInput = optionalString(value);
  if (!productInput) throw providerInputError("productInput is required");
  if (isNineteenDigitId(productInput)) return;
  try {
    const url = new URL(productInput);
    const segments = url.pathname.split("/").filter(Boolean);
    const index = segments.indexOf("product");
    const productId = index >= 0 ? segments[index + 1] : undefined;
    if (
      url.protocol === "https:" &&
      (!url.port || url.port === "443") &&
      (url.hostname === "tiktok.com" || url.hostname.endsWith(".tiktok.com")) &&
      productId &&
      isNineteenDigitId(productId)
    )
      return;
  } catch {
    // Return the input error below for both invalid cases.
  }
  throw providerInputError("productInput must be a 19-digit product ID or supported TikTok product URL");
}

function isNineteenDigitId(value: string): boolean {
  return value.length === 19 && [...value].every((character) => "0" <= character && character <= "9");
}

async function requestLinkfoxPayload(
  path: string,
  options: {
    method: "GET" | "POST";
    body?: ActionInput;
    timeoutMs?: number;
    gatewayBusinessCodeOnly?: boolean;
  },
  apiKey: string,
  fetcher: typeof fetch,
  phase: LinkfoxRequestPhase = "execute",
  acceptCreditError = false,
  parentSignal?: AbortSignal,
): Promise<unknown> {
  return runProviderRequest(
    { label: "LinkFox", timeoutMs: options.timeoutMs ?? linkfoxRequestTimeoutMs, signal: parentSignal },
    async (signal) => {
      const response = await fetcher(new URL(path, linkfoxApiBaseUrl), {
        method: options.method,
        headers: {
          accept: "application/json",
          authorization: apiKey,
          ...(options.body ? { "content-type": "application/json" } : {}),
          "user-agent": providerUserAgent,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal,
      });
      const payload = await readJsonPayload(response);
      const businessCode = options.gatewayBusinessCodeOnly
        ? readGatewayBusinessCode(payload)
        : readBusinessCode(payload);
      if (acceptCreditError && businessCode === 402) return payload;
      if (!response.ok || (businessCode !== undefined && businessCode !== 200)) {
        throw createLinkfoxError(response.status, businessCode, payload, phase);
      }
      return payload;
    },
  );
}

async function readJsonPayload(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return text;
    }
    throw providerResponseError("LinkFox returned invalid JSON");
  }
}

function createLinkfoxError(
  httpStatus: number,
  businessCode: number | undefined,
  payload: unknown,
  phase: LinkfoxRequestPhase,
) {
  const code = businessCode ?? httpStatus;
  const message = readErrorMessage(payload) ?? `LinkFox request failed with code ${code}`;
  if (businessCode === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (httpStatus === 401 || httpStatus === 403 || businessCode === 403) {
    return new ProviderRequestError(httpStatus >= 400 ? httpStatus : 403, message);
  }
  if (code === 402 || httpStatus === 402) {
    return new ProviderRequestError(402, message || "LinkFox credits are insufficient");
  }
  if (code === 429 || httpStatus === 429 || code === 1003) {
    return new ProviderRequestError(429, message);
  }
  if (code === 501 && message.toLowerCase().includes("kalodata api http 5")) {
    return providerResponseError(message);
  }
  if ((httpStatus >= 400 && httpStatus < 500) || [400, 403, 404, 422, 501, 1002, 1004, 1005].includes(code)) {
    return providerInputError(message);
  }
  return new ProviderRequestError(httpStatus >= 500 ? httpStatus : 502, message);
}

function readBusinessCode(payload: unknown) {
  const record = optionalRecord(payload);
  for (const key of ["errcode", "errorCode", "code"] as const) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function readGatewayBusinessCode(payload: unknown): number | undefined {
  const record = optionalRecord(payload);
  for (const key of ["errcode", "errorCode"] as const) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

function readErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }
  const record = optionalRecord(payload);
  for (const key of ["errmsg", "msg", "message", "error", "detail"] as const) {
    const value = readString(record?.[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function normalizeAccount(payload: unknown) {
  const account = requireRecord(payload, "LinkFox returned an invalid account response");
  return {
    accountId: readString(account.id) ?? null,
    nickname: readString(account.nickName) ?? null,
    accountType: account.isTeamUser === true ? "team" : "personal",
    verified: account.verifyStatus === true,
  };
}

function normalizeProductList(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid product response");
  const products = readArray(record.products) ?? readArray(record.data) ?? [];
  return {
    total: readInteger(record.total) ?? readInteger(record.totalCount) ?? products.length,
    products,
    costToken: readNumber(record.costToken),
  };
}

function normalizeDataList(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid list response");
  const data = readArray(record.data) ?? [];
  return {
    total: readInteger(record.total) ?? data.length,
    data,
    costToken: readNumber(record.costToken),
  };
}

function normalizeSifResult(payload: unknown): Record<string, unknown> {
  const record = requireRecord(payload, "LinkFox returned an invalid SIF response");
  const code = typeof record.code === "string" || typeof record.code === "number" ? String(record.code) : undefined;
  if (code !== "1") {
    throw new ProviderRequestError(
      502,
      readString(record.msg) ?? "LinkFox SIF returned an unsuccessful business response",
      record,
    );
  }
  const data = readArray(record.data);
  if (!data) throw new ProviderRequestError(502, "LinkFox SIF response did not include data", record);
  return {
    ...record,
    code,
    msg: readString(record.msg) ?? null,
    total: readInteger(record.total) ?? data.length,
    data,
    columns: readArray(record.columns) ?? [],
    type: readString(record.type) ?? null,
    title: readString(record.title) ?? null,
    costTime: readInteger(record.costTime),
    costToken: readNumber(record.costToken),
  };
}

function normalizeVideoList(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid video response");
  const videos = readArray(record.videos) ?? readArray(record.data) ?? [];
  return {
    total: readInteger(record.total) ?? videos.length,
    videos,
    costToken: readNumber(record.costToken),
  };
}

function normalizeSellerList(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid seller response");
  const sellers = readArray(record.sellers) ?? [];
  return {
    total: readInteger(record.total) ?? sellers.length,
    sellers,
    costToken: readNumber(record.costToken),
  };
}

function normalizeDetail(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid detail response");
  return { ...record, costToken: readNumber(record.costToken) };
}

function normalizeAlexa(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid Alexa response");
  return {
    report: readString(record.stdout) ?? null,
    data: readArray(record.data) ?? [],
    resultsNum: readInteger(record.resultsNum) ?? 0,
    taskId: readString(record.taskId) ?? null,
    costTime: readInteger(record.costTime),
    costToken: readNumber(record.costToken),
  };
}

function normalizeReviews(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid review response");
  const reviews = readArray(record.data) ?? [];
  return {
    total: readInteger(record.total) ?? reviews.length,
    reviews,
    costToken: readNumber(record.costToken),
  };
}

function normalizeAba(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid ABA response");
  return {
    success: record.success !== false,
    tables: readArray(record.tables) ?? [],
    total: readInteger(record.total),
    downloadUrl: readString(record.downloadUrl) ?? null,
    message: readString(record.msg) ?? readString(record.downloadNote) ?? null,
    costToken: readNumber(record.costToken),
  };
}

function normalizeOpportunities(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid opportunity response");
  return {
    opportunities: readArray(record.data) ?? [],
    costToken: readNumber(record.costToken),
  };
}

function normalizeOpportunityReport(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid opportunity report response");
  const report = readString(record.stdout);
  if (!report) {
    throw providerResponseError("LinkFox opportunity report did not include stdout");
  }
  return {
    report,
    costTime: readInteger(record.costTime),
    costToken: readNumber(record.costToken),
  };
}

function normalizeAuthorizationUrl(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid authorization response");
  const authorizeUrl = readString(record.authorizeUrl);
  if (!authorizeUrl) {
    throw providerResponseError("LinkFox response did not include authorizeUrl");
  }
  return { authorizeUrl };
}

function normalizeStores(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid authorized-account response");
  const stores = readArray(record.stores) ?? [];
  return {
    stores,
    total: readInteger(record.total) ?? stores.length,
  };
}

function normalizeAdsProfiles(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid Amazon Ads profile response");
  const profiles = readArray(record.profiles) ?? [];
  return {
    profiles,
    total: readInteger(record.total) ?? profiles.length,
    refreshed: record.refreshed === true,
  };
}

function normalizeCompliance(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid compliance response");
  const data = readArray(record.data) ?? readArray(record.results) ?? [];
  return {
    total: readInteger(record.total) ?? data.length,
    data,
    detectId: readString(record.detectId) ?? readString(record.checkId) ?? null,
    columns: readArray(record.columns) ?? [],
    type: readString(record.type) ?? null,
    riskLevel: readString(record.riskLevel) ?? null,
    costToken: readNumber(record.costToken),
  };
}

function normalizeTextTrademark(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid text trademark response");
  return {
    ...normalizeCompliance(record),
    blacklistTrademarks: readArray(record.blacklistTrademarks) ?? [],
    whitelistTrademarks: readArray(record.whitelistTrademarks) ?? [],
    textTrademarkRadar: readString(record.textTrademarkRadar) ?? readString(record.riskLevel) ?? null,
  };
}

function normalizeGraphicTrademark(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid graphic trademark response");
  return {
    ...normalizeCompliance(record),
    boundingBoxCount: readInteger(record.boundingBoxCount),
    radarResult: readString(record.radarResult) ?? null,
  };
}

function normalizeOzonProducts(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid Ozon product response");
  const products = readArray(record.products) ?? [];
  return {
    total: readInteger(record.total) ?? products.length,
    products,
    failures: readArray(record.failures) ?? [],
    successCount: readInteger(record.successCount),
    failedCount: readInteger(record.failedCount),
    costTime: readInteger(record.costTime),
    costToken: readNumber(record.costToken),
  };
}

function normalizeOzonTrend(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid Ozon trend response");
  const data = readArray(record.data) ?? [];
  return {
    total: readInteger(record.total) ?? data.length,
    data,
    costTime: readInteger(record.costTime),
    costToken: readNumber(record.costToken),
  };
}

function normalizeEtsyCategories(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid Etsy category response");
  const categories = readArray(record.categories) ?? [];
  return {
    total: readInteger(record.total) ?? categories.length,
    categories,
    title: readString(record.title) ?? null,
    costToken: readNumber(record.costToken),
  };
}

function normalizeEtsyProduct(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid Etsy product response");
  const data = readArray(record.data) ?? [];
  return {
    total: readInteger(record.total) ?? data.length,
    data,
    costToken: readNumber(record.costToken),
  };
}

function normalizeEtsyProducts(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid Etsy product search response");
  const products = readArray(record.products) ?? [];
  return {
    total: readInteger(record.total) ?? products.length,
    productNum: readInteger(record.productNum) ?? readInteger(record.product_num),
    products,
    sourceTool: readString(record.sourceTool) ?? null,
    sourceType: readString(record.sourceType) ?? null,
    title: readString(record.title) ?? null,
    costToken: readNumber(record.costToken),
  };
}

function normalizeEtsyStores(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid Etsy shop search response");
  const stores = readArray(record.stores) ?? [];
  return {
    total: readInteger(record.total) ?? stores.length,
    storeNum: readInteger(record.storeNum) ?? readInteger(record.store_num),
    stores,
    sourceTool: readString(record.sourceTool) ?? null,
    sourceType: readString(record.sourceType) ?? null,
    title: readString(record.title) ?? null,
    costToken: readNumber(record.costToken),
  };
}

async function executeOrderSearch(input: ActionInput, context: { apiKey: string; fetcher: typeof fetch }) {
  const query = new URLSearchParams();
  appendQuery(query, "createdAfter", input.createdAfter);
  appendQuery(query, "createdBefore", input.createdBefore);
  appendQuery(query, "lastUpdatedAfter", input.lastUpdatedAfter);
  appendQuery(query, "lastUpdatedBefore", input.lastUpdatedBefore);
  appendQuery(query, "marketplaceIds", input.marketplaceIds);
  appendQuery(query, "fulfillmentStatuses", input.fulfillmentStatuses);
  appendQuery(query, "fulfilledBy", input.fulfilledBy);
  appendQuery(query, "includedData", input.includedData);
  appendQuery(query, "maxResultsPerPage", input.maxResultsPerPage);
  appendQuery(query, "paginationToken", input.paginationToken);

  const proxy = await callDeveloperProxy(
    "/spApi/developerProxy",
    {
      region: input.region,
      path: "orders/2026-01-01/orders",
      method: "GET",
      sellerId: input.sellerId,
      queryString: query.toString(),
    },
    context,
  );
  const body = readDeveloperProxyBody(proxy);
  return {
    orders: readArray(body.orders) ?? [],
    nextToken: readString(body.nextToken) ?? null,
  };
}

async function executeStoreReport(input: ActionInput, context: { apiKey: string; fetcher: typeof fetch }) {
  let reportId = readString(input.reportId);
  if (!reportId) {
    const createBody = compactObject({
      reportType: input.reportType,
      marketplaceIds: input.marketplaceIds,
      dataStartTime: input.dataStartTime,
      dataEndTime: input.dataEndTime,
      lastUpdatedDate: input.lastUpdatedDate,
      reportOptions: input.reportOptions,
    });
    const created = await callDeveloperProxy(
      "/spApi/developerProxy",
      {
        region: input.region,
        path: storeReportPath,
        method: "POST",
        sellerId: input.sellerId,
        body: JSON.stringify(createBody),
        contentType: "application/json",
      },
      context,
    );
    reportId = readString(readDeveloperProxyBody(created).reportId);
    if (!reportId) {
      throw providerResponseError("Amazon report creation did not return reportId");
    }
  }

  const maxAttempts = readInteger(input.maxAttempts) ?? 20;
  const pollIntervalSeconds = readInteger(input.pollIntervalSeconds) ?? 30;
  const pollDeadline = Date.now() + reportPollingBudgetMs;
  let pollAttempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (Date.now() >= pollDeadline) {
      break;
    }
    pollAttempts = attempt;
    const statusPayload = await callDeveloperProxy(
      "/spApi/developerProxy",
      {
        region: input.region,
        path: `${storeReportPath}/${encodeURIComponent(reportId)}`,
        method: "GET",
        sellerId: input.sellerId,
      },
      context,
    );
    const statusBody = readDeveloperProxyBody(statusPayload);
    const status = (readString(statusBody.processingStatus) ?? "UNKNOWN").toUpperCase();
    if (status === "DONE") {
      const documentId = readString(statusBody.reportDocumentId);
      if (!documentId) {
        throw providerResponseError("Completed Amazon report did not include reportDocumentId");
      }
      const documentPayload = await callDeveloperProxy(
        "/spApi/developerProxy",
        {
          region: input.region,
          path: `reports/2021-06-30/documents/${encodeURIComponent(documentId)}`,
          method: "GET",
          sellerId: input.sellerId,
        },
        context,
      );
      const document = readDeveloperProxyBody(documentPayload);
      const downloadUrl = readString(document.url);
      if (!downloadUrl) {
        throw providerResponseError("Amazon report document did not include url");
      }
      return {
        reportId,
        status,
        downloadUrl,
        compressionAlgorithm: readString(document.compressionAlgorithm) ?? null,
        pollAttempts: attempt,
      };
    }
    if (["FATAL", "CANCELLED"].includes(status)) {
      throw providerResponseError(`Amazon report generation ended with ${status}`);
    }
    if (!["IN_QUEUE", "IN_PROGRESS"].includes(status)) {
      throw providerResponseError(`Amazon report returned unknown status ${status}`);
    }
    if (attempt < maxAttempts && Date.now() + pollIntervalSeconds * 1000 < pollDeadline) {
      await waitSeconds(pollIntervalSeconds);
    } else {
      break;
    }
  }

  return {
    reportId,
    status: "STILL_PROCESSING",
    downloadUrl: null,
    compressionAlgorithm: null,
    pollAttempts,
  };
}

async function executeSpCampaignList(input: ActionInput, context: { apiKey: string; fetcher: typeof fetch }) {
  const fetchAll = input.fetchAll !== false;
  const maxPages = readInteger(input.maxPages) ?? 50;
  const requestBody = compactObject({
    campaignIdFilter: input.campaignIdFilter,
    stateFilter: input.stateFilter,
    nameFilter: input.nameFilter,
    portfolioIdFilter: input.portfolioIdFilter,
    maxResults: input.maxResults ?? 100,
    nextToken: input.nextToken,
  });
  const campaigns: unknown[] = [];
  let nextToken = readString(requestBody.nextToken);

  for (let page = 1; page <= maxPages; page += 1) {
    const payload = await callDeveloperProxy(
      "/amazonAds/developerProxy",
      {
        region: input.region,
        path: "sp/campaigns/list",
        method: "POST",
        profileId: input.profileId,
        body: JSON.stringify(compactObject({ ...requestBody, nextToken })),
        contentType: spCampaignContentType,
      },
      context,
    );
    const body = readDeveloperProxyBody(payload);
    campaigns.push(...(readArray(body.campaigns) ?? []));
    nextToken = readString(body.nextToken);
    if (!nextToken || !fetchAll) {
      break;
    }
  }

  return {
    campaigns,
    total: campaigns.length,
    nextToken: nextToken ?? null,
  };
}

async function executeAdsReport(input: ActionInput, context: { apiKey: string; fetcher: typeof fetch }) {
  let reportId = readString(input.reportId);
  if (!reportId) {
    const reportTypeId = readString(input.reportTypeId)!;
    const body = {
      name: readString(input.name) ?? `${reportTypeId}_${String(input.startDate)}_${String(input.endDate)}`,
      startDate: input.startDate,
      endDate: input.endDate,
      configuration: {
        adProduct: input.adProduct,
        groupBy: input.groupBy,
        columns: input.columns,
        filters: input.filters,
        reportTypeId,
        timeUnit: input.timeUnit ?? "SUMMARY",
        format: input.format ?? "GZIP_JSON",
      },
    };
    const created = await callDeveloperProxy(
      "/amazonAds/developerProxy",
      {
        region: input.region,
        path: adsReportPath,
        method: "POST",
        profileId: input.profileId,
        body: JSON.stringify(body),
        contentType: adsReportContentType,
      },
      context,
    );
    const httpStatus = readInteger(created.httpStatus);
    if (httpStatus === 425) {
      reportId = readDuplicateReportId(created.body);
    } else {
      reportId = readString(readDeveloperProxyBody(created).reportId);
    }
    if (!reportId) {
      throw providerResponseError("Amazon Ads report creation did not return reportId");
    }
  }

  const maxAttempts = readInteger(input.maxAttempts) ?? 20;
  const pollIntervalSeconds = readInteger(input.pollIntervalSeconds) ?? 30;
  const pollDeadline = Date.now() + reportPollingBudgetMs;
  let pollAttempts = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (Date.now() >= pollDeadline) {
      break;
    }
    pollAttempts = attempt;
    const statusPayload = await callDeveloperProxy(
      "/amazonAds/developerProxy",
      {
        region: input.region,
        path: `${adsReportPath}/${encodeURIComponent(reportId)}`,
        method: "GET",
        profileId: input.profileId,
      },
      context,
    );
    const statusBody = readDeveloperProxyBody(statusPayload);
    const status = (readString(statusBody.status) ?? "UNKNOWN").toUpperCase();
    if (["COMPLETED", "SUCCESS"].includes(status)) {
      const downloadUrl = readString(statusBody.url);
      if (!downloadUrl) {
        throw providerResponseError("Completed Amazon Ads report did not include url");
      }
      return {
        reportId,
        status,
        downloadUrl,
        compressionAlgorithm: null,
        pollAttempts: attempt,
      };
    }
    if (["FAILURE", "FAILED", "CANCELLED"].includes(status)) {
      const reason = readString(statusBody.failureReason);
      throw providerResponseError(
        reason ? `Amazon Ads report failed: ${reason}` : `Amazon Ads report ended with ${status}`,
      );
    }
    if (!["PENDING", "PROCESSING", "IN_QUEUE", "IN_PROGRESS"].includes(status)) {
      throw providerResponseError(`Amazon Ads report returned unknown status ${status}`);
    }
    if (attempt < maxAttempts && Date.now() + pollIntervalSeconds * 1000 < pollDeadline) {
      await waitSeconds(pollIntervalSeconds);
    } else {
      break;
    }
  }

  return {
    reportId,
    status: "STILL_PROCESSING",
    downloadUrl: null,
    compressionAlgorithm: null,
    pollAttempts,
  };
}

async function callDeveloperProxy(path: string, body: ActionInput, context: { apiKey: string; fetcher: typeof fetch }) {
  const payload = await requestLinkfoxPayload(path, { method: "POST", body }, context.apiKey, context.fetcher);
  return requireRecord(payload, "LinkFox developer proxy returned an invalid response");
}

function readDeveloperProxyBody(payload: Record<string, unknown>) {
  const httpStatus = readInteger(payload.httpStatus);
  if (httpStatus === null) {
    throw providerResponseError("LinkFox developer proxy omitted httpStatus");
  }
  const body = parseNestedJson(payload.body);
  if (httpStatus >= 200 && httpStatus < 300) {
    return requireRecord(body, "LinkFox developer proxy returned an invalid upstream body");
  }
  const message = readErrorMessage(body) ?? `Amazon upstream request failed with status ${httpStatus}`;
  if (httpStatus === 401) {
    throw new ProviderRequestError(401, message);
  }
  if (httpStatus === 403) {
    throw new ProviderRequestError(403, message);
  }
  if (httpStatus === 429) {
    throw new ProviderRequestError(429, message);
  }
  if (httpStatus >= 400 && httpStatus < 500) {
    throw providerInputError(message);
  }
  throw new ProviderRequestError(httpStatus, message);
}

function parseNestedJson(value: unknown) {
  if (typeof value !== "string") {
    return value ?? {};
  }
  if (!value.trim()) {
    return {};
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw providerResponseError("LinkFox developer proxy returned invalid JSON");
  }
}

function readDuplicateReportId(value: unknown) {
  const detail = typeof value === "string" ? value : readString(optionalRecord(value)?.detail);
  if (!detail) {
    return undefined;
  }
  const marker = "duplicate of";
  const markerIndex = detail.toLowerCase().indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }
  const suffix = detail.slice(markerIndex + marker.length).trimStart();
  if (!suffix.startsWith(":")) {
    return undefined;
  }
  const reportId = suffix.slice(1).trimStart().slice(0, 36);
  const allowed = "0123456789abcdef-";
  return reportId.length === 36 && [...reportId].every((char) => allowed.includes(char.toLowerCase()))
    ? reportId
    : undefined;
}

function appendQuery(query: URLSearchParams, name: string, value: unknown) {
  if (Array.isArray(value)) {
    for (const item of value) {
      appendQuery(query, name, item);
    }
    return;
  }
  if (value !== undefined && value !== null && value !== "") {
    query.append(name, String(value));
  }
}

function requireRecord(value: unknown, message: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw providerResponseError(message);
  }
  return record;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : undefined;
}

function readString(value: unknown) {
  const stringValue = optionalString(value)?.trim();
  return stringValue || undefined;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function readInteger(value: unknown) {
  const numberValue = readNumber(value);
  return numberValue !== null && Number.isInteger(numberValue) ? numberValue : null;
}

function waitSeconds(seconds: number) {
  if (seconds <= 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}
