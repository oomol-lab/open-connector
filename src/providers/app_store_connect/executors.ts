import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { AppStoreConnectContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerProxyEndpointPrefixes,
  requireCustomCredential,
  requiredInputString,
} from "../provider-runtime.ts";
import { createAppStoreConnectAuthorization } from "./jwt.ts";
import {
  appStoreConnectActionHandlers,
  appStoreConnectApiBaseUrl,
  requestAppStoreConnectCredentialValidation,
} from "./runtime.ts";

const service = "app_store_connect";

export const executors: ProviderExecutors = defineProviderExecutors<AppStoreConnectContext>({
  service,
  handlers: appStoreConnectActionHandlers,
  // The API host is a hardcoded literal with no credential-derived component.
  skipDnsValidation: true,
  fallbackMessage: "App Store Connect request failed",
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AppStoreConnectContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      authorization: createAppStoreConnectAuthorization(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const keyId = requiredInputString(input.values.keyId, "keyId");
    const issuerId = optionalString(input.values.issuerId);
    await requestAppStoreConnectCredentialValidation({
      authorization: createAppStoreConnectAuthorization(input.values),
      fetcher,
      signal,
    });

    return {
      profile: {
        // Team keys share one issuer across the team; an individual key has no
        // issuer, so its own key id is the stable identity.
        accountId: issuerId ?? keyId,
        displayName: `App Store Connect key ${keyId}`,
      },
      // App Store Connect exposes no endpoint that reports the roles a key
      // holds, so there is nothing to derive granted scopes from.
      grantedScopes: [],
      metadata: {
        apiBaseUrl: appStoreConnectApiBaseUrl,
        validationEndpoint: "/v1/apps",
        keyId,
        issuerId: issuerId ?? null,
        keyKind: issuerId ? "team" : "individual",
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: appStoreConnectApiBaseUrl,
  // App Store Connect authenticates with a per-request signed JWT, which no
  // shared proxy auth type covers, so the header is set here instead.
  auth: { type: "none" },
  skipDnsValidation: true,
  allowedEndpoint: providerProxyEndpointPrefixes("/v1", "/v2", "/v3"),
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    const authorization = createAppStoreConnectAuthorization(credential.values);
    headers.set("authorization", await authorization());
  },
});
