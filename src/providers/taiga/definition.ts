import type { ProviderDefinition } from "../../core/types.ts";

import { taigaActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "taiga",
  displayName: "Taiga",
  description: "Manage projects, user stories, tasks, and issues on a Taiga instance.",
  categories: ["Productivity"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "baseUrl",
          label: "Taiga Instance URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://api.taiga.io",
          description:
            "The HTTPS URL of your Taiga API instance. Use https://api.taiga.io for Taiga Cloud. Private-network instances require OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK in the self-hosted runtime; reserved, local, and cloud-metadata targets remain blocked.",
        },
        {
          key: "username",
          label: "Username or Email",
          inputType: "text",
          required: true,
          secret: false,
          description: "The username or email used to sign in to this Taiga instance.",
        },
        {
          key: "password",
          label: "Password",
          inputType: "password",
          required: true,
          secret: true,
          description: "The password used to obtain short-lived Taiga API tokens through /api/v1/auth.",
        },
      ],
    },
  ],
  homepageUrl: "https://taiga.io",
  actions: taigaActions,
};
