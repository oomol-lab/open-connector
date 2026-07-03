import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { BenchmarkEmailContext } from "./runtime.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
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

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBenchmarkEmailCredential(input, fetcher, signal);
  },
};
