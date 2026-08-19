import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "zhihu";
const zhihuApiBaseUrl = "https://developer.zhihu.com";

interface ZhihuRequestInput {
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  phase?: ZhihuRequestPhase;
}

type ZhihuRequestPhase = "validate" | "execute";
type ZhihuActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ZhihuActionHandler = (input: Record<string, unknown>, context: ZhihuActionContext) => Promise<unknown>;

export const zhihuActionHandlers: ProviderActionHandlers<"zhihu", ZhihuActionHandler> = {
  zhihu_search(input, context) {
    return requestZhihuJson(
      {
        path: "/api/v1/content/zhihu_search",
        query: {
          Query: input.query,
          Count: input.count,
        },
      },
      context,
    );
  },
  global_search(input, context) {
    return requestZhihuJson(
      {
        path: "/api/v1/content/global_search",
        query: {
          Query: input.query,
          Count: input.count,
          Filter: input.filter,
          SearchDB: input.searchDB,
        },
      },
      context,
    );
  },
  hot_list(input, context) {
    return requestZhihuJson(
      {
        path: "/api/v1/content/hot_list",
        query: {
          Limit: input.limit,
        },
      },
      context,
    );
  },
  zhida(input, context) {
    return requestZhihuJson(
      {
        method: "POST",
        path: "/v1/chat/completions",
        body: {
          ...input,
          stream: false,
        },
      },
      context,
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, zhihuActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestZhihuJson(
      {
        path: "/api/v1/content/hot_list",
        query: {
          Limit: 1,
        },
        phase: "validate",
      },
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
    );

    return {
      profile: {
        accountId: "zhihu",
        displayName: "Zhihu Access Secret",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: zhihuApiBaseUrl,
        validationEndpoint: "/api/v1/content/hot_list",
      }),
    };
  },
};

async function requestZhihuJson(input: ZhihuRequestInput, context: ZhihuActionContext): Promise<unknown> {
  const response = await rawZhihuRequest(input, context);
  const payload = await readZhihuPayload(response);
  if (!response.ok) {
    throw createZhihuHttpError(response.status, payload, input.phase ?? "execute");
  }

  const payloadObject = optionalRecord(payload);
  const code = optionalNumber(payloadObject?.Code);
  if (code !== undefined && code !== 0) {
    throw createZhihuPayloadError(payload, input.phase ?? "execute");
  }

  return payload;
}

async function rawZhihuRequest(input: ZhihuRequestInput, context: ZhihuActionContext): Promise<Response> {
  const url = new URL(input.path, zhihuApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await context.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "x-request-timestamp": String(Math.floor(Date.now() / 1000)),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Zhihu request failed: ${error.message}` : "Zhihu request failed",
    );
  }
}

async function readZhihuPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Zhihu returned invalid JSON response");
  }
}

function createZhihuHttpError(status: number, payload: unknown, phase: ZhihuRequestPhase): ProviderRequestError {
  const message = extractZhihuErrorMessage(payload) ?? `Zhihu request failed with ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 400 || status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 400 || status === 404)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message, payload);
  }

  return new ProviderRequestError(status || 502, message, payload);
}

function createZhihuPayloadError(payload: unknown, phase: ZhihuRequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const code = optionalNumber(record?.Code);
  const message = extractZhihuErrorMessage(payload) ?? "Zhihu request failed";

  if (code === 30001) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (code === 10001 || code === 20001)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && code === 10001) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && code === 20001) {
    return new ProviderRequestError(401, message, payload);
  }

  return new ProviderRequestError(502, message, payload);
}

function extractZhihuErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return (
    optionalString(record.Message) ??
    optionalString(record.msg) ??
    optionalString(record.message) ??
    optionalString(error?.message)
  );
}
