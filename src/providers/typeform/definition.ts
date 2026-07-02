import type { ProviderDefinition } from "../../core/types.ts";

import { typeformActions } from "./actions.ts";

const service = "typeform";

const typeformRequestedProviderScopes = ["accounts:read", "forms:read", "responses:read", "workspaces:read", "offline"];

export const provider: ProviderDefinition = {
  service,
  displayName: "Typeform",
  categories: ["Productivity", "Data"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://api.typeform.com/oauth/authorize",
      tokenUrl: "https://api.typeform.com/oauth/token",
      scopes: typeformRequestedProviderScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "typeform_personal_access_token",
      description:
        "Typeform personal access token used with the Authorization Bearer header. Create it from Account > Personal tokens: https://www.typeform.com/developers/get-started/personal-access-token/.",
    },
  ],
  homepageUrl: "https://www.typeform.com",
  actions: typeformActions,
};
