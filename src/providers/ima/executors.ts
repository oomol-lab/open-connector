import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ImaRuntimeContext } from "./runtime.ts";

import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { imaActionHandlers, imaApiBaseUrl, validateImaCredential } from "./runtime.ts";

const service = "ima";

export const executors: ProviderExecutors = defineProviderExecutors<ImaRuntimeContext>({
  service,
  handlers: imaActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ImaRuntimeContext> {
    const credential = await requireCustomCredential(context, service);
    const clientId = credential.values.clientId;
    const apiKey = credential.values.apiKey;
    if (!clientId || !apiKey) {
      throw new ProviderRequestError(401, "Configure ima clientId and apiKey credentials first.");
    }
    const runtimeContext: ImaRuntimeContext = {
      clientId,
      apiKey,
      fetcher,
      signal: context.signal,
    };
    if (context.transitFiles) {
      runtimeContext.transitFiles = context.transitFiles;
    }
    return runtimeContext;
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const clientId = credential.values.clientId;
    const apiKey = credential.values.apiKey;
    if (!clientId || !apiKey) {
      throw new ProviderRequestError(401, "Configure ima clientId and apiKey credentials first.");
    }

    const url = createProviderProxyUrl(imaApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("ima-openapi-clientid", clientId);
    headers.set("ima-openapi-apikey", apiKey);
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

    const response = await fetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `IMA request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "IMA request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    return validateImaCredential(input.values, { fetcher, signal });
  },
};
