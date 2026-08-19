import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalRecord as asOptionalObject,
  optionalString as asOptionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const tikhubApiBaseUrl = "https://api.tikhub.io";
const tikhubDefaultRequestTimeoutMs = 45_000;
const tikhubUserScope = "/api/v1/tikhub/user/";
const tikhubTiktokWebScope = "/api/v1/tiktok/web/";
const tikhubDouyinWebScope = "/api/v1/douyin/web/";
const tikhubXiaohongshuAppV2Scope = "/api/v1/xiaohongshu/app_v2/";
const tikhubXiaohongshuWebV2Scope = "/api/v1/xiaohongshu/web_v2/";
const tikhubDouyinSearchScope = "/api/v1/douyin/search/";
const tikhubDouyinBillboardScope = "/api/v1/douyin/billboard/";
const tikhubXiaohongshuDefaultSearchPage = 1;
const tikhubXiaohongshuDefaultSearchSort = "general";
const tikhubXiaohongshuDefaultSearchNoteType = "不限";
const tikhubXiaohongshuDefaultSearchTimeFilter = "不限";
const tikhubXiaohongshuDefaultSearchSource = "explore_feed";
const tikhubXiaohongshuDefaultAiMode = 0;

type TikHubPhase = "validate" | "execute";
type TikHubActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type TikHubMethod = "GET" | "POST";
type TikHubRequestValue = string | number | boolean | undefined;

type TikHubEnvelope = {
  code?: number | null;
  requestId?: string | null;
  message?: string | null;
  router?: string | null;
  params?: Record<string, unknown> | null;
};

export const tikhubActionHandlers: ProviderActionHandlers<"tikhub", TikHubActionHandler> = {
  async get_user_daily_usage(_input, context) {
    const payload = await requestTikHubJson({
      path: "/api/v1/tikhub/user/get_user_daily_usage",
      apiKey: context.apiKey,
      params: {},
      fetcher: context.fetcher,
      phase: "execute",
    });
    const data = payload.data;

    return {
      envelope: normalizeEnvelope(payload),
      usage: Array.isArray(data) ? data.filter(isRecord) : [],
      rawData: data,
      raw: payload,
    };
  },
  async get_user_info(_input, context) {
    const payload = await requestTikHubJson({
      path: "/api/v1/tikhub/user/get_user_info",
      apiKey: context.apiKey,
      params: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return normalizeUserInfo(payload);
  },
  async get_endpoint_info(input, context) {
    const endpoint = readEndpoint(input.endpoint);
    const payload = await requestTikHubJson({
      path: "/api/v1/tikhub/user/get_endpoint_info",
      apiKey: context.apiKey,
      params: { endpoint },
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      envelope: normalizeEnvelope(payload),
      endpoint,
      endpointInfo: payload.data,
      raw: payload,
    };
  },
  async get_all_endpoints_info(_input, context) {
    const payload = await requestTikHubJson({
      path: "/api/v1/tikhub/user/get_all_endpoints_info",
      apiKey: context.apiKey,
      params: {},
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      envelope: normalizeEnvelope(payload),
      endpoints: payload.data,
      raw: payload,
    };
  },
  async calculate_price(input, context) {
    const endpoint = readEndpoint(input.endpoint);
    const requestPerDay =
      typeof input.requestPerDay === "number" && Number.isInteger(input.requestPerDay) ? input.requestPerDay : 1;
    const payload = await requestTikHubJson({
      path: "/api/v1/tikhub/user/calculate_price",
      apiKey: context.apiKey,
      params: {
        endpoint,
        request_per_day: String(requestPerDay),
      },
      fetcher: context.fetcher,
      phase: "execute",
    });

    return {
      envelope: normalizeEnvelope(payload),
      endpoint,
      requestPerDay,
      price: payload.data,
      raw: payload,
    };
  },
  async fetch_tiktok_user_profile(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/tiktok/web/fetch_user_profile",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        uniqueId: readOptionalNonEmptyString(input.uniqueId),
        secUid: readOptionalNonEmptyString(input.secUid),
      }),
      outputKey: "profile",
    });
  },
  async fetch_tiktok_post_detail(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/tiktok/web/fetch_post_detail",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: {
        itemId: readRequiredString(input.itemId, "itemId"),
      },
      outputKey: "post",
    });
  },
  async fetch_tiktok_user_posts(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/tiktok/web/fetch_user_post",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        secUid: readRequiredString(input.secUid, "secUid"),
        cursor: readOptionalInteger(input.cursor),
        count: readOptionalInteger(input.count),
        coverFormat: readOptionalInteger(input.coverFormat),
        post_item_list_request_type: readOptionalInteger(input.postItemListRequestType),
      }),
      outputKey: "posts",
    });
  },
  async fetch_tiktok_post_comments(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/tiktok/web/fetch_post_comment",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        aweme_id: readRequiredString(input.awemeId, "awemeId"),
        cursor: readOptionalInteger(input.cursor),
        count: readOptionalInteger(input.count),
        current_region: readOptionalNonEmptyString(input.currentRegion),
      }),
      outputKey: "comments",
    });
  },
  async search_tiktok_users(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/tiktok/web/fetch_search_user",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        keyword: readRequiredString(input.keyword, "keyword"),
        cursor: readOptionalInteger(input.cursor),
        search_id: readOptionalNonEmptyString(input.searchId),
      }),
      outputKey: "results",
    });
  },
  async fetch_tiktok_tag_detail(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/tiktok/web/fetch_tag_detail",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: {
        tag_name: readRequiredString(input.tagName, "tagName"),
      },
      outputKey: "results",
    });
  },
  async fetch_tiktok_tag_posts(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/tiktok/web/fetch_tag_post",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        challengeID: readRequiredString(input.challengeId, "challengeId"),
        count: readOptionalInteger(input.count),
        cursor: readOptionalInteger(input.cursor),
      }),
      outputKey: "posts",
    });
  },
  async fetch_douyin_video_detail(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/douyin/web/fetch_one_video",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        aweme_id: readRequiredString(input.awemeId, "awemeId"),
        need_anchor_info: readOptionalBoolean(input.needAnchorInfo),
      }),
      outputKey: "post",
    });
  },
  async fetch_douyin_video_by_share_url(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/douyin/web/fetch_one_video_by_share_url",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: {
        share_url: readRequiredString(input.shareUrl, "shareUrl"),
      },
      outputKey: "post",
    });
  },
  async fetch_douyin_user_profile_by_uid(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/douyin/web/fetch_user_profile_by_uid",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: {
        uid: readRequiredString(input.uid, "uid"),
      },
      outputKey: "profile",
    });
  },
  async fetch_douyin_user_profile_by_short_id(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/douyin/web/fetch_user_profile_by_short_id",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: {
        short_id: readRequiredString(input.shortId, "shortId"),
      },
      outputKey: "profile",
    });
  },
  async fetch_douyin_user_posts(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/douyin/web/fetch_user_post_videos",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        sec_user_id: readRequiredString(input.secUserId, "secUserId"),
        max_cursor: readOptionalNonEmptyString(input.maxCursor),
        count: readOptionalInteger(input.count),
        filter_type: readOptionalNonEmptyString(input.filterType),
      }),
      outputKey: "posts",
    });
  },
  async fetch_douyin_video_comments(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/douyin/web/fetch_video_comments",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        aweme_id: readRequiredString(input.awemeId, "awemeId"),
        cursor: readOptionalInteger(input.cursor),
        count: readOptionalInteger(input.count),
      }),
      outputKey: "comments",
    });
  },
  async fetch_douyin_video_comment_replies(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/douyin/web/fetch_video_comment_replies",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        item_id: readRequiredString(input.itemId, "itemId"),
        comment_id: readRequiredString(input.commentId, "commentId"),
        cursor: readOptionalInteger(input.cursor),
        count: readOptionalInteger(input.count),
      }),
      outputKey: "replies",
    });
  },
  async search_xiaohongshu_notes(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/xiaohongshu/app_v2/search_notes",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        keyword: readRequiredString(input.keywords, "keywords"),
        page: readOptionalInteger(input.page) ?? tikhubXiaohongshuDefaultSearchPage,
        sort_type: readOptionalNonEmptyString(input.sortType) ?? tikhubXiaohongshuDefaultSearchSort,
        note_type: normalizeXiaohongshuAppV2NoteType(input.noteType) ?? tikhubXiaohongshuDefaultSearchNoteType,
        time_filter: tikhubXiaohongshuDefaultSearchTimeFilter,
        source: tikhubXiaohongshuDefaultSearchSource,
        ai_mode: tikhubXiaohongshuDefaultAiMode,
      }),
      outputKey: "results",
    });
  },
  async search_xiaohongshu_users(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/xiaohongshu/app_v2/search_users",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        keyword: readRequiredString(input.keywords, "keywords"),
        page: readOptionalInteger(input.page) ?? tikhubXiaohongshuDefaultSearchPage,
        source: tikhubXiaohongshuDefaultSearchSource,
      }),
      outputKey: "results",
    });
  },
  async fetch_xiaohongshu_note_comments(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/xiaohongshu/app_v2/get_note_comments",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: buildXiaohongshuNoteCommentsQuery(input),
      outputKey: "comments",
    });
  },
  async fetch_xiaohongshu_sub_comments(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/xiaohongshu/app_v2/get_note_sub_comments",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: buildXiaohongshuSubCommentsQuery(input),
      outputKey: "replies",
    });
  },
  async fetch_xiaohongshu_user_info(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/xiaohongshu/app_v2/get_user_info",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: buildXiaohongshuUserLookupQuery(input),
      outputKey: "profile",
    });
  },
  async fetch_xiaohongshu_hot_list(_input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/xiaohongshu/web_v2/fetch_hot_list",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: {},
      outputKey: "hotList",
    });
  },
  async fetch_xiaohongshu_user_notes(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/xiaohongshu/app_v2/get_user_posted_notes",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: buildXiaohongshuUserNotesQuery(input),
      outputKey: "posts",
    });
  },
  async fetch_xiaohongshu_note_comment_replies(input, context) {
    return executeTikHubListAction({
      path: "/api/v1/xiaohongshu/app_v2/get_note_sub_comments",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: buildXiaohongshuSubCommentsQuery(input),
      outputKey: "replies",
    });
  },
  async search_douyin_videos(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/douyin/search/fetch_video_search_v1",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: compactObject({
        keyword: readRequiredString(input.keyword, "keyword"),
        cursor: readOptionalInteger(input.cursor),
        sort_type: readOptionalString(input.sortType),
        publish_time: readOptionalString(input.publishTime),
        filter_duration: readOptionalString(input.filterDuration),
        content_type: readOptionalString(input.contentType),
        search_id: readOptionalString(input.searchId),
        backtrace: readOptionalString(input.backtrace),
      }),
      outputKey: "results",
    });
  },
  async search_douyin_users(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/douyin/search/fetch_user_search",
      method: "POST",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      body: compactObject({
        keyword: readRequiredString(input.keyword, "keyword"),
        cursor: readOptionalInteger(input.cursor),
        douyin_user_fans: readOptionalString(input.douyinUserFans),
        douyin_user_type: readOptionalString(input.douyinUserType),
        search_id: readOptionalString(input.searchId),
      }),
      outputKey: "results",
    });
  },
  async fetch_douyin_hot_total_list(input, context) {
    return executeTikHubReadAction({
      path: "/api/v1/douyin/billboard/fetch_hot_total_list",
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      query: compactObject({
        page: readOptionalInteger(input.page),
        page_size: readOptionalInteger(input.pageSize),
        type: readRequiredString(input.type, "type"),
        snapshot_time: readOptionalNonEmptyString(input.snapshotTime),
        start_date: readOptionalNonEmptyString(input.startDate),
        end_date: readOptionalNonEmptyString(input.endDate),
        sentence_tag: readOptionalNonEmptyString(input.sentenceTag),
        keyword: readOptionalNonEmptyString(input.keyword),
      }),
      outputKey: "hotList",
    });
  },
} satisfies Record<string, TikHubActionHandler>;

export async function validateTikHubCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<import("../../core/types.ts").CredentialValidationResult> {
  const payload = await requestTikHubJson({
    path: "/api/v1/tikhub/user/get_user_info",
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(401, message)),
    params: {},
    fetcher,
    phase: "validate",
  });
  const normalized = normalizeUserInfo(payload);

  return {
    profile: {
      accountId: asOptionalString(normalized.apiKey?.api_key_name) ?? "tikhub-api-key",
      displayName:
        asOptionalString(normalized.user?.email) ??
        asOptionalString(normalized.apiKey?.api_key_name) ??
        "TikHub API Key",
      grantedScopes: normalized.scopes,
    },
    grantedScopes: normalized.scopes,
    metadata: compactObject({
      validationEndpoint: "/api/v1/tikhub/user/get_user_info",
      apiKeyName: normalized.apiKey?.api_key_name,
      apiKeyStatus: normalized.apiKey?.api_key_status,
      balance: normalized.user?.balance,
      freeCredit: normalized.user?.free_credit,
      emailVerified: normalized.user?.email_verified,
      requiredScope: tikhubUserScope,
    }),
  };
}

async function requestTikHubJson(input: {
  path: string;
  apiKey: string;
  params?: Record<string, TikHubRequestValue>;
  body?: Record<string, TikHubRequestValue>;
  method?: TikHubMethod;
  fetcher: typeof fetch;
  phase: TikHubPhase;
}) {
  const timeoutHandle = createProviderTimeout(undefined, tikhubDefaultRequestTimeoutMs);

  try {
    const method = input.method ?? "GET";
    const response = await input.fetcher(buildTikHubUrl(input.path, input.params ?? {}), {
      method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
        "user-agent": providerUserAgent,
      },
      ...(method === "POST" ? { body: JSON.stringify(input.body ?? {}) } : {}),
      signal: timeoutHandle.signal,
    });
    const payload = await readTikHubPayload(response);

    if (!response.ok) {
      throw createTikHubError(response.status, payload, input.phase, input.path);
    }

    const payloadRecord = asOptionalObject(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "TikHub returned an invalid payload");
    }

    const code = typeof payloadRecord.code === "number" ? payloadRecord.code : undefined;
    if (code !== undefined && code >= 400) {
      throw createTikHubError(code, payloadRecord, input.phase, input.path);
    }

    return payloadRecord;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "TikHub request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `TikHub request failed: ${error.message}` : "TikHub request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildTikHubUrl(path: string, params: Record<string, TikHubRequestValue>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${tikhubApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readTikHubPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "TikHub returned invalid JSON", text);
  }
}

function createTikHubError(status: number, payload: unknown, phase: TikHubPhase, path: string) {
  const message = extractTikHubErrorMessage(payload) ?? `TikHub request failed with status ${status}`;
  const errorData = payload;

  if (status === 401) {
    return phase === "validate"
      ? new ProviderRequestError(400, message, errorData)
      : new ProviderRequestError(401, message, errorData);
  }

  if (status === 402) {
    return new ProviderRequestError(402, `TikHub payment required: ${message}`, errorData);
  }

  if (status === 403) {
    return new ProviderRequestError(
      403,
      `${message}. The TikHub API token likely needs the ${requiredScopeForPath(path)} path scope.`,
      errorData,
    );
  }

  if (status === 429) {
    return new ProviderRequestError(429, message, errorData);
  }

  if (status === 422) {
    return new ProviderRequestError(422, message, errorData);
  }

  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, errorData);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, errorData);
  }

  return new ProviderRequestError(status || 502, message, errorData);
}

function extractTikHubErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = asOptionalObject(payload);
  if (!record) {
    return undefined;
  }

  const detail = record.detail;
  if (typeof detail === "string" && detail.trim() !== "") {
    return detail;
  }

  const detailRecord = asOptionalObject(detail);
  const detailRecordMessage = readTikHubErrorRecordMessage(detailRecord);
  if (detailRecordMessage) {
    return detailRecordMessage;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const firstDetail = asOptionalObject(detail[0]);
    const detailMessage = asOptionalString(firstDetail?.msg)?.trim();
    if (detailMessage) {
      return detailMessage;
    }
  }

  return (
    asOptionalString(record.message)?.trim() ??
    asOptionalString(record.error)?.trim() ??
    asOptionalString(record.error_message)?.trim()
  );
}

function readTikHubErrorRecordMessage(record: Record<string, unknown> | undefined) {
  if (!record) {
    return undefined;
  }

  return (
    asOptionalString(record.message)?.trim() ??
    asOptionalString(record.message_zh)?.trim() ??
    asOptionalString(record.error)?.trim() ??
    asOptionalString(record.error_message)?.trim()
  );
}

function requiredScopeForPath(path: string) {
  if (path.startsWith(tikhubUserScope)) {
    return tikhubUserScope;
  }
  if (path.startsWith(tikhubTiktokWebScope)) {
    return tikhubTiktokWebScope;
  }
  if (path.startsWith(tikhubDouyinWebScope)) {
    return tikhubDouyinWebScope;
  }
  if (path.startsWith(tikhubXiaohongshuAppV2Scope)) {
    return tikhubXiaohongshuAppV2Scope;
  }
  if (path.startsWith(tikhubXiaohongshuWebV2Scope)) {
    return tikhubXiaohongshuWebV2Scope;
  }
  if (path.startsWith(tikhubDouyinSearchScope)) {
    return tikhubDouyinSearchScope;
  }
  if (path.startsWith(tikhubDouyinBillboardScope)) {
    return tikhubDouyinBillboardScope;
  }
  return "the matching TikHub path";
}

function normalizeEnvelope(payload: Record<string, unknown>): TikHubEnvelope {
  return compactObject({
    code: typeof payload.code === "number" ? payload.code : null,
    requestId: asOptionalString(payload.request_id) ?? null,
    message: asOptionalString(payload.message) ?? null,
    router: asOptionalString(payload.router) ?? null,
    params: asOptionalObject(payload.params) ?? null,
  });
}

function normalizeUserInfo(payload: Record<string, unknown>) {
  const apiKey = readPayloadRecord(payload, "api_key_data");
  const user = readPayloadRecord(payload, "user_data");
  const scopes = readStringArray(apiKey?.api_key_scopes);

  return {
    envelope: normalizeEnvelope(payload),
    apiKey,
    user,
    scopes,
    rawData: compactObject({
      api_key_data: apiKey,
      user_data: user,
    }),
    raw: payload,
  };
}

async function executeTikHubReadAction(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  query?: Record<string, TikHubRequestValue>;
  body?: Record<string, TikHubRequestValue>;
  method?: TikHubMethod;
  outputKey: "profile" | "post" | "results" | "hotList";
}) {
  const payload = await requestTikHubJson({
    path: input.path,
    apiKey: input.apiKey,
    params: input.query ?? {},
    body: input.body,
    method: input.method,
    fetcher: input.fetcher,
    phase: "execute",
  });
  const data = payload.data;

  return {
    envelope: normalizeEnvelope(payload),
    [input.outputKey]: data,
    rawData: data,
    raw: payload,
  };
}

async function executeTikHubListAction(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  query: Record<string, TikHubRequestValue>;
  outputKey: "posts" | "comments" | "replies";
}) {
  const payload = await requestTikHubJson({
    path: input.path,
    apiKey: input.apiKey,
    params: input.query,
    fetcher: input.fetcher,
    phase: "execute",
  });
  const data = payload.data;

  return {
    envelope: normalizeEnvelope(payload),
    [input.outputKey]: data,
    rawData: data,
    raw: payload,
  };
}

function readPayloadRecord(payload: Record<string, unknown>, key: string) {
  const direct = asOptionalObject(payload[key]);
  if (direct) {
    return direct;
  }

  const data = asOptionalObject(payload.data);
  return asOptionalObject(data?.[key]) ?? null;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function buildXiaohongshuUserLookupQuery(input: Record<string, unknown>) {
  const userId = readOptionalNonEmptyString(input.userId);
  const shareText = readOptionalNonEmptyString(input.shareText);
  if (!userId && !shareText) {
    throw new ProviderRequestError(400, "Either userId or shareText is required");
  }

  return compactObject({
    user_id: userId,
    share_text: shareText,
  });
}

function buildXiaohongshuUserNotesQuery(input: Record<string, unknown>) {
  return compactObject({
    ...buildXiaohongshuUserLookupQuery(input),
    cursor: readOptionalNonEmptyString(input.cursor) ?? readOptionalNonEmptyString(input.lastCursor),
  });
}

function buildXiaohongshuNoteLookupQuery(input: Record<string, unknown>) {
  const noteId = readOptionalNonEmptyString(input.noteId);
  const shareText = readOptionalNonEmptyString(input.shareText);
  if (!noteId && !shareText) {
    throw new ProviderRequestError(400, "Either noteId or shareText is required");
  }

  return compactObject({
    note_id: noteId,
    share_text: shareText,
  });
}

function buildXiaohongshuNoteCommentsQuery(input: Record<string, unknown>) {
  return compactObject({
    ...buildXiaohongshuNoteLookupQuery(input),
    cursor: readOptionalNonEmptyString(input.cursor),
    index: readOptionalInteger(input.index),
    pageArea: readOptionalNonEmptyString(input.pageArea),
    sort_strategy: readOptionalNonEmptyString(input.sortStrategy),
  });
}

function buildXiaohongshuSubCommentsQuery(input: Record<string, unknown>) {
  return compactObject({
    ...buildXiaohongshuNoteLookupQuery(input),
    comment_id: readRequiredString(input.commentId, "commentId"),
    cursor: readOptionalNonEmptyString(input.cursor) ?? readOptionalNonEmptyString(input.lastCursor),
    index: readOptionalInteger(input.index),
  });
}

function readEndpoint(value: unknown) {
  if (typeof value !== "string" || !value.trim().startsWith("/")) {
    throw new ProviderRequestError(400, "endpoint must be a TikHub path starting with /");
  }
  return value.trim();
}

function readRequiredString(value: unknown, fieldName: string) {
  const text = readOptionalNonEmptyString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readOptionalNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readOptionalInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return undefined;
  }
  return value;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeXiaohongshuAppV2NoteType(value: unknown) {
  const text =
    typeof value === "number" && Number.isInteger(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : undefined;
  if (!text) {
    return undefined;
  }

  const normalized = text.toLowerCase();
  if (normalized === "0" || normalized === "_0" || normalized === "all" || text === "不限") {
    return "不限";
  }
  if (normalized === "1" || normalized === "_1" || normalized === "image" || text === "普通笔记") {
    return "普通笔记";
  }
  if (normalized === "2" || normalized === "_2" || normalized === "video" || text === "视频笔记") {
    return "视频笔记";
  }
  if (normalized === "live" || text === "直播笔记") {
    return "直播笔记";
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(asOptionalObject(value));
}
