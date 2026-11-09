import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";

import { optionalString } from "../../core/cast.ts";
import { ProviderRequestError, requiredInputString } from "../provider-runtime.ts";
import { requestToken, requireClient } from "./runtime.ts";
export const oauth: ProviderOAuthRuntime = {
  buildAuthorizationUrl({ authorizationUrl, clientConfig }) {
    requireClient(clientConfig);
    const market = optionalString(clientConfig.extra.market)?.trim().toUpperCase();
    if (market !== "US" && market !== "ROW")
      throw new ProviderRequestError(400, "TikTok Shop market must be US or ROW");
    const url = new URL(
      market === "US"
        ? "https://services.us.tiktokshop.com/open/authorize"
        : "https://services.tiktokshop.com/open/authorize",
    );
    url.searchParams.set("service_id", requiredInputString(clientConfig.extra.serviceId, "serviceId"));
    url.searchParams.set("state", authorizationUrl.searchParams.get("state")!);
    return url.toString();
  },
  async exchangeCode(input) {
    const token = await requestToken(
      input.clientConfig,
      { auth_code: input.code, grant_type: "authorized_code" },
      input.fetcher,
    );
    return { ...token, providerSecret: { ...requireClient(input.clientConfig) } };
  },
  async refreshAccessToken(input) {
    const token = await requestToken(
      input.clientConfig,
      { refresh_token: input.refreshToken, grant_type: "refresh_token" },
      input.fetcher,
      input.refreshToken,
    );
    return { ...token, providerSecret: { ...requireClient(input.clientConfig) } };
  },
};
