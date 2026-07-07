import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineBearerProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { calendlyActionHandlers, calendlyApiOrigin, validateCalendlyCredential } from "./runtime.ts";

const service = "calendly";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, calendlyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: calendlyApiOrigin,
  auth: { type: "bearer" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateCalendlyCredential(input.apiKey, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }) {
    return validateCalendlyCredential(input.accessToken, fetcher, signal);
  },
};
