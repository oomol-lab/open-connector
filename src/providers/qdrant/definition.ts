import type { ProviderDefinition } from "../../core/types.ts";

import { qdrantActions } from "./actions.ts";

const service = "qdrant";

/**
 * Qdrant Cloud provider backed by the official REST API.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "Qdrant Cloud",
  description: "Create, inspect, write, and query dense-vector collections in Qdrant Cloud.",
  categories: ["Data", "Developer Tools"],
  authTypes: ["custom_credential"],
  auth: [
    {
      type: "custom_credential",
      fields: [
        {
          key: "clusterUrl",
          label: "Cluster URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://your-cluster.cloud.qdrant.io",
          description:
            "The HTTPS REST URL for a Qdrant Cloud cluster. Only official cloud.qdrant.io endpoints on port 443 or 6333 are supported.",
        },
        {
          key: "apiKey",
          label: "API Key",
          inputType: "password",
          required: true,
          secret: true,
          placeholder: "Your Qdrant Cloud database API key",
          description: "A Qdrant Cloud database API key with access to the target collections.",
        },
      ],
    },
  ],
  homepageUrl: "https://qdrant.tech/cloud/",
  actions: qdrantActions,
};
