import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { OracleCloudContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createOracleCloudContext, oracleCloudActionHandlers, validateOracleCloudCredential } from "./runtime.ts";

const service = "oracle_cloud";

export const executors: ProviderExecutors = defineProviderExecutors<OracleCloudContext>({
  service,
  handlers: oracleCloudActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OracleCloudContext> {
    const credential = await requireCustomCredential(context, service);
    return createOracleCloudContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "Oracle Cloud Infrastructure request failed",
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateOracleCloudCredential(input.values, fetcher, signal);
  },
};
