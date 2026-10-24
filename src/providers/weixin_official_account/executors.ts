import type { CredentialValidators, ExecutionContext, ProviderExecutors, TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { WechatApiResult, WechatOfficialAccountCredential } from "./access-token.ts";

import {
  compactObject,
  objectArray,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredStringArray,
} from "../../core/cast.ts";
import { readBoundedResponseBytes } from "../../core/request.ts";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { readTransitFileInput } from "../provider-files.ts";
import {
  createProviderFetch,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";
import {
  getWechatAccessToken,
  isWechatTokenError,
  normalizeWechatApiError,
  parseWechatJson,
  readWechatErrcode,
  readWechatOfficialAccountCredential,
} from "./access-token.ts";

const service = "weixin_official_account";
const wechatApiBaseUrl = "https://api.weixin.qq.com";
// Media uploads and downloads move up to 10 MB, so they get a wider budget than the shared default.
const wechatMediaTimeoutMs = 120_000;
const wechatDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = 86_400_000;

const draftArticleFieldMap: Record<string, string> = {
  articleType: "article_type",
  contentSourceUrl: "content_source_url",
  thumbMediaId: "thumb_media_id",
  thumbUrl: "thumb_url",
  needOpenComment: "need_open_comment",
  onlyFansCanComment: "only_fans_can_comment",
  imageInfo: "image_info",
  coverInfo: "cover_info",
  productInfo: "product_info",
};

interface WechatOfficialAccountContext {
  credential: WechatOfficialAccountCredential;
  fetcher: ProviderFetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

type WechatActionHandler = ProviderRuntimeHandler<WechatOfficialAccountContext>;

interface WechatApiRequest {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown> | FormData;
  timeoutMs?: number;
}

interface WechatMediaDownloadRequest extends WechatApiRequest {
  mediaId: string;
  preferredFileName?: string;
}

type WechatMediaDownloadResult =
  | ({ kind: "json" } & WechatApiResult)
  | { kind: "binary"; output: Record<string, unknown> };

const weixinOfficialAccountActionHandlers: ProviderActionHandlers<typeof service, WechatActionHandler> = {
  get_api_domain_ip(_input, context) {
    return callWechatApi(context, { method: "GET", path: "/cgi-bin/get_api_domain_ip" });
  },
  get_callback_ip(_input, context) {
    return callWechatApi(context, { method: "GET", path: "/cgi-bin/getcallbackip" });
  },
  callback_check(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/callback/check",
      body: {
        action: optionalString(input.action) ?? "all",
        check_operator: optionalString(input.checkOperator) ?? "DEFAULT",
      },
    });
  },
  clear_quota(_input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/clear_quota",
      body: { appid: context.credential.appId },
    });
  },
  upload_temp_media(input, context) {
    return uploadWechatMedia(context, {
      path: "/cgi-bin/media/upload",
      query: { type: requiredInputString(input.type, "type") },
      file: input.file,
    });
  },
  get_temp_media(input, context) {
    const mediaId = requiredInputString(input.mediaId, "mediaId");
    return downloadWechatMedia(context, {
      method: "GET",
      path: "/cgi-bin/media/get",
      query: { media_id: mediaId },
      mediaId,
      preferredFileName: optionalString(input.fileName),
    });
  },
  upload_article_image(input, context) {
    return uploadWechatMedia(context, { path: "/cgi-bin/media/uploadimg", file: input.file });
  },
  add_material(input, context) {
    const type = requiredInputString(input.type, "type");
    const formFields: Record<string, string> = {};
    if (type === "video") {
      formFields.description = JSON.stringify({
        title: requiredInputString(input.title, "title"),
        introduction: requiredInputString(input.introduction, "introduction"),
      });
    }
    return uploadWechatMedia(context, {
      path: "/cgi-bin/material/add_material",
      query: { type },
      file: input.file,
      formFields,
    });
  },
  get_material(input, context) {
    const mediaId = requiredInputString(input.mediaId, "mediaId");
    return downloadWechatMedia(context, {
      method: "POST",
      path: "/cgi-bin/material/get_material",
      body: { media_id: mediaId },
      mediaId,
      preferredFileName: optionalString(input.fileName),
    });
  },
  delete_material(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/material/del_material",
      body: { media_id: requiredInputString(input.mediaId, "mediaId") },
    });
  },
  get_material_count(_input, context) {
    return callWechatApi(context, { method: "GET", path: "/cgi-bin/material/get_materialcount" });
  },
  batch_get_material(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/material/batchget_material",
      body: {
        type: requiredInputString(input.type, "type"),
        offset: readOffset(input),
        count: readCount(input),
      },
    });
  },
  add_draft(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/draft/add",
      body: { articles: objectArray(input.articles, "articles", providerInputError).map(mapDraftArticle) },
    });
  },
  get_draft(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/draft/get",
      body: { media_id: requiredInputString(input.mediaId, "mediaId") },
    });
  },
  delete_draft(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/draft/delete",
      body: { media_id: requiredInputString(input.mediaId, "mediaId") },
    });
  },
  update_draft(input, context) {
    const index = optionalInteger(input.index);
    if (index === undefined || index < 0) {
      throw providerInputError("index must be a non-negative integer");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/draft/update",
      body: {
        media_id: requiredInputString(input.mediaId, "mediaId"),
        index,
        articles: mapDraftArticle(requiredRecord(input.article, "article", providerInputError)),
      },
    });
  },
  get_draft_count(_input, context) {
    return callWechatApi(context, { method: "GET", path: "/cgi-bin/draft/count" });
  },
  batch_get_draft(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/draft/batchget",
      body: readPageInput(input),
    });
  },
  publish_draft(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/freepublish/submit",
      body: { media_id: requiredInputString(input.mediaId, "mediaId") },
    });
  },
  get_publish_status(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/freepublish/get",
      body: { publish_id: requiredInputString(input.publishId, "publishId") },
    });
  },
  delete_publish(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/freepublish/delete",
      body: compactObject({
        article_id: requiredInputString(input.articleId, "articleId"),
        index: readOptionalPositiveInteger(input.index, "index"),
      }),
    });
  },
  get_published_article(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/freepublish/getarticle",
      body: { article_id: requiredInputString(input.articleId, "articleId") },
    });
  },
  batch_get_published(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/freepublish/batchget",
      body: readPageInput(input),
    });
  },
  send_custom_message(input, context) {
    const msgType = requiredInputString(input.msgType, "msgType");
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/message/custom/send",
      body: {
        touser: requiredInputString(input.toUser, "toUser"),
        msgtype: msgType,
        [msgType]: requiredRecord(input.content, "content", providerInputError),
      },
    });
  },
  set_typing_status(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/message/custom/typing",
      body: {
        touser: requiredInputString(input.toUser, "toUser"),
        command: optionalString(input.command) ?? "Typing",
      },
    });
  },
  send_mass_message(input, context) {
    const msgType = requiredInputString(input.msgType, "msgType");
    const sendIgnoreReprint = optionalBoolean(input.sendIgnoreReprint);
    const toUsers = requiredStringArray(input.toUsers, "toUsers", providerInputError);
    if (toUsers.length < 2 || toUsers.length > 10000) {
      throw providerInputError("toUsers must contain between 2 and 10000 OpenIDs");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/message/mass/send",
      body: compactObject({
        touser: toUsers,
        msgtype: msgType,
        [massSendContentKey(msgType)]: requiredRecord(input.content, "content", providerInputError),
        send_ignore_reprint:
          msgType === "mpnews" && sendIgnoreReprint !== undefined ? (sendIgnoreReprint ? 1 : 0) : undefined,
      }),
    });
  },
  send_mass_message_by_tag(input, context) {
    const msgType = requiredInputString(input.msgType, "msgType");
    const isToAll = optionalBoolean(input.isToAll) ?? false;
    const tagId = optionalInteger(input.tagId);
    if (!isToAll && tagId === undefined) {
      throw providerInputError("tagId is required when isToAll is false");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/message/mass/sendall",
      body: {
        filter: compactObject({ is_to_all: isToAll, tag_id: isToAll ? undefined : tagId }),
        msgtype: msgType,
        [massSendContentKey(msgType)]: requiredRecord(input.content, "content", providerInputError),
      },
    });
  },
  preview_mass_message(input, context) {
    const msgType = requiredInputString(input.msgType, "msgType");
    const toUser = optionalString(input.toUser);
    const toWxName = optionalString(input.toWxName);
    if ((toUser === undefined) === (toWxName === undefined)) {
      throw providerInputError("exactly one of toUser and toWxName is required");
    }
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/message/mass/preview",
      body: compactObject({
        touser: toUser,
        towxname: toWxName,
        msgtype: msgType,
        [msgType]: requiredRecord(input.content, "content", providerInputError),
      }),
    });
  },
  get_mass_message_status(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/message/mass/get",
      body: { msg_id: readMassMessageId(input.msgId) },
    });
  },
  delete_mass_message(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/message/mass/delete",
      body: compactObject({
        msg_id: readMassMessageId(input.msgId),
        article_idx: readOptionalPositiveInteger(input.articleIdx, "articleIdx"),
      }),
    });
  },
  send_template_message(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/message/template/send",
      body: compactObject({
        touser: requiredInputString(input.toUser, "toUser"),
        template_id: requiredInputString(input.templateId, "templateId"),
        url: optionalString(input.url),
        miniprogram: optionalRecord(input.miniprogram),
        client_msg_id: optionalString(input.clientMsgId),
        data: requiredRecord(input.data, "data", providerInputError),
      }),
    });
  },
  add_template(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/template/api_add_template",
      body: { template_id_short: requiredInputString(input.templateIdShort, "templateIdShort") },
    });
  },
  get_all_templates(_input, context) {
    return callWechatApi(context, { method: "GET", path: "/cgi-bin/template/get_all_private_template" });
  },
  delete_template(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/template/del_private_template",
      body: { template_id: requiredInputString(input.templateId, "templateId") },
    });
  },
  set_template_industry(input, context) {
    return callWechatApi(context, {
      method: "POST",
      path: "/cgi-bin/template/api_set_industry",
      body: {
        industry_id1: requiredInputString(input.industryId1, "industryId1"),
        industry_id2: requiredInputString(input.industryId2, "industryId2"),
      },
    });
  },
  get_template_industry(_input, context) {
    return callWechatApi(context, { method: "GET", path: "/cgi-bin/template/get_industry" });
  },
  get_user_summary: datacubeHandler("/datacube/getusersummary", 7),
  get_user_cumulate: datacubeHandler("/datacube/getusercumulate", 7),
  get_article_read: datacubeHandler("/datacube/getarticleread", 1),
  get_article_share: datacubeHandler("/datacube/getarticleshare", 1),
  get_biz_summary: datacubeHandler("/datacube/getbizsummary", 30),
  get_article_total_detail: datacubeHandler("/datacube/getarticletotaldetail", 1),
};

function datacubeHandler(path: string, maxSpanDays: number): WechatActionHandler {
  return (input, context) => callWechatApi(context, { method: "POST", path, body: readDateRange(input, maxSpanDays) });
}

export const executors: ProviderExecutors = defineProviderExecutors<WechatOfficialAccountContext>({
  service,
  handlers: weixinOfficialAccountActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<WechatOfficialAccountContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      credential: readWechatOfficialAccountCredential(credential.values),
      fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const credential = readWechatOfficialAccountCredential(input.values);
    await getWechatAccessToken({
      credential,
      fetcher: createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
      signal,
    });
    return {
      profile: {
        accountId: credential.appId,
        displayName: `WeChat Official Account · ${credential.appId}`,
      },
      grantedScopes: [],
      metadata: { appId: credential.appId },
    };
  },
};

/**
 * Run one JSON API call with the credential's stable access token, refreshing
 * the token and retrying exactly once when WeChat reports it as invalid.
 */
async function callWechatApi(
  context: WechatOfficialAccountContext,
  request: WechatApiRequest,
): Promise<Record<string, unknown>> {
  const result = await withWechatTokenRetry<WechatApiResult>(
    context,
    (jsonResult) => isWechatTokenError(readWechatErrcode(jsonResult.record)),
    (token) => executeWechatJsonRequest(context, request, token),
  );
  return resolveWechatJsonResult(result);
}

/**
 * Run one media download. WeChat answers with JSON for news/video payloads and
 * error envelopes, and with raw bytes for image/voice/thumb media; the bytes
 * land in local transit storage.
 */
async function downloadWechatMedia(
  context: WechatOfficialAccountContext,
  request: WechatMediaDownloadRequest,
): Promise<Record<string, unknown>> {
  const result = await withWechatTokenRetry<WechatMediaDownloadResult>(
    context,
    (downloadResult) => downloadResult.kind === "json" && isWechatTokenError(readWechatErrcode(downloadResult.record)),
    (token) => executeWechatMediaRequest(context, request, token),
  );
  if (result.kind === "json") {
    return resolveWechatJsonResult(result);
  }
  return result.output;
}

/**
 * Execute a request with a cached token, minting a fresh one and retrying
 * exactly once when the first attempt failed with a token-invalid errcode.
 */
async function withWechatTokenRetry<TResult>(
  context: WechatOfficialAccountContext,
  isTokenError: (result: TResult) => boolean,
  execute: (token: string) => Promise<TResult>,
): Promise<TResult> {
  const firstToken = await getWechatAccessToken({
    credential: context.credential,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const result = await execute(firstToken);
  if (!isTokenError(result)) {
    return result;
  }
  const freshToken = await getWechatAccessToken({
    credential: context.credential,
    fetcher: context.fetcher,
    signal: context.signal,
    forceRefresh: true,
  });
  return execute(freshToken);
}

/** Throw the normalized error for a failed call, or return the payload without the errcode/errmsg envelope. */
function resolveWechatJsonResult(result: WechatApiResult): Record<string, unknown> {
  const errcode = readWechatErrcode(result.record);
  if (result.status >= 400 || result.record === undefined || (errcode !== null && errcode !== 0)) {
    throw normalizeWechatApiError(result);
  }
  const output = { ...result.record };
  delete output.errcode;
  delete output.errmsg;
  return output;
}

async function executeWechatJsonRequest(
  context: WechatOfficialAccountContext,
  request: WechatApiRequest,
  accessToken: string,
): Promise<WechatApiResult> {
  return runProviderRequest(
    { signal: context.signal, label: "WeChat Official Account", timeoutMs: request.timeoutMs },
    async (signal) => {
      const { url, init } = buildWechatRequestInit(request, accessToken, signal);
      const response = await context.fetcher(url, init);
      const rawText = await response.text();
      return { status: response.status, record: parseWechatJson(rawText), rawText };
    },
  );
}

async function executeWechatMediaRequest(
  context: WechatOfficialAccountContext,
  request: WechatMediaDownloadRequest,
  accessToken: string,
): Promise<WechatMediaDownloadResult> {
  return runProviderRequest(
    { signal: context.signal, label: "WeChat Official Account", timeoutMs: wechatMediaTimeoutMs },
    async (signal) => {
      const { url, init } = buildWechatRequestInit(request, accessToken, signal);
      const response = await context.fetcher(url, init);
      if (!response.ok) {
        const rawText = await response.text();
        return { kind: "json", status: response.status, record: parseWechatJson(rawText), rawText };
      }
      if (!context.transitFiles) {
        // Without transit storage only the JSON payloads (news articles, video URLs) can be served.
        const rawText = await response.text();
        const record = parseWechatJson(rawText);
        if (record === undefined) {
          throw new ProviderRequestError(503, "Local transit file storage is not enabled");
        }
        return { kind: "json", status: response.status, record, rawText };
      }
      const bytes = await readBoundedResponseBytes(response, {
        maxBytes: context.transitFiles.maxBytes,
        fieldName: `WeChat media ${request.mediaId}`,
        createError: (message) => new ProviderRequestError(413, message),
      });
      // WeChat omits Content-Type on material downloads, so the JSON envelope is
      // detected from the body itself: envelopes are objects, media bytes never start with "{".
      if (startsWithJsonObject(bytes)) {
        const rawText = new TextDecoder().decode(bytes);
        return { kind: "json", status: response.status, record: parseWechatJson(rawText), rawText };
      }
      const fileName =
        request.preferredFileName ??
        readContentDispositionFileName(response.headers.get("content-disposition")) ??
        `wechat-${request.mediaId}`;
      const headerType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || undefined;
      const mediaType =
        (headerType !== undefined && headerType !== "text/plain" ? headerType : undefined) ??
        sniffWechatMediaType(bytes) ??
        "application/octet-stream";
      const upload = await context.transitFiles.create(
        new File([new Uint8Array(bytes)], fileName, { type: mediaType }),
      );
      return { kind: "binary", output: { mediaId: request.mediaId, file: upload, contentType: mediaType } };
    },
  );
}

async function uploadWechatMedia(
  context: WechatOfficialAccountContext,
  input: { path: string; query?: Record<string, string>; file: unknown; formFields?: Record<string, string> },
): Promise<Record<string, unknown>> {
  const file = await readTransitFileInput(input.file, context);
  const formData = new FormData();
  for (const [key, value] of Object.entries(input.formFields ?? {})) {
    formData.set(key, value);
  }
  formData.set("media", file.file, file.name);
  return callWechatApi(context, {
    method: "POST",
    path: input.path,
    query: input.query,
    body: formData,
    timeoutMs: wechatMediaTimeoutMs,
  });
}

/** Build the URL with access_token query and the request init shared by both request paths. */
function buildWechatRequestInit(
  request: WechatApiRequest,
  accessToken: string,
  signal: AbortSignal,
): { url: string; init: RequestInit } {
  const url = new URL(request.path, wechatApiBaseUrl);
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    url.searchParams.set(key, value);
  }
  const headers: Record<string, string> = { "user-agent": providerUserAgent };
  let body: BodyInit | undefined;
  if (request.body instanceof FormData) {
    body = request.body;
  } else if (request.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(request.body);
  }
  return { url: url.toString(), init: { method: request.method, headers, body, signal } };
}

/** Map known camelCase draft article fields to WeChat's snake_case; unknown fields pass through unchanged. */
function mapDraftArticle(article: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(article)) {
    if (value === undefined) {
      continue;
    }
    mapped[draftArticleFieldMap[key] ?? key] = value;
  }
  return mapped;
}

function readPageInput(input: Record<string, unknown>): Record<string, unknown> {
  const noContent = optionalBoolean(input.noContent);
  return compactObject({
    offset: readOffset(input),
    count: readCount(input),
    no_content: noContent === undefined ? undefined : noContent ? 1 : 0,
  });
}

function readOffset(input: Record<string, unknown>): number {
  const offset = optionalInteger(input.offset);
  if (offset === undefined) {
    return 0;
  }
  if (offset < 0) {
    throw providerInputError("offset must be a non-negative integer");
  }
  return offset;
}

function readCount(input: Record<string, unknown>): number {
  const count = optionalInteger(input.count);
  if (count === undefined) {
    return 20;
  }
  if (count < 1 || count > 20) {
    throw providerInputError("count must be between 1 and 20");
  }
  return count;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    return undefined;
  }
  if (parsed < 1) {
    throw providerInputError(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

/** Mass send and sendall put the image content under `images`; every other type uses the msgtype itself as the key. */
function massSendContentKey(msgType: string): string {
  return msgType === "image" ? "images" : msgType;
}

/** WeChat documents msg_id as a number but examples pass it as a string, so accept both. */
function readMassMessageId(value: unknown): string | number {
  const msgId = optionalString(value) ?? optionalInteger(value);
  if (msgId === undefined) {
    throw providerInputError("msgId is required.");
  }
  return msgId;
}

/** Read and span-check the datacube date range; maxSpanDays counts both end dates. */
function readDateRange(input: Record<string, unknown>, maxSpanDays: number): Record<string, string> {
  const beginDate = requiredInputString(input.beginDate, "beginDate");
  const endDate = requiredInputString(input.endDate, "endDate");
  if (!wechatDatePattern.test(beginDate) || !wechatDatePattern.test(endDate)) {
    throw providerInputError("beginDate and endDate must use the YYYY-MM-DD format");
  }
  const spanDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${beginDate}T00:00:00Z`)) / dayMs;
  if (spanDays < 0) {
    throw providerInputError("endDate must be on or after beginDate");
  }
  if (spanDays + 1 > maxSpanDays) {
    throw providerInputError(`this WeChat statistics API allows a date range of at most ${maxSpanDays} day(s)`);
  }
  return { begin_date: beginDate, end_date: endDate };
}

function readContentDispositionFileName(header: string | null): string | undefined {
  const match = /filename="?([^";]+)/.exec(header ?? "");
  const raw = optionalString(match?.[1]);
  if (raw === undefined) {
    return undefined;
  }
  // WeChat writes raw UTF-8 bytes into the header; fetch exposes header bytes as latin-1 text.
  return new TextDecoder().decode(Uint8Array.from(raw, (char) => char.charCodeAt(0)));
}

/** Whether the body starts with a JSON object, after optional whitespace. */
function startsWithJsonObject(bytes: Uint8Array): boolean {
  for (const byte of bytes) {
    if (byte === 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      continue;
    }
    return byte === 0x7b;
  }
  return false;
}

/** Best-effort media type from magic bytes, for downloads where WeChat sends no usable Content-Type. */
function sniffWechatMediaType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return "video/mp4";
  }
  if (bytes.length < 4) {
    return undefined;
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  if (bytes[0] === 0x23 && bytes[1] === 0x21 && bytes[2] === 0x41 && bytes[3] === 0x4d) {
    return "audio/amr";
  }
  if ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && bytes[1] === 0xfb)) {
    return "audio/mpeg";
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return "audio/wav";
  }
  return undefined;
}
