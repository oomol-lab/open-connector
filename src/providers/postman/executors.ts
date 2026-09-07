import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy, mapProviderActionHandlers } from "../provider-runtime.ts";
import { postmanActions } from "./actions.ts";
import { executePostmanAction, postmanApiBaseUrl, validatePostmanCredential } from "./runtime.ts";

const service = "postman";

type PostmanActionContext = ApiKeyProviderContext;

type PostmanActionHandler = (input: Record<string, unknown>, context: PostmanActionContext) => Promise<unknown>;

export const postmanActionHandlers: ProviderActionHandlers<"postman", PostmanActionHandler> = mapProviderActionHandlers(
  service,
  postmanActions,
  (_action, name): PostmanActionHandler =>
    (input, context) =>
      executePostmanAction(name, input, context),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, postmanActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: postmanApiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validatePostmanCredential(input.apiKey, fetcher);
  },
};
