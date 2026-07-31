import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { optionalStringArray } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch, defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { createWandbMcpContext, validateWandbMcpCredential, wandbMcpActionHandlers } from "./runtime.ts";

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

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateWandbMcpCredential(input.apiKey, input.values, guardedFetcher, signal);
  },
};
