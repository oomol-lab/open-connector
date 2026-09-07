import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OomnitzaActionContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { oomnitzaActionHandlers, resolveOomnitzaCredential, validateOomnitzaCredential } from "./runtime.ts";

const service = "oomnitza";

export const executors: ProviderExecutors = defineProviderExecutors<OomnitzaActionContext>({
  service,
  handlers: oomnitzaActionHandlers,
  async createContext(context, fetcher): Promise<OomnitzaActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const resolvedCredential = resolveOomnitzaCredential(
      credential.apiKey,
      optionalString(credential.metadata.baseUrl) ?? optionalString(credential.values.baseUrl),
    );
    return {
      ...resolvedCredential,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return resolveOomnitzaCredential(
      credential.apiKey,
      optionalString(credential.metadata.baseUrl) ?? optionalString(credential.values.baseUrl),
    ).baseUrl;
  },
  auth: { type: "api_key_header", name: "Authorization2" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateOomnitzaCredential(
      {
        apiKey: input.apiKey,
        baseUrl: input.values.baseUrl,
      },
      fetcher,
      signal,
    );
  },
};
