import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const spiderApiBaseUrl = "https://api.spider.cloud";

const requestTimeoutMs = 60_000;

type RequestPhase = "validate" | "execute";

interface SpiderRequestInput {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}

export const spiderActionHandlers: ProviderActionHandlers<"spider", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_credits(_input, context) {
    return {
      data: await requestSpiderJson({ path: "/data/credits" }, context, "execute"),
    };
  },
  async scrape(input, context) {
    return {
      data: await requestSpiderJson(
        { path: "/scrape", method: "POST", body: compactObject({ ...input }) },
        context,
        "execute",
      ),
    };
  },
  async search(input, context) {
    return {
      data: await requestSpiderJson(
        { path: "/search", method: "POST", body: buildSearchBody(input) },
        context,
        "execute",
      ),
    };
  },
  async get_links(input, context) {
    return {
      data: await requestSpiderJson(
        { path: "/links", method: "POST", body: compactObject({ ...input }) },
        context,
        "execute",
      ),
    };
  },
};

export async function validateSpiderCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestSpiderJson({ path: "/data/credits" }, { apiKey, fetcher, signal }, "validate");

  return {
    profile: {
      accountId: "spider:api-key",
      displayName: "Spider Cloud API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: spiderApiBaseUrl,
      credits: payload,
    },
  };
}

function buildSearchBody(input: Record<string, unknown>): Record<string, unknown> {
  const { request, return_format, ...search } = input;
  const base = compactObject({ request, return_format });
  return compactObject({
    ...search,
    base: Object.keys(base).length === 0 ? undefined : base,
  });
}

async function requestSpiderJson(
  input: SpiderRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: RequestPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, requestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(new URL(`${spiderApiBaseUrl}${input.path}`), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "Spider Cloud request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Spider Cloud request failed: ${error.message}` : "Spider Cloud request failed",
    );
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    throw createSpiderError(response.status, payload, phase);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Spider Cloud returned invalid JSON");
  }
}

function createSpiderError(status: number, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `Spider Cloud request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status || 500, message);
}
