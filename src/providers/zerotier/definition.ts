import type { ProviderDefinition } from "../../core/types.ts";

import { zerotierActions } from "./actions.ts";

const service = "zerotier";

export const provider: ProviderDefinition = {
  service,
  displayName: "ZeroTier",
  description:
    "Manage ZeroTier virtual networks, members, organizations, service accounts, webhooks, and IAM through the ZeroTier Central v1 (Legacy) and v2 (New Central) APIs.",
  categories: ["Developer Tools", "Infrastructure"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      label: "ZeroTier API Token",
      description:
        "Choose the API generation matching your token: v1 tokens come from the Legacy Central Account page (api.zerotier.com), v2 service account API keys come from New Central (central.zerotier.com).",
      fields: [
        {
          key: "apiVersion",
          label: "API Version",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "v2",
          description:
            'Which Central API to call: "v1" for Legacy Central (api.zerotier.com, Authorization: token) or "v2" for New Central (central.zerotier.com, Authorization: Bearer service account key).',
        },
        {
          key: "apiKey",
          label: "API Token",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "your_zerotier_token",
          description:
            "For v1: a personal API token created in Legacy Central under Account > API Access Tokens. For v2: a service account API key created in New Central under your organization > Service Accounts (the secret is shown only once).",
        },
        {
          key: "orgId",
          label: "Organization ID",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "c0341f5c-...",
          description:
            "New Central (v2) only: the organization ID used as the default org-id filter for list actions. Leave empty for v1.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.zerotier.com",
  actions: zerotierActions,
};
