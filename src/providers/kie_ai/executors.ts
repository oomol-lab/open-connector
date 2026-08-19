import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "kie_ai";
const kieAiBaseUrl = "https://api.kie.ai";
const downloadUrlTtlSeconds = 20 * 60;

type KieAiActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const kieAiActionHandlers: ProviderActionHandlers<"kie_ai", KieAiActionHandler> = {
  async get_account_credits(_input, context): Promise<unknown> {
    const payload = await requestKieAi(context, "/api/v1/chat/credit");
    return {
      code: readInteger(payload.code, "code"),
      message: readString(payload.msg, "msg"),
      credits: readInteger(payload.data, "data"),
    };
  },
  async get_download_url(input, context): Promise<unknown> {
    const payload = await requestKieAi(context, "/api/v1/common/download-url", {
      method: "POST",
      body: {
        url: requiredString(input.url, "url", kieAiInputError),
      },
    });
    return {
      code: readInteger(payload.code, "code"),
      message: readString(payload.msg, "msg"),
      downloadUrl: readString(payload.data, "data"),
      expiresInSeconds: downloadUrlTtlSeconds,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, kieAiActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestKieAi(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "/api/v1/chat/credit",
    );
    const credits = readInteger(payload.data, "data");
    return {
      profile: {
        accountId: "api_key",
        displayName: "KIE.AI API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/api/v1/chat/credit",
        credits,
      },
    };
  },
};

async function requestKieAi(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  options: {
    method?: string;
    body?: Record<string, unknown>;
  } = {},
): Promise<Record<string, unknown>> {
  const response = await context.fetcher(`${kieAiBaseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: buildKieAiHeaders(context.apiKey, Boolean(options.body)),
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: context.signal,
  });

  const payload = await readJsonObject(response);
  const code = optionalInteger(payload.code) ?? response.status;
  if (!response.ok || code !== 200) {
    throw mapKieAiError(code, optionalString(payload.msg) ?? response.statusText, response.status);
  }

  return payload;
}

function buildKieAiHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderRequestError(502, "KIE.AI returned a non-JSON response");
  }
  return readObject(payload, "response");
}

function mapKieAiError(code: number, message: string, status: number): ProviderRequestError {
  const normalizedStatus = status >= 400 ? status : code;
  switch (code) {
    case 401:
    case 403:
      return new ProviderRequestError(401, message);
    case 422:
      return new ProviderRequestError(400, message);
    case 429:
      return new ProviderRequestError(429, message);
    default:
      return new ProviderRequestError(normalizedStatus >= 400 ? normalizedStatus : 502, message);
  }
}

function readObject(value: unknown, field: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `KIE.AI ${field} must be an object`);
  }
  return record;
}

function readInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `KIE.AI ${field} must be an integer`);
  }
  return value as number;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, `KIE.AI ${field} must be a string`);
  }
  return value;
}

function kieAiInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
