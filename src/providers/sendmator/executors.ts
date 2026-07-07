import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { SendmatorActionContext } from "./runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  readOptionalTeamId,
  sendmatorActionHandlers,
  sendmatorApiBaseUrl,
  validateSendmatorCredential,
} from "./runtime.ts";

const service = "sendmator";

export const executors: ProviderExecutors = defineProviderExecutors<SendmatorActionContext>({
  service,
  handlers: sendmatorActionHandlers,
  async createContext(context: ExecutionContext, fetcher): Promise<SendmatorActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      teamId: readOptionalTeamId(credential),
      phase: "execute",
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateSendmatorCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: sendmatorApiBaseUrl,
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("x-api-key", credential.apiKey);
    const teamId = readOptionalTeamId(credential);
    if (teamId) {
      headers.set("x-team-id", teamId);
    }
  },
});
