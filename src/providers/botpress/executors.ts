import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { BotpressContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { botpressActionHandlers, botpressApiBaseUrl, validateBotpressCredential } from "./runtime.ts";

const service = "botpress";

export const executors: ProviderExecutors = defineProviderExecutors<BotpressContext>({
  service,
  handlers: botpressActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<BotpressContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      workspaceId:
        optionalString(credential.values.workspaceId) ??
        optionalString(credential.metadata.workspaceId) ??
        missingWorkspaceId(),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBotpressCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: botpressApiBaseUrl,
  auth: {
    type: "credential_headers",
    headers: [
      { name: "authorization", source: { type: "api_key" }, prefix: "Bearer " },
      { name: "x-workspace-id", source: { type: "credential_value", name: "workspaceId" }, optional: true },
    ],
  },
  customizeRequest({ credential, headers }) {
    if (!credential || credential.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure Botpress credentials.");
    }
    const workspaceId =
      optionalString(credential.values.workspaceId) ?? optionalString(credential.metadata.workspaceId);
    if (!workspaceId) throw new ProviderRequestError(400, "botpress workspaceId is required");
    headers.set("x-workspace-id", workspaceId);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  },
  skipDnsValidation: true,
});

function missingWorkspaceId(): never {
  throw new ProviderRequestError(400, "botpress workspaceId is required");
}
