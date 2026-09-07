import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  basicAuthorizationHeader,
  defineProviderExecutors,
  defineProviderProxy,
  mapProviderActionHandlers,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { dataciteActions } from "./actions.ts";
import { dataciteApiBaseUrl, executeDataciteAction, validateDataciteCredential } from "./runtime.ts";
const service = "datacite";
interface DataciteContext {
  apiKey?: string;
  fetcher: typeof fetch;
}
const handlers: ProviderActionHandlers<"datacite", ProviderRuntimeHandler<DataciteContext>> = mapProviderActionHandlers(
  service,
  dataciteActions,
  (_action, name) => (input, context) => executeDataciteAction(name, input, context.fetcher, context.apiKey),
);
export const executors: ProviderExecutors = defineProviderExecutors<DataciteContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType == "no_auth") return { fetcher };
    if (credential.authType == "api_key") return { apiKey: credential.apiKey, fetcher };
    throw new ProviderRequestError(401, "Connect DataCite without authentication or configure an API key.");
  },
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: dataciteApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await context.getCredential(service);
    if (credential?.authType === "api_key")
      headers.set("authorization", basicAuthorizationHeader(`${credential.apiKey}:`));
    else if (credential && credential.authType !== "no_auth")
      throw new ProviderRequestError(401, "DataCite requires no_auth or api_key credential");
    if (!headers.has("accept")) headers.set("accept", "application/vnd.api+json");
    if (!headers.has("content-type")) headers.set("content-type", "application/vnd.api+json");
  },
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateDataciteCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
