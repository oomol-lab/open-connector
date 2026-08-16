import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ActionContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
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
  const tradingBaseUrl = environment === "live" ? liveTradingBaseUrl : paperTradingBaseUrl;
  if (endpoint === "/v2/options/contracts" || endpoint.startsWith("/v2/options/contracts/")) {
    return tradingBaseUrl;
  }

  if (
    endpoint.startsWith("/v1/") ||
    endpoint.startsWith("/v1beta1/") ||
    endpoint.startsWith("/v2/stocks/") ||
    endpoint.startsWith("/v2/options/") ||
    endpoint.startsWith("/v2/crypto/")
  ) {
    return dataBaseUrl;
  }
  return tradingBaseUrl;
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
    const environment = await resolveAlpacaOAuthEnvironment(credential, fetcher, context.signal);
    return {
      credential: readAlpacaOAuthCredential(credential, environment),
      fetcher,
      signal: context.signal,
    };
  }
  throw new ProviderRequestError(401, "Configure Alpaca credentials first.");
}

async function resolveAlpacaOAuthEnvironment(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<string> {
  const storedEnvironment = optionalString(credential.metadata.environment);
  if (storedEnvironment) {
    return storedEnvironment;
  }

  const validation = await validateAlpacaOAuthCredential(credential, fetcher, signal);
  const discoveredEnvironment = optionalString(validation.metadata?.environment);
  if (!discoveredEnvironment) {
    throw new ProviderRequestError(502, "Alpaca OAuth environment discovery returned no environment");
  }
  return discoveredEnvironment;
}
