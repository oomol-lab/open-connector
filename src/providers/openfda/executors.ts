import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { defineProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import { executeOpenfdaAction, openfdaApiBaseUrl, validateOpenfdaCredential } from "./runtime.ts";

const service = "openfda";

interface OpenfdaContext {
  apiKey?: string;
  fetcher: typeof fetch;
}

const handlers = {
  search_drug_records(input: Record<string, unknown>, context: OpenfdaContext): Promise<unknown> {
    return executeOpenfdaAction("search_drug_records", input, context.fetcher, context.apiKey);
  },
  count_drug_values(input: Record<string, unknown>, context: OpenfdaContext): Promise<unknown> {
    return executeOpenfdaAction("count_drug_values", input, context.fetcher, context.apiKey);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<OpenfdaContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<OpenfdaContext> {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType === "no_auth") {
      return { fetcher };
    }
    if (credential.authType === "api_key") {
      return { apiKey: credential.apiKey, fetcher };
    }
    throw new ProviderRequestError(401, "Connect openFDA without authentication or configure an API key.");
  },
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: openfdaApiBaseUrl,
  auth: { type: "optional_api_key_query", name: "api_key" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateOpenfdaCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
