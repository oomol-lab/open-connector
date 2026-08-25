import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredRecord,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "mailcheck";
const mailcheckApiBaseUrl = "https://api.usercheck.com";
const mailcheckDefaultRequestTimeoutMs = 30_000;

type MailcheckRequestPhase = "validate" | "execute";
type MailcheckActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const mailcheckActionHandlers: ProviderActionHandlers<"mailcheck", MailcheckActionHandler> = {
  async get_status(_input, context) {
    return {
      status: await requestMailcheckStatus({
        apiKey: context.apiKey,
        context,
        phase: "execute",
      }),
    };
  },
  async verify_email(input, context) {
    return {
      email: await requestMailcheckEmail({
        apiKey: context.apiKey,
        context,
        phase: "execute",
        email: requiredString(input.email, "email"),
      }),
    };
  },
  async validate_domain(input, context) {
    return {
      domain: await requestMailcheckDomain({
        apiKey: context.apiKey,
        context,
        phase: "execute",
        domain: requiredString(input.domain, "domain"),
      }),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailcheckActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMailcheckCredential(input.apiKey, fetcher, signal);
  },
};

async function validateMailcheckCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMailcheckStatus({
    apiKey,
    context: { fetcher, signal },
    phase: "validate",
  });
  const account = requireMailcheckObject(payload.account, "/status.account");
  const user = requireMailcheckObject(account.user, "/status.account.user");
  const plan = requireMailcheckObject(account.plan, "/status.account.plan");
  const usage = requireMailcheckObject(payload.usage, "/status.usage");
  const userEmail = requireMailcheckString(user.email, "/status.account.user.email");

  return {
    profile: {
      accountId: userEmail,
      displayName: userEmail,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: mailcheckApiBaseUrl,
      validationEndpoint: "/status",
      userEmail,
      userName: optionalString(user.name),
      planName: optionalString(plan.name),
      creditsLimit: optionalNumber(plan.credits),
      creditsRemaining: optionalNumber(usage.remaining),
      rateLimit: optionalNumber(plan.rate_limit),
    }),
  };
}

async function requestMailcheckStatus(input: {
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: MailcheckRequestPhase;
}): Promise<Record<string, unknown>> {
  const payload = await requestMailcheckJson({
    apiKey: input.apiKey,
    context: input.context,
    path: "/status",
    phase: input.phase,
  });

  return requireMailcheckObject(payload, "/status");
}

async function requestMailcheckEmail(input: {
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: MailcheckRequestPhase;
  email: string;
}): Promise<Record<string, unknown>> {
  const payload = await requestMailcheckJson({
    apiKey: input.apiKey,
    context: input.context,
    path: `/email/${encodeURIComponent(input.email)}`,
    phase: input.phase,
  });

  return requireMailcheckObject(payload, "/email/{email}");
}

async function requestMailcheckDomain(input: {
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  phase: MailcheckRequestPhase;
  domain: string;
}): Promise<Record<string, unknown>> {
  const payload = await requestMailcheckJson({
    apiKey: input.apiKey,
    context: input.context,
    path: `/domain/${encodeURIComponent(input.domain)}`,
    phase: input.phase,
  });

  return requireMailcheckObject(payload, "/domain/{domain}");
}

async function requestMailcheckJson(input: {
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  path: string;
  phase: MailcheckRequestPhase;
}): Promise<unknown> {
  const url = new URL(input.path, mailcheckApiBaseUrl);
  const timeout = createProviderTimeout(input.context.signal, mailcheckDefaultRequestTimeoutMs);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readMailcheckPayload(response);
  } catch (error) {
    if (isAbortLikeError(error) || timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Mailcheck request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Mailcheck request failed: ${error.message}` : "Mailcheck request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createMailcheckError(response, payload, input.phase);
  }

  return payload;
}

async function readMailcheckPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createMailcheckError(
  response: Response,
  payload: unknown,
  phase: MailcheckRequestPhase,
): ProviderRequestError {
  const message =
    extractMailcheckErrorMessage(payload) ?? response.statusText ?? `Mailcheck request failed with ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractMailcheckErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message);
}

function requireMailcheckObject(value: unknown, context: string): Record<string, unknown> {
  return requiredRecord(value, context, (message) => new ProviderRequestError(502, message));
}

function requireMailcheckString(value: unknown, context: string): string {
  return requiredString(value, context, (message) => new ProviderRequestError(502, message));
}
