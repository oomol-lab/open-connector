import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { DingtalkBotActionName } from "./actions.ts";

import { createHash, createHmac } from "node:crypto";
import { compactObject, objectArray, optionalNumber, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  createProviderProxyUrl,
  defineProviderExecutors,
  isAbortLikeError,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

const service = "dingtalk_bot";
const apiBaseUrl = "https://oapi.dingtalk.com";
const webhookPath = "/robot/send";
const requestTimeoutMs = 30_000;
const validationProbePayload = { msgtype: "__validation_probe__" };
const validationSuccessCodes = new Set([40035, 400105]);

interface DingtalkBotContext {
  apiKey: string;
  signingSecret?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface DingtalkBotEnvelope {
  errcode: number | null;
  errmsg: string | null;
}

interface DingtalkBotRequestResult {
  status: number;
  envelope: DingtalkBotEnvelope | null;
  rawText: string;
}

type DingtalkBotActionHandler = (input: Record<string, unknown>, context: DingtalkBotContext) => Promise<unknown>;

export const dingtalkBotActionHandlers: Record<DingtalkBotActionName, DingtalkBotActionHandler> = {
  send_text_message(input, context) {
    return sendDingtalkBotMessage(
      compactObject({
        msgtype: "text",
        msgUuid: optionalString(input.msgUuid),
        at: buildAtPayload(input),
        text: { content: requiredString(input.content, "content", providerInputError) },
      }),
      context,
    );
  },
  send_link_message(input, context) {
    return sendDingtalkBotMessage(
      compactObject({
        msgtype: "link",
        msgUuid: optionalString(input.msgUuid),
        link: compactObject({
          title: requiredString(input.title, "title", providerInputError),
          text: requiredString(input.text, "text", providerInputError),
          messageUrl: requiredString(input.messageUrl, "messageUrl", providerInputError),
          picUrl: optionalString(input.picUrl),
        }),
      }),
      context,
    );
  },
  send_markdown_message(input, context) {
    return sendDingtalkBotMessage(
      compactObject({
        msgtype: "markdown",
        msgUuid: optionalString(input.msgUuid),
        at: buildAtPayload(input),
        markdown: {
          title: requiredString(input.title, "title", providerInputError),
          text: requiredString(input.text, "text", providerInputError),
        },
      }),
      context,
    );
  },
  send_action_card_message(input, context) {
    return sendDingtalkBotMessage(buildActionCardPayload(input), context);
  },
  send_feed_card_message(input, context) {
    return sendDingtalkBotMessage(
      compactObject({
        msgtype: "feedCard",
        msgUuid: optionalString(input.msgUuid),
        feedCard: {
          links: objectArray(input.links, "links", providerInputError).map((item) => ({
            title: requiredString(item.title, "title", providerInputError),
            messageURL: requiredString(item.messageUrl, "messageUrl", providerInputError),
            picURL: requiredString(item.picUrl, "picUrl", providerInputError),
          })),
        },
      }),
      context,
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DingtalkBotContext>({
  service,
  handlers: dingtalkBotActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DingtalkBotContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      signingSecret: optionalString(credential.values.signingSecret),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(apiBaseUrl, input.endpoint, input.query);
    if (url.pathname !== webhookPath) {
      throw new ProviderRequestError(400, "DingTalk Bot proxy endpoint must be /robot/send");
    }
    applyWebhookAuthentication(
      url,
      normalizeApiKey(credential.apiKey),
      optionalString(credential.values.signingSecret),
    );
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const accessToken = normalizeApiKey(input.apiKey);
    const signingSecret = optionalString(input.values.signingSecret);
    const probe = await requestDingtalkBot({
      accessToken,
      signingSecret,
      payload: validationProbePayload,
      fetcher,
      signal,
    });
    if (!isSuccessfulValidationProbe(probe)) {
      throw normalizeDingtalkBotError(probe, "validate");
    }
    return {
      profile: {
        accountId: buildProviderAccountId(accessToken),
        displayName: `DingTalk Bot ${accessToken.slice(-6) || "******"}`,
      },
      grantedScopes: [],
      metadata: compactObject({
        webhookHost: new URL(buildWebhookUrl(accessToken)).host,
        validationMode: "invalid_msgtype_probe",
        credentialKind: "webhook_access_token",
        securityMode: signingSecret ? "signed" : "unsigned",
      }),
    };
  },
};

async function sendDingtalkBotMessage(payload: Record<string, unknown>, context: DingtalkBotContext): Promise<unknown> {
  const result = await requestDingtalkBot({
    accessToken: normalizeApiKey(context.apiKey),
    signingSecret: context.signingSecret,
    payload,
    fetcher: context.fetcher,
    signal: context.signal,
  });
  if (result.envelope?.errcode !== 0) {
    throw normalizeDingtalkBotError(result, "execute");
  }
  return {
    errcode: result.envelope.errcode,
    errmsg: result.envelope.errmsg ?? "ok",
  };
}

async function requestDingtalkBot(input: {
  accessToken: string;
  signingSecret?: string;
  payload: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<DingtalkBotRequestResult> {
  const timeout = createProviderTimeout(input.signal, requestTimeoutMs);
  try {
    const response = await input.fetcher(buildWebhookUrl(input.accessToken, input.signingSecret), {
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
      envelope: readEnvelope(rawText),
      rawText,
    };
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "DingTalk Bot request timed out");
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "DingTalk Bot request failed");
  } finally {
    timeout.cleanup();
  }
}

function buildAtPayload(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const at = compactObject({
    atMobiles: Array.isArray(input.atMobiles) ? input.atMobiles : undefined,
    atUserIds: Array.isArray(input.atUserIds) ? input.atUserIds : undefined,
    isAtAll: typeof input.isAtAll === "boolean" ? input.isAtAll : undefined,
  });
  return Object.keys(at).length > 0 ? at : undefined;
}

function buildActionCardPayload(input: Record<string, unknown>): Record<string, unknown> {
  const actionCard =
    input.cardMode === "single"
      ? {
          title: requiredString(input.title, "title", providerInputError),
          text: requiredString(input.text, "text", providerInputError),
          singleTitle: requiredString(input.singleTitle, "singleTitle", providerInputError),
          singleURL: requiredString(input.singleUrl, "singleUrl", providerInputError),
          btnOrientation: mapButtonOrientation(optionalString(input.buttonOrientation)),
        }
      : {
          title: requiredString(input.title, "title", providerInputError),
          text: requiredString(input.text, "text", providerInputError),
          btns: objectArray(input.buttons, "buttons", providerInputError).map((button) => ({
            title: requiredString(button.title, "title", providerInputError),
            actionURL: requiredString(button.actionUrl, "actionUrl", providerInputError),
          })),
          btnOrientation: mapButtonOrientation(optionalString(input.buttonOrientation)),
        };
  return compactObject({
    msgtype: "actionCard",
    msgUuid: optionalString(input.msgUuid),
    actionCard: compactObject(actionCard),
  });
}

function mapButtonOrientation(value: string | undefined): string | undefined {
  return value === "vertical" ? "0" : value === "horizontal" ? "1" : undefined;
}

function readEnvelope(rawText: string): DingtalkBotEnvelope | null {
  try {
    const payload = JSON.parse(rawText) as Record<string, unknown>;
    return {
      errcode: optionalNumber(payload.errcode) ?? null,
      errmsg: optionalString(payload.errmsg) ?? null,
    };
  } catch {
    return null;
  }
}

function isSuccessfulValidationProbe(result: DingtalkBotRequestResult): boolean {
  return (
    (result.envelope?.errcode != null && validationSuccessCodes.has(result.envelope.errcode)) ||
    (result.envelope?.errcode === 310000 && result.envelope.errmsg?.includes("keywords not in content") === true)
  );
}

function normalizeDingtalkBotError(
  result: DingtalkBotRequestResult,
  phase: "validate" | "execute",
): ProviderRequestError {
  const errcode = result.envelope?.errcode;
  const message =
    (result.envelope?.errmsg ?? result.rawText.trim()) || `DingTalk Bot request failed with status ${result.status}`;
  if (errcode === 410100 || result.status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (errcode === 400013 || errcode === 400101 || errcode === 400102 || errcode === 400106) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }
  if (errcode === 310000 || errcode === 40035 || errcode === 400105) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(result.status >= 400 ? result.status : 500, message);
}

function normalizeApiKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  if (!trimmed.includes("://")) {
    return trimmed;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ProviderRequestError(400, "apiKey must be a DingTalk webhook access token or webhook URL");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new ProviderRequestError(400, "webhook URL must use https and must not include credentials");
  }
  if (url.host !== "oapi.dingtalk.com" || url.pathname !== webhookPath) {
    throw new ProviderRequestError(400, "webhook URL must be a DingTalk custom bot webhook URL");
  }
  const accessToken = url.searchParams.get("access_token")?.trim();
  if (!accessToken) {
    throw new ProviderRequestError(400, "webhook URL must include an access_token query parameter");
  }
  return accessToken;
}

function buildWebhookUrl(accessToken: string, signingSecret?: string): string {
  const url = new URL(webhookPath, apiBaseUrl);
  applyWebhookAuthentication(url, accessToken, signingSecret);
  return url.toString();
}

function applyWebhookAuthentication(url: URL, accessToken: string, signingSecret?: string): void {
  url.searchParams.set("access_token", accessToken);
  if (signingSecret) {
    const timestamp = Date.now().toString();
    url.searchParams.set("timestamp", timestamp);
    url.searchParams.set(
      "sign",
      createHmac("sha256", signingSecret).update(`${timestamp}\n${signingSecret}`).digest("base64"),
    );
  }
}

function buildProviderAccountId(accessToken: string): string {
  return `dingtalk_bot:${createHash("sha256").update(accessToken).digest("hex").slice(0, 24)}`;
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
