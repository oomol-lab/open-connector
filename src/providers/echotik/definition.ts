import type { ProviderDefinition } from "../../core/types.ts";

import { echotikActions } from "./actions.ts";

const service = "echotik";

export const provider: ProviderDefinition = {
  service,
  displayName: "EchoTik",
  description: "Research TikTok Shop products, categories, creators, videos, and live commerce with EchoTik data.",
  categories: ["Data", "Marketing", "E-commerce"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "username",
          label: "API Username",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "ECHOTIK_USERNAME",
          description:
            "EchoTik API username used for HTTP Basic authentication. Create or view the credential pair at https://echotik.live/platform/api-keys.",
        },
        {
          key: "password",
          label: "API Password",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "ECHOTIK_PASSWORD",
          description:
            "EchoTik API password paired with the API username. Create or view the credential pair at https://echotik.live/platform/api-keys.",
        },
      ],
      testAction: {
        actionName: "list_product_categories",
        input: { level: 1, language: "en-US" },
      },
    },
  ],
  homepageUrl: "https://echotik.live/zh/api-service",
  actions: echotikActions,
};
