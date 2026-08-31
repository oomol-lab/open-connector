import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent, runProviderRequest } from "../provider-runtime.ts";

export const enchargeApiBaseUrl = "https://api.encharge.io/v1";

const enchargeDefaultRequestTimeoutMs = 15_000;
const enchargeSendEmailPath = "/emails/send";
const missingEmailContentMessage = "Missing email content";

interface EnchargeRequestOptions {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  method?: "GET" | "POST";
  path: string;
  body?: unknown;
}

type EnchargeActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const enchargeActionHandlers: ProviderActionHandlers<"encharge", EnchargeActionHandler> = {
  send_email(input, context) {
    return sendEmail(input, context);
  },
};

export async function validateEnchargeCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await validateEnchargeApiKey({
    context: { apiKey, fetcher, signal },
    path: enchargeSendEmailPath,
    method: "POST",
    body: {},
  });

  return {
    profile: {
      accountId: "encharge",
      displayName: "Encharge API Key",
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: enchargeSendEmailPath,
      apiBaseUrl: enchargeApiBaseUrl,
    },
  };
}

async function sendEmail(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return requestEncharge({
    context,
    path: enchargeSendEmailPath,
    method: "POST",
    body: buildSendEmailBody(input),
  });
}

async function requestEncharge(options: EnchargeRequestOptions): Promise<unknown> {
  const response = await rawEnchargeRequest(options);
  const payload = await readEnchargePayload(response);

  if (!response.ok) {
    throw buildEnchargeError(response.status, payload);
  }

  if (payload === null) {
    return { ok: true };
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Encharge returned an invalid JSON response");
  }

  return {
    ok: true,
    response: record,
  };
}

async function validateEnchargeApiKey(options: EnchargeRequestOptions): Promise<void> {
  const response = await rawEnchargeRequest(options);
  const payload = await readEnchargePayload(response);

  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw buildEnchargeError(response.status, payload);
  }
  if (response.status >= 500) {
    throw buildEnchargeError(response.status, payload);
  }
  if (!response.ok && !isMissingEmailContentError(payload)) {
    throw buildEnchargeError(response.status, payload);
  }
}

async function rawEnchargeRequest(options: EnchargeRequestOptions): Promise<Response> {
  const url = new URL(resolveEnchargePath(options.path), `${enchargeApiBaseUrl}/`);
  return runProviderRequest(
    { signal: options.context.signal, timeoutMs: enchargeDefaultRequestTimeoutMs, label: "Encharge" },
    async (signal) => {
      return await options.context.fetcher(url, {
        method: options.method ?? "GET",
        signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "user-agent": providerUserAgent,
          "X-Encharge-Token": options.context.apiKey,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    },
  );
}

function buildSendEmailBody(input: Record<string, unknown>): Record<string, unknown> {
  const contentType = readRequiredString(input.contentType, "contentType");
  const content = readRequiredString(input.content, "content");
  if (contentType !== "template" && !optionalString(input.subject)) {
    throw new ProviderRequestError(400, "subject is required unless contentType is template");
  }

  return compactObject({
    [contentType]: content,
    to: input.to,
    from: input.from,
    subject: optionalString(input.subject),
    templateProperties: optionalRecord(input.templateProperties),
    unsubscribeCheck: input.unsubscribeCheck,
    UTMTags: input.UTMTags,
    cc: optionalString(input.cc),
    bcc: optionalString(input.bcc),
    reply: input.reply,
  });
}

async function readEnchargePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Encharge returned an invalid JSON response");
  }
}

function buildEnchargeError(status: number, payload: unknown): ProviderRequestError {
  const message = extractEnchargeErrorMessage(payload) ?? `Encharge request failed with ${status}`;

  if (status === 401 || status === 403) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractEnchargeErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return optionalString(error?.message) ?? optionalString(record.message) ?? optionalString(record.error);
}

function isMissingEmailContentError(payload: unknown): boolean {
  return extractEnchargeErrorMessage(payload)?.includes(missingEmailContentMessage) === true;
}

function readRequiredString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function resolveEnchargePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}
