import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers } from "../provider-executors.ts";

import { defineApiKeyProviderExecutors, mapProviderActionNames } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { descriptActions } from "./actions.ts";
import { descriptApiBaseUrl, executeDescriptAction, validateDescriptCredential } from "./runtime.ts";

const service = "descript";
type DescriptHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"descript", DescriptHandler> = mapProviderActionNames(
  service,
  descriptActions.map((action) => action.name),
  (actionName) => (input, context) =>
    executeDescriptAction({ apiKey: context.apiKey, actionName, input }, context.fetcher),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: descriptApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateDescriptCredential(input.apiKey, fetcher);
  },
};
