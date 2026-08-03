import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";
import type { KomariActionContext } from "./runtime.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { createProviderFetch, defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { createKomariContext, komariActionHandlers, validateKomariCredential } from "./runtime.ts";

const service = "komari";

export const executors: ProviderExecutors = defineProviderExecutors<KomariActionContext>({
  service,
  handlers: komariActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<KomariActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return createKomariContext(
      credential.values,
      credential.apiKey,
      fetcher,
      isPrivateNetworkAccessAllowed(),
      context.signal,
    );
  },
  fallbackMessage: "Komari request failed",
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateKomariCredential(
      input.values,
      input.apiKey,
      guardedFetcher,
      isPrivateNetworkAccessAllowed(),
      signal,
    );
  },
};
