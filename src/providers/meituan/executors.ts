import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "meituan";
const meituanTravelEndpoint = "https://mcp-open-cater.meituan.com/v1/api/voyage/openapi/query";
const meituanTravelChannel = "meituan-developer";
const meituanDefaultCity = "北京";
const meituanRequestTimeoutMs = 120_000;
const meituanAuthErrorPhrases = [
  "鉴权失败",
  "无效的访问令牌",
  "access token",
  "authorization failed",
  "unauthorized",
  "token无效",
  "访问令牌已过期",
];

interface MeituanTravelRequest {
  query: string;
  city: string;
  originQuery: string;
}

type MeituanContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

const invalidInput = (message: string): ProviderRequestError => new ProviderRequestError(400, message);

const meituanActionHandlers: ProviderActionHandlers<"meituan", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  query_travel(input, context) {
    const query = requiredString(input.query, "query", invalidInput);
    const city = optionalString(input.city) ?? meituanDefaultCity;
    const originQuery = optionalString(input.originQuery) ?? query;
    return requestMeituanTravel(
      {
        query,
        city,
        originQuery,
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, meituanActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input): Promise<CredentialValidationResult> {
    const apiKey = requiredString(input.apiKey, "apiKey", invalidInput);
    const tokenHash = hashMeituanToken(apiKey);
    return {
      profile: {
        accountId: `meituan:personal:${tokenHash}`,
        displayName: `Meituan Personal Developer · ${tokenHash.slice(-6)}`,
      },
      grantedScopes: [],
    };
  },
};

async function requestMeituanTravel(
  request: MeituanTravelRequest,
  context: MeituanContext,
): Promise<{ content: string }> {
  const timeout = createProviderTimeout(context.signal, meituanRequestTimeoutMs);

  try {
    const response = await context.fetcher(meituanTravelEndpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: context.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        city: request.city,
        query: request.query,
        originQuery: request.originQuery,
        channel: meituanTravelChannel,
      }),
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "Meituan Travel returned invalid JSON",
    });
    if (!response.ok) {
      throw createMeituanError(response.status, payload);
    }

    return parseMeituanTravelPayload(payload);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Meituan Travel request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Meituan Travel request failed: ${error.message}` : "Meituan Travel request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function parseMeituanTravelPayload(payload: unknown): { content: string } {
  const record = optionalRecord(payload);
  const code = typeof record?.code === "number" ? record.code : undefined;
  if (code !== 0) {
    throw createMeituanError(code, payload);
  }

  const content = optionalString(record?.data);
  if (!content) {
    throw new ProviderRequestError(502, "Meituan Travel response did not include content");
  }
  if (isMeituanAuthErrorMessage(content)) {
    throw new ProviderRequestError(502, content);
  }

  return { content };
}

function createMeituanError(statusOrCode: number | undefined, payload: unknown): ProviderRequestError {
  const message =
    extractMeituanErrorMessage(payload) ??
    (statusOrCode === undefined
      ? "Meituan Travel request failed"
      : `Meituan Travel request failed with code ${statusOrCode}`);

  if (statusOrCode === 429 || statusOrCode === 509 || statusOrCode === 50200) {
    return new ProviderRequestError(429, message, payload);
  }
  if (statusOrCode === 403 || statusOrCode === 4) {
    return new ProviderRequestError(502, message, payload);
  }
  if (statusOrCode === 401 || hasMeituanAuthError(payload)) {
    return new ProviderRequestError(401, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function extractMeituanErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  return optionalString(record?.msg) ?? optionalString(record?.data);
}

function isMeituanAuthErrorMessage(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return meituanAuthErrorPhrases.some((phrase) => normalizedMessage.includes(phrase));
}

function hasMeituanAuthError(payload: unknown): boolean {
  if (typeof payload === "string") {
    return isMeituanAuthErrorMessage(payload);
  }

  const record = optionalRecord(payload);
  return [optionalString(record?.msg), optionalString(record?.data)].some(
    (message) => message !== undefined && isMeituanAuthErrorMessage(message),
  );
}

function hashMeituanToken(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}
