import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { MuxContext } from "./runtime.ts";

import { requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, ProviderRequestError, requireApiKeyCredential } from "../provider-runtime.ts";
import { muxActionHandlers, validateMuxCredential } from "./runtime.ts";

const service = "mux";

export const executors: ProviderExecutors = defineProviderExecutors<MuxContext>({
  service,
  handlers: muxActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<MuxContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      tokenId: requireMuxTokenId(credential.values.tokenId),
      tokenSecret: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateMuxCredential({
      tokenId: requireMuxTokenId(input.values.tokenId),
      tokenSecret: input.apiKey,
      fetcher,
      signal,
    });
  },
};

function requireMuxTokenId(value: unknown): string {
  return requiredString(value, "tokenId", (message) => new ProviderRequestError(400, message));
}
