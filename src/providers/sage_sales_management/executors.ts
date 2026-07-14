import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  createSageSalesManagementActionContext,
  sageSalesManagementApiBaseUrl,
  sageSalesManagementActionHandlers,
  validateSageSalesManagementCredential,
} from "./runtime.ts";

const service = "sage_sales_management";
const sageSalesManagementFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  skipDnsValidation: true,
  handlers: sageSalesManagementActionHandlers,
  async createContext(context, fetcher) {
    const credential = await requireCustomCredential(context, service);
    return createSageSalesManagementActionContext(credential.values, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireCustomCredential(context, service);
    const sageContext = await createSageSalesManagementActionContext(
      credential.values,
      sageSalesManagementFetch,
      context.signal,
    );
    const url = createProviderProxyUrl(sageSalesManagementApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);
    headers.set("x-session-key", sageContext.sessionKey);

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

    const response = await sageSalesManagementFetch(url, init);
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
  customCredential(input, { fetcher, signal }) {
    return validateSageSalesManagementCredential(input.values, fetcher, signal);
  },
};
