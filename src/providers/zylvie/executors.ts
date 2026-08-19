import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, requireApiKeyCredential } from "../provider-runtime.ts";
import { executeZylvieAction, validateZylvieCredential, zylvieApiBaseUrl } from "./runtime.ts";

const service = "zylvie";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"zylvie", Handler> = {
  get_current_user(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_current_user",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_product(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_product",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_product(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_product",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_product(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_product",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  create_coupon(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "create_coupon",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  update_coupon(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "update_coupon",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  delete_coupon(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "delete_coupon",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_coupons(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_coupons",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  verify_license_key(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "verify_license_key",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  redeem_license_key(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "redeem_license_key",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  refund_license_key(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "refund_license_key",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  verify_subscriptions(input, context) {
    return executeZylvieAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "verify_subscriptions",
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
  baseUrl: zylvieApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateZylvieCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
