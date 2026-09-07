import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalStringArray } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  createWandbMcpContext,
  normalizeWandbMcpEndpoint,
  validateWandbMcpCredential,
  wandbMcpActionHandlers,
} from "./runtime.ts";

const service = "wandb";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: wandbMcpActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return createWandbMcpContext(
      credential.apiKey,
      credential.values,
      fetcher,
      context.signal,
      optionalStringArray(credential.metadata.availableActions),
      isPrivateNetworkAccessAllowed(),
    );
  },
  fallbackMessage: "W&B MCP request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    return normalizeWandbMcpEndpoint(
      typeof credential.metadata.mcpEndpoint === "string"
        ? credential.metadata.mcpEndpoint
        : credential.values.mcpEndpoint,
      isPrivateNetworkAccessAllowed(),
    ).toString();
  },
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateWandbMcpCredential(input.apiKey, input.values, guardedFetcher, signal);
  },
};
