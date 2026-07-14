import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { ClickupActionContext } from "./runtime.ts";

import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { clickupActionHandlers, clickupApiOrigin, validateClickupCredential } from "./runtime.ts";

const service = "clickup";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: clickupActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ClickupActionContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType === "oauth2") {
      return {
        authType: "oauth2",
        accessToken: credential.accessToken,
        fetcher,
        signal: context.signal,
      };
    }
    if (credential?.authType === "api_key") {
      return {
        authType: "api_key",
        accessToken: credential.apiKey,
        fetcher,
        signal: context.signal,
      };
    }

    throw new ProviderRequestError(401, "Configure clickup credentials first.");
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await context.getCredential(service);
    if (credential?.authType !== "api_key" && credential?.authType !== "oauth2") {
      throw new ProviderRequestError(401, "Configure clickup credentials first.");
    }
    const url = createProviderProxyUrl(clickupApiOrigin, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set(
      "authorization",
      credential.authType === "oauth2" ? `${credential.tokenType} ${credential.accessToken}` : credential.apiKey,
    );
    headers.set("user-agent", providerUserAgent);
    if (input.body !== undefined && !headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }

    const response = await providerFetch(url, {
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

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateClickupCredential(input.apiKey, "api_key", fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateClickupCredential(input.accessToken, "oauth2", fetcher, signal);
  },
};
