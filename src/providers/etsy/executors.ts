import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalInteger, optionalString } from "../../core/cast.ts";
import { requireOAuthCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";
export { oauth } from "./oauth.ts";

import { etsyApiBaseUrl } from "./constants.ts";
import { etsyRoutes } from "./routes.ts";
import { requestEtsy } from "./runtime.ts";
function signingKey(secret: Record<string, unknown> | undefined): string {
  const clientId = requiredInputString(secret?.clientId, "Etsy clientId");
  const sharedSecret = requiredInputString(secret?.sharedSecret, "Etsy sharedSecret");
  return `${clientId}:${sharedSecret}`;
}
interface EtsyContext {
  accessToken: string;
  apiKey: string;
  fetcher: typeof fetch;
}

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "etsy",
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireOAuthCredential(context, "etsy");
    return { accessToken: credential.accessToken, apiKey: signingKey(credential.providerSecret), fetcher };
  },
  handlers: Object.fromEntries(
    Object.entries(etsyRoutes).map(([name, route]) => [
      name,
      async (data: Record<string, unknown>, context: EtsyContext) => {
        let pathname = route.path;
        for (const key of route.pathKeys) pathname = pathname.replace(`{${key}}`, String(data[key]));
        const url = new URL(pathname, etsyApiBaseUrl);
        for (const key of route.queryKeys) {
          const value = data[key];
          if (value != null) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
        }
        const body = route.write
          ? Object.fromEntries(
              Object.entries(data).filter(([key]) => !route.pathKeys.includes(key) && !route.queryKeys.includes(key)),
            )
          : undefined;
        return requestEtsy(url, context.accessToken, context.apiKey, context.fetcher, body);
      },
    ]),
  ),
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "etsy",
  baseUrl: etsyApiBaseUrl,
  auth: { type: "oauth_bearer" },
  skipDnsValidation: true,
  sensitiveHeaders: ["x-api-key"],
  async customizeRequest({ context, headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    const credential = await requireOAuthCredential(context, "etsy");
    headers.set("x-api-key", signingKey(credential.providerSecret));
  },
});
export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher }) {
    const config = signingKey(input.providerSecret);
    const me = await requestEtsy(
      new URL("/v3/application/users/me", etsyApiBaseUrl),
      input.accessToken,
      config,
      fetcher,
    );
    const id = optionalInteger(me.user_id);
    if (id == null || id <= 0) throw new ProviderRequestError(502, "Etsy response is missing user_id");
    let displayName = `Etsy User ${id}`;
    const shopId = optionalInteger(me.shop_id);
    if (shopId != null && shopId > 0) {
      const shop = await requestEtsy(
        new URL(`/v3/application/shops/${shopId}`, etsyApiBaseUrl),
        input.accessToken,
        config,
        fetcher,
      );
      displayName = optionalString(shop.shop_name) || displayName;
    }
    return {
      profile: { accountId: String(id), displayName },
      grantedScopes: optionalString(input.metadata.scope)?.split(" ").filter(Boolean),
      metadata: {},
    };
  },
};
