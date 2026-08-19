import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { CloudflareWorkerContext } from "./runtime.ts";

import { compactObject, optionalString, requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import {
  cloudflareWorkerActionHandlers,
  requestCloudflareWorkerCurrentUser,
  validateCloudflareWorkerCredential,
} from "./runtime.ts";

const service = "cloudflare_worker";

export const executors: ProviderExecutors = defineProviderExecutors<CloudflareWorkerContext>({
  service,
  handlers: cloudflareWorkerActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<CloudflareWorkerContext> {
    const credential = await context.getCredential(service);
    if (credential?.authType === "custom_credential") {
      return {
        authType: "custom_credential",
        accessToken: requiredString(
          credential.values.apiKey,
          "apiKey",
          (message) => new ProviderRequestError(400, message),
        ),
        accountId: requiredString(
          credential.values.accountId,
          "accountId",
          (message) => new ProviderRequestError(400, message),
        ),
        metadata: credential.metadata,
        fetcher,
        signal: context.signal,
      };
    }
    if (credential?.authType === "oauth2") {
      return {
        authType: "oauth2",
        accessToken: credential.accessToken,
        accountId: optionalString(credential.metadata.accountId),
        metadata: credential.metadata,
        fetcher,
        signal: context.signal,
      };
    }
    throw new ProviderRequestError(401, "Configure cloudflare_worker credentials first.");
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    return validateCloudflareWorkerCredential(input.values, fetcher, signal);
  },
  async oauth2(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const user = await requestCloudflareWorkerCurrentUser(input.accessToken, fetcher, signal);
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.username ||
      user.email ||
      "Cloudflare Worker";
    return {
      profile: {
        accountId: user.userId,
        displayName,
      },
      grantedScopes: input.profile.grantedScopes,
      metadata: compactObject({
        userId: user.userId,
        email: user.email,
        validationEndpoint: "/user",
      }),
    };
  },
};
