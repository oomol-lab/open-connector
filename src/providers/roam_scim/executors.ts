import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  roamScimActionHandlers,
  roamScimApiBaseUrl,
  toRoamScimExecutionError,
  validateRoamScimCredential,
} from "./runtime.ts";

const service = "roam_scim";

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: roamScimApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
});

export const executors: ProviderExecutors = Object.fromEntries(
  Object.entries(roamScimActionHandlers).map(([name, handler]) => [
    `${service}.${name}`,
    async (input: unknown, context: ExecutionContext) => {
      try {
        const credential = await requireApiKeyCredential(context, service);
        const providerContext: ApiKeyProviderContext = {
          apiKey: credential.apiKey,
          fetcher: fetch,
          signal: context.signal,
        };
        if (context.transitFiles) {
          providerContext.transitFiles = context.transitFiles;
        }
        return {
          ok: true,
          output: await handler(input as Record<string, unknown>, providerContext),
        };
      } catch (error) {
        return toRoamScimExecutionError(error);
      }
    },
  ]),
) as ProviderExecutors;

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateRoamScimCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};
