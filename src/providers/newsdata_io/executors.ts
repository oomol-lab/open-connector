import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalScalarString, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "newsdata_io";
const newsdataIoApiBaseUrl = "https://newsdata.io";

type NewsdataIoPhase = "validate" | "execute";
type NewsdataIoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const newsdataIoActionHandlers: ProviderActionHandlers<"newsdata_io", NewsdataIoActionHandler> = {
  get_latest_news(input, context) {
    return requestNewsdataIoJson("/api/1/latest", buildNewsdataIoQuery(input), context, "execute");
  },
  search_news_archive(input, context) {
    return requestNewsdataIoJson("/api/1/archive", buildNewsdataIoQuery(input), context, "execute");
  },
  list_crypto_news(input, context) {
    return requestNewsdataIoJson("/api/1/crypto", buildNewsdataIoQuery(input), context, "execute");
  },
  list_news_sources(input, context) {
    return requestNewsdataIoJson("/api/1/sources", buildNewsdataIoQuery(input), context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, newsdataIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = optionalRecord(
      await requestNewsdataIoJson(
        "/api/1/sources",
        {},
        {
          apiKey: input.apiKey,
          fetcher,
          signal,
        },
        "validate",
      ),
    );

    return {
      profile: {
        accountId: "newsdata_io",
        displayName: "NewsData.io API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: "/api/1/sources",
        apiBaseUrl: newsdataIoApiBaseUrl,
        sourceCount: Array.isArray(payload?.results) ? payload.results.length : undefined,
      }),
    };
  },
};

async function requestNewsdataIoJson(
  path: string,
  query: Record<string, string>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: NewsdataIoPhase,
): Promise<unknown> {
  const response = await context.fetcher(buildNewsdataIoUrl(path, query, context.apiKey), {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  const payload = await readNewsdataIoPayload(response);
  if (!response.ok || isNewsdataIoErrorPayload(payload)) {
    throw createNewsdataIoError(response.status, payload, phase);
  }
  return payload;
}

function buildNewsdataIoUrl(path: string, query: Record<string, string>, apiKey: string): URL {
  const url = new URL(path, newsdataIoApiBaseUrl);
  url.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function buildNewsdataIoQuery(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => [key, optionalScalarString(value)] as const)
      .filter((entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ""),
  );
}

async function readNewsdataIoPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "NewsData.io returned invalid JSON");
  }
}

function createNewsdataIoError(status: number, payload: unknown, phase: NewsdataIoPhase): ProviderRequestError {
  const message = extractNewsdataIoMessage(payload) ?? `NewsData.io request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (isNewsdataIoErrorPayload(payload)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractNewsdataIoMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.results) ?? optionalString(record?.code);
}

function isNewsdataIoErrorPayload(payload: unknown): boolean {
  return optionalString(optionalRecord(payload)?.status) === "error";
}
