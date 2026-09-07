import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { JumpServerMcpContext } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  mapProviderActionNames,
  requireCustomCredential,
} from "../provider-runtime.ts";
import { jumpServerMcpToolNames } from "./actions.ts";

const service = "jumpserver";

type JumpServerRuntime = typeof import("./runtime.ts");
type JumpServerActionHandler = (input: Record<string, unknown>, context: JumpServerMcpContext) => Promise<unknown>;

let runtimeModule: Promise<JumpServerRuntime> | undefined;

function loadJumpServerRuntime(): Promise<JumpServerRuntime> {
  runtimeModule ??= import("./runtime.ts");
  return runtimeModule;
}

const handlers = mapProviderActionNames(
  service,
  jumpServerMcpToolNames,
  (toolName): JumpServerActionHandler =>
    async (input, context) =>
      (await loadJumpServerRuntime()).jumpServerActionHandlers[toolName](input, context),
);

export const executors: ProviderExecutors = defineProviderExecutors<JumpServerMcpContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<JumpServerMcpContext> {
    const credential = await requireCustomCredential(context, service);
    return (await loadJumpServerRuntime()).createJumpServerMcpContext(credential.values, fetcher, context.signal);
  },
  fallbackMessage: "JumpServer MCP request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireCustomCredential(context, service);
    return (await loadJumpServerRuntime()).normalizeJumpServerMcpEndpoint(credential.metadata.mcpEndpoint).toString();
  },
  auth: {
    type: "custom_credential_header",
    field: "token",
    name: "authorization",
    prefix: "Bearer ",
  },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json, text/event-stream");
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return (await loadJumpServerRuntime()).validateJumpServerCredential(input.values, guardedFetcher, signal);
  },
};
