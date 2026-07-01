import type { ProviderDefinition } from "../../core/types.ts";

import { algoliaActions } from "./actions.ts";

const service = "algolia";

export const provider: ProviderDefinition = {
  service,
  displayName: "Algolia",
  categories: ["Developer Tools", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "ALGOLIA_API_KEY",
      description:
        "Algolia API Key used with the X-Algolia-API-Key header. Manage keys in the Algolia dashboard: https://dashboard.algolia.com/account/api-keys.",
      extraFields: [
        {
          key: "applicationId",
          label: "Application ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "Your Algolia Application ID",
          description:
            "The Algolia application ID paired with the API key for Search API requests. Find it in the Algolia dashboard or see https://support.algolia.com/hc/en-us/articles/11040113398673-Where-can-I-find-my-application-ID-and-the-index-name.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.algolia.com",
  actions: algoliaActions,
};
