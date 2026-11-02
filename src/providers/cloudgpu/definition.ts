import type { ProviderDefinition } from "../../core/types.ts";

import { cloudgpuActions } from "./actions.ts";

/** CloudGPU's OpenAI-compatible model API. */
export const provider: ProviderDefinition = {
  service: "cloudgpu",
  displayName: "CloudGPU",
  categories: ["AI", "Developer Tools"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "cgw-sk-...",
      description:
        "Create an API key at https://cloudgpu.app/api/console. Requests use Bearer authentication; inference is billed per token.",
      extraFields: [],
    },
  ],
  homepageUrl: "https://cloudgpu.app",
  actions: cloudgpuActions,
};
