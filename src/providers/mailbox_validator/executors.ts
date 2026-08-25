import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "mailbox_validator";
const mailboxValidatorApiBaseUrl = "https://api.mailboxvalidator.com";
const mailboxValidatorValidationEmail = "hello@mailboxvalidator.com";

type MailboxValidatorActionHandler = (
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
) => Promise<unknown>;

export const mailboxValidatorActionHandlers: ProviderActionHandlers<
  "mailbox_validator",
  MailboxValidatorActionHandler
> = {
  validate_email(input, context) {
    return requestMailboxValidator({
      path: "/v2/validation/single",
      apiKey: context.apiKey,
      context,
      email: input.email,
    });
  },
  check_disposable_email(input, context) {
    return requestMailboxValidator({
      path: "/v2/email/disposable",
      apiKey: context.apiKey,
      context,
      email: input.email,
    });
  },
  check_free_email(input, context) {
    return requestMailboxValidator({
      path: "/v2/email/free",
      apiKey: context.apiKey,
      context,
      email: input.email,
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailboxValidatorActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMailboxValidatorCredential(input.apiKey, fetcher, signal);
  },
};

async function validateMailboxValidatorCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMailboxValidator({
    path: "/v2/validation/single",
    apiKey,
    context: { fetcher, signal },
    email: mailboxValidatorValidationEmail,
  });

  return {
    profile: {
      accountId: "api_key",
      displayName: "MailboxValidator API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: mailboxValidatorApiBaseUrl,
      validationEndpoint: "/v2/validation/single",
      validatedEmail: optionalString(payload.email_address) ?? mailboxValidatorValidationEmail,
      creditsAvailable: optionalInteger(payload.credits_available),
    }),
  };
}

async function requestMailboxValidator(input: {
  path: string;
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  email: unknown;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, mailboxValidatorApiBaseUrl);
  url.searchParams.set("key", input.apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("email", String(input.email));

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
      `MailboxValidator request failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      `MailboxValidator response read failed with HTTP ${response.status}: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }

  const payload = parseMailboxValidatorPayload(response.status, rawBody);
  const providerError = readMailboxValidatorError(payload);
  if (providerError) {
    throw mapMailboxValidatorError(providerError.code, providerError.message, payload);
  }

  if (!response.ok) {
    throw new ProviderRequestError(
      response.status === 429 ? 429 : response.status || 502,
      `MailboxValidator request failed with HTTP ${response.status}`,
      payload,
    );
  }

  return payload;
}

function parseMailboxValidatorPayload(status: number, rawBody: string): Record<string, unknown> {
  if (!rawBody) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return optionalRecord(parsed) ?? {};
  } catch (error) {
    throw new ProviderRequestError(
      status === 429 ? 429 : 502,
      `MailboxValidator returned invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
    );
  }
}

function readMailboxValidatorError(payload: Record<string, unknown>): { code?: number; message: string } | null {
  const error = optionalRecord(payload.error);
  if (!error) {
    return null;
  }

  return {
    code: optionalInteger(error.error_code),
    message: optionalString(error.error_message) ?? "MailboxValidator request failed",
  };
}

function mapMailboxValidatorError(
  code: number | undefined,
  message: string,
  payload: Record<string, unknown>,
): ProviderRequestError {
  if (code === 10001 || code === 10002 || code === 10003 || code === 10004) {
    return new ProviderRequestError(400, message, payload);
  }

  if (code === 10006) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}
