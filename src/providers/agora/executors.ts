import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { agoraActionHandlers, readAgoraCustomerId, validateAgoraCredential } from "./runtime.ts";

const service = "agora";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: agoraActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      customerId: readAgoraCustomerId(credential.values),
      customerSecret: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateAgoraCredential(
      {
        customerId: input.values.customerId,
        customerSecret: input.apiKey,
      },
      fetcher,
      signal,
    );
  },
};
