import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, requireCustomCredential } from "../provider-runtime.ts";
import {
  createQdrantContext,
  normalizeQdrantClusterUrl,
  qdrantActionHandlers,
  validateQdrantCredential,
} from "./runtime.ts";

const service = "qdrant";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: qdrantActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<ReturnType<typeof createQdrantContext>> {
    const credential = await requireCustomCredential(context, service);
    return createQdrantContext(credential.values, fetcher, context.signal);
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireCustomCredential(context, service);
    return normalizeQdrantClusterUrl(credential.metadata.clusterUrl).origin;
  },
  auth: { type: "custom_credential_header", field: "apiKey", name: "api-key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateQdrantCredential(input.values, fetcher, signal);
  },
};
