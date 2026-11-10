import type { ProviderDefinition } from "../../core/types.ts";

import { capturekitActions } from "./actions.ts";

const service = "capturekit";

export const provider: ProviderDefinition = {
  service,
  displayName: "CaptureKit",
  categories: ["Developer Tools", "Design & Media"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "CAPTUREKIT_API_KEY",
      description:
        "CaptureKit API key sent with the x-api-key header. Create or copy it from your CaptureKit dashboard: https://app.capturekit.dev/",
    },
  ],
  homepageUrl: "https://www.capturekit.dev",
  actions: capturekitActions,
};
