import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyExecutionResult,
} from "../../core/types.ts";
import type { BenchmarkEmailContext } from "./runtime.ts";

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
  benchmarkEmailActionHandlers,
  resolveBenchmarkEmailBaseUrl,
  validateBenchmarkEmailCredential,
} from "./runtime.ts";

const service = "benchmark_email";

export const executors: ProviderExecutors = defineProviderExecutors<BenchmarkEmailContext>({
  service,
  handlers: benchmarkEmailActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BenchmarkEmailContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      baseUrl: resolveBenchmarkEmailBaseUrl(credential.values, credential.metadata),
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const proxy: ProviderProxyExecutor = async (input, context): Promise<ProxyExecutionResult> => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(
      resolveBenchmarkEmailBaseUrl(credential.values, credential.metadata),
      input.endpoint,
      input.query,
    );
    url.searchParams.set("token", credential.apiKey);
    url.searchParams.set("output", "json");
    const headers = normalizeProviderProxyHeaders(input.headers);
    headers.set("user-agent", providerUserAgent);

    const response = await fetch(url, {
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
  apiKey(input, { fetcher, signal }) {
    return validateBenchmarkEmailCredential(input, fetcher, signal);
  },
};
