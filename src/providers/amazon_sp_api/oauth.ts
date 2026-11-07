import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { OAuthTokenResult, ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";

import { optionalNumber, optionalString } from "../../core/cast.ts";
import { ProviderRequestError, requiredInputString, runProviderRequest } from "../provider-runtime.ts";
import { readAmazonResponse } from "./runtime.ts";
interface AmazonStore {
  host: string;
  region: "na" | "eu" | "fe";
}

const amazonStores: Record<string, AmazonStore> = {
  US: { host: "sellercentral.amazon.com", region: "na" },
  CA: { host: "sellercentral.amazon.ca", region: "na" },
  MX: { host: "sellercentral.amazon.com.mx", region: "na" },
  BR: { host: "sellercentral.amazon.com.br", region: "na" },
  ES: { host: "sellercentral-europe.amazon.com", region: "eu" },
  UK: { host: "sellercentral-europe.amazon.com", region: "eu" },
  FR: { host: "sellercentral-europe.amazon.com", region: "eu" },
  DE: { host: "sellercentral-europe.amazon.com", region: "eu" },
  IT: { host: "sellercentral-europe.amazon.com", region: "eu" },
  IE: { host: "sellercentral.amazon.ie", region: "eu" },
  BE: { host: "sellercentral.amazon.com.be", region: "eu" },
  NL: { host: "sellercentral.amazon.nl", region: "eu" },
  SE: { host: "sellercentral.amazon.se", region: "eu" },
  ZA: { host: "sellercentral.amazon.co.za", region: "eu" },
  PL: { host: "sellercentral.amazon.pl", region: "eu" },
  EG: { host: "sellercentral.amazon.eg", region: "eu" },
  TR: { host: "sellercentral.amazon.com.tr", region: "eu" },
  SA: { host: "sellercentral.amazon.sa", region: "eu" },
  AE: { host: "sellercentral.amazon.ae", region: "eu" },
  IN: { host: "sellercentral.amazon.in", region: "eu" },
  SG: { host: "sellercentral.amazon.sg", region: "fe" },
  AU: { host: "sellercentral.amazon.com.au", region: "fe" },
  JP: { host: "sellercentral.amazon.co.jp", region: "fe" },
};

function resolveStore(clientConfig: OAuthClientConfig) {
  const country = (optionalString(clientConfig.extra?.country) ?? "US").trim().toUpperCase();
  const store = Object.hasOwn(amazonStores, country) ? amazonStores[country] : undefined;
  if (!store) {
    throw new ProviderRequestError(
      400,
      `Unsupported Amazon Seller Central country: ${country}`,
      undefined,
      "invalid_input",
    );
  }
  return store;
}

export const oauth: ProviderOAuthRuntime = {
  buildAuthorizationUrl({ authorizationUrl, clientConfig }) {
    const store = resolveStore(clientConfig);
    const version = optionalString(clientConfig.extra.version)?.trim();
    if (version && version !== "beta")
      throw new ProviderRequestError(400, "Amazon application version must be beta or empty");
    const url = new URL(`https://${store.host}/apps/authorize/consent`);
    url.searchParams.set("application_id", requiredInputString(clientConfig.extra.applicationId, "applicationId"));
    url.searchParams.set("state", authorizationUrl.searchParams.get("state")!);
    url.searchParams.set("redirect_uri", authorizationUrl.searchParams.get("redirect_uri")!);
    if (version) url.searchParams.set("version", version);
    return url.toString();
  },
  async exchangeCode(input) {
    const sellerId = requiredInputString(input.callbackParameters?.selling_partner_id, "selling_partner_id");
    const token = await exchangeToken(
      input.clientConfig,
      { grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri },
      [],
      input.fetcher,
    );
    if (!token.refreshToken) throw input.createError("Amazon LWA response is missing refresh_token");
    return { ...token, metadata: { ...token.metadata, sellerId, region: resolveStore(input.clientConfig).region } };
  },
  async refreshAccessToken(input) {
    const token = await exchangeToken(
      input.clientConfig,
      { grant_type: "refresh_token", refresh_token: input.refreshToken },
      [],
      input.fetcher,
    );
    return { ...token, refreshToken: token.refreshToken || input.refreshToken };
  },
};
async function exchangeToken(
  clientConfig: OAuthClientConfig,
  parameters: Record<string, string>,
  fallbackScopes: string[],
  fetcher: typeof fetch,
): Promise<OAuthTokenResult> {
  return runProviderRequest({ label: "Amazon LWA" }, async (signal) => {
    const response = await fetcher("https://api.amazon.com/auth/o2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        ...parameters,
        client_id: clientConfig.clientId,
        client_secret: clientConfig.clientSecret,
      }),
      signal,
    });
    const payload = await readAmazonResponse(response);
    const expiresIn = optionalNumber(payload.expires_in);
    if (expiresIn === undefined || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new ProviderRequestError(
        502,
        "Amazon LWA response is missing a valid expires_in",
        undefined,
        "provider_error",
      );
    }
    const scope = optionalString(payload.scope);
    return {
      accessToken: requiredInputString(payload.access_token, "Amazon LWA access_token"),
      refreshToken: optionalString(payload.refresh_token) ?? "",
      tokenType: optionalString(payload.token_type) ?? "bearer",
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      metadata: { scope: scope ?? fallbackScopes.join(" ") },
    };
  });
}
