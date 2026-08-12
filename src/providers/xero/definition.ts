import type { ProviderDefinition } from "../../core/types.ts";

import { xeroActions } from "./actions.ts";
import { xeroOAuthScopes } from "./scopes.ts";

const service = "xero";

/**
 * Xero provider backed by the Xero Accounting and Identity APIs.
 *
 * Open-source users bring their own Xero OAuth app. Xero access tokens expire
 * after 30 minutes, so the runtime refreshes them with the refresh token
 * granted through `offline_access`; see `src/oauth/oauth-credential-refresh-service.ts`.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Xero",
  categories: ["Finance", "Data"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://login.xero.com/identity/connect/authorize",
      tokenUrl: "https://identity.xero.com/connect/token",
      scopes: xeroOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
      // Xero web apps reject authorization requests that include a PKCE
      // code challenge ("Requested wrong apps scopes" / access_denied), so
      // PKCE stays off even though the runtime supports it.
    },
  ],
  homepageUrl: "https://www.xero.com",
  actions: xeroActions,
};
