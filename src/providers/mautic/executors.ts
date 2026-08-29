import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch, defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
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

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateMauticCredential(input.values, guardedFetcher, signal);
  },
};
