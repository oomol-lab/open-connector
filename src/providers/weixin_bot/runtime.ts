import type { TransitFileWriter } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { looseArray, optionalInteger, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export interface WeixinBotContext {
  botToken: string;
  accountId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  transitFiles?: TransitFileWriter;
}

export interface WeixinRequestOptions {
  context: WeixinBotContext;
  path: string;
  label: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}

type WeixinBotActionHandler = (
  input: Record<string, unknown>,
  context: WeixinBotContext,
) => Promise<Record<string, unknown>>;

const apiBaseUrl = "https://ilinkai.weixin.qq.com";
const channelVersion = "1.0.0";
const botAgent = "oomol-connect/0.1";
const appClientVersion = "65536";

export const weixinBotActionHandlers: ProviderActionHandlers<"weixin_bot", WeixinBotActionHandler> = {
  async get_updates(input, context) {
    const payload = await requestWeixin({
      context,
      path: "/ilink/bot/getupdates",
      label: "Weixin get updates",
      timeoutMs: 40_000,
      body: {
        get_updates_buf: optionalString(input.cursor) ?? "",
        base_info: baseInfo(),
      },
    });

    return {
      messages: looseArray(payload.msgs).map((message) => requiredResponseRecord(message, "Weixin message")),
      nextCursor: optionalString(payload.get_updates_buf) ?? null,
      longPollingTimeoutMs: optionalInteger(payload.longpolling_timeout_ms) ?? null,
    };
  },

  async send_message(input, context) {
    const payload = await requestWeixin({
      context,
      path: "/ilink/bot/sendmessage",
      label: "Weixin send message",
      body: {
        msg: {
          from_user_id: "",
          to_user_id: requiredInputString(input.toUserId, "toUserId"),
          client_id: randomUUID(),
          message_type: 2,
          message_state: 2,
          context_token: requiredInputString(input.contextToken, "contextToken"),
          item_list: [{ type: 1, text_item: { text: requiredInputString(input.text, "text") } }],
        },
        base_info: baseInfo(),
      },
    });

    return { messageId: optionalString(payload.message_id) ?? null };
  },

  async send_media(input, context) {
    const { sendWeixinMedia } = await import("./runtime-media.ts");
    return sendWeixinMedia(input, context, requestWeixin);
  },

  async download_media(input, context) {
    const { downloadWeixinMedia } = await import("./runtime-media.ts");
    return downloadWeixinMedia(input, context);
  },

  async send_typing(input, context) {
    const userId = requiredInputString(input.userId, "userId");
    const contextToken = requiredInputString(input.contextToken, "contextToken");
    const status = readTypingStatus(input.status);
    const config = await requestWeixin({
      context,
      path: "/ilink/bot/getconfig",
      label: "Weixin get config",
      body: {
        ilink_user_id: userId,
        context_token: contextToken,
        base_info: baseInfo(),
      },
    });
    const typingTicket = optionalString(config.typing_ticket);
    if (!typingTicket) {
      throw providerResponseError("Weixin get config response is missing typing_ticket");
    }

    await requestWeixin({
      context,
      path: "/ilink/bot/sendtyping",
      label: "Weixin send typing",
      body: {
        ilink_user_id: userId,
        typing_ticket: typingTicket,
        status: status === "typing" ? 1 : 2,
        base_info: baseInfo(),
      },
    });

    return { status };
  },
};

function baseInfo(): Record<string, string> {
  return {
    channel_version: channelVersion,
    bot_agent: botAgent,
  };
}

export async function requestWeixin(options: WeixinRequestOptions): Promise<Record<string, unknown>> {
  return runProviderRequest(
    { signal: options.context.signal, label: options.label, timeoutMs: options.timeoutMs },
    async (signal) => {
      const response = await options.context.fetcher(new URL(options.path, apiBaseUrl), {
        method: "POST",
        headers: authenticatedHeaders(options.context.botToken),
        body: JSON.stringify(options.body),
        signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new ProviderRequestError(response.status, text || `${options.label} failed`);
      }
      const payload = requiredResponseRecord(parseWeixinJson(text), `${options.label} response`);
      assertWeixinSuccess(payload, options.label);
      return payload;
    },
  );
}

function authenticatedHeaders(botToken: string): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    AuthorizationType: "ilink_bot_token",
    Authorization: `Bearer ${botToken}`,
    "iLink-App-Id": "bot",
    "iLink-App-ClientVersion": appClientVersion,
  });
  const randomValue = crypto.getRandomValues(new Uint32Array(1))[0]!;
  headers.set("X-WECHAT-UIN", Buffer.from(String(randomValue), "utf8").toString("base64"));
  return headers;
}

function assertWeixinSuccess(payload: Record<string, unknown>, label: string): void {
  const ret = optionalInteger(payload.ret);
  const errorCode = optionalInteger(payload.errcode);
  const failureCode = ret && ret !== 0 ? ret : errorCode && errorCode !== 0 ? errorCode : undefined;
  if (failureCode === undefined) return;

  const message = optionalString(payload.errmsg) ?? `${label} failed with code ${failureCode}`;
  if (failureCode === -14) {
    throw new ProviderRequestError(401, `${message}. Run the QR login example again to reconnect.`);
  }
  throw new ProviderRequestError(502, message, payload);
}

function readTypingStatus(value: unknown): "typing" | "cancel" {
  const status = requiredInputString(value, "status");
  if (status === "typing" || status === "cancel") return status;
  throw new ProviderRequestError(400, "status must be typing or cancel");
}

export function parseWeixinJson(text: string): unknown {
  const losslessIds = new Set(["message_id", "msg_id", "svr_id"]);
  let output = "";
  let position = 0;

  while (position < text.length) {
    if (text[position] !== '"') {
      output += text[position++];
      continue;
    }

    const start = position++;
    let escaped = false;
    while (position < text.length) {
      const character = text[position++];
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') break;
    }
    const token = text.slice(start, position);
    output += token;

    let cursor = position;
    while (/\s/.test(text[cursor] ?? "")) cursor++;
    if (text[cursor] !== ":") continue;

    let key: unknown;
    try {
      key = JSON.parse(token);
    } catch {
      continue;
    }
    if (typeof key !== "string" || !losslessIds.has(key)) continue;

    output += text.slice(position, cursor + 1);
    cursor++;
    while (/\s/.test(text[cursor] ?? "")) output += text[cursor++];
    const numberStart = cursor;
    if (text[cursor] === "-") cursor++;
    while (/\d/.test(text[cursor] ?? "")) cursor++;
    if (cursor === numberStart || (cursor === numberStart + 1 && text[numberStart] === "-")) {
      position = numberStart;
      continue;
    }

    output += `"${text.slice(numberStart, cursor)}"`;
    position = cursor;
  }

  return JSON.parse(output);
}
