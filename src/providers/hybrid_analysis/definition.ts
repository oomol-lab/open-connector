import type { ProviderDefinition } from "../../core/types.ts";

import { hybridAnalysisActions } from "./actions.ts";

export const provider: ProviderDefinition = {
  service: "hybrid_analysis",
  displayName: "Hybrid Analysis",
  description: "Search malware hashes and retrieve Hybrid Analysis reports.",
  categories: ["Security", "Data"],
  authTypes: ["api_key"],
  auth: [
    {
      type: "api_key",
      label: "API Key",
      placeholder: "HYBRID_ANALYSIS_API_KEY",
      description:
        "Hybrid Analysis API key sent in the api-key header. Get it at https://www.hybrid-analysis.com/profile?tab=api-key.",
    },
  ],
  homepageUrl: "https://www.hybrid-analysis.com/",
  actions: hybridAnalysisActions,
};
