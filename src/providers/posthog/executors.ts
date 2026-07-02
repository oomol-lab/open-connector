import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { PosthogRuntimeContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import { posthogActionHandlers, validatePosthogCredential } from "./runtime.ts";

const service = "posthog";

const posthogExecutorHandlers = Object.fromEntries(
  Object.entries(posthogActionHandlers).map(([actionName, handler]) => [
    actionName,
    async (input: Record<string, unknown>, context: PosthogRuntimeContext): Promise<unknown> =>
      handler(
        {
          actionName,
          input,
          apiKey: context.apiKey,
          providerMetadata: context.providerMetadata,
        },
        context.fetcher,
      ),
  ]),
);

export const executors: ProviderExecutors = defineProviderExecutors<PosthogRuntimeContext>({
  service,
  handlers: posthogExecutorHandlers,
  fallbackMessage: "PostHog request failed.",
  async createContext(context, fetcher): Promise<PosthogRuntimeContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType === "oauth2") {
      return {
        apiKey: credential.accessToken,
        fetcher,
        providerMetadata: {
          ...credential.metadata,
          baseUrl: optionalString(credential.metadata.posthog_base_url) ?? credential.metadata.baseUrl,
        },
      };
    }
    if (credential?.authType !== "api_key") {
      throw new ProviderRequestError(401, "Connect posthog with OAuth or configure PostHog API key credentials first.");
    }
    return {
      apiKey: credential.apiKey,
      fetcher,
      providerMetadata: {
        ...credential.metadata,
        baseUrl: credential.metadata.baseUrl ?? credential.values.baseUrl,
        organizationId: credential.metadata.organizationId,
      },
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, options) {
    try {
      return await validatePosthogCredential(
        {
          apiKey: input.accessToken,
          values: {
            baseUrl: optionalString(input.metadata.posthog_base_url) ?? "https://us.posthog.com",
          },
        },
        options.fetcher,
      );
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }
      throw new ProviderRequestError(
        502,
        error instanceof Error ? error.message : "PostHog credential validation failed",
      );
    }
  },

  async apiKey(input, options) {
    try {
      return await validatePosthogCredential(input, options.fetcher);
    } catch (error) {
      if (error instanceof ProviderRequestError) {
        throw error;
      }
      throw new ProviderRequestError(
        502,
        error instanceof Error ? error.message : "PostHog credential validation failed",
      );
    }
  },
};
