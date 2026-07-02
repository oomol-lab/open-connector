import type { ProviderDefinition } from "../../core/types.ts";

import { figmaActions } from "./actions.ts";
import { figmaProviderScopes } from "./scopes.ts";

const service = "figma";

/**
 * Figma provider backed by the public Figma REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Figma",
  categories: ["Design", "Productivity"],
  authTypes: ["api_key", "oauth2"],
  auth: [
    {
      type: "api_key",
      label: "Personal Access Token",
      placeholder: "figd_...",
      description:
        "Figma personal access token sent with the X-Figma-Token header. Create or manage tokens from Figma account settings: https://www.figma.com/developers/api#access-tokens",
    },
    {
      type: "oauth2",
      authorizationUrl: "https://www.figma.com/oauth",
      tokenUrl: "https://api.figma.com/v1/oauth/token",
      scopes: figmaProviderScopes,
      tokenEndpointAuthMethod: "client_secret_basic",
    },
  ],
  homepageUrl: "https://www.figma.com",
  actions: figmaActions,
};
