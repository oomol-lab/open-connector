import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, mapProviderActionHandlers } from "../provider-runtime.ts";
import { chengxinActions } from "./actions.ts";
import { executeChengxinAction, validateChengxinCredential } from "./runtime.ts";

const handlers: ProviderActionHandlers<
  "chengxin",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = mapProviderActionHandlers(
  "chengxin",
  chengxinActions,
  (_action, name) => (input, context) => executeChengxinAction(name, input, context.apiKey, context.fetcher),
);

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("chengxin", handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateChengxinCredential({ apiKey: input.apiKey }, fetcher).then((result) => ({
      profile: { accountId: `chengxin:${input.apiKey.slice(-8)}`, displayName: result.accountLabel },
      metadata: result.providerMetadata,
    }));
  },
};
