import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "mailgenius";
const mailgeniusApiBaseUrl = "https://app.mailgenius.com";
const requestTimeoutMs = 30_000;

type MailgeniusRequestPhase = "validate" | "execute";

interface MailgeniusRequestInput {
  method: "GET";
  path: string;
  query?: Record<string, string>;
}

export const mailgeniusActionHandlers: ProviderActionHandlers<
  "mailgenius",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async get_daily_limit(_input, context) {
    return {
      dailyLimit: await requestMailgeniusObject(
        { method: "GET", path: "/external/api/daily_limit" },
        context,
        "execute",
        "MailGenius daily limit response",
      ),
    };
  },
  async create_email_audit(_input, context) {
    return {
      audit: await requestMailgeniusObject(
        { method: "GET", path: "/external/api/email-audit" },
        context,
        "execute",
        "MailGenius generated test email response",
      ),
    };
  },
  async get_email_result(input, context) {
    const slug = requiredString(input.slug, "slug");
    return {
      result: await requestMailgeniusObject(
        { method: "GET", path: `/external/api/email-result/${encodeURIComponent(slug)}` },
        context,
        "execute",
        "MailGenius email result response",
      ),
    };
  },
  async list_email_audits(input, context) {
    const raw = await requestMailgeniusObject(
      {
        method: "GET",
        path: "/external/api/audits",
        query: queryParams({
          from: optionalNumber(input.fromTimestamp),
          to: optionalNumber(input.toTimestamp),
          page: optionalNumber(input.page),
          per_page: optionalNumber(input.perPage),
          used: typeof input.used === "boolean" ? input.used : undefined,
        }),
      },
      context,
      "execute",
      "MailGenius test email list response",
    );
    return {
      testEmails: readTestEmails(raw),
      raw,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailgeniusActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: mailgeniusApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const payload = await requestMailgeniusObject(
      { method: "GET", path: "/external/api/daily_limit" },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
      "MailGenius validation response",
    );
    return {
      profile: {
        displayName: "MailGenius API Token",
        grantedScopes: [],
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: mailgeniusApiBaseUrl,
        validationEndpoint: "/external/api/daily_limit",
        dailyLimit: optionalNumber(payload.daily_limit) ?? optionalNumber(payload.limit),
        used: optionalNumber(payload.used),
        remaining: optionalNumber(payload.remaining),
      }),
    };
  },
};

async function requestMailgeniusObject(
  input: MailgeniusRequestInput,
  context: ApiKeyProviderContext,
  phase: MailgeniusRequestPhase,
  responseLabel: string,
): Promise<Record<string, unknown>> {
  const payload = await requestMailgeniusJson(input, context, phase);
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, `${responseLabel} must be a JSON object`);
  }
  return record;
}

async function requestMailgeniusJson(
  input: MailgeniusRequestInput,
  context: ApiKeyProviderContext,
  phase: MailgeniusRequestPhase,
): Promise<unknown> {
  const url = new URL(input.path, mailgeniusApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "MailGenius returned invalid JSON",
      invalidJsonFallback: (text) => text,
    });
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, `MailGenius request timed out after ${requestTimeoutMs / 1000} seconds`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `MailGenius request failed: ${error.message}` : "MailGenius request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createMailgeniusError(response, payload, phase);
  }
  return payload;
}

function createMailgeniusError(
  response: Response,
  payload: unknown,
  phase: MailgeniusRequestPhase,
): ProviderRequestError {
  const message =
    extractMailgeniusErrorMessage(payload) ?? optionalString(response.statusText) ?? "MailGenius request failed";
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(502, message, { upstreamStatus: response.status, payload });
}

function extractMailgeniusErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }
  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message) ?? optionalString(record?.status);
}

function readTestEmails(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!Array.isArray(payload.test_emails)) {
    return [];
  }
  return payload.test_emails.flatMap((item) => {
    const record = optionalRecord(item);
    return record ? [record] : [];
  });
}
