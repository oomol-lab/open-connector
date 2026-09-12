import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import {
  defineProviderExecutors,
  defineProviderProxy,
  mapProviderActionSources,
  ProviderRequestError,
} from "../provider-runtime.ts";
import { granolaMcpActionHandlers, validateGranolaOAuthCredential } from "./runtime-mcp.ts";
import { granolaActionHandlers, granolaApiBaseUrl, validateGranolaCredential } from "./runtime.ts";

const service = "granola";

interface GranolaContext {
  credential: ResolvedCredential;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export const executors: ProviderExecutors = defineProviderExecutors<GranolaContext>({
  service,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<GranolaContext> {
    const credential = await context.getCredential(service);
    if (!credential) throw new ProviderRequestError(401, "A Granola connection is required.");
    return { credential, fetcher, signal: context.signal };
  },
  handlers: mapProviderActionSources(
    service,
    granolaActionHandlers,
    (name, restHandler) =>
      async (input: Record<string, unknown>, { credential, fetcher, signal }: GranolaContext) => {
        if (credential.authType === "api_key") {
          return restHandler(input, { apiKey: credential.apiKey, fetcher, signal });
        }
        if (credential.authType === "oauth2") {
          return granolaMcpActionHandlers[name](input, { accessToken: credential.accessToken, fetcher, signal });
        }
        throw new ProviderRequestError(401, "A Granola OAuth or API key connection is required.");
      },
  ),
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: granolaApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  oauth2: validateGranolaOAuthCredential,
  apiKey(input, { fetcher, signal }) {
    return validateGranolaCredential(input.apiKey, fetcher, signal);
  },
};
