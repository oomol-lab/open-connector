import type { ProviderDefinition } from "../../core/types.ts";

import { giteeActions } from "./actions.ts";
import { giteeOAuthScopes } from "./scopes.ts";

const service = "gitee";

/** Gitee provider backed by the public Gitee API V5. */
export const provider: ProviderDefinition = {
  service,
  displayName: "Gitee",
  categories: ["Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://gitee.com/oauth/authorize",
      tokenUrl: "https://gitee.com/oauth/token",
      refreshTokenUrl: "https://gitee.com/oauth/token",
      scopes: giteeOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal access token",
      placeholder: "Gitee personal access token",
      description: "Gitee personal access token used with the public API V5.",
    },
  ],
  homepageUrl: "https://gitee.com",
  actions: giteeActions,
};
