import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch, ProviderRequestError } from "../provider-runtime.ts";
import {
  exchangeKrispCallAccessToken,
  krispcallActionHandlers,
  krispcallApiBaseUrl,
  validateKrispCallCredential,
} from "./runtime.ts";

const service = "krispcall";
const krispcallFetch = createProviderFetch({ skipDnsValidation: true });

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: krispcallActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, service);
    const clientId = credential.values.clientId;
    const clientSecret = credential.values.clientSecret;
    if (!clientId || !clientSecret) {
      throw new ProviderRequestError(401, "Configure KrispCall client credentials first.");
    }
    return {
      accessToken: await exchangeKrispCallAccessToken({ clientId, clientSecret }, fetcher, context.signal),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: krispcallApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    const clientId = credential.values.clientId;
    const clientSecret = credential.values.clientSecret;
    if (!clientId || !clientSecret) {
      throw new ProviderRequestError(401, "Configure KrispCall client credentials first.");
    }
    const token = await exchangeKrispCallAccessToken({ clientId, clientSecret }, krispcallFetch, context.signal);
    headers.set("authorization", `JWT ${token}`);
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateKrispCallCredential(
      input.values,
      createProviderFetch({ fetch: fetcher, skipDnsValidation: true }),
      signal,
    );
  },
};
