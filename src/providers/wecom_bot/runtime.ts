import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";
import type { WecomBotActionName } from "./actions.ts";

import { createHash } from "node:crypto";
import { objectArray, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const wecomBotApiBaseUrl = "https://qyapi.weixin.qq.com";
const wecomBotWebhookPath = "/cgi-bin/webhook/send";
const wecomBotRequestTimeoutMs = 30_000;
const wecomBotValidationSuccessCodes = new Set([0, 40008, 40058, 93017]);
const utf8Encoder = new TextEncoder();

type WecomBotRequestPhase = "validate" | "execute";

interface WecomBotContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type WecomBotActionHandler = (input: Record<string, unknown>, context: WecomBotContext) => Promise<unknown>;

interface WecomBotEnvelope {
  errcode: number | null;
  errmsg: string | null;
}

interface WecomBotRequestResult {
  status: number;
  envelope: WecomBotEnvelope | null;
  rawText: string;
}

export const wecomBotActionHandlers: Record<WecomBotActionName, WecomBotActionHandler> = {
  send_text_message(input, context) {
    const content = requireUtf8Content(input.content, "content", 2048);
    return sendWecomBotMessage(
      withoutUndefined({
        msgtype: "text",
        text: withoutUndefined({
          content,
          mentioned_list: Array.isArray(input.mentionedList) ? input.mentionedList : undefined,
          mentioned_mobile_list: Array.isArray(input.mentionedMobileList) ? input.mentionedMobileList : undefined,
        }),
      }),
      context,
    );
  },
  send_markdown_message(input, context) {
    const content = requireUtf8Content(input.content, "content", 4096);
    return sendWecomBotMessage(
      {
        msgtype: "markdown",
        markdown: { content },
      },
      context,
    );
  },
  send_markdown_v2_message(input, context) {
    const content = requireUtf8Content(input.content, "content", 4096);
    return sendWecomBotMessage(
      {
        msgtype: "markdown_v2",
        markdown_v2: { content },
      },
      context,
    );
  },
  send_image_message(input, context) {
    return sendWecomBotMessage(
      {
        msgtype: "image",
        image: {
          base64: String(input.base64),
          md5: String(input.md5),
        },
      },
      context,
    );
  },
  send_news_message(input, context) {
    return sendWecomBotMessage(
      {
        msgtype: "news",
        news: {
          articles: objectArray(input.articles, "articles", providerInputError),
        },
      },
      context,
    );
  },
};

export async function validateWecomBotCredential(
  apiKeyInput: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = normalizeWecomBotApiKey(apiKeyInput);
  const probe = await requestWecomBot({
    apiKey,
    payload: {},
    fetcher,
    signal,
  });
  if (!isSuccessfulWecomBotValidationProbe(probe)) throw normalizeWecomBotError(probe, "validate");
  return {
    profile: {
      accountId: buildWecomBotProviderAccountId(apiKey),
      displayName: buildWecomBotAccountLabel(apiKey),
    },
    grantedScopes: [],
    metadata: {
      webhookHost: new URL(buildWecomBotWebhookUrl(apiKey)).host,
      validationMode: "empty_payload_probe",
      credentialKind: "webhook_key",
    },
  };
}

async function sendWecomBotMessage(
  payload: Record<string, unknown>,
  context: WecomBotContext,
): Promise<Record<string, unknown>> {
  const result = await requestWecomBot({
    apiKey: normalizeWecomBotApiKey(context.apiKey),
    payload,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  if (result.envelope?.errcode !== 0) throw normalizeWecomBotError(result, "execute");
  return {
    errcode: result.envelope.errcode,
    errmsg: result.envelope.errmsg ?? "ok",
  };
}

async function requestWecomBot(input: {
  apiKey: string;
  payload: Record<string, unknown>;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}): Promise<WecomBotRequestResult> {
  const timeout = createProviderTimeout(input.signal, wecomBotRequestTimeoutMs);
  try {
    const response = await input.fetcher(buildWecomBotWebhookUrl(input.apiKey), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.payload),
      signal: timeout.signal,
    });
    const rawText = await response.text();
    return {
      status: response.status,
      envelope: readWecomBotEnvelope(rawText),
      rawText,
    };
  } catch (error) {
    throw new ProviderRequestError(
      timeout.didTimeout() ? 504 : 502,
      timeout.didTimeout()
        ? "wecom_bot request timed out"
        : error instanceof Error
          ? error.message
          : "wecom_bot request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function readWecomBotEnvelope(rawText: string): WecomBotEnvelope | null {
  try {
    const payload = JSON.parse(rawText) as unknown;
    const record = optionalRecord(payload);
    if (!record) return null;
    return {
      errcode: readWecomBotErrorCode(record.errcode) ?? readWecomBotErrorCode(record.ErrCode) ?? null,
      errmsg:
        optionalString(record.errmsg) ?? optionalString(record.ErrMsg) ?? optionalString(record.error_msg) ?? null,
    };
  } catch {
    return null;
  }
}

function readWecomBotErrorCode(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const raw = optionalString(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function isSuccessfulWecomBotValidationProbe(result: WecomBotRequestResult): boolean {
  return result.envelope?.errcode != null && wecomBotValidationSuccessCodes.has(result.envelope.errcode);
}

function normalizeWecomBotError(result: WecomBotRequestResult, phase: WecomBotRequestPhase): ProviderRequestError {
  const errcode = result.envelope?.errcode;
  const message =
    result.envelope?.errmsg ?? (result.rawText.trim() || `wecom_bot request failed with status ${result.status}`);
  if (errcode === 45009 || result.status === 429) return new ProviderRequestError(429, message, result.envelope);
  if (errcode === 40008 || errcode === 40058 || errcode === 93017 || errcode === 93018) {
    return new ProviderRequestError(400, message, result.envelope);
  }
  if (errcode === 93000 || errcode === 93004 || errcode === 93019) {
    return new ProviderRequestError(phase === "validate" ? 400 : 409, message, result.envelope);
  }
  if (errcode === 93001 || errcode === 93008) {
    return new ProviderRequestError(phase === "validate" ? 400 : 500, message, result.envelope);
  }
  return new ProviderRequestError(result.status >= 400 ? result.status : 500, message, result.envelope);
}

function normalizeWecomBotApiKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new ProviderRequestError(400, "apiKey is required");
  if (!trimmed.includes("://")) return trimmed;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ProviderRequestError(400, "apiKey must be a WeCom webhook key or webhook URL");
  }
  if (url.protocol !== "https:") throw new ProviderRequestError(400, "webhook URL must use https");
  if (url.host !== "qyapi.weixin.qq.com" || url.pathname !== wecomBotWebhookPath) {
    throw new ProviderRequestError(400, "webhook URL must be a WeCom bot webhook URL");
  }
  const key = url.searchParams.get("key")?.trim();
  if (!key) throw new ProviderRequestError(400, "webhook URL must include a key query parameter");
  return key;
}

function buildWecomBotWebhookUrl(apiKey: string): string {
  const url = new URL(wecomBotWebhookPath, wecomBotApiBaseUrl);
  url.searchParams.set("key", apiKey);
  return url.toString();
}

function buildWecomBotProviderAccountId(apiKey: string): string {
  return `wecom_bot:${createHash("sha256").update(apiKey).digest("hex").slice(0, 24)}`;
}

function buildWecomBotAccountLabel(apiKey: string): string {
  return `WeCom Bot · ${apiKey.slice(-6) || "******"}`;
}

function withoutUndefined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

function requireUtf8Content(value: unknown, fieldName: string, maxBytes: number): string {
  const content = optionalString(value);
  if (!content) throw new ProviderRequestError(400, `${fieldName} is required`);
  if (utf8Encoder.encode(content).byteLength > maxBytes) {
    throw new ProviderRequestError(400, `${fieldName} must be at most ${maxBytes} UTF-8 bytes`);
  }
  return content;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
