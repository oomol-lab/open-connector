import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { UrlhausRuntimeContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { readUrlhausError } from "./runtime.ts";
import { urlhausActionHandlers, urlhausApiBaseUrl, urlhausValidationPath, validateUrlhausAuthKey } from "./runtime.ts";

const service = "urlhaus";

export const executors: ProviderExecutors = defineProviderExecutors<UrlhausRuntimeContext>({
  service,
  handlers: urlhausActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<UrlhausRuntimeContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  readError: readUrlhausError,
  service,
  baseUrl: urlhausApiBaseUrl,
  auth: { type: "api_key_header", name: "Auth-Key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await validateUrlhausAuthKey(input.apiKey, fetcher, signal);

    return {
      profile: {
        accountId: "urlhaus-auth-key",
        displayName: "URLhaus Auth-Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: urlhausApiBaseUrl,
        validationEndpoint: urlhausValidationPath,
      },
    };
  },
};
