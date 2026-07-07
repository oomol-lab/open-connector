import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { DrataActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { drataActionHandlers, drataDefaultRegion, drataRegionBaseUrls, validateDrataCredential } from "./runtime.ts";

const service = "drata";

export const executors: ProviderExecutors = defineProviderExecutors<DrataActionContext>({
  service,
  handlers: drataActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<DrataActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const region = typeof credential.metadata.region === "string" ? credential.metadata.region : drataDefaultRegion;
    return {
      apiKey: credential.apiKey,
      baseUrl:
        drataRegionBaseUrls[region as keyof typeof drataRegionBaseUrls] ?? drataRegionBaseUrls[drataDefaultRegion],
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const region =
      typeof credential.metadata.region === "string"
        ? credential.metadata.region
        : typeof credential.values.region === "string"
          ? credential.values.region
          : drataDefaultRegion;
    return drataRegionBaseUrls[region as keyof typeof drataRegionBaseUrls] ?? drataRegionBaseUrls[drataDefaultRegion];
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateDrataCredential(input, fetcher, signal);
  },
};
