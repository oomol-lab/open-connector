import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  TransitFileWriter,
} from "../../core/types.ts";
import type { FeishuAppBotActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalBoolean, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { feishuAppBotProviderScopes } from "./scopes.ts";

const service = "feishu_app_bot";
const feishuOpenBaseUrl = "https://open.feishu.cn/open-apis";
const feishuRequestTimeoutMs = 30_000;
const feishuTenantAccessTokenRefreshSkewMs = 60_000;
const feishuMaxImageUploadSourceBytes = 10 * 1024 * 1024;
const feishuMaxFileUploadSourceBytes = 30 * 1024 * 1024;
const feishuImageUploadType = "message";
const feishuRateLimitedErrorCodes = new Set([11232, 11233, 11247, 230020, 230047, 99991400, 1000004, 1000005]);
const feishuCredentialExpiredErrorCodes = new Set([
  4001, 10005, 10012, 10013, 10014, 10015, 20002, 20005, 20013, 20014, 99991543, 99991661, 99991663, 99991664, 99991665,
  99991671, 99991673,
]);
const feishuScopeMissingErrorCodes = new Set([10023, 11223, 11229, 11241, 99991672, 99991676, 99991679]);

interface FeishuAppBotCredential {
  appId: string;
  appSecret: string;
}

interface FeishuAppBotActionContext extends FeishuAppBotCredential {
  fetcher: typeof fetch;
  transitFiles?: TransitFileWriter;
  signal?: AbortSignal;
}

interface FeishuApiEnvelope<TData> {
  code?: unknown;
  msg?: unknown;
  data?: TData;
  tenant_access_token?: unknown;
  expire?: unknown;
}

interface FeishuTenantAccessTokenCacheEntry {
  token: string;
  expiresAtMs: number;
}

interface FeishuUploadSource {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}

interface FeishuRawResponse {
  response: Response;
  cleanup: () => void;
}

interface FeishuRequestSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

type FeishuRequestPhase = "validate" | "execute";
type FeishuActionHandler = (input: Record<string, unknown>, context: FeishuAppBotActionContext) => Promise<unknown>;

const feishuTenantAccessTokenCache = new Map<string, FeishuTenantAccessTokenCacheEntry>();

export const feishuAppBotActionHandlers: Record<FeishuAppBotActionName, FeishuActionHandler> = {
  upload_image(input, context) {
    return uploadImage(input, context);
  },
  download_image(input, context) {
    return downloadImage(input, context);
  },
  upload_file(input, context) {
    return uploadFile(input, context);
  },
  download_file(input, context) {
    return downloadFile(input, context);
  },
  send_message(input, context) {
    return sendMessage(input, context);
  },
  reply_message(input, context) {
    return replyMessage(input, context);
  },
  get_message(input, context) {
    return getMessage(input, context);
  },
  list_messages(input, context) {
    return listMessages(input, context);
  },
  list_chats(input, context) {
    return listChats(input, context);
  },
  search_chats(input, context) {
    return searchChats(input, context);
  },
  get_chat(input, context) {
    return getChat(input, context);
  },
  list_chat_members(input, context) {
    return listChatMembers(input, context);
  },
  recall_message(input, context) {
    return recallMessage(input, context);
  },
  edit_message(input, context) {
    return editMessage(input, context);
  },
  add_message_reaction(input, context) {
    return addMessageReaction(input, context);
  },
  list_message_reactions(input, context) {
    return listMessageReactions(input, context);
  },
  remove_message_reaction(input, context) {
    return removeMessageReaction(input, context);
  },
  pin_message(input, context) {
    return pinMessage(input, context);
  },
  list_pins(input, context) {
    return listPins(input, context);
  },
  remove_pin(input, context) {
    return removePin(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FeishuAppBotActionContext>({
  service,
  handlers: feishuAppBotActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FeishuAppBotActionContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      ...readFeishuAppBotCredential(credential.values),
      fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const accessToken = await fetchTenantAccessToken(
      readFeishuAppBotCredential(credential.values),
      fetch,
      "execute",
      context.signal,
    );
    const url = createProviderProxyUrl(feishuOpenBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    headers.set("user-agent", providerUserAgent);

    const requestSignal = createFeishuRequestSignal(context.signal);
    try {
      const init: RequestInit = {
        method: input.method,
        headers,
        signal: requestSignal.signal,
      };
      if (input.body !== undefined) {
        init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
        if (!headers.has("content-type") && typeof input.body !== "string") {
          headers.set("content-type", "application/json; charset=utf-8");
        }
      }

      const response = await fetch(url, init);
      if (!response.ok) {
        const rawText = await readProviderProxyErrorMessage(response, "");
        let envelope: FeishuApiEnvelope<unknown>;
        try {
          envelope = readFeishuEnvelope<unknown>(rawText);
        } catch {
          throw new ProviderRequestError(
            response.status >= 500 ? 502 : response.status,
            rawText.trim() || `Feishu request failed with status ${response.status}`,
          );
        }
        throw normalizeFeishuError({
          phase: "execute",
          status: response.status,
          rawText,
          envelope,
        });
      }

      return {
        ok: true,
        response: await readProviderProxyResponse(response),
      };
    } finally {
      requestSignal.cleanup();
    }
  } catch (error) {
    if (isAbortError(error)) {
      return toProviderProxyError(
        new ProviderRequestError(504, "timed out while requesting Feishu"),
        "Feishu request failed",
      );
    }
    return toProviderProxyError(error, "Feishu request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const credential = readFeishuAppBotCredential(input.values);
    await fetchTenantAccessToken(credential, fetcher, "validate", signal);

    return {
      profile: {
        accountId: credential.appId,
        displayName: credential.appId,
      },
      grantedScopes: feishuAppBotProviderScopes,
      metadata: compactObject({
        appId: credential.appId,
      }),
    };
  },
};

function readFeishuAppBotCredential(input: Record<string, string>): FeishuAppBotCredential {
  return {
    appId: requiredFeishuString(input.appId, "appId"),
    appSecret: requiredFeishuString(input.appSecret, "appSecret"),
  };
}

async function uploadImage(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  const source = await resolveFeishuImageUploadSource(requiredFeishuString(input.imageUrl, "imageUrl"), context);
  const formData = new FormData();
  formData.set("image_type", feishuImageUploadType);
  formData.set("image", new File([Buffer.from(source.bytes)], source.fileName, { type: source.mimeType }));

  return feishuRequest({
    method: "POST",
    path: "/im/v1/images",
    body: formData,
    accessToken: await fetchTenantAccessToken(context, context.fetcher, "execute", context.signal),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
}

async function uploadFile(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  const source = await resolveFeishuFileUploadSource(
    requiredFeishuString(input.fileUrl, "fileUrl"),
    optionalString(input.fileName),
    context,
  );
  const formData = new FormData();
  formData.set("file_type", requiredFeishuString(input.fileType, "fileType"));
  formData.set("file_name", source.fileName);
  const duration = stringifyOptionalScalar(input.duration);
  if (duration) {
    formData.set("duration", duration);
  }
  formData.set("file", new File([Buffer.from(source.bytes)], source.fileName, { type: source.mimeType }));

  return feishuRequest({
    method: "POST",
    path: "/im/v1/files",
    body: formData,
    accessToken: await fetchTenantAccessToken(context, context.fetcher, "execute", context.signal),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
}

async function downloadImage(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  const imageKey = requiredFeishuString(input.imageKey, "imageKey");
  const rawResponse = await feishuRawRequest({
    method: "GET",
    path: `/im/v1/images/${encodeURIComponent(imageKey)}`,
    accessToken: await fetchTenantAccessToken(context, context.fetcher, "execute", context.signal),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });

  return uploadFeishuMediaTransitFile({
    actionName: "download_image",
    idKey: "imageKey",
    idValue: imageKey,
    preferredFileName: optionalString(input.fileName),
    rawResponse,
    context,
  });
}

async function downloadFile(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  const fileKey = requiredFeishuString(input.fileKey, "fileKey");
  const rawResponse = await feishuRawRequest({
    method: "GET",
    path: `/im/v1/files/${encodeURIComponent(fileKey)}`,
    accessToken: await fetchTenantAccessToken(context, context.fetcher, "execute", context.signal),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });

  return uploadFeishuMediaTransitFile({
    actionName: "download_file",
    idKey: "fileKey",
    idValue: fileKey,
    preferredFileName: optionalString(input.fileName),
    rawResponse,
    context,
  });
}

async function sendMessage(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return callMessageEndpoint(
    {
      method: "POST",
      path: "/im/v1/messages",
      query: [["receive_id_type", requiredFeishuString(input.receiveIdType, "receiveIdType")]],
      body: compactObject({
        receive_id: requiredFeishuString(input.receiveId, "receiveId"),
        msg_type: requiredFeishuString(input.msgType, "msgType"),
        content: serializeFeishuContent(input.content),
        uuid: optionalString(input.uuid),
      }),
    },
    context,
  );
}

async function replyMessage(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return callMessageEndpoint(
    {
      method: "POST",
      path: `/im/v1/messages/${encodeURIComponent(requiredFeishuString(input.messageId, "messageId"))}/reply`,
      body: compactObject({
        content: serializeFeishuContent(input.content),
        msg_type: requiredFeishuString(input.msgType, "msgType"),
        reply_in_thread: optionalBoolean(input.replyInThread),
        uuid: optionalString(input.uuid),
      }),
    },
    context,
  );
}

async function getMessage(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "GET",
      path: `/im/v1/messages/${encodeURIComponent(requiredFeishuString(input.messageId, "messageId"))}`,
      query: compactQueryPairs([
        ["user_id_type", optionalString(input.userIdType)],
        ["card_msg_content_type", optionalString(input.cardMsgContentType)],
      ]),
    },
    context,
  );
}

async function listMessages(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "GET",
      path: "/im/v1/messages",
      query: compactQueryPairs([
        ["container_id_type", requiredFeishuString(input.containerIdType, "containerIdType")],
        ["container_id", requiredFeishuString(input.containerId, "containerId")],
        ["start_time", stringifyOptionalScalar(input.startTime)],
        ["end_time", stringifyOptionalScalar(input.endTime)],
        ["sort_type", optionalString(input.sortType)],
        ["page_size", stringifyOptionalScalar(input.pageSize)],
        ["page_token", optionalString(input.pageToken)],
        ["card_msg_content_type", optionalString(input.cardMsgContentType)],
      ]),
    },
    context,
  );
}

async function listChats(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "GET",
      path: "/im/v1/chats",
      query: compactQueryPairs([
        ["user_id_type", optionalString(input.userIdType)],
        ["sort_type", optionalString(input.sortType)],
        ["page_size", stringifyOptionalScalar(input.pageSize)],
        ["page_token", optionalString(input.pageToken)],
      ]),
    },
    context,
  );
}

async function searchChats(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "GET",
      path: "/im/v1/chats/search",
      query: compactQueryPairs([
        ["query", requiredFeishuString(input.query, "query")],
        ["user_id_type", optionalString(input.userIdType)],
        ["page_size", stringifyOptionalScalar(input.pageSize)],
        ["page_token", optionalString(input.pageToken)],
      ]),
    },
    context,
  );
}

async function getChat(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "GET",
      path: `/im/v1/chats/${encodeURIComponent(requiredFeishuString(input.chatId, "chatId"))}`,
      query: compactQueryPairs([["user_id_type", optionalString(input.userIdType)]]),
    },
    context,
  );
}

async function listChatMembers(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "GET",
      path: `/im/v1/chats/${encodeURIComponent(requiredFeishuString(input.chatId, "chatId"))}/members`,
      query: compactQueryPairs([
        ["member_id_type", optionalString(input.memberIdType)],
        ["page_size", stringifyOptionalScalar(input.pageSize)],
        ["page_token", optionalString(input.pageToken)],
      ]),
    },
    context,
  );
}

async function recallMessage(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "DELETE",
      path: `/im/v1/messages/${encodeURIComponent(requiredFeishuString(input.messageId, "messageId"))}`,
    },
    context,
  );
}

async function editMessage(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return callMessageEndpoint(
    {
      method: "PUT",
      path: `/im/v1/messages/${encodeURIComponent(requiredFeishuString(input.messageId, "messageId"))}`,
      body: {
        msg_type: requiredFeishuString(input.msgType, "msgType"),
        content: serializeFeishuContent(input.content),
      },
    },
    context,
  );
}

async function addMessageReaction(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "POST",
      path: `/im/v1/messages/${encodeURIComponent(requiredFeishuString(input.messageId, "messageId"))}/reactions`,
      body: {
        reaction_type: {
          emoji_type: requiredFeishuString(input.emojiType, "emojiType"),
        },
      },
    },
    context,
  );
}

async function listMessageReactions(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "GET",
      path: `/im/v1/messages/${encodeURIComponent(requiredFeishuString(input.messageId, "messageId"))}/reactions`,
      query: compactQueryPairs([
        ["reaction_type", optionalString(input.reactionType)],
        ["page_token", optionalString(input.pageToken)],
        ["page_size", stringifyOptionalScalar(input.pageSize)],
        ["user_id_type", optionalString(input.userIdType)],
      ]),
    },
    context,
  );
}

async function removeMessageReaction(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "DELETE",
      path: `/im/v1/messages/${encodeURIComponent(requiredFeishuString(input.messageId, "messageId"))}/reactions/${encodeURIComponent(requiredFeishuString(input.reactionId, "reactionId"))}`,
    },
    context,
  );
}

async function pinMessage(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "POST",
      path: "/im/v1/pins",
      body: {
        message_id: requiredFeishuString(input.messageId, "messageId"),
      },
    },
    context,
  );
}

async function listPins(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "GET",
      path: "/im/v1/pins",
      query: compactQueryPairs([
        ["chat_id", requiredFeishuString(input.chatId, "chatId")],
        ["start_time", stringifyOptionalScalar(input.startTime)],
        ["end_time", stringifyOptionalScalar(input.endTime)],
        ["page_size", stringifyOptionalScalar(input.pageSize)],
        ["page_token", optionalString(input.pageToken)],
      ]),
    },
    context,
  );
}

async function removePin(
  input: Record<string, unknown>,
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return executeFeishuRequest(
    {
      method: "DELETE",
      path: `/im/v1/pins/${encodeURIComponent(requiredFeishuString(input.messageId, "messageId"))}`,
    },
    context,
  );
}

async function executeFeishuRequest(
  input: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    path: string;
    query?: Array<[string, string]>;
    body?: Record<string, unknown>;
  },
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return feishuRequest({
    ...input,
    accessToken: await fetchTenantAccessToken(context, context.fetcher, "execute", context.signal),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
}

async function callMessageEndpoint(
  input: {
    method: "POST" | "PUT";
    path: string;
    query?: Array<[string, string]>;
    body: Record<string, unknown>;
  },
  context: FeishuAppBotActionContext,
): Promise<Record<string, unknown>> {
  return feishuRequest({
    method: input.method,
    path: input.path,
    query: input.query,
    body: input.body,
    accessToken: await fetchTenantAccessToken(context, context.fetcher, "execute", context.signal),
    fetcher: context.fetcher,
    phase: "execute",
    signal: context.signal,
  });
}

async function fetchTenantAccessToken(
  credential: FeishuAppBotCredential,
  fetcher: typeof fetch,
  phase: FeishuRequestPhase,
  signal?: AbortSignal,
): Promise<string> {
  const nowMs = Date.now();
  const cacheKey = `${credential.appId}\u0000${credential.appSecret}`;
  const cached = feishuTenantAccessTokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > nowMs) {
    return cached.token;
  }

  const envelope = await feishuRequest<{
    tenant_access_token?: unknown;
    expire?: unknown;
  }>({
    method: "POST",
    path: "/auth/v3/tenant_access_token/internal",
    body: {
      app_id: credential.appId,
      app_secret: credential.appSecret,
    },
    fetcher,
    phase,
    signal,
  });

  const tenantAccessToken = optionalString(envelope.tenant_access_token);
  if (!tenantAccessToken) {
    throw new ProviderRequestError(502, "feishu tenant_access_token is missing");
  }

  const expireSeconds = typeof envelope.expire === "number" && Number.isFinite(envelope.expire) ? envelope.expire : 0;
  if (expireSeconds > 0) {
    feishuTenantAccessTokenCache.set(cacheKey, {
      token: tenantAccessToken,
      expiresAtMs: Math.max(nowMs, nowMs + expireSeconds * 1000 - feishuTenantAccessTokenRefreshSkewMs),
    });
  }
  return tenantAccessToken;
}

async function feishuRequest<TData = Record<string, unknown>>(input: {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Array<[string, string]>;
  body?: FormData | Record<string, unknown>;
  accessToken?: string;
  fetcher: typeof fetch;
  phase: FeishuRequestPhase;
  signal?: AbortSignal;
}): Promise<Record<string, unknown> & FeishuApiEnvelope<TData>> {
  const url = new URL(`${feishuOpenBaseUrl}${input.path}`);
  for (const [key, value] of input.query ?? []) {
    url.searchParams.set(key, value);
  }

  const requestSignal = createFeishuRequestSignal(input.signal);
  try {
    const body = input.body;
    const isMultipartBody = body instanceof FormData;
    const headers: Record<string, string> = {
      "user-agent": providerUserAgent,
    };
    if (input.accessToken) {
      headers.authorization = `Bearer ${input.accessToken}`;
    }
    if (body && !isMultipartBody) {
      headers["content-type"] = "application/json; charset=utf-8";
    }
    let requestBody: BodyInit | undefined;
    if (body == null) {
      requestBody = undefined;
    } else if (isMultipartBody) {
      requestBody = body;
    } else {
      requestBody = JSON.stringify(body);
    }

    const response = await input.fetcher(url, {
      method: input.method,
      headers,
      body: requestBody,
      signal: requestSignal.signal,
    });
    const rawText = await response.text();
    const parsed = readFeishuEnvelope<TData>(rawText);
    const code = typeof parsed.code === "number" ? parsed.code : 0;
    if (!response.ok || code !== 0) {
      throw normalizeFeishuError({
        phase: input.phase,
        status: response.status,
        rawText,
        envelope: parsed,
      });
    }

    const data = optionalRecord(parsed.data) ?? {};
    return {
      code,
      msg: optionalString(parsed.msg) ?? "success",
      data: data as TData,
      ...(parsed.tenant_access_token ? { tenant_access_token: parsed.tenant_access_token } : {}),
      ...(parsed.expire ? { expire: parsed.expire } : {}),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, "timed out while requesting Feishu");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Feishu request failed");
  } finally {
    requestSignal.cleanup();
  }
}

async function feishuRawRequest(input: {
  method: "GET";
  path: string;
  accessToken?: string;
  fetcher: typeof fetch;
  phase: FeishuRequestPhase;
  signal?: AbortSignal;
}): Promise<FeishuRawResponse> {
  const url = new URL(`${feishuOpenBaseUrl}${input.path}`);
  const requestSignal = createFeishuRequestSignal(input.signal);
  let shouldCleanup = true;
  try {
    const headers: Record<string, string> = {
      "user-agent": providerUserAgent,
    };
    if (input.accessToken) {
      headers.authorization = `Bearer ${input.accessToken}`;
    }

    const response = await input.fetcher(url, {
      method: input.method,
      headers,
      signal: requestSignal.signal,
    });
    if (response.ok) {
      shouldCleanup = false;
      return {
        response,
        cleanup: requestSignal.cleanup,
      };
    }

    const rawText = await response.text();
    let envelope: FeishuApiEnvelope<unknown>;
    try {
      envelope = readFeishuEnvelope<unknown>(rawText);
    } catch {
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : response.status,
        rawText.trim() || `Feishu media request failed with status ${response.status}`,
      );
    }
    throw normalizeFeishuError({
      phase: input.phase,
      status: response.status,
      rawText,
      envelope,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, "timed out while downloading Feishu media");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Feishu media download failed", error);
  } finally {
    if (shouldCleanup) {
      requestSignal.cleanup();
    }
  }
}

function readFeishuEnvelope<TData>(rawText: string): FeishuApiEnvelope<TData> {
  try {
    return JSON.parse(rawText) as FeishuApiEnvelope<TData>;
  } catch {
    throw new ProviderRequestError(502, "invalid Feishu JSON response");
  }
}

function normalizeFeishuError(input: {
  phase: FeishuRequestPhase;
  status: number;
  rawText: string;
  envelope: FeishuApiEnvelope<unknown>;
}): ProviderRequestError {
  const message =
    optionalString(input.envelope.msg) ||
    (input.rawText.trim().length > 0 ? input.rawText : `Feishu request failed with status ${input.status}`);
  const code = typeof input.envelope.code === "number" ? input.envelope.code : null;
  const taggedMessage = code ? `Feishu ${code}: ${message}` : message;

  if (input.status === 429 || (code !== null && feishuRateLimitedErrorCodes.has(code))) {
    return new ProviderRequestError(429, taggedMessage, input.envelope);
  }
  if (input.phase === "validate") {
    return new ProviderRequestError(input.status >= 500 ? 502 : 400, taggedMessage, input.envelope);
  }
  if (input.status === 401 || (code !== null && feishuCredentialExpiredErrorCodes.has(code))) {
    return new ProviderRequestError(401, taggedMessage, input.envelope);
  }
  if (code !== null && feishuScopeMissingErrorCodes.has(code)) {
    return new ProviderRequestError(403, taggedMessage, input.envelope);
  }
  if (code === 230001) {
    return new ProviderRequestError(400, message, input.envelope);
  }
  if (input.status >= 400 && input.status < 500) {
    return new ProviderRequestError(input.status, taggedMessage, input.envelope);
  }
  return new ProviderRequestError(502, taggedMessage, input.envelope);
}

async function uploadFeishuMediaTransitFile(input: {
  actionName: "download_image" | "download_file";
  idKey: "imageKey" | "fileKey";
  idValue: string;
  preferredFileName?: string;
  rawResponse: FeishuRawResponse;
  context: FeishuAppBotActionContext;
}): Promise<Record<string, unknown>> {
  const { response, cleanup } = input.rawResponse;
  try {
    if (!input.context.transitFiles) {
      throw new ProviderRequestError(500, `${input.actionName} requires local transit files`);
    }

    const mimeType = normalizeMimeType(response.headers.get("content-type")) ?? "application/octet-stream";
    const fileName = input.preferredFileName ?? buildFeishuTransitFileName(input.idValue, mimeType);
    const upload = await input.context.transitFiles.create(
      new File([await response.arrayBuffer()], fileName, { type: mimeType }),
    );

    return {
      [input.idKey]: input.idValue,
      file: {
        name: fileName,
        mimetype: mimeType,
        downloadUrl: upload.downloadUrl,
      },
      contentType: mimeType,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, "timed out while storing Feishu media");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? error.message : `Feishu ${input.actionName} transit upload failed`,
      error,
    );
  } finally {
    cleanup();
  }
}

function serializeFeishuContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  const objectValue = optionalRecord(value);
  if (!objectValue) {
    throw new ProviderRequestError(400, "content must be a JSON string or object");
  }
  return JSON.stringify(objectValue);
}

function requiredFeishuString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function stringifyOptionalScalar(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function compactQueryPairs(pairs: Array<[string, string | undefined]>): Array<[string, string]> {
  return pairs.filter((entry): entry is [string, string] => entry[1] !== undefined);
}

function buildFeishuTransitFileName(id: string, mimeType: string): string {
  const extension = resolveFeishuFileExtension(mimeType);
  return extension ? `feishu-${id}.${extension}` : `feishu-${id}`;
}

function resolveFeishuFileExtension(mimeType: string): string | null {
  const normalizedMimeType = mimeType.split(";")[0]?.trim().toLowerCase();
  switch (normalizedMimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/bmp":
      return "bmp";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return "ico";
    case "image/tiff":
      return "tiff";
    case "image/heic":
      return "heic";
    case "application/pdf":
      return "pdf";
    case "application/msword":
      return "doc";
    case "application/vnd.ms-excel":
      return "xls";
    case "application/vnd.ms-powerpoint":
      return "ppt";
    case "video/mp4":
      return "mp4";
    case "audio/ogg":
    case "audio/opus":
      return "opus";
    default:
      return null;
  }
}

function resolveFeishuImageUploadSource(
  imageUrl: string,
  context: FeishuAppBotActionContext,
): Promise<FeishuUploadSource> {
  return resolveFeishuUploadSource({
    rawUrl: imageUrl,
    fieldName: "imageUrl",
    sourceKind: "image",
    maxBytes: feishuMaxImageUploadSourceBytes,
    fallbackFileName: "image.bin",
    context,
  });
}

function resolveFeishuFileUploadSource(
  fileUrl: string,
  preferredFileName: string | undefined,
  context: FeishuAppBotActionContext,
): Promise<FeishuUploadSource> {
  return resolveFeishuUploadSource({
    rawUrl: fileUrl,
    fieldName: "fileUrl",
    sourceKind: "file",
    maxBytes: feishuMaxFileUploadSourceBytes,
    preferredFileName,
    fallbackFileName: "file.bin",
    context,
  });
}

async function resolveFeishuUploadSource(input: {
  rawUrl: string;
  fieldName: "imageUrl" | "fileUrl";
  sourceKind: "image" | "file";
  maxBytes: number;
  preferredFileName?: string;
  fallbackFileName: string;
  context: FeishuAppBotActionContext;
}): Promise<FeishuUploadSource> {
  const url = assertPublicHttpUrl(input.rawUrl, {
    fieldName: input.fieldName,
    createError: (message) => new ProviderRequestError(400, message),
  });
  const requestSignal = createFeishuRequestSignal(input.context.signal);
  try {
    const response = await input.context.fetcher(url, {
      headers: { "user-agent": providerUserAgent },
      signal: requestSignal.signal,
    });
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status >= 500 ? 502 : response.status,
        `failed to fetch Feishu ${input.sourceKind} source: ${response.status} ${response.statusText}`.trim(),
      );
    }

    const bytes = await readFeishuUploadSourceBytes(response, input.maxBytes, input.fieldName);
    if (bytes.byteLength === 0) {
      throw new ProviderRequestError(400, `${input.fieldName} did not return ${input.sourceKind} bytes`);
    }

    return {
      bytes,
      fileName: input.preferredFileName || inferFileNameFromUrl(url) || input.fallbackFileName,
      mimeType: normalizeMimeType(response.headers.get("content-type")) ?? "application/octet-stream",
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, `timed out while fetching Feishu ${input.sourceKind} source`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? error.message : `failed to fetch Feishu ${input.sourceKind} source`,
    );
  } finally {
    requestSignal.cleanup();
  }
}

async function readFeishuUploadSourceBytes(
  response: Response,
  maxBytes: number,
  fieldName: "imageUrl" | "fileUrl",
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number.parseInt(contentLength, 10);
    if (Number.isInteger(parsedLength) && parsedLength > maxBytes) {
      throw new ProviderRequestError(400, `${fieldName} exceeds ${maxBytes} bytes`);
    }
  }
  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  try {
    while (true) {
      const readResult = await reader.read();
      if (readResult.done) {
        break;
      }

      totalSize += readResult.value.byteLength;
      if (totalSize > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ProviderRequestError(400, `${fieldName} exceeds ${maxBytes} bytes`);
      }
      chunks.push(readResult.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function inferFileNameFromUrl(url: URL): string | undefined {
  const lastSegment = url.pathname.split("/").filter(Boolean).at(-1);
  if (!lastSegment) {
    return undefined;
  }
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

function normalizeMimeType(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const [mimeType] = value.split(";");
  return optionalString(mimeType);
}

function createFeishuRequestSignal(parent?: AbortSignal): FeishuRequestSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), feishuRequestTimeoutMs);
  const abortFromParent = (): void => controller.abort(parent?.reason);
  if (parent?.aborted) {
    controller.abort(parent.reason);
  } else {
    parent?.addEventListener("abort", abortFromParent, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      parent?.removeEventListener("abort", abortFromParent);
    },
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
