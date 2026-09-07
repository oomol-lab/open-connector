import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { agiledActionHandlers, agiledApiBaseUrl, readAgiledBrand, validateAgiledCredential } from "./runtime.ts";

const service = "agiled";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: agiledActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      brand: readAgiledBrand(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: agiledApiBaseUrl,
  auth: { type: "api_key_query", name: "api_token" },
  skipDnsValidation: true,
  customizeRequest({ credential, headers }) {
    if (credential?.authType !== "api_key") throw new ProviderRequestError(400, "api_key credential is required");
    const brand = typeof credential?.metadata.brand === "string" ? credential.metadata.brand : undefined;
    if (!brand) throw new ProviderRequestError(400, "agiled credential cannot proxy brand");
    headers.set("brand", brand);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAgiledCredential(
      {
        apiKey: input.apiKey,
        ...input.values,
      },
      fetcher,
      signal,
    );
  },
};
