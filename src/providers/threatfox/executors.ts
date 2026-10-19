import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ThreatfoxRuntimeContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { readThreatfoxError } from "./runtime.ts";
import { threatfoxActionHandlers, threatfoxApiBaseUrl, threatfoxApiPath, validateThreatfoxAuthKey } from "./runtime.ts";

const service = "threatfox";

export const executors: ProviderExecutors = defineProviderExecutors<ThreatfoxRuntimeContext>({
  service,
  handlers: threatfoxActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ThreatfoxRuntimeContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  readError: readThreatfoxError,
  service,
  baseUrl: threatfoxApiBaseUrl,
  auth: { type: "api_key_header", name: "Auth-Key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await validateThreatfoxAuthKey(input.apiKey, fetcher, signal);

    return {
      profile: {
        accountId: "threatfox-auth-key",
        displayName: "ThreatFox Auth-Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: threatfoxApiBaseUrl,
        validationEndpoint: threatfoxApiPath,
      },
    };
  },
};
