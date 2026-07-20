import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { AliyunSlsActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { aliyunSlsActionHandlers, createAliyunSlsContext, validateAliyunSlsCredential } from "./runtime.ts";

const service = "aliyun_sls";

export const executors: ProviderExecutors = defineProviderExecutors<AliyunSlsActionContext>({
  service,
  handlers: aliyunSlsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AliyunSlsActionContext> {
    const credential = await requireCustomCredential(context, service);
    return createAliyunSlsContext(credential.values, fetcher, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input): Promise<CredentialValidationResult> {
    return validateAliyunSlsCredential(input.values);
  },
};
