import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { BtMcpContext } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { defineProviderExecutors, requireCustomCredential } from "../provider-executors.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import { callBtMcpTool, createBtMcpContext, listBtMcpTools, validateBtMcpCredential } from "./runtime.ts";

const service = "bt_mcp";

export const btMcpActionHandlers: ProviderActionHandlers<"bt_mcp", ProviderRuntimeHandler<BtMcpContext>> = {
  async list_tools(_input, context) {
    return { tools: await listBtMcpTools(context) };
  },
  call_tool(input, context) {
    return callBtMcpTool(context, input);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<BtMcpContext>({
  service,
  handlers: btMcpActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BtMcpContext> {
    const credential = await requireCustomCredential(context, service);
    return createBtMcpContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "BT Panel MCP request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({
      fetch: fetcher,
      allowPrivateNetwork: isPrivateNetworkAccessAllowed,
    });
    return validateBtMcpCredential(input.values, guardedFetcher, signal);
  },
};
