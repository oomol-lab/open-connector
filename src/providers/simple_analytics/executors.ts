import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { simpleAnalyticsActionHandlers, simpleAnalyticsBaseUrl, validateSimpleAnalyticsCredential } from "./runtime.ts";

const service = "simple_analytics";

const simpleAnalyticsFetch = createProviderFetch({ skipDnsValidation: true });

interface SimpleAnalyticsContext extends ApiKeyProviderContext {
  userId?: string;
}

export const executors: ProviderExecutors = defineProviderExecutors<SimpleAnalyticsContext>({
  service,
  handlers: simpleAnalyticsActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: ProviderFetch): Promise<SimpleAnalyticsContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      userId: credential.values.userId || readMetadataUserId(credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const userId = credential.values.userId || readMetadataUserId(credential.metadata);
    if (!userId) {
      throw new ProviderRequestError(400, "userId is required");
    }

    const url = createProviderProxyUrl(simpleAnalyticsBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("api-key", credential.apiKey);
    headers.set("user-id", userId);
    headers.set("user-agent", providerUserAgent);

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
      if (!headers.has("content-type") && typeof input.body !== "string") {
        headers.set("content-type", "application/json");
      }
    }

    const response = await simpleAnalyticsFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateSimpleAnalyticsCredential(input.apiKey, input.values, fetcher, signal);
  },
};

function readMetadataUserId(metadata: Record<string, unknown>): string | undefined {
  return typeof metadata.userId === "string" && metadata.userId ? metadata.userId : undefined;
}
