import type { ProviderDefinition } from "../../core/types.ts";

import { huggingfaceActions } from "./actions.ts";
import { huggingfaceOAuthScopes } from "./scopes.ts";

const service = "huggingface";

/**
 * Hugging Face provider backed by the Hub, Dataset Viewer, Inference, and OAuth APIs.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Hugging Face",
  categories: ["AI", "Developer Tools"],
  authTypes: ["oauth2"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://huggingface.co/oauth/authorize",
      tokenUrl: "https://huggingface.co/oauth/token",
      scopes: huggingfaceOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
  ],
  homepageUrl: "https://huggingface.co",
  actions: huggingfaceActions,
};
