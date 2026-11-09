import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { MetaContext } from "./request.ts";

import { hmacHex } from "../../core/aws-sigv4.ts";
import { optionalString } from "../../core/cast.ts";
import { requireBearerCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { metaAdsHandlers } from "./ads.ts";
import { metaPageHandlers } from "./pages.ts";
import { metaGraphApiBaseUrl, metaGraphApiVersion, metaRequest, sanitizeMetaOutput } from "./request.ts";
export { oauth } from "./oauth.ts";

const handlers = { ...metaAdsHandlers, ...metaPageHandlers };

export const executors: ProviderExecutors = defineProviderExecutors<MetaContext>({
  service: "meta",
  skipDnsValidation: true,
  handlers: Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [
      name,
      async (input: Record<string, unknown>, context: MetaContext) => {
        return sanitizeMetaOutput(await handler(input, context));
      },
    ]),
  ),
  async createContext(context, fetcher) {
    const credential = await requireBearerCredential(context, "meta");
    const stored = await context.getCredential("meta");
    return {
      accessToken: credential.accessToken,
      fetcher,
      signal: context.signal,
      appSecret: stored?.authType === "oauth2" ? optionalString(stored.providerSecret?.appSecret) : undefined,
      profileId: stored?.authType === "oauth2" || stored?.authType === "api_key" ? stored.profile.accountId : undefined,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "meta",
  baseUrl: metaGraphApiBaseUrl,
  auth: { type: "bearer" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers, url }) {
    const stored = await context.getCredential("meta");
    if (stored?.authType === "oauth2") {
      const secret = optionalString(stored.providerSecret?.appSecret);
      if (secret) url.searchParams.set("appsecret_proof", hmacHex(secret, stored.accessToken));
    }

    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
async function validate(context: MetaContext) {
  const result = await metaRequest("me", context, { query: { fields: "id,name" } });
  const id = optionalString(result.id);
  if (!id) throw new ProviderRequestError(502, "Meta account ID is missing");
  return {
    profile: { accountId: id, displayName: optionalString(result.name) ?? id },
    metadata: { graphApiVersion: metaGraphApiVersion, profileId: id },
  };
}

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validate({ accessToken: input.apiKey, fetcher, signal });
  },
  async oauth2(input, { fetcher, signal }) {
    return validate({
      accessToken: input.accessToken,
      fetcher,
      signal,
      appSecret: optionalString(input.providerSecret?.appSecret),
    });
  },
};
