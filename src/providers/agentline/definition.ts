import type { ProviderDefinition } from "../../core/types.ts";

import actions from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "agentline",
  displayName: "AgentLine",
  description: "Voice agent, contact and account voice configuration",
  homepageUrl: "https://agentline.cloud",
  categories: ["Communication", "AI"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "al_live_...",
      description:
        "Obtain an AgentLine API key through the email verification flow at https://docs.agentline.cloud/authentication. Save the returned key when shown; requests use Authorization: Bearer.",
    },
  ],
  actions,
};
