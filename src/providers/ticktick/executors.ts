import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { defineBearerProviderExecutors, defineProviderProxy } from "../provider-runtime.ts";
import {
  fetchTicktickCurrentAccount,
  ticktickActionHandlers,
  ticktickApiBaseUrl,
  validateTicktickCredential,
} from "./runtime.ts";

const service = "ticktick";

export const executors: ProviderExecutors = defineBearerProviderExecutors(service, ticktickActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: ticktickApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey: validateTicktickCredential,
  async oauth2(input, { fetcher, signal }) {
    return fetchTicktickCurrentAccount(input.accessToken, fetcher, signal);
  },
};
