import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { BearerProviderContext } from "../provider-runtime.ts";

import { compactObject, looseArray, optionalRecord, recordOrEmpty } from "../../core/cast.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const tiktokBusinessApiBaseUrl = "https://business-api.tiktok.com";
const tiktokBusinessUserInfoUrl = `${tiktokBusinessApiBaseUrl}/open_api/v1.3/user/info/`;
const tiktokBusinessAdvertiserUrl = `${tiktokBusinessApiBaseUrl}/open_api/v1.3/oauth2/advertiser/get/`;

const tiktokBusinessPermissionScopeHint =
  "In the TikTok app Permission Scope page, select Required: 广告账号管理, 广告管理, 数据报表. Recommended: Onsite Commerce Store.";

type TikTokBusinessEnvelope<T> = {
  code?: number;
  message?: string;
  request_id?: string;
  data?: T;
};

type TikTokBusinessActionContext = BearerProviderContext;

type TikTokBusinessActionHandler = (
  input: Record<string, unknown>,
  context: TikTokBusinessActionContext,
) => Promise<unknown>;

type TikTokBusinessQueryValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | readonly Record<string, unknown>[]
  | Record<string, unknown>
  | undefined;

type TikTokBusinessApiVersion = "v1.3" | "v2.0";

export const tiktokBusinessActionHandlers: ProviderActionHandlers<"tiktok_business", TikTokBusinessActionHandler> = {
  list_advertisers(input, context) {
    return listAdvertisers(input, context);
  },
  list_campaigns(input, context) {
    return listCampaigns(input, context);
  },
  list_gmv_max_stores(input, context) {
    return listGmvMaxStores(input, context);
  },
  check_gmv_max_shop_ad_usage(input, context) {
    return checkGmvMaxShopAdUsage(input, context);
  },
  get_gmv_max_exclusive_authorization(input, context) {
    return getGmvMaxExclusiveAuthorization(input, context);
  },
  get_gmv_max_identities(input, context) {
    return getGmvMaxIdentities(input, context);
  },
  get_gmv_max_videos(input, context) {
    return getGmvMaxVideos(input, context);
  },
  list_gmv_max_occupied_custom_shop_ads(input, context) {
    return listGmvMaxOccupiedCustomShopAds(input, context);
  },
  get_gmv_max_custom_anchor_video_list(input, context) {
    return getGmvMaxCustomAnchorVideoList(input, context);
  },
  get_gmv_max_shop_video_anchors(input, context) {
    return getGmvMaxShopVideoAnchors(input, context);
  },
  get_gmv_max_campaign_info(input, context) {
    return getGmvMaxCampaignInfo(input, context);
  },
  list_gmv_max_sessions(input, context) {
    return listGmvMaxSessions(input, context);
  },
  get_gmv_max_sessions(input, context) {
    return getGmvMaxSessions(input, context);
  },
  get_gmv_max_bid_recommendation(input, context) {
    return getGmvMaxBidRecommendation(input, context);
  },
  get_gmv_max_report(input, context) {
    return getGmvMaxReport(input, context);
  },
};

export async function validateTikTokBusinessCredential(
  input: { accessToken: string; metadata: Record<string, unknown> },
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const envelope = await tiktokBusinessJsonEnvelopeRequest<{
    core_user_id?: unknown;
    display_name?: unknown;
    email?: unknown;
    avatar_url?: unknown;
    id?: unknown;
  }>({
    url: tiktokBusinessUserInfoUrl,
    fetcher,
    accessToken: input.accessToken,
  });
  const user = recordOrEmpty(envelope.data);
  const userId = stringOrUndefined(user.core_user_id) ?? stringOrUndefined(user.id);
  if (!userId) {
    throw new ProviderRequestError(502, "tiktok business user info is missing core_user_id");
  }

  const displayName = stringOrUndefined(user.display_name) || userId;
  const grantedScopes = normalizeProviderScopes(input.metadata.scope);
  return {
    profile: {
      accountId: userId,
      displayName,
      grantedScopes,
    },
    grantedScopes,
    metadata: compactObject({
      coreUserId: userId,
      email: stringOrUndefined(user.email),
      avatarUrl: stringOrUndefined(user.avatar_url),
    }),
  };
}

async function listGmvMaxStores(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<{
    store_list?: unknown[];
  }>("/gmv_max/store/list/", context, {
    advertiser_id: stringValue(input.advertiserId),
  });

  return {
    stores: looseArray(envelope.data?.store_list).map(normalizeStore),
    requestId: envelope.request_id ?? "",
    raw: recordOrEmpty(envelope.data),
  };
}

async function listAdvertisers(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessJsonEnvelopeRequest<{
    list?: unknown[];
    advertiser_list?: unknown[];
  }>({
    url: tiktokBusinessAdvertiserUrl,
    fetcher: context.fetcher,
    accessToken: context.accessToken,
  });

  return {
    advertisers: readTikTokBusinessAdvertisers(recordOrEmpty(envelope.data)),
    requestId: envelope.request_id ?? "",
    raw: recordOrEmpty(envelope.data),
  };
}

async function listCampaigns(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<Record<string, unknown>>("/campaign/get/", context, {
    advertiser_id: stringValue(input.advertiserId),
    filtering: normalizeCampaignFiltering(input.filtering),
    fields: optionalStringArrayValue(input.fields),
    exclude_field_types_in_response: optionalStringArrayValue(input.excludeFieldTypesInResponse),
    page: numberOrUndefined(input.page),
    page_size: numberOrUndefined(input.pageSize),
  });
  const data = recordOrEmpty(envelope.data);

  return {
    campaigns: looseArray(data.list),
    pageInfo: recordOrEmpty(data.page_info),
    requestId: envelope.request_id ?? "",
    raw: data,
  };
}

async function checkGmvMaxShopAdUsage(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<Record<string, unknown>>("/gmv_max/store/shop_ad_usage_check/", context, {
    advertiser_id: stringValue(input.advertiserId),
    store_id: stringValue(input.storeId),
  });
  const data = recordOrEmpty(envelope.data);

  return {
    runningCustomShopAds: booleanValue(data.has_roi1_ads),
    promoteAllProductsAllowed: booleanValue(data.allow_create_roi2_ad),
    requestId: envelope.request_id ?? "",
    raw: data,
  };
}

async function getGmvMaxExclusiveAuthorization(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<Record<string, unknown>>("/gmv_max/exclusive_authorization/get/", context, {
    advertiser_id: stringValue(input.advertiserId),
    store_id: stringValue(input.storeId),
    store_authorized_bc_id: stringValue(input.storeAuthorizedBcId),
  });
  const data = recordOrEmpty(envelope.data);

  return compactObject({
    advertiserId: stringOrUndefined(data.advertiser_id),
    advertiserName: stringOrUndefined(data.advertiser_name),
    advertiserStatus: stringOrUndefined(data.advertiser_status),
    authorizationStatus: stringOrUndefined(data.authorization_status),
    identityId: stringOrUndefined(data.mutex_asset_id),
    storeId: stringOrUndefined(data.store_id),
    requestId: envelope.request_id ?? "",
    raw: data,
  });
}

async function getGmvMaxIdentities(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<{
    identity_list?: unknown[];
  }>("/gmv_max/identity/get/", context, {
    advertiser_id: stringValue(input.advertiserId),
    store_id: stringValue(input.storeId),
    store_authorized_bc_id: stringValue(input.storeAuthorizedBcId),
  });

  return {
    identities: looseArray(envelope.data?.identity_list).map(normalizeIdentity),
    requestId: envelope.request_id ?? "",
    raw: recordOrEmpty(envelope.data),
  };
}

async function getGmvMaxVideos(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<Record<string, unknown>>("/gmv_max/video/get/", context, {
    advertiser_id: stringValue(input.advertiserId),
    store_id: stringValue(input.storeId),
    store_authorized_bc_id: stringValue(input.storeAuthorizedBcId),
    spu_id_list: optionalStringArrayValue(input.spuIdList),
    identity_list: optionalObjectArrayValue(input.identityList),
    need_auth_code_video: booleanOrUndefined(input.needAuthCodeVideo),
    custom_posts_eligible: booleanOrUndefined(input.customPostsEligible),
    sort_field: stringOrUndefined(input.sortField),
    sort_type: stringOrUndefined(input.sortType),
    keyword: stringOrUndefined(input.keyword),
    page: numberOrUndefined(input.page),
    page_size: numberOrUndefined(input.pageSize),
  });
  const data = recordOrEmpty(envelope.data);

  return {
    videos: looseArray(data.video_list ?? data.list),
    pageInfo: recordOrEmpty(data.page_info),
    requestId: envelope.request_id ?? "",
    raw: data,
  };
}

async function listGmvMaxOccupiedCustomShopAds(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<Record<string, unknown>>(
    "/gmv_max/occupied_custom_shop_ads/list/",
    context,
    {
      advertiser_id: stringValue(input.advertiserId),
      store_id: stringValue(input.storeId),
      asset_ids: stringArrayValue(input.assetIds),
      occupied_asset_type: stringValue(input.occupiedAssetType),
    },
  );
  const data = recordOrEmpty(envelope.data);

  return {
    occupiedCustomShopAds: looseArray(data.occupied_shop_ads ?? data.occupied_custom_shop_ads ?? data.list),
    requestId: envelope.request_id ?? "",
    raw: data,
  };
}

async function getGmvMaxCustomAnchorVideoList(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<Record<string, unknown>>(
    "/gmv_max/creation/custom_anchor_video_list/get/",
    context,
    {
      advertiser_id: stringValue(input.advertiserId),
      campaign_custom_anchor_video_id: stringValue(input.campaignCustomAnchorVideoId),
      custom_anchor_video_list: objectArrayValue(input.customAnchorVideoList),
    },
    "v2.0",
  );
  const data = recordOrEmpty(envelope.data);

  return {
    customAnchorVideos: looseArray(data.custom_anchor_video_list ?? data.anchor_video_list ?? data.list),
    requestId: envelope.request_id ?? "",
    raw: data,
  };
}

async function getGmvMaxShopVideoAnchors(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<Record<string, unknown>>(
    "/gmv_max/creation/shop_video/video_anchors/",
    context,
    {
      advertiser_id: stringValue(input.advertiserId),
      store_id: stringOrUndefined(input.storeId),
      store_authorized_bc_id: stringOrUndefined(input.storeAuthorizedBcId),
      video_ids: optionalStringArrayValue(input.videoIds),
      page: numberOrUndefined(input.page),
      page_size: numberOrUndefined(input.pageSize),
    },
    "v2.0",
  );
  const data = recordOrEmpty(envelope.data);

  return {
    videoAnchors: looseArray(data.video_anchor_list ?? data.video_anchors ?? data.list),
    pageInfo: recordOrEmpty(data.page_info),
    requestId: envelope.request_id ?? "",
    raw: data,
  };
}

async function getGmvMaxCampaignInfo(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<{
    gmv_max_data?: Record<string, unknown>;
  }>("/campaign/gmv_max/info/", context, {
    advertiser_id: stringValue(input.advertiserId),
    campaign_id: stringValue(input.campaignId),
  });

  return {
    campaign: recordOrEmpty(envelope.data?.gmv_max_data),
    requestId: envelope.request_id ?? "",
    raw: recordOrEmpty(envelope.data),
  };
}

async function listGmvMaxSessions(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<{
    session_list?: unknown[];
  }>("/campaign/gmv_max/session/list/", context, {
    advertiser_id: stringValue(input.advertiserId),
    campaign_id: stringValue(input.campaignId),
  });

  return normalizeSessionEnvelope(envelope);
}

async function getGmvMaxSessions(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<{
    session_list?: unknown[];
  }>("/campaign/gmv_max/session/get/", context, {
    advertiser_id: stringValue(input.advertiserId),
    session_ids: stringArrayValue(input.sessionIds),
  });

  return normalizeSessionEnvelope(envelope);
}

async function getGmvMaxBidRecommendation(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<Record<string, unknown>>("/gmv_max/bid/recommend/", context, {
    advertiser_id: stringValue(input.advertiserId),
    store_id: stringValue(input.storeId),
    shopping_ads_type: stringValue(input.shoppingAdsType),
    optimization_goal: stringValue(input.optimizationGoal),
    item_group_ids: optionalStringArrayValue(input.itemGroupIds),
    identity_id: stringOrUndefined(input.identityId),
  });
  const data = recordOrEmpty(envelope.data);

  return {
    budget: data.budget,
    cpaBid: data.cpa_bid,
    roasBid: data.roas_bid,
    requestId: envelope.request_id ?? "",
    raw: data,
  };
}

async function getGmvMaxReport(input: Record<string, unknown>, context: TikTokBusinessActionContext) {
  const envelope = await tiktokBusinessGet<Record<string, unknown>>("/gmv_max/report/get/", context, {
    advertiser_id: stringValue(input.advertiserId),
    store_ids: stringArrayValue(input.storeIds),
    dimensions: stringArrayValue(input.dimensions),
    metrics: stringArrayValue(input.metrics),
    start_date: stringValue(input.startDate),
    end_date: stringValue(input.endDate),
    enable_total_metrics: booleanOrUndefined(input.enableTotalMetrics),
    filtering: normalizeReportFiltering(input.filtering),
    sort_field: stringOrUndefined(input.sortField),
    sort_type: stringOrUndefined(input.sortType),
    page: numberOrUndefined(input.page),
    page_size: numberOrUndefined(input.pageSize),
    context_info: normalizeContextInfo(input.contextInfo),
  });
  const data = recordOrEmpty(envelope.data);

  return {
    rows: looseArray(data.list),
    pageInfo: recordOrEmpty(data.page_info),
    totalMetrics: recordOrEmpty(data.total_metrics),
    requestId: envelope.request_id ?? "",
    raw: data,
  };
}

async function tiktokBusinessGet<T>(
  path: string,
  context: TikTokBusinessActionContext,
  query: Record<string, TikTokBusinessQueryValue>,
  apiVersion: TikTokBusinessApiVersion = "v1.3",
) {
  return tiktokBusinessJsonEnvelopeRequest<T>({
    url: buildTikTokBusinessUrl(path, query, apiVersion),
    fetcher: context.fetcher,
    accessToken: context.accessToken,
  });
}

async function tiktokBusinessJsonEnvelopeRequest<T>(options: {
  url: string;
  fetcher: typeof fetch;
  method?: string;
  body?: unknown;
  accessToken?: string;
}): Promise<TikTokBusinessEnvelope<T>> {
  const response = await options.fetcher(options.url, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: buildTikTokBusinessHeaders(options.accessToken, options.body !== undefined),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const envelope = await readTikTokBusinessEnvelope<T>(response);

  if (!response.ok || (typeof envelope.code === "number" && envelope.code !== 0)) {
    throw createTikTokBusinessError(response.status, envelope);
  }

  return envelope;
}

function buildTikTokBusinessHeaders(accessToken: string | undefined, hasBody: boolean) {
  return {
    accept: "application/json",
    ...(hasBody ? { "content-type": "application/json" } : {}),
    ...(accessToken ? { "Access-Token": accessToken } : {}),
  };
}

async function readTikTokBusinessEnvelope<T>(response: Response) {
  try {
    return (await response.json()) as TikTokBusinessEnvelope<T>;
  } catch {
    throw new ProviderRequestError(502, "tiktok business returned an invalid JSON response");
  }
}

function createTikTokBusinessError<T>(status: number, envelope: TikTokBusinessEnvelope<T>) {
  const message =
    typeof envelope.message === "string" && envelope.message.trim()
      ? envelope.message.trim()
      : `tiktok business request failed with status ${status}`;
  const code = envelope.code;

  if (status === 401 || code === 40100 || code === 40101 || code === 40102) {
    return new ProviderRequestError(status || 401, message);
  }
  if (status === 403 || code === 40002 || code === 40105) {
    return new ProviderRequestError(
      status || 403,
      `${stripTrailingSentencePunctuation(message)}. ${tiktokBusinessPermissionScopeHint}`,
    );
  }
  if (status === 400 || status === 422 || code === 40001 || code === 40003) {
    return new ProviderRequestError(400, message);
  }
  if (status === 429) {
    return new ProviderRequestError(status || 429, message);
  }

  return new ProviderRequestError(status || 502, message);
}

function stripTrailingSentencePunctuation(value: string) {
  let result = value.trim();
  while (result.length > 0) {
    const lastChar = result.at(-1);
    if (
      lastChar !== "." &&
      lastChar !== "!" &&
      lastChar !== "?" &&
      lastChar !== "。" &&
      lastChar !== "！" &&
      lastChar !== "？"
    ) {
      break;
    }
    result = result.slice(0, -1).trimEnd();
  }
  return result;
}

function normalizeProviderScopes(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(normalizeProviderScopeValue).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.replaceAll(",", " ").split(" ").map(normalizeProviderScope).filter(Boolean);
  }
  return [];
}

function normalizeProviderScopeValue(value: unknown) {
  if (typeof value === "string") {
    return normalizeProviderScope(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function normalizeProviderScope(value: string) {
  return value.trim();
}

function readTikTokBusinessAdvertisers(data: { list?: unknown[]; advertiser_list?: unknown[] }) {
  return looseArray(data.list ?? data.advertiser_list)
    .map((item) => {
      const record = recordOrEmpty(item);
      const advertiserId = stringValue(record.advertiser_id);
      if (!advertiserId) {
        return null;
      }

      return {
        advertiserId,
        advertiserName: stringOrUndefined(record.advertiser_name),
        advertiserRole: stringOrUndefined(record.advertiser_role),
        raw: record,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function buildTikTokBusinessUrl(
  path: string,
  query: Record<string, TikTokBusinessQueryValue>,
  apiVersion: TikTokBusinessApiVersion = "v1.3",
) {
  const url = new URL(`/open_api/${apiVersion}${path}`, tiktokBusinessApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
      url.searchParams.set(key, JSON.stringify(value));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function normalizeStore(item: unknown) {
  const record = recordOrEmpty(item);
  return compactObject({
    storeId: stringValue(record.store_id),
    storeName: stringValue(record.store_name),
    storeCode: stringOrUndefined(record.store_code),
    storeStatus: stringOrUndefined(record.shop_status),
    storeRole: stringOrUndefined(record.store_user_role),
    storeAuthorizedBcId: stringOrUndefined(record.store_authorized_bc_id),
    gmvMaxAvailable: booleanOrUndefined(record.is_gmv_max_available),
    ownerBusinessCenter: booleanOrUndefined(record.is_owner_bc),
    targetingRegionCodes: optionalStringArrayValue(record.targeting_region_codes),
    thumbnailUrl: stringOrUndefined(record.thumbnail_url),
    raw: record,
  });
}

function normalizeIdentity(item: unknown) {
  const record = recordOrEmpty(item);
  return compactObject({
    identityId: stringValue(record.identity_id),
    identityType: stringOrUndefined(record.identity_type),
    displayName: stringOrUndefined(record.name),
    userName: stringOrUndefined(record.user_name),
    profileImage: stringOrUndefined(record.avatar_url),
    storeId: stringOrUndefined(record.store_id),
    identityAuthorizedBcId: stringOrUndefined(record.identity_authorized_bc_id),
    identityAuthorizedShopId: stringOrUndefined(record.identity_authorized_shop_id),
    liveGmvMaxAvailable: booleanOrUndefined(record.available_for_live),
    productGmvMaxAvailable: booleanOrUndefined(record.available_for_product),
    runningCustomShopAds: booleanOrUndefined(record.has_roi1_ads),
    unavailableReason: stringOrUndefined(record.unavailable_reason_for_live),
    raw: record,
  });
}

function normalizeSessionEnvelope(envelope: TikTokBusinessEnvelope<{ session_list?: unknown[] }>) {
  return {
    sessions: looseArray(envelope.data?.session_list).map(normalizeSession),
    requestId: envelope.request_id ?? "",
    raw: recordOrEmpty(envelope.data),
  };
}

function normalizeSession(item: unknown) {
  const record = recordOrEmpty(item);
  return compactObject({
    sessionId: stringValue(record.id),
    campaignId: stringOrUndefined(record.campaign_id),
    bidType: stringOrUndefined(record.session_type),
    budget: record.budget,
    scheduleType: stringOrUndefined(record.schedule_type),
    scheduleStartTime: record.schedule_start_time,
    scheduleEndTime: record.schedule_end_time,
    productList: Array.isArray(record.product_list)
      ? record.product_list.map((product) => recordOrEmpty(product))
      : undefined,
    itemId: stringOrUndefined(record.item_id),
    raw: record,
  });
}

function normalizeReportFiltering(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    campaign_ids: optionalStringArrayValue(record.campaignIds),
    campaign_name: stringOrUndefined(record.campaignName),
    campaign_statuses: optionalStringArrayValue(record.campaignStatuses),
    gmv_max_promotion_types: optionalStringArrayValue(record.gmvMaxPromotionTypes),
    item_group_ids: optionalStringArrayValue(record.itemGroupIds),
    item_ids: optionalStringArrayValue(record.itemIds),
    creative_types: optionalStringArrayValue(record.creativeTypes),
    room_ids: optionalStringArrayValue(record.roomIds),
    search_word: stringOrUndefined(record.searchWord),
    creative_delivery_statuses: optionalStringArrayValue(record.creativeDeliveryStatuses),
  });
}

function normalizeCampaignFiltering(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    campaign_ids: optionalStringArrayValue(record.campaignIds),
    campaign_name: stringOrUndefined(record.campaignName),
    primary_status: stringOrUndefined(record.primaryStatus),
    secondary_status: stringOrUndefined(record.secondaryStatus),
    objective_type: stringOrUndefined(record.objectiveType),
    campaign_type: stringOrUndefined(record.campaignType),
    buying_types: optionalStringArrayValue(record.buyingTypes),
    campaign_system_origins: optionalStringArrayValue(record.campaignSystemOrigins),
    campaign_product_source: stringOrUndefined(record.campaignProductSource),
    creative_campaign_type: optionalStringArrayValue(record.creativeCampaignType),
    optimization_goal: stringOrUndefined(record.optimizationGoal),
    sales_destination: stringOrUndefined(record.salesDestination),
    creation_filter_start_time: stringOrUndefined(record.creationFilterStartTime),
    creation_filter_end_time: stringOrUndefined(record.creationFilterEndTime),
    is_smart_performance_campaign: booleanOrUndefined(record.isSmartPerformanceCampaign),
    split_test_enabled: booleanOrUndefined(record.splitTestEnabled),
  });
}

function normalizeContextInfo(value: unknown) {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  return compactObject({
    app_id: numberOrUndefined(record.appId),
    core_user_id: numberOrUndefined(record.coreUserId),
    developer_id: numberOrUndefined(record.developerId),
    x_forwarded_for: stringOrUndefined(record.xForwardedFor),
    x_real_ip: stringOrUndefined(record.xRealIp),
    user_agent: stringOrUndefined(record.userAgent),
    referer: stringOrUndefined(record.referer),
  });
}

function optionalObjectArrayValue(value: unknown) {
  const values = looseArray(value)
    .map(recordOrEmpty)
    .filter((item) => Object.keys(item).length > 0);
  return values.length > 0 ? values : undefined;
}

function objectArrayValue(value: unknown) {
  return looseArray(value).map(recordOrEmpty).filter(Boolean);
}

function stringArrayValue(value: unknown) {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function optionalStringArrayValue(value: unknown) {
  const values = stringArrayValue(value);
  return values.length > 0 ? values : undefined;
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function stringOrUndefined(value: unknown) {
  const text = stringValue(value);
  return text ? text : undefined;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function booleanOrUndefined(value: unknown) {
  return value === undefined ? undefined : booleanValue(value);
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
