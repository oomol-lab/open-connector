import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { HithinkFinanceActionContext } from "./runtime.ts";

import {
  createProviderProxyUrl,
  defineProviderExecutors,
  normalizeProviderProxyHeaders,
  providerFetch,
  providerUserAgent,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  fetchHithinkFinanceProxy,
  hithinkFinanceActionHandlers,
  hithinkFinanceApiBaseUrl,
  validateHithinkFinanceCredential,
} from "./runtime.ts";

const service = "hithink_finance";

export const executors: ProviderExecutors = defineProviderExecutors<HithinkFinanceActionContext>({
  service,
  handlers: hithinkFinanceActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<HithinkFinanceActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      transitFiles: context.transitFiles,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateHithinkFinanceCredential(input.apiKey, fetcher);
  },
};

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(hithinkFinanceApiBaseUrl, input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
    headers.set("x-api-key", credential.apiKey);
    const response = await fetchHithinkFinanceProxy({
      url,
      init: { method: input.method, headers, signal: context.signal },
      fetcher: providerFetch,
    });
    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Tonghuashun Financial Data proxy request failed");
  }
};
