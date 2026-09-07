import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  executeMoreTreesAction,
  moreTreesAccountOrigin,
  moreTreesProjectOrigin,
  moreTreesTransactionOrigin,
  validateMoreTreesCredential,
} from "./runtime.ts";

const service = "more_trees";

interface ProviderContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

type Handler = (input: Record<string, unknown>, context: ProviderContext) => Promise<unknown>;

const handlers: ProviderActionHandlers<"more_trees", Handler> = {
  get_account(input, context) {
    return executeMoreTreesAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_account",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  get_forest(input, context) {
    return executeMoreTreesAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "get_forest",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  list_projects(input, context) {
    return executeMoreTreesAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "list_projects",
        input,
        providerMetadata: context.metadata,
      },
      context.fetcher,
    );
  },
  plant_trees(input, context) {
    return executeMoreTreesAction(
      {
        apiKey: context.apiKey,
        ...context.values,
        values: context.values,
        actionName: "plant_trees",
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
  baseUrl: moreTreesAccountOrigin,
  allowedOrigins: [moreTreesProjectOrigin, moreTreesTransactionOrigin],
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
  customizeRequest({ credential, url, headers }) {
    if (!credential || credential.authType !== "api_key") {
      throw new ProviderRequestError(401, "Configure More Trees credentials.");
    }
    if (
      url.origin === moreTreesAccountOrigin &&
      (url.pathname === "/user-management-api/external/forest" ||
        url.pathname.startsWith("/user-management-api/external/forest/"))
    ) {
      headers.delete("x-api-key");
    } else if (url.origin === moreTreesProjectOrigin) {
      const publicValidationKey = optionalString(credential.values.publicValidationKey);
      if (!publicValidationKey) throw new ProviderRequestError(400, "publicValidationKey is required");
      headers.set("x-api-key", publicValidationKey);
    }
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const result = await validateMoreTreesCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
    return {
      profile: {
        displayName: result.accountLabel,
      },
      grantedScopes: result.providerScopes,
      metadata: result.providerMetadata,
    };
  },
};
