import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { VtexContext } from "./runtime.ts";

import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  buildVtexApiBaseUrl,
  normalizeVtexEnvironment,
  readVtexAccountName,
  requireVtexAppToken,
  validateVtexCredential,
  vtexActionHandlers,
} from "./runtime.ts";

const service = "vtex";

export const executors: ProviderExecutors = defineProviderExecutors<VtexContext>({
  service,
  handlers: vtexActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<VtexContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      appKey: credential.apiKey,
      appToken: requireVtexAppToken(credential.values.appToken),
      accountName: readVtexAccountName(credential.metadata.accountName ?? credential.values.accountName),
      environment: normalizeVtexEnvironment(credential.metadata.environment ?? credential.values.environment),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const accountName = readVtexAccountName(credential.metadata.accountName ?? credential.values.accountName);
    const environment = normalizeVtexEnvironment(credential.metadata.environment ?? credential.values.environment);
    const url = createProviderProxyUrl(buildVtexApiBaseUrl(accountName, environment), input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("x-vtex-api-appkey", credential.apiKey);
    headers.set("x-vtex-api-apptoken", requireVtexAppToken(credential.values.appToken));
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
      throw new ProviderRequestError(response.status, text || `vtex request failed with HTTP ${response.status}`);
    }
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "vtex request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  apiKey(input) {
    return validateVtexCredential({
      appKey: input.apiKey,
      appToken: input.values.appToken,
      accountName: input.values.accountName,
      environment: input.values.environment,
    });
  },
};
