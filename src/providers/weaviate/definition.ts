import type { ProviderDefinition } from "../../core/types.ts";

import { weaviateActions } from "./actions.ts";

const service = "weaviate";

export const provider: ProviderDefinition = {
  service,
  displayName: "Weaviate",
  categories: ["Data", "Developer Tools", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "WEAVIATE_API_KEY",
      description: "Weaviate API key used with the Authorization Bearer header.",
      extraFields: [
        {
          key: "baseUrl",
          label: "Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://your-cluster.weaviate.network",
          description:
            "The Weaviate cluster base URL. Use your cluster origin and the connector will call official REST endpoints under /v1.",
        },
      ],
    },
  ],
  homepageUrl: "https://weaviate.io",
  actions: weaviateActions,
};
