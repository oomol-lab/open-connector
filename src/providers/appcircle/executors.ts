import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  appcircleApiBaseUrl,
  exchangeAppcircleProxyAccessToken,
  executeAppcircleAction,
  validateAppcircleCredential,
} from "./runtime.ts";

const service = "appcircle";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"appcircle", Handler> = {
  list_organizations(input, context) {
    return executeAppcircleAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_organizations",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_build_profiles(input, context) {
    return executeAppcircleAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_build_profiles",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_distribution_profiles(input, context) {
    return executeAppcircleAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_distribution_profiles",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_enterprise_store_profiles(input, context) {
    return executeAppcircleAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_enterprise_store_profiles",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
};

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return { apiKey: credential.apiKey, values: credential.values, metadata: credential.metadata, fetcher };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: appcircleApiBaseUrl,
  auth: { type: "api_key_header", name: "x-connector-api-key" },
  skipDnsValidation: true,
  async customizeRequest({ credential, fetcher, headers }) {
    if (credential?.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure Appcircle API key credentials first.");
    }
    headers.delete("x-connector-api-key");
    const accessToken = await exchangeAppcircleProxyAccessToken(
      credential.apiKey,
      credential.values,
      credential.metadata,
      fetcher,
    );
    headers.set("authorization", `Bearer ${accessToken}`);
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateAppcircleCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
