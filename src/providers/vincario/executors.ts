import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";

import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { handlers, readContext, validateCredential } from "./runtime.ts";

const service = "vincario";
export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    return readContext((await requireCustomCredential(context, service)).values, fetcher, context.signal);
  },
});
export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher, signal }) {
    return validateCredential(input.values, fetcher, signal);
  },
};
