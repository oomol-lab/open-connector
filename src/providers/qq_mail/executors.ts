import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { QqMailProtocol } from "./protocol.ts";
import type { QqMailActionContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { qqMailActionHandlers, validateQqMailCredential } from "./runtime.ts";

const service = "qq_mail";
let protocolPromise: Promise<QqMailProtocol> | undefined;

export const executors: ProviderExecutors = defineProviderExecutors<QqMailActionContext>({
  service,
  handlers: qqMailActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<QqMailActionContext> {
    const credential = await requireCustomCredential(context, service);
    const protocol = await loadProtocol();
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
  async customCredential(input, options): Promise<CredentialValidationResult> {
    return validateQqMailCredential(input.values, loadProtocol, options.logger);
  },
};

async function loadProtocol(): Promise<QqMailProtocol> {
  protocolPromise ??= import("./protocol.ts").then(({ createQqMailProtocol }) => createQqMailProtocol());
  return protocolPromise;
}
