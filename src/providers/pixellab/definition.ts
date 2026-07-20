import type { ProviderDefinition } from "../../core/types.ts";

import { pixellabActions } from "./actions.ts";

const service = "pixellab";

export const provider: ProviderDefinition = {
  service,
  displayName: "PixelLab",
  description:
    "Generate, edit, animate, and manage pixel-art images, UI assets, characters, and objects with PixelLab.",
  categories: ["AI", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Token",
      placeholder: "PIXELLAB_API_TOKEN",
      description:
        "PixelLab API token sent as a Bearer token. Create or manage tokens in the PixelLab dashboard: https://www.pixellab.ai/",
    },
  ],
  homepageUrl: "https://www.pixellab.ai/",
  actions: pixellabActions,
};
