import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const linkfoxApiBaseUrl = "https://tool-gateway.linkfox.com";

const linkfoxRequestTimeoutMs = 120_000;
const storeReportPath = "reports/2021-06-30/reports";
const adsReportPath = "reporting/reports";
const adsReportContentType = "application/vnd.createasyncreportrequest.v3+json";
const spCampaignContentType = "application/vnd.spcampaign.v3+json";
const reportPollingBudgetMs = 10 * 60 * 1000;

type LinkfoxRequestPhase = "validate" | "execute";
type ActionInput = Record<string, unknown>;
interface LinkfoxContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
type ActionHandler = (input: ActionInput, context: LinkfoxContext) => Promise<unknown>;

interface DirectOperation {
  path: string;
  method?: "GET" | "POST";
  buildBody?: (input: ActionInput) => ActionInput;
  normalize: (payload: unknown) => unknown;
}

const directOperations: Record<string, DirectOperation> = {
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
  search_echotik_products: {
    path: "/echotik/listProduct",
    normalize: normalizeProductList,
  },
  get_echotik_products: {
    path: "/echotik/batchProductDetail",
    normalize: normalizeProductList,
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
    normalize: normalizeCompliance,
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
  check_product_tro_risk: {
    path: "/maidalv/checkApiFlash",
    buildBody: (input) => ({ language: "zh", ...input }),
    normalize: normalizeCompliance,
  },
};

const customHandlers: Record<string, ActionHandler> = {
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
    grantedScopes: [],
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
  signal?: AbortSignal,
): Promise<unknown> {
  validateLinkfoxActionInput(actionName, input);
  const direct = directOperations[actionName];
  if (direct) {
    const body = direct.buildBody ? direct.buildBody(input) : input;
    const payload = await requestLinkfoxPayload(
      direct.path,
      {
        method: direct.method ?? "POST",
        ...((direct.method ?? "POST") === "POST" ? { body } : {}),
      },
      apiKey,
      fetcher,
      "execute",
      false,
      signal,
    );
    return direct.normalize(payload);
  }

  const handler = customHandlers[actionName];
  if (!handler) {
    throw new ProviderRequestError(400, `unknown linkfox action: ${actionName}`);
  }
  return handler(input, { apiKey, fetcher, signal });
}

function validateLinkfoxActionInput(actionName: string, input: ActionInput): void {
  if (actionName === "search_amazon_by_image" && input.deliveryZip && input.countryOrAreaCode) {
    throw new ProviderRequestError(400, "deliveryZip and countryOrAreaCode cannot be used together");
  }
  if (actionName === "search_amazon_opportunities") {
    const meaningful = Object.keys(input).some(
      (key) => key !== "amazonDomain" && key !== "limit" && input[key] !== undefined,
    );
    if (!meaningful) {
      throw new ProviderRequestError(400, "Provide keyword, nicheName, or at least one opportunity metric filter");
    }
  }
  if (actionName === "search_1688_products" && !input.keyWord && !input.goodsUrl && !input.productIds) {
    throw new ProviderRequestError(400, "Provide keyWord, goodsUrl, or productIds");
  }
  if (actionName === "search_1688_by_image" && !input.imageUrl && !input.imageId) {
    throw new ProviderRequestError(400, "Provide imageUrl or imageId");
  }
  if (actionName === "get_echotik_products") {
    const productIds = Array.isArray(input.productIds) ? input.productIds : [];
    const productUrls = Array.isArray(input.productUrls) ? input.productUrls : [];
    if (productIds.length === 0 && productUrls.length === 0) {
      throw new ProviderRequestError(400, "Provide productIds or productUrls");
    }
    if (productIds.length + productUrls.length > 1000) {
      throw new ProviderRequestError(400, "The combined productIds and productUrls count cannot exceed 1000");
    }
  }
  if (actionName === "search_amazon_store_orders" && Boolean(input.createdAfter) === Boolean(input.lastUpdatedAfter)) {
    throw new ProviderRequestError(400, "Provide exactly one of createdAfter or lastUpdatedAfter");
  }
  if (
    actionName === "get_amazon_store_report" &&
    !input.reportId &&
    (!input.reportType || !Array.isArray(input.marketplaceIds) || input.marketplaceIds.length === 0)
  ) {
    throw new ProviderRequestError(
      400,
      "Provide reportId, or provide reportType and marketplaceIds to create a report",
    );
  }
  if (actionName === "get_amazon_ads_report" && !input.reportId) {
    for (const field of ["reportTypeId", "adProduct", "groupBy", "columns", "startDate", "endDate"]) {
      const value = input[field];
      if (value === undefined || (Array.isArray(value) && value.length === 0)) {
        throw new ProviderRequestError(400, `${field} is required when reportId is not provided`);
      }
    }
  }
}

async function requestLinkfoxPayload(
  path: string,
  options: { method: "GET" | "POST"; body?: ActionInput },
  apiKey: string,
  fetcher: typeof fetch,
  phase: LinkfoxRequestPhase = "execute",
  acceptCreditError = false,
  signal?: AbortSignal,
) {
  const timeout = createProviderTimeout(signal, linkfoxRequestTimeoutMs);
  let response: Response;
  try {
    response = await fetcher(new URL(path, linkfoxApiBaseUrl), {
      method: options.method,
      headers: {
        accept: "application/json",
        authorization: apiKey,
        ...(options.body ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: timeout.signal,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "LinkFox request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `LinkFox request failed: ${error.message}` : "LinkFox request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readJsonPayload(response);
  const businessCode = readBusinessCode(payload);
  if (acceptCreditError && businessCode === 402) {
    return payload;
  }
  if (!response.ok || (businessCode !== undefined && businessCode !== 200)) {
    throw createLinkfoxError(response.status, businessCode, payload, phase);
  }
  return payload;
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
    throw new ProviderRequestError(502, "LinkFox returned invalid JSON");
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
  if (code === 401 || httpStatus === 401) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (code === 403 || httpStatus === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 403, message);
  }
  if (code === 402 || httpStatus === 402) {
    return new ProviderRequestError(402, message || "LinkFox credits are insufficient");
  }
  if (code === 429 || httpStatus === 429) {
    return new ProviderRequestError(429, message);
  }
  if (code === 501 && message.toLowerCase().includes("kalodata api http 5")) {
    return new ProviderRequestError(502, message);
  }
  if ((httpStatus >= 400 && httpStatus < 500) || [400, 403, 404, 422, 501, 1002, 1004, 1005].includes(code)) {
    return new ProviderRequestError(400, message);
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
    costToken: readInteger(record.costToken),
  };
}

function normalizeReviews(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid review response");
  const reviews = readArray(record.data) ?? [];
  return {
    total: readInteger(record.total) ?? reviews.length,
    reviews,
    costToken: readInteger(record.costToken),
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
    costToken: readInteger(record.costToken),
  };
}

function normalizeOpportunities(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid opportunity response");
  return {
    opportunities: readArray(record.data) ?? [],
    costToken: readInteger(record.costToken),
  };
}

function normalizeOpportunityReport(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid opportunity report response");
  const report = readString(record.stdout);
  if (!report) {
    throw new ProviderRequestError(502, "LinkFox opportunity report did not include stdout");
  }
  return {
    report,
    costTime: readInteger(record.costTime),
    costToken: readInteger(record.costToken),
  };
}

function normalizeAuthorizationUrl(payload: unknown) {
  const record = requireRecord(payload, "LinkFox returned an invalid authorization response");
  const authorizeUrl = readString(record.authorizeUrl);
  if (!authorizeUrl) {
    throw new ProviderRequestError(502, "LinkFox response did not include authorizeUrl");
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
  const results = readArray(record.results) ?? readArray(record.data) ?? [];
  return {
    total: readInteger(record.total) ?? results.length,
    results,
    detectId: readString(record.detectId) ?? readString(record.checkId) ?? null,
    riskLevel: readString(record.riskLevel) ?? readString(record.textTrademarkRadar) ?? null,
    costToken: readInteger(record.costToken),
  };
}

async function executeOrderSearch(input: ActionInput, context: LinkfoxContext) {
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

async function executeStoreReport(input: ActionInput, context: LinkfoxContext) {
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
      throw new ProviderRequestError(502, "Amazon report creation did not return reportId");
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
        throw new ProviderRequestError(502, "Completed Amazon report did not include reportDocumentId");
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
        throw new ProviderRequestError(502, "Amazon report document did not include url");
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
      throw new ProviderRequestError(502, `Amazon report generation ended with ${status}`);
    }
    if (!["IN_QUEUE", "IN_PROGRESS"].includes(status)) {
      throw new ProviderRequestError(502, `Amazon report returned unknown status ${status}`);
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

async function executeSpCampaignList(input: ActionInput, context: LinkfoxContext) {
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

async function executeAdsReport(input: ActionInput, context: LinkfoxContext) {
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
      throw new ProviderRequestError(502, "Amazon Ads report creation did not return reportId");
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
        throw new ProviderRequestError(502, "Completed Amazon Ads report did not include url");
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
      throw new ProviderRequestError(
        502,
        reason ? `Amazon Ads report failed: ${reason}` : `Amazon Ads report ended with ${status}`,
      );
    }
    if (!["PENDING", "PROCESSING", "IN_QUEUE", "IN_PROGRESS"].includes(status)) {
      throw new ProviderRequestError(502, `Amazon Ads report returned unknown status ${status}`);
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

async function callDeveloperProxy(path: string, body: ActionInput, context: LinkfoxContext) {
  const payload = await requestLinkfoxPayload(
    path,
    { method: "POST", body },
    context.apiKey,
    context.fetcher,
    "execute",
    false,
    context.signal,
  );
  return requireRecord(payload, "LinkFox developer proxy returned an invalid response");
}

function readDeveloperProxyBody(payload: Record<string, unknown>) {
  const httpStatus = readInteger(payload.httpStatus);
  if (httpStatus === null) {
    throw new ProviderRequestError(502, "LinkFox developer proxy omitted httpStatus");
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
    throw new ProviderRequestError(400, message);
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
    throw new ProviderRequestError(502, "LinkFox developer proxy returned invalid JSON");
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
    throw new ProviderRequestError(502, message);
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

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
