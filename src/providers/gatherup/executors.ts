import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { GatherupContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { gatherupActionHandlers, gatherupApiBaseUrl, validateGatherupCredential } from "./runtime.ts";

const service = "gatherup";

export const executors: ProviderExecutors = defineProviderExecutors<GatherupContext>({
  service,
  handlers: gatherupActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireCustomCredential(context, service);
    return {
      apiKey: credential.values.apiKey ?? "",
      clientId: credential.values.clientId ?? "",
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: gatherupApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers, url }) {
    const credential = await requireCustomCredential(context, service);
    headers.set("authorization", `Bearer ${credential.values.apiKey ?? ""}`);
    url.searchParams.set("clientId", credential.values.clientId ?? "");
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher }) {
    return validateGatherupCredential(input.values, fetcher);
  },
};
