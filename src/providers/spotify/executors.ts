import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { defineOAuthProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import { spotifyActionHandlers, spotifyApiBaseUrl, spotifyJsonRequest } from "./runtime.ts";

const service = "spotify";

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, spotifyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: spotifyApiBaseUrl,
  auth: { type: "oauth_bearer" },
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }) {
    const payload = await spotifyJsonRequest<Record<string, unknown>>("me", {
      accessToken: input.accessToken,
      fetcher,
      signal,
    });
    const accountId = optionalString(payload.id);
    if (!accountId) {
      throw new ProviderRequestError(502, "Spotify current account response is missing id");
    }
    return {
      profile: {
        accountId,
        displayName: optionalString(payload.display_name) ?? optionalString(payload.email) ?? accountId,
      },
      grantedScopes: parseScopeList(input.metadata.scope),
      metadata: {
        currentUser: payload,
      },
    };
  },
};

function parseScopeList(value: unknown): string[] {
  if (typeof value !== "string" || value.length === 0) {
    return [];
  }
  return value
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);
}
