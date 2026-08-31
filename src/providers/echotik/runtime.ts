import type { EchoTikContext } from "./executors.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

export const echotikApiBaseUrl = "https://open.echotik.live/api/v3";
const echotikMaxResponseBytes = 4 * 1024 * 1024;
const echotikRequestTimeoutMs = 30_000;

type EchoTikPhase = "validate" | "execute";
type EchoTikCredential = Pick<EchoTikContext, "username" | "password" | "signal">;
type EchoTikActionHandler = (input: Record<string, unknown>, context: EchoTikContext) => Promise<unknown>;
type EchoTikEnvelope = Record<string, unknown> & {
  code?: unknown;
  message?: unknown;
  data?: unknown;
  requestId?: unknown;
};
type EchoTikRequestInput = {
  path: string;
  query?: Record<string, string | number | undefined>;
  credential: EchoTikCredential;
  fetcher: typeof fetch;
  phase: EchoTikPhase;
  riskControlRetryDelaysMs?: readonly number[];
};

const productSortValues = {
  total_sales: 1,
  total_gmv: 2,
  average_price: 3,
  sales_7_days: 4,
  sales_30_days: 5,
  gmv_7_days: 6,
  gmv_30_days: 7,
} as const;

const influencerSortValues = {
  followers: 1,
  likes: 2,
  product_sales: 3,
  product_gmv: 4,
  videos: 5,
  video_views: 6,
  live_views: 7,
} as const;

const videoSortValues = {
  views: 1,
  likes: 2,
  shares: 3,
  sales: 4,
  gmv: 5,
  created_at: 6,
} as const;

const liveSortValues = {
  peak_views: 1,
  product_count: 2,
  sales: 3,
  gmv: 4,
  total_views: 5,
} as const;

export const echotikActionHandlers: Record<string, EchoTikActionHandler> = {
  async list_product_categories(input, context) {
    const level = readRequiredInteger(input.level, "level");
    const envelope = await requestEchoTikJson({
      path: `/echotik/category/l${level}`,
      query: compactObject({
        language: readRequiredString(input.language, "language"),
        parent_id: readOptionalString(input.parentCategoryId),
      }),
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return {
      items: readRecordArray(envelope.data, "EchoTik category data").map(normalizeCategory),
      requestId: readRequestId(envelope),
    };
  },

  async resolve_product_id(input, context) {
    assertTikTokShareUrl(input.shareUrl);
    const envelope = await requestEchoTikJson({
      path: "/realtime/extract_product_id",
      query: { share_url: readRequiredString(input.shareUrl, "shareUrl") },
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
      riskControlRetryDelaysMs: [200, 500],
    });
    const data = optionalRecord(envelope.data);
    if (!data) {
      throw new ProviderRequestError(502, "EchoTik product ID data must be an object", undefined, "provider_error");
    }
    return {
      productId: readRequiredString(data.productId ?? data.product_id, "data.productId"),
      freshness: "realtime",
      requestId: readRequestId(envelope),
    };
  },

  async list_products(input, context) {
    assertRanges(input, [
      ["minimumTotalSales", "maximumTotalSales"],
      ["minimumSales30Days", "maximumSales30Days"],
      ["minimumPrice", "maximumPrice"],
      ["minimumCommissionRate", "maximumCommissionRate"],
      ["minimumInfluencerCount", "maximumInfluencerCount"],
      ["minimumVideoCount", "maximumVideoCount"],
      ["minimumRating", "maximumRating"],
      ["minimumTotalGmv", "maximumTotalGmv"],
      ["minimumGmv30Days", "maximumGmv30Days"],
    ]);
    return requestProductPage(
      {
        path: "/echotik/product/list",
        query: compactObject({
          region: readRegion(input.region),
          category_id: readOptionalString(input.categoryId),
          category_l2_id: readOptionalString(input.categoryLevel2Id),
          category_l3_id: readOptionalString(input.categoryLevel3Id),
          sales_trend_flag: mapOptionalEnum(input.salesTrend, {
            stable: 0,
            rising: 1,
            falling: 2,
          }),
          min_total_sale_cnt: readOptionalNumber(input.minimumTotalSales),
          max_total_sale_cnt: readOptionalNumber(input.maximumTotalSales),
          min_total_sale_30d_cnt: readOptionalNumber(input.minimumSales30Days),
          max_total_sale_30d_cnt: readOptionalNumber(input.maximumSales30Days),
          min_spu_avg_price: readOptionalNumber(input.minimumPrice),
          max_spu_avg_price: readOptionalNumber(input.maximumPrice),
          min_product_commission_rate: readOptionalNumber(input.minimumCommissionRate),
          max_product_commission_rate: readOptionalNumber(input.maximumCommissionRate),
          min_total_ifl_cnt: readOptionalNumber(input.minimumInfluencerCount),
          max_total_ifl_cnt: readOptionalNumber(input.maximumInfluencerCount),
          min_total_video_cnt: readOptionalNumber(input.minimumVideoCount),
          max_total_video_cnt: readOptionalNumber(input.maximumVideoCount),
          min_product_rating: readOptionalNumber(input.minimumRating),
          max_product_rating: readOptionalNumber(input.maximumRating),
          min_total_sale_gmv_amt: readOptionalNumber(input.minimumTotalGmv),
          max_total_sale_gmv_amt: readOptionalNumber(input.maximumTotalGmv),
          min_total_sale_gmv_30d_amt: readOptionalNumber(input.minimumGmv30Days),
          max_total_sale_gmv_30d_amt: readOptionalNumber(input.maximumGmv30Days),
          sales_flag: mapOptionalEnum(input.salesChannel, {
            video: 1,
            live: 2,
          }),
          from_flag: mapOptionalEnum(input.storeType, {
            local: 1,
            cross_border: 2,
          }),
          is_s_shop: mapOptionalBoolean(input.managedShop),
          free_shipping: mapOptionalBoolean(input.freeShipping),
          off_mark: input.listedOnly === true ? 0 : undefined,
          is_hot: mapOptionalBoolean(input.hotProduct),
          shop_type: mapOptionalBoolean(input.brandedStore),
          product_sort_field: mapOptionalEnum(input.sortBy, productSortValues),
          sort_type: mapSortOrder(input.sortOrder),
          page_num: readPage(input),
          page_size: readPageSize(input),
        }),
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      input,
      normalizeProduct,
      "t_plus_1",
    );
  },

  async list_product_comments(input, context) {
    assertRanges(input, [["minimumRating", "maximumRating"]]);
    return requestProductPage(
      {
        path: "/echotik/product/comment",
        query: compactObject({
          product_id: readRequiredString(input.productId, "productId"),
          min_rating: readOptionalNumber(input.minimumRating),
          max_rating: readOptionalNumber(input.maximumRating),
          page_num: readPage(input),
          page_size: readPageSize(input),
        }),
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      input,
      normalizeProductComment,
    );
  },

  async get_product_details(input, context) {
    const productIds = readRequiredStringArray(input.productIds, "productIds");
    const envelope = await requestEchoTikJson({
      path: "/echotik/product/detail",
      query: { product_ids: [...new Set(productIds)].join(",") },
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return {
      items: readRecordArray(envelope.data, "EchoTik product detail data").map(normalizeProduct),
      freshness: "offline",
      requestId: readRequestId(envelope),
    };
  },

  async get_product_trend(input, context) {
    assertDateRange(input, 180);
    return requestProductPage(
      {
        path: "/echotik/product/trend",
        query: {
          product_id: readRequiredString(input.productId, "productId"),
          start_date: readRequiredString(input.startDate, "startDate"),
          end_date: readRequiredString(input.endDate, "endDate"),
          page_num: readPage(input),
          page_size: readPageSize(input),
        },
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      input,
      normalizeProductTrend,
    );
  },

  async get_category_overview(input, context) {
    const envelope = await requestEchoTikJson({
      path: "/echotik/category/product/detail",
      query: {
        category_id: readRequiredString(input.categoryId, "categoryId"),
        region: readRegion(input.region),
      },
      credential: context,
      fetcher: context.fetcher,
      phase: "execute",
    });
    return {
      items: readRecordArray(envelope.data, "EchoTik category overview data").map(normalizeCategoryOverview),
      freshness: "t_plus_1",
      requestId: readRequestId(envelope),
    };
  },

  async get_category_trend(input, context) {
    assertDateRange(input);
    return requestProductPage(
      {
        path: "/echotik/category/trend",
        query: compactObject({
          region: readRegion(input.region),
          category_id: readOptionalString(input.categoryId),
          category_l2_id: readOptionalString(input.categoryLevel2Id),
          category_l3_id: readOptionalString(input.categoryLevel3Id),
          start_date: readRequiredString(input.startDate, "startDate"),
          end_date: readRequiredString(input.endDate, "endDate"),
          page_num: readPage(input),
          page_size: readPageSize(input),
        }),
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      input,
      normalizeCategoryTrend,
    );
  },

  async list_product_influencers(input, context) {
    return requestProductPage(
      {
        path: "/echotik/product/influencer/list",
        query: compactObject({
          product_id: readRequiredString(input.productId, "productId"),
          product_influencer_sort_field: mapOptionalEnum(input.sortBy, influencerSortValues),
          sort_type: mapSortOrder(input.sortOrder),
          page_num: readPage(input),
          page_size: readPageSize(input),
        }),
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      input,
      normalizeProductInfluencer,
    );
  },

  async list_product_videos(input, context) {
    assertRanges(input, [["createdFrom", "createdTo"]]);
    return requestProductPage(
      {
        path: "/echotik/product/video/list",
        query: compactObject({
          product_id: readRequiredString(input.productId, "productId"),
          user_id: readOptionalString(input.userId),
          min_create_time: readOptionalNumber(input.createdFrom),
          max_create_time: readOptionalNumber(input.createdTo),
          product_video_sort_field: mapOptionalEnum(input.sortBy, videoSortValues),
          sort_type: mapSortOrder(input.sortOrder),
          page_num: readPage(input),
          page_size: readPageSize(input),
        }),
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      input,
      normalizeProductVideo,
    );
  },

  async list_product_lives(input, context) {
    assertRanges(input, [["createdFrom", "createdTo"]]);
    return requestProductPage(
      {
        path: "/echotik/product/live/list",
        query: compactObject({
          product_id: readRequiredString(input.productId, "productId"),
          min_create_time: readOptionalNumber(input.createdFrom),
          max_create_time: readOptionalNumber(input.createdTo),
          product_live_sort_field: mapOptionalEnum(input.sortBy, liveSortValues),
          sort_type: mapSortOrder(input.sortOrder),
          page_num: readPage(input),
          page_size: readPageSize(input),
        }),
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      input,
      normalizeProductLive,
    );
  },

  async list_product_rankings(input, context) {
    const date = readRequiredString(input.date, "date");
    const region = readRegion(input.region);
    const metric = readRequiredString(input.metric, "metric");
    const period = readRequiredString(input.period, "period");
    const result = await requestProductPage(
      {
        path: "/echotik/product/ranklist",
        query: compactObject({
          date,
          region,
          product_rank_field: mapRequiredEnum(metric, "metric", {
            sales: 1,
            influencers: 2,
          }),
          rank_type: mapRequiredEnum(period, "period", {
            daily: 1,
            weekly: 2,
            monthly: 3,
          }),
          from_flag: mapOptionalEnum(input.storeType, {
            local: 1,
            cross_border: 2,
          }),
          category_id: readOptionalString(input.categoryId),
          category_l2_id: readOptionalString(input.categoryLevel2Id),
          category_l3_id: readOptionalString(input.categoryLevel3Id),
          page_num: readPage(input),
          page_size: readPageSize(input),
        }),
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      input,
      normalizeProductRanking,
    );
    return { ...result, date, region, metric, period };
  },

  async get_shop_details(input, context) {
    return requestOfflineItems(
      {
        path: "/echotik/seller/detail",
        query: { seller_id: readRequiredString(input.shopId, "shopId") },
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      "EchoTik shop detail data",
      normalizeShop,
    );
  },

  async get_influencer_details(input, context) {
    const userIds = readOptionalStringArray(input.userIds, "userIds");
    const uniqueIds = readOptionalStringArray(input.uniqueIds, "uniqueIds");
    const identifierCount = (userIds?.length ?? 0) + (uniqueIds?.length ?? 0);
    if (identifierCount === 0 || identifierCount > 10) {
      throw new ProviderRequestError(
        400,
        identifierCount === 0
          ? "At least one user ID or unique ID is required"
          : "EchoTik creator details support at most 10 IDs per request",
        undefined,
        "invalid_input",
      );
    }
    return requestOfflineItems(
      {
        path: "/echotik/influencer/detail",
        query: compactObject({
          user_ids: userIds ? [...new Set(userIds)].join(",") : undefined,
          unique_ids: uniqueIds ? [...new Set(uniqueIds)].join(",") : undefined,
        }),
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      "EchoTik creator detail data",
      normalizeInfluencerDetail,
    );
  },

  async get_video_details(input, context) {
    const videoIds = readRequiredStringArray(input.videoIds, "videoIds");
    return requestOfflineItems(
      {
        path: "/echotik/video/detail",
        query: { video_ids: [...new Set(videoIds)].join(",") },
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      "EchoTik video detail data",
      normalizeVideoDetail,
    );
  },

  async get_live_details(input, context) {
    const roomIds = readRequiredStringArray(input.roomIds, "roomIds");
    return requestOfflineItems(
      {
        path: "/echotik/live/detail",
        query: { room_ids: [...new Set(roomIds)].join(",") },
        credential: context,
        fetcher: context.fetcher,
        phase: "execute",
      },
      "EchoTik live detail data",
      normalizeLiveDetail,
    );
  },
};

export async function requestEchoTikCredentialValidation(context: EchoTikContext): Promise<void> {
  await requestEchoTikJson({
    path: "/echotik/category/l1",
    query: { language: "en-US" },
    credential: context,
    fetcher: context.fetcher,
    phase: "validate",
  });
}

export function createEchoTikProviderAccountId(username: string): string {
  return createHash("sha256").update("echotik\0").update(username).digest("hex");
}

async function requestOfflineItems<T>(
  request: EchoTikRequestInput,
  fieldName: string,
  normalize: (record: Record<string, unknown>) => T,
) {
  const envelope = await requestEchoTikJson(request);
  return {
    items: readRecordArray(envelope.data, fieldName).map(normalize),
    freshness: "offline",
    requestId: readRequestId(envelope),
  };
}

async function requestProductPage<T>(
  request: EchoTikRequestInput,
  actionInput: Record<string, unknown>,
  normalize: (record: Record<string, unknown>) => T,
  freshness: "offline" | "t_plus_1" = "offline",
) {
  const envelope = await requestEchoTikJson(request);
  return {
    items: readRecordArray(envelope.data, "EchoTik product data").map(normalize),
    page: readPage(actionInput),
    pageSize: readPageSize(actionInput),
    freshness,
    requestId: readRequestId(envelope),
  };
}

async function requestEchoTikJson(input: EchoTikRequestInput): Promise<EchoTikEnvelope> {
  const timeout = createProviderTimeout(input.credential.signal, echotikRequestTimeoutMs);
  const retryDelays = input.riskControlRetryDelaysMs ?? [];
  try {
    for (let attempt = 0; ; attempt += 1) {
      const result = await fetchEchoTikEnvelope(input, timeout.signal);
      const code = readOptionalNumber(result.envelope.code);
      if (result.response.ok && code === 0) {
        return result.envelope;
      }
      const retryDelay = retryDelays[attempt];
      if (result.response.ok && code === 500 && retryDelay !== undefined) {
        await wait(retryDelay, timeout.signal);
        continue;
      }
      throw createEchoTikError(result.response.status, result.envelope, input.phase);
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "EchoTik request timed out", undefined, "provider_error");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `EchoTik request failed: ${error.message}` : "EchoTik request failed",
      undefined,
      "provider_error",
    );
  } finally {
    timeout.cleanup();
  }
}

async function fetchEchoTikEnvelope(input: EchoTikRequestInput, signal: AbortSignal | undefined) {
  const url = new URL(`${echotikApiBaseUrl}${normalizePath(input.path)}`);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }

  const response = await input.fetcher(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Basic ${createBasicAuthToken(input.credential)}`,
      "user-agent": providerUserAgent,
    },
    signal,
  });

  return {
    response,
    envelope: await readEchoTikEnvelope(response),
  };
}

function wait(delayMs: number, signal: AbortSignal | undefined) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("request aborted"));
      return;
    }
    const handle = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      globalThis.clearTimeout(handle);
      reject(signal?.reason ?? new Error("request aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function normalizePath(value: string) {
  return value.startsWith("/") ? value : `/${value}`;
}

function createBasicAuthToken(credential: EchoTikCredential) {
  return Buffer.from(`${credential.username}:${credential.password}`, "utf8").toString("base64");
}

async function readEchoTikEnvelope(response: Response): Promise<EchoTikEnvelope> {
  const text = await readBoundedResponseText(response);
  if (!text) {
    throw new ProviderRequestError(502, "EchoTik returned an empty response", undefined, "provider_error");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ProviderRequestError(502, "EchoTik returned invalid JSON", undefined, "provider_error");
  }

  const envelope = optionalRecord(payload);
  if (!envelope || readOptionalNumber(envelope.code) === undefined) {
    throw new ProviderRequestError(502, "EchoTik returned an invalid response envelope", undefined, "provider_error");
  }
  return envelope;
}

async function readBoundedResponseText(response: Response) {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (Number.isFinite(parsedLength) && parsedLength > echotikMaxResponseBytes) {
      await cancelResponseBody(response);
      throw responseTooLargeError();
    }
  }
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      totalBytes += result.value.byteLength;
      if (totalBytes > echotikMaxResponseBytes) {
        await reader.cancel();
        throw responseTooLargeError();
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function cancelResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {
    return;
  }
}

function responseTooLargeError() {
  return new ProviderRequestError(
    502,
    `EchoTik response exceeds the ${echotikMaxResponseBytes} byte limit`,
    undefined,
    "provider_error",
  );
}

function createEchoTikError(httpStatus: number, envelope: EchoTikEnvelope, phase: EchoTikPhase) {
  const code = readOptionalNumber(envelope.code);
  const message = optionalString(envelope.message)?.trim() || "EchoTik request failed";
  const requestId = readRequestId(envelope);
  const errorData = requestId ? { requestId } : undefined;
  const normalizedMessage = message.toLowerCase();
  const isAuthError =
    httpStatus === 401 ||
    httpStatus === 403 ||
    code === 401 ||
    code === 403 ||
    normalizedMessage.includes("auth error") ||
    normalizedMessage.includes("unauthorized");

  if (isAuthError) {
    return phase === "validate"
      ? new ProviderRequestError(400, message, errorData, "invalid_input")
      : new ProviderRequestError(401, message, errorData, "credential_expired");
  }

  if (
    httpStatus === 429 ||
    code === 429 ||
    normalizedMessage.includes("rate limit") ||
    normalizedMessage.includes("quota")
  ) {
    return new ProviderRequestError(429, message, errorData, "rate_limited");
  }

  if (httpStatus >= 400 && httpStatus < 500) {
    return new ProviderRequestError(400, message, errorData, "invalid_input");
  }

  return new ProviderRequestError(502, message, errorData, "provider_error");
}

function readRecordArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`, undefined, "provider_error");
  }
  return value.map((item, index) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `${fieldName}[${index}] must be an object`, undefined, "provider_error");
    }
    return record;
  });
}

function normalizeCategory(raw: Record<string, unknown>) {
  return compactObject({
    categoryId: readRequiredString(raw.category_id, "data.category_id"),
    level: readOptionalString(raw.category_level),
    name: readOptionalString(raw.category_name),
    language: readOptionalString(raw.language),
    parentId: readOptionalString(raw.parent_id),
  });
}

function normalizeProductComment(raw: Record<string, unknown>) {
  return compactObject({
    reviewId: readRequiredString(raw.review_id, "data.review_id"),
    productId: readOptionalString(raw.product_id),
    rating: readOptionalInteger(raw.rating),
    text: readOptionalString(raw.display_text),
    reviewedAt: readOptionalInteger(raw.review_timestamp),
    skuId: readOptionalString(raw.sku_id),
    skuSpecification: readOptionalString(raw.sku_specification),
  });
}

function normalizeCategoryOverview(raw: Record<string, unknown>) {
  return compactObject({
    categoryId: readRequiredString(raw.category_id, "data.category_id"),
    region: readOptionalString(raw.priority_region),
    trend: readOptionalString(raw.category_trend),
    priceTrend: readOptionalString(raw.category_price_trend),
    totalGmv: readOptionalNumber(raw.total_gmv_amt),
    gmv1Day: readOptionalNumber(raw.total_gmv_1d_amt),
    gmv7Days: readOptionalNumber(raw.total_gmv_7d_amt),
    gmv30Days: readOptionalNumber(raw.total_gmv_30d_amt),
    totalSales: readOptionalInteger(raw.total_sale_cnt),
    sales1Day: readOptionalInteger(raw.total_sale_1d_cnt),
    sales7Days: readOptionalInteger(raw.total_sale_7d_cnt),
    sales30Days: readOptionalInteger(raw.total_sale_30d_cnt),
    totalProducts: readOptionalInteger(raw.total_product_cnt),
    products1Day: readOptionalInteger(raw.total_product_1d_cnt),
    products7Days: readOptionalInteger(raw.total_product_7d_cnt),
    products30Days: readOptionalInteger(raw.total_product_30d_cnt),
    totalInfluencers: readOptionalInteger(raw.total_ifl_cnt),
    influencers1Day: readOptionalInteger(raw.total_ifl_1d_cnt),
    influencers7Days: readOptionalInteger(raw.total_ifl_7d_cnt),
    influencers30Days: readOptionalInteger(raw.total_ifl_30d_cnt),
    averagePrice: readOptionalNumber(raw.total_spu_avg_price_cnt),
    liveSales: readOptionalInteger(raw.total_live_sale_cnt),
  });
}

function normalizeCategoryTrend(raw: Record<string, unknown>) {
  return compactObject({
    date: readRequiredString(raw.dt, "data.dt"),
    region: readOptionalString(raw.priority_region),
    categoryId: readOptionalString(raw.category_id),
    categoryLevel2Id: readOptionalString(raw.category_l2_id),
    categoryLevel3Id: readOptionalString(raw.category_l3_id),
    dailySales: readOptionalInteger(raw.total_sale_1d_cnt),
    dailyGmv: readOptionalNumber(raw.total_sale_gmv_1d_amt),
  });
}

function normalizeProduct(raw: Record<string, unknown>) {
  const coverUrls = decodeProductCovers(raw.cover_url);
  return compactObject({
    productId: readRequiredString(raw.product_id, "data.product_id"),
    productName: readOptionalString(raw.product_name),
    region: readOptionalString(raw.region),
    categoryId: readOptionalString(raw.category_id),
    categoryLevel2Id: readOptionalString(raw.category_l2_id),
    categoryLevel3Id: readOptionalString(raw.category_l3_id),
    sellerId: readOptionalString(raw.seller_id),
    coverUrl: coverUrls[0]?.url,
    coverUrls: coverUrls.length > 0 ? coverUrls : undefined,
    minimumPrice: readOptionalNumber(raw.min_price),
    maximumPrice: readOptionalNumber(raw.max_price),
    averagePrice: readOptionalNumber(raw.spu_avg_price),
    commissionRate: readOptionalNumber(raw.product_commission_rate),
    rating: readOptionalNumber(raw.product_rating),
    reviewCount: readOptionalInteger(raw.review_count),
    totalSales: readOptionalInteger(raw.total_sale_cnt),
    sales30Days: readOptionalInteger(raw.total_sale_30d_cnt),
    totalGmv: readOptionalNumber(raw.total_sale_gmv_amt),
    gmv30Days: readOptionalNumber(raw.total_sale_gmv_30d_amt),
    influencerCount: readOptionalInteger(raw.total_ifl_cnt),
    videoCount: readOptionalInteger(raw.total_video_cnt),
    liveCount: readOptionalInteger(raw.total_live_cnt),
  });
}

function decodeProductCovers(value: unknown) {
  const decoded = decodeCoverCollection(value);
  return decoded
    .map((item) => {
      const record = optionalRecord(item);
      const url = record ? readOptionalString(record.url) : undefined;
      if (!url) {
        return undefined;
      }
      return compactObject({
        url,
        index: readOptionalInteger(record?.index),
      });
    })
    .filter((item): item is { url: string; index: number | undefined } => item !== undefined)
    .sort((left, right) => (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER));
}

function decodeCoverCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    if (value.startsWith("https://") || value.startsWith("http://")) {
      return [{ url: value }];
    }
  }
  return [];
}

function normalizeProductRanking(raw: Record<string, unknown>) {
  return compactObject({
    productId: readRequiredString(raw.product_id, "data.product_id"),
    productName: readOptionalString(raw.product_name),
    region: readOptionalString(raw.region),
    categoryId: readOptionalString(raw.category_id),
    categoryLevel2Id: readOptionalString(raw.category_l2_id),
    categoryLevel3Id: readOptionalString(raw.category_l3_id),
    minimumPrice: readOptionalNumber(raw.min_price),
    maximumPrice: readOptionalNumber(raw.max_price),
    averagePrice: readOptionalNumber(raw.spu_avg_price),
    commissionRate: readOptionalNumber(raw.product_commission_rate),
    periodSales: readOptionalInteger(raw.total_sale_cnt),
    periodGmv: readOptionalNumber(raw.total_sale_gmv_amt),
    influencerCount: readOptionalInteger(raw.total_ifl_cnt),
    videoCount: readOptionalInteger(raw.total_video_cnt),
    liveCount: readOptionalInteger(raw.total_live_cnt),
  });
}

function normalizeProductTrend(raw: Record<string, unknown>) {
  return compactObject({
    date: readRequiredString(raw.dt, "data.dt"),
    productId: readOptionalString(raw.product_id),
    averagePrice: readOptionalNumber(raw.spu_avg_price),
    dailySales: readOptionalInteger(raw.total_sale_1d_cnt),
    totalSales: readOptionalInteger(raw.total_sale_cnt),
    dailyGmv: readOptionalNumber(raw.total_sale_gmv_1d_amt),
    totalGmv: readOptionalNumber(raw.total_sale_gmv_amt),
    influencerCount: readOptionalInteger(raw.total_ifl_cnt),
    videoCount: readOptionalInteger(raw.total_video_cnt),
    liveCount: readOptionalInteger(raw.total_live_cnt),
  });
}

function normalizeProductInfluencer(raw: Record<string, unknown>) {
  return compactObject({
    userId: readRequiredString(raw.user_id, "data.user_id"),
    productId: readOptionalString(raw.product_id),
    nickname: readOptionalString(raw.nick_name),
    region: readOptionalString(raw.region),
    category: readOptionalString(raw.category),
    avatarUrl: readOptionalString(raw.avatar),
    followerCount: readOptionalInteger(raw.total_followers_cnt),
    likeCount: readOptionalInteger(raw.total_digg_cnt),
    productSales: readOptionalInteger(raw.per_product_ifl_sale_cnt),
    productGmv: readOptionalNumber(raw.per_product_ifl_gmv_amt),
    videoCount: readOptionalInteger(raw.total_post_video_cnt),
    videoViewCount: readOptionalInteger(raw.total_views_cnt),
    liveCount: readOptionalInteger(raw.total_live_cnt),
    liveViewCount: readOptionalInteger(raw.total_live_views_cnt),
  });
}

function normalizeProductVideo(raw: Record<string, unknown>) {
  return compactObject({
    videoId: readRequiredString(raw.video_id, "data.video_id"),
    productId: readOptionalString(raw.product_id),
    userId: readOptionalString(raw.user_id),
    region: readOptionalString(raw.region),
    description: readOptionalString(raw.video_desc),
    createdAt: readOptionalScalarString(raw.create_time),
    durationSeconds: readOptionalInteger(raw.duration),
    playUrl: readOptionalString(raw.play_addr),
    coverUrl: readOptionalString(raw.reflow_cover),
    viewCount: readOptionalInteger(raw.total_views_cnt),
    likeCount: readOptionalInteger(raw.total_digg_cnt),
    commentCount: readOptionalInteger(raw.total_comments_cnt),
    shareCount: readOptionalInteger(raw.total_shares_cnt),
    favoriteCount: readOptionalInteger(raw.total_favorites_cnt),
    productSales: readOptionalInteger(raw.total_video_sale_cnt),
    productGmv: readOptionalNumber(raw.total_video_sale_gmv_amt),
  });
}

function normalizeProductLive(raw: Record<string, unknown>) {
  return compactObject({
    roomId: readRequiredString(raw.room_id, "data.room_id"),
    productId: readOptionalString(raw.product_id),
    productName: readOptionalString(raw.product_name),
    userId: readOptionalString(raw.user_id),
    region: readOptionalString(raw.region),
    createdAt: readOptionalInteger(raw.create_time),
    liveType: normalizeLiveType(raw.live_type),
    coverUrl: readOptionalString(raw.cover_url),
    sellerId: readOptionalString(raw.seller_id),
    sellerName: readOptionalString(raw.seller_name),
    peakViewCount: readOptionalInteger(raw.max_views_cnt),
    totalViewCount: readOptionalInteger(raw.total_views_cnt),
    productCount: readOptionalInteger(raw.total_product_cnt),
    productSales: readOptionalInteger(raw.total_sale_cnt),
    productGmv: readOptionalNumber(raw.total_sale_gmv_amt),
  });
}

function normalizeShop(raw: Record<string, unknown>) {
  return compactObject({
    shopId: readRequiredString(raw.seller_id, "data.seller_id"),
    shopName: readOptionalString(raw.seller_name),
    shopUrl: readOptionalString(raw.seller_link),
    region: readOptionalString(raw.region),
    storeType: normalizeStoreType(raw.from_flag),
    coverUrl: readOptionalString(raw.cover_url),
    rating: readOptionalNumber(raw.rating),
    reviewCount: readOptionalInteger(raw.review_count),
    positiveFeedbackRate: readOptionalNumber(raw.positive_feedback_rate),
    responseRate: readOptionalNumber(raw.response_rate),
    followerCount: readOptionalInteger(raw.followers_count),
    productCount: readOptionalInteger(raw.total_product_cnt),
    influencerCount: readOptionalInteger(raw.total_ifl_cnt),
    videoCount: readOptionalInteger(raw.total_video_cnt) ?? readOptionalInteger(raw.video_count),
    liveCount: readOptionalInteger(raw.total_live_cnt),
    totalSales: readOptionalInteger(raw.total_sale_cnt),
    sales30Days: readOptionalInteger(raw.total_sale_30d_cnt),
    totalGmv: readOptionalNumber(raw.total_sale_gmv_amt),
    gmv30Days: readOptionalNumber(raw.total_sale_gmv_30d_amt),
    averagePrice: readOptionalNumber(raw.spu_avg_price),
  });
}

function normalizeInfluencerDetail(raw: Record<string, unknown>) {
  return compactObject({
    userId: readRequiredString(raw.user_id, "data.user_id"),
    uniqueId: readOptionalString(raw.unique_id),
    nickname: readOptionalString(raw.nick_name),
    signature: readOptionalString(raw.signature),
    region: readOptionalString(raw.region),
    language: readOptionalString(raw.language),
    gender: readOptionalString(raw.gender),
    category: readOptionalString(raw.category),
    avatarUrl: readOptionalString(raw.avatar),
    contactEmail: readOptionalString(raw.contact_email),
    commerceScore: readOptionalNumber(raw.ec_score),
    interactionRate: readOptionalNumber(raw.interaction_rate),
    followerCount: readOptionalInteger(raw.total_followers_cnt),
    followerGrowth7Days: readOptionalInteger(raw.total_followers_7d_cnt),
    followerGrowth30Days: readOptionalInteger(raw.total_followers_30d_cnt),
    followingCount: readOptionalInteger(raw.total_following_cnt),
    likeCount: readOptionalInteger(raw.total_digg_cnt) ?? readOptionalInteger(raw.total_likes_cnt),
    videoCount: readOptionalInteger(raw.total_post_video_cnt),
    liveCount: readOptionalInteger(raw.total_live_cnt),
    productCount: readOptionalInteger(raw.total_product_cnt),
    totalSales: readOptionalInteger(raw.total_sale_cnt),
    totalGmv: readOptionalNumber(raw.total_sale_gmv_amt),
    gmv30Days: readOptionalNumber(raw.total_sale_gmv_30d_amt),
    averageProductPrice30Days: readOptionalNumber(raw.avg_30d_price),
    showcaseEnabled: readOptionalBooleanFlag(raw.show_case_flag),
  });
}

function normalizeVideoDetail(raw: Record<string, unknown>) {
  return compactObject({
    videoId: readRequiredString(raw.video_id, "data.video_id"),
    userId: readOptionalString(raw.user_id),
    uniqueId: readOptionalString(raw.unique_id),
    description: readOptionalString(raw.video_desc),
    region: readOptionalString(raw.region),
    createdAt: readOptionalScalarString(raw.create_time),
    durationSeconds: readOptionalInteger(raw.duration),
    coverUrl: readOptionalString(raw.reflow_cover),
    createdByAi: readOptionalBooleanFlag(raw.created_by_ai),
    isAd: readOptionalBooleanFlag(raw.is_ad),
    viewCount: readOptionalInteger(raw.total_views_cnt),
    views7Days: readOptionalInteger(raw.total_views_7d_cnt),
    views30Days: readOptionalInteger(raw.total_views_30d_cnt),
    likeCount: readOptionalInteger(raw.total_digg_cnt),
    likes7Days: readOptionalInteger(raw.total_digg_7d_cnt),
    likes30Days: readOptionalInteger(raw.total_digg_30d_cnt),
    commentCount: readOptionalInteger(raw.total_comments_cnt),
    favoriteCount: readOptionalInteger(raw.total_favorites_cnt),
    shareCount: readOptionalInteger(raw.total_shares_cnt),
    productSales: readOptionalInteger(raw.total_video_sale_cnt),
    productGmv: readOptionalNumber(raw.total_video_sale_gmv_amt),
  });
}

function normalizeLiveDetail(raw: Record<string, unknown>) {
  return compactObject({
    roomId: readRequiredString(raw.room_id, "data.room_id"),
    userId: readOptionalString(raw.user_id),
    uniqueId: readOptionalString(raw.unique_id),
    nickname: readOptionalString(raw.nick_name),
    title: readOptionalString(raw.title),
    region: readOptionalString(raw.region),
    status: normalizeLiveStatus(raw.live_status),
    liveType: normalizeLiveType(raw.live_type),
    startedAt: readOptionalInteger(raw.create_time),
    finishedAt: readOptionalInteger(raw.finish_time),
    durationSeconds: readOptionalInteger(raw.duration),
    coverUrl: readOptionalString(raw.cover_url),
    avatarUrl: readOptionalString(raw.avatar),
    peakViewCount: readOptionalInteger(raw.max_views_cnt),
    totalViewCount: readOptionalInteger(raw.total_views_cnt),
    followerGrowthRate: readOptionalNumber(raw.followers_growth_rate),
    followerGrowthCount: readOptionalInteger(raw.total_followers_growth_cnt),
    productCount: readOptionalInteger(raw.total_product_cnt),
    activeProductCount: readOptionalInteger(raw.total_active_product_cnt),
    productSales: readOptionalInteger(raw.total_sale_cnt),
    productGmv: readOptionalNumber(raw.total_sale_gmv_amt),
    averageProductPrice: readOptionalNumber(raw.spu_avg_price),
    topProducts: readOptionalString(raw.live_sale_top3_product),
  });
}

function normalizeStoreType(value: unknown) {
  if (readOptionalNumber(value) === 1) {
    return "local";
  }
  if (readOptionalNumber(value) === 2) {
    return "cross_border";
  }
  return value == null ? undefined : "unknown";
}

function normalizeLiveStatus(value: unknown) {
  if (readOptionalNumber(value) === 2) {
    return "live";
  }
  if (readOptionalNumber(value) === 4) {
    return "ended";
  }
  return value == null ? undefined : "unknown";
}

function normalizeLiveType(value: unknown) {
  if (readOptionalNumber(value) === 1) {
    return "shop";
  }
  if (readOptionalNumber(value) === 2) {
    return "creator";
  }
  return value == null ? undefined : "unknown";
}

function readPage(input: Record<string, unknown>) {
  return readOptionalInteger(input.page) ?? 1;
}

function readPageSize(input: Record<string, unknown>) {
  return readOptionalInteger(input.pageSize) ?? 10;
}

function readRequestId(envelope: EchoTikEnvelope) {
  return readOptionalString(envelope.requestId) ?? null;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(502, `${fieldName} is missing`, undefined, "provider_error");
  }
  return value.trim();
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

function assertRanges(input: Record<string, unknown>, ranges: readonly (readonly [string, string])[]): void {
  for (const [minimumField, maximumField] of ranges) {
    const minimum = input[minimumField];
    const maximum = input[maximumField];
    if (typeof minimum === "number" && typeof maximum === "number" && minimum > maximum) {
      throw new ProviderRequestError(
        400,
        `${minimumField} must not exceed ${maximumField}`,
        undefined,
        "invalid_input",
      );
    }
  }
}

function assertDateRange(input: Record<string, unknown>, maximumDays?: number): void {
  const startDate = readRequiredString(input.startDate, "startDate");
  const endDate = readRequiredString(input.endDate, "endDate");
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (start > end) {
    throw new ProviderRequestError(400, "startDate must not be after endDate", undefined, "invalid_input");
  }
  if (maximumDays !== undefined && end - start > (maximumDays - 1) * 24 * 60 * 60 * 1_000) {
    throw new ProviderRequestError(
      400,
      `EchoTik product trends support at most ${maximumDays} calendar days`,
      undefined,
      "invalid_input",
    );
  }
}

function assertTikTokShareUrl(value: unknown): void {
  const shareUrl = readRequiredString(value, "shareUrl");
  let url: URL;
  try {
    url = new URL(shareUrl);
  } catch {
    throw new ProviderRequestError(400, "shareUrl must be a valid URL", undefined, "invalid_input");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    (url.hostname !== "tiktok.com" && !url.hostname.endsWith(".tiktok.com"))
  ) {
    throw new ProviderRequestError(
      400,
      "shareUrl must use a TikTok HTTP or HTTPS hostname",
      undefined,
      "invalid_input",
    );
  }
}

function readRegion(value: unknown): string {
  return readRequiredString(value, "region").toUpperCase();
}

function readOptionalScalarString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readRequiredInteger(value: unknown, fieldName: string) {
  const parsed = readOptionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} must be an integer`, undefined, "invalid_input");
  }
  return parsed;
}

function readOptionalInteger(value: unknown) {
  const number = readOptionalNumber(value);
  return number !== undefined && Number.isInteger(number) ? number : undefined;
}

function readOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readRequiredStringArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a non-empty string array`, undefined, "invalid_input");
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new ProviderRequestError(400, `${fieldName}[${index}] is required`, undefined, "invalid_input");
    }
    return item.trim();
  });
}

function readOptionalStringArray(value: unknown, fieldName: string) {
  return value === undefined ? undefined : readRequiredStringArray(value, fieldName);
}

function readOptionalBooleanFlag(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === 1 || value === "1" || value === "true") {
    return true;
  }
  if (value === 0 || value === "0" || value === "false") {
    return false;
  }
  return undefined;
}

function mapOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? (value ? 1 : 0) : undefined;
}

function mapSortOrder(value: unknown) {
  return mapOptionalEnum(value, { asc: 0, desc: 1 });
}

function mapOptionalEnum<const TValues extends Record<string, number>>(value: unknown, values: TValues) {
  if (typeof value !== "string") {
    return undefined;
  }
  return values[value];
}

function mapRequiredEnum<const TValues extends Record<string, number>>(
  value: unknown,
  fieldName: string,
  values: TValues,
) {
  const mapped = mapOptionalEnum(value, values);
  if (mapped === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is invalid`, undefined, "invalid_input");
  }
  return mapped;
}
