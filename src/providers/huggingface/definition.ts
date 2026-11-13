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
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      requiredScopes: ["openid", "profile"],
      authorizationUrl: "https://huggingface.co/oauth/authorize",
      tokenUrl: "https://huggingface.co/oauth/token",
      scopes: huggingfaceOAuthScopes,
      tokenEndpointAuthMethod: "client_secret_post",
    },
    {
      type: "api_key",
      label: "User Access Token",
      placeholder: "hf_...",
      description:
        "Hugging Face user access token sent as a Bearer token. Create one from your Hugging Face access token settings.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://huggingface.co",
  actions: huggingfaceActions,
};
