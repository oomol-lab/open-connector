import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { StannpActionContext } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { buildStannpApiBaseUrl, readStannpRegion, stannpActionHandlers, validateStannpCredential } from "./runtime.ts";

const service = "stannp";

export const executors: ProviderExecutors = defineProviderExecutors<StannpActionContext>({
  service,
  handlers: stannpActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<StannpActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      region: readStannpRegion(credential.metadata.region ?? credential.values.region),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateStannpCredential(input.apiKey, input.values.region, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return buildStannpApiBaseUrl(readStannpRegion(credential.metadata.region ?? credential.values.region));
  },
  auth: { type: "api_key_basic", suffix: ":" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});
