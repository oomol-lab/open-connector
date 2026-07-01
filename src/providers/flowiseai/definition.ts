import type { ProviderDefinition } from "../../core/types.ts";

import { flowiseaiActions } from "./actions.ts";

const service = "flowiseai";

/**
 * FlowiseAI provider backed by the chatflow API key and prediction endpoints.
 */
export const provider: ProviderDefinition = {
  service,
  displayName: "FlowiseAI",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "FLOWISE_API_KEY",
      description:
        "FlowiseAI chatflow-level API key used with the Authorization: Bearer <apiKey> header. Create or manage it in your FlowiseAI dashboard API Keys section, then assign it to the target flow: https://docs.flowiseai.com/configuration/authorization/chatflow-level.",
      extraFields: [
        {
          key: "baseUrl",
          label: "API Base URL",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "https://your-flowise-host/api/v1",
          description:
            "The FlowiseAI API base URL for your deployment. Use the same API root that serves the official /chatflows and /prediction endpoints for your FlowiseAI instance.",
        },
      ],
    },
  ],
  homepageUrl: "https://flowiseai.com",
  actions: flowiseaiActions,
};
