import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-runtime.ts";
import { postmanActions } from "./actions.ts";
import { executePostmanAction, validatePostmanCredential } from "./runtime.ts";

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

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    return validatePostmanCredential(input.apiKey, fetcher);
  },
};
