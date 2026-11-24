import type { ProviderDefinition } from "../../core/types.ts";

import { leonardoAiActions } from "./actions.ts";

const service = "leonardo_ai";

export const provider: ProviderDefinition = {
  service,
  displayName: "Leonardo.Ai",
  description:
    "Remove image backgrounds and create or inspect image, video, audio, and 3D generation jobs with Leonardo.Ai.",
  categories: ["AI", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
      description:
        "Leonardo.Ai production API key used with the Authorization Bearer header. Create or copy it from the official API Access page: https://app.leonardo.ai/api-access.",
    },
  ],
  homepageUrl: "https://leonardo.ai",
  actions: leonardoAiActions,
};
