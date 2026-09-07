import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  getresponseActionHandlers,
  resolveStoredGetresponseApiBaseUrl,
  validateGetresponseCredential,
} from "./runtime.ts";

interface GetresponseContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

const handlers: Record<string, (input: Record<string, unknown>, context: GetresponseContext) => Promise<unknown>> =
  Object.fromEntries(
    Object.entries(getresponseActionHandlers).map(([name, handler]) => [
      name,
      (input: Record<string, unknown>, context: GetresponseContext) =>
        handler(
          { apiKey: context.apiKey, providerMetadata: context.metadata, input, actionName: name },
          context.fetcher,
        ),
    ]),
  );

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "getresponse",
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, "getresponse");
    return { apiKey: credential.apiKey, values: credential.values, metadata: credential.metadata, fetcher };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "getresponse",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "getresponse");
    return resolveStoredGetresponseApiBaseUrl(credential.metadata);
  },
  auth: {
    type: "credential_headers",
    headers: [
      { name: "X-Auth-Token", source: { type: "api_key" }, prefix: "api-key " },
      { name: "X-Domain", source: { type: "credential_metadata", name: "domain" }, optional: true },
      {
        name: "X-Parent-Login",
        source: { type: "credential_metadata", name: "parentLogin" },
        optional: true,
      },
    ],
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) {
      headers.set("accept", "application/json");
    }
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateGetresponseCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
