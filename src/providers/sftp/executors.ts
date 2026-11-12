import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";

import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { createSftpContext, sftpActionHandlers, validateSftpCredential } from "./runtime.ts";

const service = "sftp";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: sftpActionHandlers,
  async createContext(context: ExecutionContext) {
    const credential = await requireCustomCredential(context, service);
    return createSftpContext(credential.values, credential.metadata, context.transitFiles, context.signal);
  },
  fallbackMessage: "SFTP request failed",
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { signal }): Promise<CredentialValidationResult> {
    return validateSftpCredential(input.values, signal);
  },
};
