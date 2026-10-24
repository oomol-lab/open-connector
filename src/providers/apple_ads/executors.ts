import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { AppleAdsContext } from "./runtime-helpers.ts";

import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, providerProxyEndpointPrefixes } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { createAppleAdsAuthorization, readAppleAdsCredential } from "./auth.ts";
import { appleAdsApiOrigin } from "./runtime-helpers.ts";
import { appleAdsActionHandlers, validateAppleAdsCredential } from "./runtime.ts";

const service = "apple_ads";

export const executors: ProviderExecutors = defineProviderExecutors<AppleAdsContext>({
  service,
  handlers: appleAdsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AppleAdsContext> {
    const credential = await requireCustomCredential(context, service);
    const values = readAppleAdsCredential(credential.values);
    return {
      authorization: createAppleAdsAuthorization(values, fetcher, "execute", context.signal),
      fetcher,
      signal: context.signal,
      defaultAdAccountId: values.adAccountId,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateAppleAdsCredential(readAppleAdsCredential(input.values), fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: appleAdsApiOrigin,
  auth: { type: "credential_headers", headers: [] },
  allowedEndpoint: providerProxyEndpointPrefixes("/v1"),
  skipDnsValidation: true,
  async customizeRequest(input): Promise<void> {
    if (input.credential?.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure Apple Ads custom credentials first.");
    }
    const credential = readAppleAdsCredential(input.credential.values);
    input.headers.set(
      "authorization",
      await createAppleAdsAuthorization(credential, input.fetcher, "execute", input.context.signal)(),
    );
    if (credential.adAccountId && !input.headers.has("x-ap-context")) {
      input.headers.set("x-ap-context", `adAccountId=${credential.adAccountId}`);
    }
  },
});
