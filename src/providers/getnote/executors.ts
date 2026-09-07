import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { getnoteActionHandlers, getnoteBaseUrl, readGetnoteClientId, validateGetnoteCredential } from "./runtime.ts";

const service = "getnote";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: getnoteActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    const clientId = readGetnoteClientId({
      values: credential.values,
      metadata: credential.metadata,
    });

    return {
      apiKey: credential.apiKey,
      clientId,
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "Getnote request failed.",
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    readGetnoteClientId({
      values: input.values,
    });

    return validateGetnoteCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: getnoteBaseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "authorization", source: { type: "api_key" } },
      { name: "x-client-id", source: { type: "credential_value", name: "clientId" }, optional: true },
    ],
  },
  customizeRequest({ credential, headers }) {
    if (!credential || credential.authType !== "api_key") return;
    headers.set("x-client-id", readGetnoteClientId({ values: credential.values, metadata: credential.metadata }));
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
  skipDnsValidation: true,
});
