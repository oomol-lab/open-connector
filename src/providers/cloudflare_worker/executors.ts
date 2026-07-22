import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { CloudflareWorkerContext } from "./runtime.ts";

import { optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import {
  cloudflareWorkerActionHandlers,
  requestCloudflareWorkerAccounts,
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
    const result = await requestCloudflareWorkerAccounts(input.accessToken, fetcher, signal, { page: 1, perPage: 50 });
    if (result.accounts.length === 0) {
      throw new ProviderRequestError(400, "Cloudflare OAuth credential cannot access any accounts");
    }
    const totalCount = optionalInteger(result.resultInfo?.totalCount);
    if (result.accounts.length === 1 && totalCount === 1) {
      const account = result.accounts[0]!;
      return {
        profile: {
          accountId: account.id,
          displayName: account.name ?? "Cloudflare Worker",
        },
        grantedScopes: input.profile.grantedScopes,
        metadata: {
          accountId: account.id,
          accountName: account.name,
          accountType: account.type,
          validationEndpoint: "/accounts?page=1&per_page=50",
        },
      };
    }
    return {
      profile: {
        accountId: input.profile.accountId,
        displayName: "Cloudflare Worker",
      },
      grantedScopes: input.profile.grantedScopes,
      metadata: {
        requiresAccountSelection: true,
        validationEndpoint: "/accounts?page=1&per_page=50",
      },
    };
  },
};
