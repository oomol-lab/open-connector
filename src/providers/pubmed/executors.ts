import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, ProviderRequestError } from "../provider-runtime.ts";
import { createPubmedActionContext, pubmedActionHandlers, validatePubmedCredential } from "./runtime.ts";

const service = "pubmed";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: pubmedActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType === "no_auth") {
      return createPubmedActionContext({ fetcher, signal: context.signal });
    }
    if (credential.authType === "api_key") {
      return createPubmedActionContext({ apiKey: credential.apiKey, fetcher, signal: context.signal });
    }
    throw new ProviderRequestError(401, "Connect PubMed without authentication or configure an NCBI API key.");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validatePubmedCredential(input, fetcher, signal);
  },
};
