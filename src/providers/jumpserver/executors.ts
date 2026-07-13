import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { JumpServerMcpContext } from "./runtime.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createJumpServerMcpContext, jumpServerActionHandlers, validateJumpServerCredential } from "./runtime.ts";

const service = "jumpserver";

export const executors: ProviderExecutors = defineProviderExecutors<JumpServerMcpContext>({
  service,
  handlers: jumpServerActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<JumpServerMcpContext> {
    const credential = await requireCustomCredential(context, service);
    return createJumpServerMcpContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "JumpServer MCP request failed",
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateJumpServerCredential(input.values, fetcher, signal);
  },
};
