import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineApiKeyProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { executeMintlifyAction, validateMintlifyCredential } from "./runtime.ts";

const service = "mintlify";
const handlers: ProviderActionHandlers<
  "mintlify",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  trigger_deployment: (input, context) =>
    executeMintlifyAction("trigger_deployment", input, context.apiKey, context.fetcher),
  trigger_preview_deployment: (input, context) =>
    executeMintlifyAction("trigger_preview_deployment", input, context.apiKey, context.fetcher),
  get_deployment_status: (input, context) =>
    executeMintlifyAction("get_deployment_status", input, context.apiKey, context.fetcher),
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const projectId = input.values.projectId ?? "";
    await validateMintlifyCredential(input.apiKey, projectId, fetcher);
    return { profile: { displayName: `Mintlify ${projectId}` }, grantedScopes: [], metadata: { projectId } };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.mintlify.com/v1",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});
