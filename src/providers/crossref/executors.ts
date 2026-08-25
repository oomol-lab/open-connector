import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, mapProviderActionSources, ProviderRequestError } from "../provider-runtime.ts";
import { crossrefActionHandlers, validateCrossrefCredential } from "./runtime.ts";
const service = "crossref";
interface CrossrefContext {
  apiKey?: string;
  fetcher: typeof fetch;
}
const handlers = mapProviderActionSources(
  service,
  crossrefActionHandlers,
  (_name, handler) => (input: Record<string, unknown>, context: CrossrefContext) =>
    handler(input, context.fetcher, context.apiKey),
);
export const executors: ProviderExecutors = defineProviderExecutors<CrossrefContext>({
  service,
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await context.getCredential(service);
    if (!credential || credential.authType == "no_auth") return { fetcher };
    if (credential.authType == "api_key") return { apiKey: credential.apiKey, fetcher };
    throw new ProviderRequestError(401, "Connect Crossref without authentication or configure an API key.");
  },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateCrossrefCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
