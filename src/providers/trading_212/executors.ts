import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { Trading212Context, Trading212Credential } from "./runtime.ts";

import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy, providerProxyEndpointPrefixes } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  readTrading212Credential,
  readTrading212Error,
  trading212ActionHandlers,
  trading212ApiPathPrefix,
  trading212Authorization,
  trading212Origin,
  validateTrading212Credential,
} from "./runtime.ts";

const service = "trading_212";
const isTrading212ApiEndpoint = providerProxyEndpointPrefixes(trading212ApiPathPrefix);
const isTrading212ReportEndpoint = providerProxyEndpointPrefixes(`${trading212ApiPathPrefix}/equity/history/exports`);

export const executors: ProviderExecutors = defineProviderExecutors<Trading212Context>({
  service,
  handlers: trading212ActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<Trading212Context> {
    return { credential: await resolveTrading212Credential(context), fetcher, signal: context.signal };
  },
});

// The Basic header is set in customizeRequest because its user name comes from
// an extra field. The base URL resolver only picks one of the two literal
// Trading 212 origins. GET only, and no CSV reports, so the proxy stays within
// the actions' read-only scope: it must never place, change or cancel an
// order, whatever permissions the key has.
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    return trading212Origin(await resolveTrading212Credential(context));
  },
  auth: { type: "none" },
  skipDnsValidation: true,
  allowedEndpoint: (endpoint) => isTrading212ApiEndpoint(endpoint) && !isTrading212ReportEndpoint(endpoint),
  async customizeRequest({ context, method, headers }) {
    if (method.toUpperCase() !== "GET") {
      throw new ProviderRequestError(400, "Trading 212 proxy only supports GET requests.");
    }
    headers.set("authorization", trading212Authorization(await resolveTrading212Credential(context)));
  },
  readError: readTrading212Error,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateTrading212Credential(input, fetcher, signal);
  },
};

async function resolveTrading212Credential(context: ExecutionContext): Promise<Trading212Credential> {
  return readTrading212Credential(await requireApiKeyCredential(context, service));
}
