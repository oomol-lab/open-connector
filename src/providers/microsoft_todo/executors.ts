import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString, requiredString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import { microsoftTodoActionHandlers, microsoftTodoGraphBaseUrl, microsoftTodoJsonRequest } from "./runtime.ts";

const service = "microsoft_todo";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, microsoftTodoActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: microsoftTodoGraphBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const profile = await microsoftTodoJsonRequest<{
      id?: unknown;
      displayName?: unknown;
      mail?: unknown;
      userPrincipalName?: unknown;
    }>("me", {
      accessToken: input.accessToken,
      fetcher,
      query: {
        $select: ["id", "displayName", "mail", "userPrincipalName"].join(","),
      },
    });
    const accountId = requiredString(profile.id, "microsoft_todo current account id");
    const displayName = optionalString(profile.displayName);
    const mail = optionalString(profile.mail);
    const userPrincipalName = optionalString(profile.userPrincipalName);
    return {
      profile: {
        accountId,
        displayName: mail ?? userPrincipalName ?? displayName ?? accountId,
      },
      metadata: {
        currentAccount: profile,
      },
    };
  },
};
