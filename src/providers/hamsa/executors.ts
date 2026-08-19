import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { executeHamsaAction, validateHamsaCredential } from "./runtime.ts";

const service = "hamsa";
const handlers: ProviderActionHandlers<
  "hamsa",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  get_project: (input, context) => executeHamsaAction("get_project", input, context.apiKey, context.fetcher),
  list_voice_agents: (input, context) =>
    executeHamsaAction("list_voice_agents", input, context.apiKey, context.fetcher),
  get_voice_agent: (input, context) => executeHamsaAction("get_voice_agent", input, context.apiKey, context.fetcher),
  list_tts_voices: (input, context) => executeHamsaAction("list_tts_voices", input, context.apiKey, context.fetcher),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const project = await validateHamsaCredential(input.apiKey, fetcher);
    return {
      profile: { displayName: typeof project.name === "string" ? project.name : "Hamsa API Key" },
      grantedScopes: [],
      metadata: { projectId: project.id },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.tryhamsa.com",
  auth: { type: "api_key_authorization", prefix: "Token " },
  skipDnsValidation: true,
});
