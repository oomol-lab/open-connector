import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { FivetranContext } from "./runtime.ts";

import { requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError, requireCustomCredential } from "../provider-runtime.ts";
import { fivetranActionHandlers, validateFivetranCredential } from "./runtime.ts";

const service = "fivetran";

function readCredentialField(values: Record<string, string>, field: string): string {
  return requiredString(values[field], field, (message) => new ProviderRequestError(400, message));
}

export const executors: ProviderExecutors = defineProviderExecutors<FivetranContext>({
  service,
  handlers: fivetranActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<FivetranContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      apiKey: readCredentialField(credential.values, "apiKey"),
      apiSecret: readCredentialField(credential.values, "apiSecret"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    return validateFivetranCredential(
      {
        apiKey: readCredentialField(input.values, "apiKey"),
        apiSecret: readCredentialField(input.values, "apiSecret"),
      },
      fetcher,
      signal,
    );
  },
};
