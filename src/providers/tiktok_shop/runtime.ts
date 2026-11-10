import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { OAuthTokenResult } from "../../oauth/oauth-token.ts";

import { hmacHex } from "../../core/aws-sigv4.ts";
import { optionalNumber, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  isAbortLikeError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
export const apiBaseUrl = "https://open-api.tiktokglobalshop.com";

export interface TikTokShopClient {
  clientId: string;
  clientSecret: string;
}

export function requireClient(config: Partial<OAuthClientConfig> | undefined): TikTokShopClient {
  if (!config?.clientId || !config.clientSecret) {
    throw new ProviderRequestError(400, "TikTok Shop requires your app key and app secret", undefined, "invalid_input");
  }
  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

export function signRequest(url: URL, body: string, secret: string): string {
  const keys = [...new Set(url.searchParams.keys())].filter((key) => key !== "sign" && key !== "access_token").sort();
  const query = keys.map((key) => `${key}${url.searchParams.get(key)}`).join("");
  return hmacHex(secret, `${secret}${decodeURIComponent(url.pathname)}${query}${body}${secret}`);
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: Record<string, unknown>;
  try {
    payload = requiredResponseRecord(await response.json(), "TikTok Shop response");
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      "TikTok Shop returned an invalid JSON response",
      undefined,
      "provider_error",
    );
  }
  if (!response.ok || payload.code !== 0) {
    const code = optionalNumber(payload.code);
    const message = optionalString(payload.message) || "Request failed";
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      `TikTok Shop ${code ?? response.status}: ${message}`,
      undefined,
      "provider_error",
    );
  }
  return requiredResponseRecord(payload.data, "TikTok Shop response data");
}

export async function requestApi(
  accessToken: string,
  clientConfig: Partial<OAuthClientConfig> | undefined,
  pathname: string,
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  const url = new URL(pathname, apiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return runProviderRequest({ label: "TikTok Shop" }, async (signal) => {
    const config = requireClient(clientConfig);
    const payload = body ? JSON.stringify(body) : "";
    url.searchParams.set("app_key", config.clientId);
    url.searchParams.set("timestamp", String(Math.floor(Date.now() / 1000)));
    url.searchParams.set("sign", signRequest(url, payload, config.clientSecret));
    const response = await fetcher(url, {
      method: body ? "POST" : "GET",
      headers: { "x-tts-access-token": accessToken, "content-type": "application/json" },
      body: body ? payload : undefined,
      signal,
      redirect: "manual",
    });
    return readResponse(response);
  });
}

export async function requestToken(
  config: OAuthClientConfig,
  params: Record<string, string>,
  fetcher: typeof fetch,
  previousRefreshToken = "",
): Promise<OAuthTokenResult> {
  const client = requireClient(config);
  const url = new URL(`https://auth.tiktok-shops.com/api/v2/token/${previousRefreshToken ? "refresh" : "get"}`);
  url.searchParams.set("app_key", client.clientId);
  url.searchParams.set("app_secret", client.clientSecret);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return runProviderRequest({ label: "TikTok Shop token" }, async (signal) => {
    let response: Response;
    try {
      response = await fetcher(url, { signal, redirect: "manual" });
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      // Do not expose the credential-bearing token URL in transport errors.
      throw new ProviderRequestError(502, "TikTok Shop token request failed", undefined, "provider_error");
    }
    const data = await readResponse(response);
    if (![0, 4, 5].includes(optionalNumber(data.user_type) ?? -1)) {
      throw new ProviderRequestError(
        400,
        "Authorize a TikTok Shop seller account, not a creator or partner account",
        undefined,
        "invalid_input",
      );
    }
    const accessToken = optionalString(data.access_token);
    const expires = optionalNumber(data.access_token_expire_in);
    const openId = optionalString(data.open_id);
    const refreshToken = optionalString(data.refresh_token) || previousRefreshToken;
    if (!accessToken || !refreshToken || !expires || !Number.isFinite(expires) || !openId) {
      throw new ProviderRequestError(
        502,
        "TikTok Shop token response is missing tokens, expiry or seller identity",
        undefined,
        "provider_error",
      );
    }
    const scopes = Array.isArray(data.granted_scopes)
      ? data.granted_scopes.filter((scope): scope is string => typeof scope === "string")
      : undefined;
    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresAt: new Date(expires * 1000).toISOString(),
      metadata: {
        scope: scopes?.join(" "),
        openId,
        sellerName: optionalString(data.seller_name),
        sellerBaseRegion: optionalString(data.seller_base_region),
        userType: data.user_type,
      },
    };
  });
}
