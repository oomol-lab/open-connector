import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { createProviderFetch, defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import {
  createDingTalkMcpContext,
  dingTalkMcpActionHandlers,
  toDingTalkMcpExecutionError,
  validateDingTalkMcpCredential,
} from "./runtime.ts";

const service = "dingtalk_mcp";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: dingTalkMcpActionHandlers,
  mapError: toDingTalkMcpExecutionError,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    return createDingTalkMcpContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "DingTalk MCP request failed",
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateDingTalkMcpCredential(input.values, createProviderFetch({ fetch: fetcher }), signal);
  },
};
