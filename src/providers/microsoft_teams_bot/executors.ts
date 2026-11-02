import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { IntegrationDefinition } from "../../triggers/common/integration.ts";
import type { TeamsBotContext } from "./runtime.ts";

import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch, providerInputError } from "../provider-runtime.ts";
import {
  microsoftTeamsBotActionHandlers,
  mintTeamsBotConnectorToken,
  readTeamsBotCredential,
  validateTeamsBotCredential,
} from "./runtime.ts";
import { microsoftTeamsBotActivities } from "./trigger-on-activity.ts";

const service = "microsoft_teams_bot";

export const executors: ProviderExecutors = defineProviderExecutors<TeamsBotContext>({
  service,
  handlers: microsoftTeamsBotActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<TeamsBotContext> {
    const credential = await requireCustomCredential(context, service);
    return { ...readTeamsBotCredential(credential.values), fetcher, signal: context.signal };
  },
});

// The Trigger runner reaches the provider through this proxy. Bot Connector endpoints differ per
// conversation, so it targets the connection's default service URL, which the credential reader
// already restricts to Teams Bot Connector hosts. The host comes from the credential, so DNS
// validation stays on.
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const { serviceUrl } = readTeamsBotCredential((await requireCustomCredential(context, service)).values);
    if (serviceUrl === undefined)
      throw providerInputError("Set the connection's default service URL to use the Microsoft Teams Bot proxy.");
    return serviceUrl;
  },
  auth: {
    type: "bearer_resolver",
    async resolve({ context, fetcher, signal }) {
      const credential = readTeamsBotCredential((await requireCustomCredential(context, service)).values);
      const fetch = createProviderFetch({ fetch: fetcher });
      return { accessToken: await mintTeamsBotConnectorToken({ ...credential, fetcher: fetch, signal }) };
    },
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateTeamsBotCredential(input.values, createProviderFetch({ fetch: fetcher }), signal);
  },
};

export const triggers: readonly IntegrationDefinition[] = [microsoftTeamsBotActivities];
