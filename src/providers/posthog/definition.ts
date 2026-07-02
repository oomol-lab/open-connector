import type { ProviderDefinition } from "../../core/types.ts";

import { posthogActions } from "./actions.ts";

const service = "posthog";

export const provider: ProviderDefinition = {
  service,
  displayName: "PostHog",
  categories: ["Data", "Developer Tools"],
  authTypes: ["oauth2", "api_key"],
  auth: [
    {
      type: "oauth2",
      authorizationUrl: "https://oauth.posthog.com/oauth/authorize/",
      tokenUrl: "https://oauth.posthog.com/oauth/token/",
      scopes: [
        "openid",
        "profile",
        "email",
        "user:read",
        "organization:read",
        "project:read",
        "query:read",
        "query:write",
        "insight:read",
        "insight:write",
        "dashboard:read",
        "dashboard:write",
        "event_definition:read",
        "event_definition:write",
        "property_definition:read",
        "property_definition:write",
        "annotation:read",
        "annotation:write",
        "cohort:read",
        "cohort:write",
        "person:read",
        "feature_flag:read",
        "feature_flag:write",
      ],
      tokenEndpointAuthMethod: "none",
      pkce: {
        method: "S256",
      },
      authorizationParams: {
        response_mode: "query",
        required_access_level: "organization",
      },
      tokenRequestFields: {
        clientSecret: false,
      },
    },
    {
      type: "api_key",
      label: "Personal API Key",
      placeholder: "phx_...",
      description:
        "PostHog personal API key used with the Authorization Bearer header. Create or manage it at https://us.posthog.com/settings/user-api-keys or https://eu.posthog.com/settings/user-api-keys.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://us.posthog.com",
          description:
            "PostHog private API base URL, such as https://us.posthog.com, https://eu.posthog.com, or your self-hosted domain.",
        },
      ],
    },
  ],
  homepageUrl: "https://posthog.com",
  actions: posthogActions,
};
