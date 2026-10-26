import type { ProviderDefinition } from "../../core/types.ts";

import { artificialAnalysisActions } from "./actions.ts";
export const provider: ProviderDefinition = {
  service: "artificial_analysis",
  displayName: "Artificial Analysis",
  description: "Independent AI model benchmarks, pricing and performance data",
  homepageUrl: "https://artificialanalysis.ai",
  categories: ["AI", "Data & Analytics"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      description:
        "Create an organization API key at https://artificialanalysis.ai/api-key-management-redirect. Connecting reads the first page of free model data and uses one API request from your shared quota.",
    },
  ],
  actions: artificialAnalysisActions,
};
