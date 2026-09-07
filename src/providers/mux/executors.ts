import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { MuxContext } from "./runtime.ts";

import { requiredString } from "../../core/cast.ts";
import {
  basicAuthorizationHeader,
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { muxActionHandlers, muxApiOrigin, validateMuxCredential } from "./runtime.ts";

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

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: muxApiOrigin,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set(
      "authorization",
      basicAuthorizationHeader(`${requireMuxTokenId(credential.values.tokenId)}:${credential.apiKey}`),
    );
    if (!headers.has("accept")) headers.set("accept", "application/json");
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
