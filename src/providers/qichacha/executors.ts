import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { defineProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import {
  createQichachaToken,
  executeQichachaAction,
  qichachaApiBaseUrl,
  requireQichachaCredentials,
} from "./runtime.ts";

const service = "qichacha";
interface QichachaContext {
  credentials: ReturnType<typeof requireQichachaCredentials>;
  fetcher: ProviderFetch;
}
const handlers = {
  list_company_shareholders(input: Record<string, unknown>, context: QichachaContext) {
    return executeQichachaAction("list_company_shareholders", input, context.credentials, context.fetcher);
  },
  list_company_historical_investments(input: Record<string, unknown>, context: QichachaContext) {
    return executeQichachaAction("list_company_historical_investments", input, context.credentials, context.fetcher);
  },
};
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  async createContext(context, fetcher) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType !== "custom_credential")
      throw new ProviderRequestError(401, "Configure Qichacha credentials.");
    return { credentials: requireQichachaCredentials(credential.values), fetcher };
  },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  customCredential(input) {
    requireQichachaCredentials(input.values);
    return Promise.resolve({
      profile: { accountId: input.values.appKey!, displayName: "Qichacha AppKey" },
      grantedScopes: [],
      metadata: { validationMode: "format_only" },
    });
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: qichachaApiBaseUrl,
  auth: { type: "none" },
  sensitiveHeaders: ["timespan", "token"],
  skipDnsValidation: true,
  async customizeRequest({ context, url, headers }) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType !== "custom_credential") {
      throw new ProviderRequestError(401, "Configure Qichacha credentials.");
    }
    const credentials = requireQichachaCredentials(credential.values);
    const timespan = String(Math.floor(Date.now() / 1000));
    url.searchParams.set("key", credentials.appKey);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    headers.set("timespan", timespan);
    headers.set("token", createQichachaToken(credentials.appKey, timespan, credentials.secretKey));
  },
});
