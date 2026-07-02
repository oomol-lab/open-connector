import type { ProviderDefinition } from "../../core/types.ts";

import { voiceflowActions } from "./actions.ts";

const service = "voiceflow";

export const provider: ProviderDefinition = {
  service,
  displayName: "Voiceflow",
  categories: ["AI", "Productivity"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "Voiceflow API Key",
      placeholder: "VF.DM.xxx",
      description:
        "Voiceflow project API key sent in the authorization header. Create or view it in Settings > API keys, or see https://docs.voiceflow.com/api-reference/authentication.",
      extraFields: [
        {
          key: "projectId",
          label: "Project ID",
          inputType: "text",
          required: true,
          secret: false,
          placeholder: "project-id",
          description:
            "Voiceflow project ID used to target the agent. Find it in Settings > General > Metadata, or see https://docs.voiceflow.com/api-reference/authentication.",
        },
        {
          key: "environmentAlias",
          label: "Environment Alias",
          inputType: "text",
          required: false,
          secret: false,
          placeholder: "main",
          description:
            "Default Voiceflow environment alias used when an action input does not override it. Find aliases in Settings > Environments, or see https://docs.voiceflow.com/api-reference/authentication.",
        },
      ],
    },
  ],
  homepageUrl: "https://www.voiceflow.com",
  actions: voiceflowActions,
};
