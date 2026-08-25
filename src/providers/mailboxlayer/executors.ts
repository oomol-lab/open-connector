import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "mailboxlayer";
const mailboxlayerApiBaseUrl = "https://apilayer.net/api";
const mailboxlayerValidationEmail = "hello@apilayer.com";

type MailboxlayerActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const mailboxlayerActionHandlers: ProviderActionHandlers<"mailboxlayer", MailboxlayerActionHandler> = {
  check_email(input, context) {
    return requestMailboxlayer({
      path: "/check",
      apiKey: context.apiKey,
      context,
      query: [
        ["email", input.email],
        ["smtp", optionalBoolean(input.smtp)],
        ["format", optionalBoolean(input.format)],
        ["mx", optionalBoolean(input.mx)],
        ["free", optionalBoolean(input.free)],
        ["role", optionalBoolean(input.role)],
        ["catch_all", optionalBoolean(input.catch_all)],
        ["disposable", optionalBoolean(input.disposable)],
      ],
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailboxlayerActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMailboxlayerCredential(input.apiKey, fetcher, signal);
  },
};

async function validateMailboxlayerCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMailboxlayer({
    path: "/check",
    apiKey,
    context: { fetcher, signal },
    query: [
      ["email", mailboxlayerValidationEmail],
      ["smtp", false],
    ],
  });

  return {
    profile: {
      accountId: "api_key",
      displayName: "Mailboxlayer API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: mailboxlayerApiBaseUrl,
      validationEndpoint: "/check",
      validatedEmail: optionalString(payload.email) ?? mailboxlayerValidationEmail,
    }),
  };
}

async function requestMailboxlayer(input: {
  path: string;
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  query: Array<[string, unknown]>;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, mailboxlayerApiBaseUrl);
  url.searchParams.set("access_key", input.apiKey);

  for (const [key, value] of input.query) {
    appendQueryValue(url, key, value);
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `Mailboxlayer request failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  const rawBody = await response.text().catch((error) => {
    throw new ProviderRequestError(
      502,
      `Mailboxlayer response read failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  });
  const payload = parseMailboxlayerPayload(response.status, rawBody);
  const providerError = readMailboxlayerError(payload);
  if (providerError) {
    throw mapMailboxlayerError(providerError.code, providerError.message, payload);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status || 502,
      buildMailboxlayerHttpErrorMessage(response.status, rawBody),
      payload,
    );
  }

  return payload;
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (typeof value === "boolean") {
    url.searchParams.set(key, value ? "1" : "0");
    return;
  }

  if (value === undefined || value === null || value === "") {
    return;
  }

  url.searchParams.set(key, String(value));
}

function parseMailboxlayerPayload(status: number, rawBody: string): Record<string, unknown> {
  if (!rawBody) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return optionalRecord(parsed) ?? {};
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 502,
      buildMailboxlayerHttpErrorMessage(status, rawBody, error instanceof Error ? error.message : undefined),
    );
  }
}

function readMailboxlayerError(payload: Record<string, unknown>): { code?: number; message: string } | null {
  const success = payload.success;
  const error = optionalRecord(payload.error);
  if (success !== false || !error) {
    return null;
  }

  const code = typeof error.code === "number" ? error.code : undefined;
  const message =
    optionalString(error.info) ??
    optionalString(error.type) ??
    optionalString(error.message) ??
    "Mailboxlayer request failed";
  return {
    code,
    message,
  };
}

function buildMailboxlayerHttpErrorMessage(status: number, rawBody: string, parseErrorMessage?: string): string {
  const bodySnippet = rawBody.trim().slice(0, 200);
  const parts = [`Mailboxlayer request failed with ${status}`];

  if (parseErrorMessage) {
    parts.push(`invalid JSON response: ${parseErrorMessage}`);
  }
  if (bodySnippet) {
    parts.push(`body: ${bodySnippet}`);
  }

  return parts.join("; ");
}

function mapMailboxlayerError(
  code: number | undefined,
  message: string,
  payload: Record<string, unknown>,
): ProviderRequestError {
  if (code === 101 || code === 210 || code === 211) {
    return new ProviderRequestError(400, message, payload);
  }
  if (code === 104 || code === 106) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(502, message, payload);
}
