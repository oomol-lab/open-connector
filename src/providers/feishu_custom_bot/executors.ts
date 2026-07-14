import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { FeishuCustomBotActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { createHash, createHmac } from "node:crypto";
import { compactObject, optionalRecord, optionalString, requiredRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "feishu_custom_bot";
const feishuCustomBotApiBaseUrl = "https://open.feishu.cn";
const feishuCustomBotWebhookPathPrefix = "/open-apis/bot/v2/hook/";
const feishuCustomBotAllowedWebhookHosts = new Set([new URL(feishuCustomBotApiBaseUrl).host]);
const feishuCustomBotMaxPayloadBytes = 20 * 1024;
const feishuCustomBotRequestTimeoutMs = 30_000;

const feishuCustomBotFetch = createProviderFetch({ skipDnsValidation: true });
const feishuCustomBotProbeBadRequestCode = 9499;
const feishuCustomBotKeywordNotFoundCode = 19024;
const feishuCustomBotProbePayload = {
  msg_type: "__validation_probe__",
};

interface FeishuCustomBotActionContext {
  apiKey: string;
  signingSecret?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface FeishuCustomBotCredential {
  webhookUrl: string;
  webhookToken: string;
}

interface FeishuCustomBotPayload extends Record<string, unknown> {
  msg_type: string;
  content?: Record<string, unknown>;
  card?: Record<string, unknown>;
}

interface FeishuCustomBotEnvelope {
  code: number | null;
  msg: string | null;
  data: Record<string, unknown>;
  statusCode: number | null;
  statusMessage: string | null;
}

interface FeishuCustomBotRequestResult {
  status: number;
  envelope: FeishuCustomBotEnvelope | null;
  rawText: string;
}

interface FeishuCustomBotRequestSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

type FeishuCustomBotRequestPhase = "validate" | "execute";
type FeishuCustomBotActionHandler = (
  input: Record<string, unknown>,
  context: FeishuCustomBotActionContext,
) => Promise<unknown>;

export const feishuCustomBotActionHandlers: Record<FeishuCustomBotActionName, FeishuCustomBotActionHandler> = {
  send_text_message(input, context) {
    return sendFeishuCustomBotMessage(
      {
        msg_type: "text",
        content: {
          text: requiredFeishuCustomBotString(input.text, "text"),
        },
      },
      context,
    );
  },
  send_post_message(input, context) {
    return sendFeishuCustomBotMessage(
      {
        msg_type: "post",
        content: {
          post: requiredFeishuCustomBotObject(input.post, "post"),
        },
      },
      context,
    );
  },
  send_image_message(input, context) {
    return sendFeishuCustomBotMessage(
      {
        msg_type: "image",
        content: {
          image_key: requiredFeishuCustomBotString(input.imageKey, "imageKey"),
        },
      },
      context,
    );
  },
  send_share_chat_message(input, context) {
    return sendFeishuCustomBotMessage(
      {
        msg_type: "share_chat",
        content: {
          share_chat_id: requiredFeishuCustomBotString(input.shareChatId, "shareChatId"),
        },
      },
      context,
    );
  },
  send_interactive_message(input, context) {
    return sendFeishuCustomBotMessage(
      {
        msg_type: "interactive",
        card: requiredFeishuCustomBotObject(input.card, "card"),
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FeishuCustomBotActionContext>({
  service,
  skipDnsValidation: true,
  handlers: feishuCustomBotActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FeishuCustomBotActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      signingSecret: readOptionalFeishuCustomBotField(credential.values.signingSecret),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    if (input.method !== "POST") {
      throw new ProviderRequestError(400, "Feishu custom bot proxy only supports POST");
    }

    const endpointUrl = createProviderProxyUrl(feishuCustomBotApiBaseUrl, input.endpoint, input.query);
    if (endpointUrl.pathname !== feishuCustomBotWebhookPathPrefix.slice(0, -1)) {
      throw new ProviderRequestError(400, "Feishu custom bot proxy endpoint must be /open-apis/bot/v2/hook");
    }

    const credential = await requireApiKeyCredential(context, service);
    const webhook = parseFeishuCustomBotWebhookUrl(resolveFeishuCustomBotApiKey(credential.apiKey).webhookUrl);
    for (const [key, value] of endpointUrl.searchParams) {
      webhook.searchParams.set(key, value);
    }

    const payload = optionalRecord(input.body);
    if (!payload) {
      throw new ProviderRequestError(400, "Feishu custom bot proxy body must be a JSON object");
    }

    const requestBody = JSON.stringify(
      buildFeishuCustomBotRequestPayload(payload, readOptionalFeishuCustomBotField(credential.values.signingSecret)),
    );
    if (Buffer.byteLength(requestBody, "utf8") > feishuCustomBotMaxPayloadBytes) {
      throw new ProviderRequestError(400, "Feishu custom bot request body must not exceed 20 KB");
    }

    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);

    const requestSignal = createFeishuCustomBotRequestSignal(context.signal);
    try {
      const response = await feishuCustomBotFetch(webhook, {
        method: "POST",
        headers,
        body: requestBody,
        signal: requestSignal.signal,
      });
      if (!response.ok) {
        const rawText = await readProviderProxyErrorMessage(response, "");
        throw normalizeFeishuCustomBotError(
          {
            status: response.status,
            envelope: normalizeFeishuCustomBotEnvelope(parseFeishuCustomBotResponseText(rawText)),
            rawText,
          },
          "execute",
        );
      }

      return { ok: true, response: await readProviderProxyResponse(response) };
    } finally {
      requestSignal.cleanup();
    }
  } catch (error) {
    if (isAbortError(error)) {
      return toProviderProxyError(
        new ProviderRequestError(504, "Feishu custom bot request timed out"),
        "provider request failed",
      );
    }
    if (error instanceof ProviderRequestError) {
      return toProviderProxyError(error, "provider request failed");
    }
    const message = error instanceof Error && error.message ? error.message : "unknown error";
    return toProviderProxyError(
      new ProviderRequestError(502, `Feishu custom bot request failed: ${message}`),
      "provider request failed",
    );
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const credential = resolveFeishuCustomBotApiKey(input.apiKey);
    await validateFeishuCustomBotCredential({
      webhookUrl: credential.webhookUrl,
      signingSecret: readOptionalFeishuCustomBotField(input.values.signingSecret),
      fetcher,
      signal,
    });

    return {
      profile: {
        accountId: buildFeishuCustomBotProviderAccountId(credential.webhookToken),
        displayName: buildFeishuCustomBotAccountLabel(credential.webhookToken),
      },
      grantedScopes: [],
      metadata: compactObject({
        webhookHost: new URL(credential.webhookUrl).host,
        webhookPathSuffix: maskFeishuCustomBotToken(credential.webhookToken),
        securityMode: readOptionalFeishuCustomBotField(input.values.signingSecret) ? "signed" : "unsigned",
        validationMode: "invalid_msg_type_probe",
        credentialKind: "webhook_token",
      }),
    };
  },
};

async function validateFeishuCustomBotCredential(input: {
  webhookUrl: string;
  signingSecret?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<void> {
  const probe = await requestFeishuCustomBot({
    webhookUrl: input.webhookUrl,
    signingSecret: input.signingSecret,
    payload: feishuCustomBotProbePayload,
    fetcher: input.fetcher,
    signal: input.signal,
  });

  if (!isSuccessfulValidationProbe(probe)) {
    throw normalizeFeishuCustomBotError(probe, "validate");
  }
}

async function sendFeishuCustomBotMessage(
  payload: FeishuCustomBotPayload,
  context: FeishuCustomBotActionContext,
): Promise<Record<string, unknown>> {
  const credential = resolveFeishuCustomBotApiKey(context.apiKey);
  const result = await requestFeishuCustomBot({
    webhookUrl: credential.webhookUrl,
    signingSecret: context.signingSecret,
    payload,
    fetcher: context.fetcher,
    signal: context.signal,
  });

  if (result.envelope?.code !== 0) {
    throw normalizeFeishuCustomBotError(result, "execute");
  }

  return compactObject({
    code: result.envelope.code,
    msg: result.envelope.msg ?? "success",
    data: result.envelope.data,
    statusCode: result.envelope.statusCode ?? undefined,
    statusMessage: result.envelope.statusMessage ?? undefined,
  });
}

async function requestFeishuCustomBot(input: {
  webhookUrl: string;
  signingSecret?: string;
  payload: FeishuCustomBotPayload | Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<FeishuCustomBotRequestResult> {
  const webhook = parseFeishuCustomBotWebhookUrl(input.webhookUrl);
  const requestPayload = buildFeishuCustomBotRequestPayload(input.payload, input.signingSecret);
  const requestBody = JSON.stringify(requestPayload);
  if (Buffer.byteLength(requestBody, "utf8") > feishuCustomBotMaxPayloadBytes) {
    throw new ProviderRequestError(400, "Feishu custom bot request body must not exceed 20 KB");
  }

  const requestSignal = createFeishuCustomBotRequestSignal(input.signal);
  try {
    const response = await input.fetcher(webhook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: requestBody,
      signal: requestSignal.signal,
    });
    const rawText = await response.text();
    const rawPayload = parseFeishuCustomBotResponseText(rawText);

    return {
      status: response.status,
      envelope: normalizeFeishuCustomBotEnvelope(rawPayload),
      rawText,
    };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new ProviderRequestError(504, "Feishu custom bot request timed out");
    }
    const message = error instanceof Error && error.message ? error.message : "unknown error";
    throw new ProviderRequestError(502, `Feishu custom bot request failed: ${message}`);
  } finally {
    requestSignal.cleanup();
  }
}

function buildFeishuCustomBotRequestPayload(
  payload: Record<string, unknown>,
  signingSecret?: string,
): Record<string, unknown> {
  if (!signingSecret) {
    return payload;
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  return {
    timestamp,
    sign: buildFeishuCustomBotSignature(timestamp, signingSecret),
    ...payload,
  };
}

function buildFeishuCustomBotSignature(timestamp: string, secret: string): string {
  return createHmac("sha256", `${timestamp}\n${secret}`).digest("base64");
}

function parseFeishuCustomBotResponseText(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function normalizeFeishuCustomBotEnvelope(payload: unknown): FeishuCustomBotEnvelope | null {
  const record = optionalRecord(payload);
  if (!record) {
    return null;
  }

  return {
    code: readFeishuCustomBotInteger(record.code),
    msg: optionalString(record.msg) ?? null,
    data: optionalRecord(record.data) ?? {},
    statusCode: readFeishuCustomBotInteger(record.StatusCode),
    statusMessage: optionalString(record.StatusMessage) ?? null,
  };
}

function isSuccessfulValidationProbe(result: FeishuCustomBotRequestResult): boolean {
  if (result.envelope?.code === feishuCustomBotProbeBadRequestCode) {
    return true;
  }
  if (result.envelope?.code === feishuCustomBotKeywordNotFoundCode) {
    return true;
  }
  return isFeishuCustomBotUnknownContentProbeError(result.envelope?.msg);
}

function isFeishuCustomBotUnknownContentProbeError(message: string | null | undefined): boolean {
  return message?.trim().toLowerCase() === "params error, unknown content value";
}

function normalizeFeishuCustomBotError(
  result: FeishuCustomBotRequestResult,
  phase: FeishuCustomBotRequestPhase,
): ProviderRequestError {
  const message =
    result.envelope?.msg ??
    result.envelope?.statusMessage ??
    readFeishuCustomBotFallbackMessage(result.rawText) ??
    `Feishu custom bot request failed during ${phase}`;

  if (result.envelope?.code === 11232 || result.status === 429) {
    return new ProviderRequestError(429, message, result.envelope ?? result.rawText);
  }
  if (result.status >= 500) {
    return new ProviderRequestError(result.status, message, result.envelope ?? result.rawText);
  }
  if (result.envelope != null || (result.status >= 400 && result.status < 500)) {
    return new ProviderRequestError(400, message, result.envelope ?? result.rawText);
  }
  return new ProviderRequestError(502, message, result.rawText);
}

function resolveFeishuCustomBotApiKey(apiKey: string): FeishuCustomBotCredential {
  const trimmed = requiredFeishuCustomBotString(apiKey, "apiKey");
  if (trimmed.includes("://")) {
    const webhook = parseFeishuCustomBotWebhookUrl(trimmed);
    return {
      webhookUrl: webhook.toString(),
      webhookToken: extractFeishuCustomBotToken(webhook),
    };
  }

  const webhookToken = normalizeFeishuCustomBotWebhookToken(trimmed);
  return {
    webhookUrl: buildFeishuCustomBotWebhookUrl(webhookToken).toString(),
    webhookToken,
  };
}

function parseFeishuCustomBotWebhookUrl(rawValue: string): URL {
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new ProviderRequestError(400, "webhookUrl must be a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "webhookUrl must use https");
  }
  if (!feishuCustomBotAllowedWebhookHosts.has(url.host)) {
    throw new ProviderRequestError(400, "webhookUrl must use an official Feishu webhook host");
  }
  if (!url.pathname.startsWith(feishuCustomBotWebhookPathPrefix)) {
    throw new ProviderRequestError(400, "webhookUrl must be a Feishu custom bot webhook URL");
  }

  const token = extractFeishuCustomBotToken(url);
  if (!token || token.includes("/")) {
    throw new ProviderRequestError(400, "webhookUrl must include a valid Feishu custom bot token");
  }

  return url;
}

function extractFeishuCustomBotToken(webhook: URL): string {
  return webhook.pathname.slice(feishuCustomBotWebhookPathPrefix.length);
}

function normalizeFeishuCustomBotWebhookToken(value: string): string {
  const trimmed = requiredFeishuCustomBotString(value, "apiKey");
  if (trimmed.includes("/")) {
    throw new ProviderRequestError(400, "apiKey must be a Feishu webhook token or webhook URL");
  }
  return trimmed;
}

function buildFeishuCustomBotWebhookUrl(webhookToken: string): URL {
  return new URL(`${feishuCustomBotWebhookPathPrefix}${webhookToken}`, feishuCustomBotApiBaseUrl);
}

function buildFeishuCustomBotProviderAccountId(webhookToken: string): string {
  return `feishu_custom_bot:${createHash("sha256").update(webhookToken).digest("hex").slice(0, 24)}`;
}

function buildFeishuCustomBotAccountLabel(webhookToken: string): string {
  return `Feishu Custom Bot · ${maskFeishuCustomBotToken(webhookToken)}`;
}

function maskFeishuCustomBotToken(token: string): string {
  return token.length <= 6 ? token : token.slice(token.length - 6);
}

function readFeishuCustomBotInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return null;
}

function readFeishuCustomBotFallbackMessage(rawText: string): string | undefined {
  return optionalString(rawText);
}

function requiredFeishuCustomBotString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requiredFeishuCustomBotObject(value: unknown, fieldName: string): Record<string, unknown> {
  return requiredRecord(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalFeishuCustomBotField(value: unknown): string | undefined {
  return optionalString(value);
}

function createFeishuCustomBotRequestSignal(parent?: AbortSignal): FeishuCustomBotRequestSignal {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), feishuCustomBotRequestTimeoutMs);
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
