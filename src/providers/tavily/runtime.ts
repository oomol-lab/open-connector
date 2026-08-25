import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export const tavilyApiBaseUrl = "https://api.tavily.com";
const defaultTimeoutMs = 30_000;

type TavilyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface TavilyRequestInput {
  method?: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  phase?: "validate" | "execute";
}

export const tavilyActionHandlers: ProviderActionHandlers<"tavily", TavilyActionHandler> = {
  search(input, context) {
    return tavilyRequest(context, { method: "POST", path: "/search", body: input });
  },
  extract(input, context) {
    return tavilyRequest(context, { method: "POST", path: "/extract", body: input });
  },
  map(input, context) {
    return tavilyRequest(context, { method: "POST", path: "/map", body: input });
  },
  crawl(input, context) {
    return tavilyRequest(context, { method: "POST", path: "/crawl", body: input });
  },
  create_research(input, context) {
    return tavilyRequest(context, { method: "POST", path: "/research", body: input });
  },
  get_research(input, context) {
    return tavilyRequest(context, { method: "GET", path: `/research/${encodeURIComponent(String(input.request_id))}` });
  },
  get_usage(_input, context) {
    return tavilyRequest(context, { method: "GET", path: "/usage" });
  },
};

export async function validateTavilyCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await tavilyRequest(
    { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    { method: "GET", path: "/usage", phase: "validate" },
  );
  const payloadObject = optionalRecord(payload);
  const key = optionalRecord(payloadObject?.key);
  const account = optionalRecord(payloadObject?.account);
  const plan = optionalString(account?.current_plan);
  return {
    profile: {
      accountId: "tavily-api-key",
      displayName: plan ? `Tavily ${plan}` : "Tavily API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/usage",
      apiBaseUrl: tavilyApiBaseUrl,
      currentPlan: plan,
      keyUsage: optionalNumber(key?.usage),
      keyLimit: optionalNumber(key?.limit),
    }),
  };
}

async function tavilyRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: TavilyRequestInput,
): Promise<unknown> {
  const response = await tavilyRawRequest(context, input);
  if (!response.ok) {
    throw await buildTavilyError(response, input.phase ?? "execute");
  }
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Tavily returned malformed JSON");
  }
}

async function tavilyRawRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: TavilyRequestInput,
): Promise<Response> {
  const timeout = createProviderTimeout(context.signal, defaultTimeoutMs);
  try {
    return await context.fetcher(new URL(input.path, tavilyApiBaseUrl), {
      method: input.method ?? "POST",
      headers: {
        authorization: `Bearer ${context.apiKey}`,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        502,
        `Tavily request timed out after ${Math.ceil(defaultTimeoutMs / 1000)} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Tavily request failed: ${error.message}` : "Tavily request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function buildTavilyError(response: Response, phase: "validate" | "execute"): Promise<ProviderRequestError> {
  const payload = await readTavilyPayload(response);
  const message = extractTavilyErrorMessage(payload) ?? `Tavily request failed with ${response.status}`;
  if (response.status === 429) return new ProviderRequestError(429, message, payload);
  if (phase === "validate" && (response.status === 400 || response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (
    phase === "execute" &&
    (response.status === 400 ||
      response.status === 404 ||
      response.status === 422 ||
      response.status === 432 ||
      response.status === 433)
  ) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

async function readTavilyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractTavilyErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const record = optionalRecord(payload);
  return optionalString(record?.detail) ?? optionalString(record?.error) ?? optionalString(record?.message);
}
