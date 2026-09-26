import type { ProviderDefinition } from "../../core/types.ts";

import { framejetActions } from "./actions.ts";

const service = "framejet";

export const provider: ProviderDefinition = {
  service,
  displayName: "Framejet",
  categories: ["Developer Tools", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "fj_xxx",
      description:
        "Framejet API key sent as the X-Api-Key header. Create a free key (200 screenshots a month) at https://framejet.dev.",
    },
  ],
  homepageUrl: "https://framejet.dev",
  actions: framejetActions,
};
