import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { optionalString } from "../../core/cast.ts";
import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  basicAuthorizationHeader,
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireCustomCredential,
  requiredInputString,
} from "../provider-runtime.ts";
import { mauticActionHandlers, normalizeMauticBaseUrl, validateMauticCredential } from "./runtime.ts";

interface MauticContext {
  values: Record<string, string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const handlers: Record<string, (input: Record<string, unknown>, context: MauticContext) => Promise<unknown>> =
  Object.fromEntries(
    Object.entries(mauticActionHandlers).map(([name, handler]) => [
      name,
      (input: Record<string, unknown>, context: MauticContext) =>
        handler(
          input,
          {
            baseUrl: normalizeMauticBaseUrl(context.values.baseUrl ?? ""),
            username: context.values.username?.trim() ?? "",
            password: context.values.password ?? "",
          },
          context.fetcher,
          context.signal,
        ),
    ]),
  );

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "mautic",
  handlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireCustomCredential(context, "mautic");
    return { values: credential.values, fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "mautic",
  async baseUrl(context) {
    const credential = await requireCustomCredential(context, "mautic");
    return normalizeMauticBaseUrl(optionalString(credential.metadata.baseUrl) ?? credential.values.baseUrl ?? "");
  },
  auth: { type: "none" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  maxResponseBytes: 10 * 1024 * 1024,
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, "mautic");
    const username = requiredInputString(credential.values.username, "username");
    const password = requiredInputString(credential.values.password, "password");
    headers.set("authorization", basicAuthorizationHeader(`${username}:${password}`));
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateMauticCredential(input.values, guardedFetcher, signal);
  },
};
