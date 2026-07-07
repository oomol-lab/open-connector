import type { ProviderDefinition } from "../../core/types.ts";

import { coderabbitActions } from "./actions.ts";

const service = "coderabbit";

export const provider: ProviderDefinition = {
  service,
  displayName: "CodeRabbit",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "cr-xxxxxxxxxx",
      description:
        "CodeRabbit API key sent with the x-coderabbitai-api-key header. Create or view API keys from the CodeRabbit dashboard, then confirm the REST API authentication contract in the official API docs: https://docs.coderabbit.ai/api-reference/users-list",
    },
  ],
  homepageUrl: "https://www.coderabbit.ai",
  actions: coderabbitActions,
};
