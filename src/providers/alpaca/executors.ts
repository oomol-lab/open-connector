import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ActionContext } from "./runtime.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  alpacaActionHandlers,
  alpacaCredentialHeaders,
  readAlpacaCredential,
  readAlpacaOAuthCredential,
  validateAlpacaCredential,
  validateAlpacaOAuthCredential,
} from "./runtime.ts";

const service = "alpaca";
const paperTradingBaseUrl = "https://paper-api.alpaca.markets";
const liveTradingBaseUrl = "https://api.alpaca.markets";
const dataBaseUrl = "https://data.alpaca.markets";
const alpacaFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: alpacaActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    return resolveAlpacaActionContext(context, fetcher);
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const providerContext = await resolveAlpacaActionContext(context, alpacaFetch);
    const url = createProviderProxyUrl(
      resolveAlpacaProxyBaseUrl(input.endpoint, providerContext.credential.environment),
      input.endpoint,
      input.query,
    );
    const headers = normalizeProviderProxyHeaders(input.headers);
    for (const [name, value] of Object.entries(alpacaCredentialHeaders(providerContext.credential))) {
      headers.set(name, value);
    }

    const response = await alpacaFetch(url, {
      method: input.method,
      headers,
      body:
        input.body === undefined ? undefined : typeof input.body === "string" ? input.body : JSON.stringify(input.body),
      signal: context.signal,
    });
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `provider request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "provider request failed");
  }
};

function resolveAlpacaProxyBaseUrl(endpoint: string, environment: "paper" | "live"): string {
  if (
    endpoint.startsWith("/v1/") ||
    endpoint.startsWith("/v1beta1/") ||
    endpoint.startsWith("/v2/stocks/") ||
    endpoint.startsWith("/v2/options/") ||
    endpoint.startsWith("/v2/crypto/")
  ) {
    return dataBaseUrl;
  }
  return environment === "live" ? liveTradingBaseUrl : paperTradingBaseUrl;
}

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAlpacaCredential(
      {
        apiKey: input.apiKey,
        apiKeyId: input.values.apiKeyId,
        environment: input.values.environment,
      },
      fetcher,
      signal,
    );
  },
  async oauth2(input, { fetcher, signal }) {
    return validateAlpacaOAuthCredential(input, fetcher, signal);
  },
};

async function resolveAlpacaActionContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ActionContext> {
  const credential = await context.getCredential(service);
  if (credential?.authType === "api_key") {
    return {
      credential: readAlpacaCredential({
        apiKey: credential.apiKey,
        apiKeyId: credential.values.apiKeyId,
        environment: credential.values.environment,
      }),
      fetcher,
      signal: context.signal,
    };
  }
  if (credential?.authType === "oauth2") {
    return {
      credential: readAlpacaOAuthCredential(credential, credential.metadata.environment),
      fetcher,
      signal: context.signal,
    };
  }
  throw new ProviderRequestError(401, "Configure Alpaca credentials first.");
}
