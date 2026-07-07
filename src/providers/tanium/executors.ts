import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { TaniumContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  normalizeProviderProxyEndpoint,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { normalizeTaniumGatewayUrl, taniumActionHandlers, validateTaniumCredential } from "./runtime.ts";

const service = "tanium";

export const executors: ProviderExecutors = defineProviderExecutors<TaniumContext>({
  service,
  handlers: taniumActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<TaniumContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      gatewayUrl: normalizeTaniumGatewayUrl(
        optionalString(credential.metadata.gatewayUrl) ?? optionalString(credential.values.gatewayUrl),
      ),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const endpoint = normalizeProviderProxyEndpoint(input.endpoint);
    if (endpoint !== "/") {
      throw new ProviderRequestError(400, "tanium proxy endpoint must be /");
    }

    const credential = await requireApiKeyCredential(context, service);
    const gatewayUrl = normalizeTaniumGatewayUrl(
      optionalString(credential.metadata.gatewayUrl) ?? optionalString(credential.values.gatewayUrl),
    );
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("session", credential.apiKey);
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

    const response = await fetch(gatewayUrl, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(
        response.status,
        text || `Tanium Gateway request failed with HTTP ${response.status}`,
      );
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Tanium Gateway request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTaniumCredential(
      {
        apiKey: input.apiKey,
        gatewayUrl: input.values.gatewayUrl,
      },
      fetcher,
      signal,
    );
  },
};
