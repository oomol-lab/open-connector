import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { QqMailActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createQqMailProtocol } from "./protocol.ts";
import { qqMailActionHandlers, validateQqMailCredential } from "./runtime.ts";

const service = "qq_mail";
const protocol = createQqMailProtocol();

export const executors: ProviderExecutors = defineProviderExecutors<QqMailActionContext>({
  service,
  handlers: qqMailActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<QqMailActionContext> {
    const credential = await requireCustomCredential(context, service);
    const providerContext: QqMailActionContext = {
      values: credential.values,
      fetcher,
      protocol,
      signal: context.signal,
    };
    if (context.transitFiles) {
      providerContext.transitFiles = context.transitFiles;
    }
    return providerContext;
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input): Promise<CredentialValidationResult> {
    return validateQqMailCredential(input.values, protocol);
  },
};
